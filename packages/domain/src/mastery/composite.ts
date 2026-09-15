import type { Competency, Domain, Kc, KcId, MasteryBand } from '../types.js';
import { abilityStandardError, type Ability } from './elo.js';
import { retrievability, stability, type RetentionState } from './retention.js';

/**
 * The composite layer — what actually goes on screen.
 *
 * M(t) = P(mastery) x R(t)
 *
 * The product is the point. BKT alone says "you learned Thevenin equivalents"
 * and keeps saying it forever. FSRS alone says "it has been nine months" but
 * cannot tell decay from never having learned it. Multiplying them yields the
 * one number that answers "can you do this right now", and keeping the factors
 * separate yields the diagnosis for *why not*.
 */

/**
 * Why a KC is where it is. This drives remediation routing: a `gap` needs
 * instruction, a `decayed` KC needs a single review session, and confusing the
 * two wastes the learner's time in opposite directions.
 */
export type KcDiagnosis =
  | 'untested' // no evidence yet
  | 'gap' // low P(L): never learned
  | 'decayed' // high P(L), low R: learned, faded
  | 'fragile' // middling on both: shaky
  | 'solid'; // high on both

export interface KcMastery {
  kcId: KcId;
  /** P(mastery) from BKT — was it ever learned. */
  pMastery: number;
  /** R(t) from FSRS — does it survive today. */
  retrievability: number;
  /** M = pMastery * retrievability. */
  composite: number;
  band: MasteryBand;
  diagnosis: KcDiagnosis;
  /** Memory stability in days. */
  stabilityDays: number;
  /** Confidence in the underlying ability estimate; drives "needs more evidence". */
  standardError: number;
  attempts: number;
}

export const BAND_THRESHOLDS = { developing: 0.4, proficient: 0.65, mastered: 0.85 } as const;

export function bandFor(composite: number): MasteryBand {
  if (composite >= BAND_THRESHOLDS.mastered) return 'mastered';
  if (composite >= BAND_THRESHOLDS.proficient) return 'proficient';
  if (composite >= BAND_THRESHOLDS.developing) return 'developing';
  return 'gap';
}

/** Above this, BKT considers the KC learned at some point. */
const LEARNED_THRESHOLD = 0.7;
/** Below this, recall is judged to have faded. */
const FADED_THRESHOLD = 0.6;

export function diagnose(pMastery: number, r: number, attempts: number): KcDiagnosis {
  if (attempts === 0) return 'untested';
  if (pMastery < BAND_THRESHOLDS.developing) return 'gap';
  if (pMastery >= LEARNED_THRESHOLD && r < FADED_THRESHOLD) return 'decayed';
  if (pMastery >= LEARNED_THRESHOLD && r >= FADED_THRESHOLD) return 'solid';
  return 'fragile';
}

export interface KcStateInput {
  kcId: KcId;
  pMastery: number;
  ability: Ability;
  retention: RetentionState;
}

export function computeMastery(input: KcStateInput, now: Date = new Date()): KcMastery {
  const r = input.ability.n === 0 ? 0 : retrievability(input.retention, now);
  const composite = input.pMastery * r;
  return {
    kcId: input.kcId,
    pMastery: input.pMastery,
    retrievability: r,
    composite,
    band: bandFor(composite),
    diagnosis: diagnose(input.pMastery, r, input.ability.n),
    stabilityDays: stability(input.retention),
    standardError: abilityStandardError(input.ability),
    attempts: input.ability.n,
  };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/**
 * Roll mastery up along an arbitrary axis.
 *
 * Aggregation is attempt-weighted with a floor, so a KC backed by 12 responses
 * counts for more than one backed by a single lucky guess, without letting a
 * heavily drilled KC drown out untouched ones.
 */
function weightedMean(values: { value: number; weight: number }[]): number {
  const totalWeight = values.reduce((s, v) => s + v.weight, 0);
  if (totalWeight <= 0) return 0;
  return values.reduce((s, v) => s + v.value * v.weight, 0) / totalWeight;
}

const evidenceWeight = (m: KcMastery): number => 1 + Math.min(m.attempts, 10) / 10;

export interface AxisScore<K extends string> {
  key: K;
  composite: number;
  pMastery: number;
  retrievability: number;
  kcCount: number;
  /** KCs with attempts > 0. A high score over 2 of 20 KCs is not a strength. */
  testedCount: number;
  band: MasteryBand;
}

function scoreGroup<K extends string>(key: K, group: KcMastery[]): AxisScore<K> {
  const composite = weightedMean(group.map((m) => ({ value: m.composite, weight: evidenceWeight(m) })));
  return {
    key,
    composite,
    pMastery: weightedMean(group.map((m) => ({ value: m.pMastery, weight: evidenceWeight(m) }))),
    retrievability: weightedMean(
      group.map((m) => ({ value: m.retrievability, weight: evidenceWeight(m) })),
    ),
    kcCount: group.length,
    testedCount: group.filter((m) => m.attempts > 0).length,
    band: bandFor(composite),
  };
}

/**
 * Aggregate by competency. A KC tagged with several competencies contributes to
 * each — these axes are not a partition, they are lenses on the same evidence.
 */
export function byCompetency(
  masteries: readonly KcMastery[],
  kcs: ReadonlyMap<KcId, Kc>,
): AxisScore<Competency>[] {
  const groups = new Map<Competency, KcMastery[]>();
  for (const m of masteries) {
    for (const c of kcs.get(m.kcId)?.competencies ?? []) {
      const g = groups.get(c);
      if (g) g.push(m);
      else groups.set(c, [m]);
    }
  }
  return [...groups].map(([key, group]) => scoreGroup(key, group));
}

/** Aggregate by subject domain. Each KC has exactly one, so this is a partition. */
export function byDomain(
  masteries: readonly KcMastery[],
  kcs: ReadonlyMap<KcId, Kc>,
): AxisScore<Domain>[] {
  const groups = new Map<Domain, KcMastery[]>();
  for (const m of masteries) {
    const d = kcs.get(m.kcId)?.domain;
    if (!d) continue;
    const g = groups.get(d);
    if (g) g.push(m);
    else groups.set(d, [m]);
  }
  return [...groups].map(([key, group]) => scoreGroup(key, group));
}

export function byCourse(
  masteries: readonly KcMastery[],
  kcs: ReadonlyMap<KcId, Kc>,
): AxisScore<string>[] {
  const groups = new Map<string, KcMastery[]>();
  for (const m of masteries) {
    const c = kcs.get(m.kcId)?.courseId;
    if (!c) continue;
    const g = groups.get(c);
    if (g) g.push(m);
    else groups.set(c, [m]);
  }
  return [...groups].map(([key, group]) => scoreGroup(key, group));
}

// ---------------------------------------------------------------------------
// Decay forecasting
// ---------------------------------------------------------------------------

export interface DecayRisk {
  kcId: KcId;
  currentComposite: number;
  projectedComposite: number;
  daysUntilThreshold: number | null;
}

/**
 * Project mastery forward and flag KCs that will fall below `threshold` inside
 * the horizon. This is the feature that earns its keep in August: it names the
 * prerequisites that will be soft by the time the dependent course starts,
 * while there is still time to do something about it.
 */
export function decayRisk(
  states: readonly KcStateInput[],
  opts: { horizonDays: number; threshold?: number; now?: Date } ,
): DecayRisk[] {
  const threshold = opts.threshold ?? BAND_THRESHOLDS.proficient;
  const now = opts.now ?? new Date();
  const horizon = new Date(now.getTime() + opts.horizonDays * 86_400_000);

  const risks: DecayRisk[] = [];
  for (const s of states) {
    if (s.ability.n === 0) continue;
    const current = computeMastery(s, now);
    if (current.composite < threshold) continue; // already below: a gap, not a risk

    const projected = s.pMastery * retrievability(s.retention, horizon);
    if (projected >= threshold) continue;

    // Bisect for the crossing day. The forgetting curve is monotonic in t, so
    // a simple bisection is exact enough for a UI horizon and avoids inverting
    // FSRS's curve analytically (which changes between algorithm versions).
    let lo = 0;
    let hi = opts.horizonDays;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const at = new Date(now.getTime() + mid * 86_400_000);
      if (s.pMastery * retrievability(s.retention, at) >= threshold) lo = mid;
      else hi = mid;
    }

    risks.push({
      kcId: s.kcId,
      currentComposite: current.composite,
      projectedComposite: projected,
      daysUntilThreshold: Math.round(hi * 10) / 10,
    });
  }

  return risks.sort((a, b) => (a.daysUntilThreshold ?? 0) - (b.daysUntilThreshold ?? 0));
}
