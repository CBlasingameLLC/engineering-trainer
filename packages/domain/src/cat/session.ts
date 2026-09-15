import { bktUpdate, DEFAULT_BKT_PARAMS, type BktParams } from '../mastery/bkt.js';
import {
  abilityStandardError,
  DEFAULT_ELO_PARAMS,
  fisherInformation,
  newAbility,
  updateElo,
  type Ability,
  type EloParams,
  type ItemDifficulty,
} from '../mastery/elo.js';
import type { KcGraph } from '../kc-graph/graph.js';
import type { ItemId, KcId, KcRef } from '../types.js';
import {
  DEFAULT_PROPAGATION,
  propagatePriors,
  type ObservedResult,
  type PriorAdjustment,
  type PropagationParams,
} from './propagation.js';

/**
 * Computerised adaptive testing over the KC graph.
 *
 * Goal: place the learner across a whole course in ~45 items rather than ~250,
 * by (a) always asking the most informative question available and (b) mining
 * the prerequisite graph for everything an answer already implies.
 */

export interface CatItem {
  id: ItemId;
  kcRefs: KcRef[];
  /** Difficulty on the logit scale, same units as ability. */
  difficultyB: number;
}

export interface CatConfig {
  /**
   * Stop measuring a KC once its ability standard error drops below this.
   *
   * Calibrated against what a placement budget can actually buy. Standard error
   * falls as 2/sqrt(n) for optimally targeted items, so 1.2 is roughly three
   * well-aimed items on a KC — enough to sort it into a mastery band, which is
   * what placement is for. Tighter targets (0.35 would need ~33 items per KC)
   * are unreachable across a whole course and simply turn every session into
   * `budget-exhausted`.
   *
   * For a broad placement the budget binds first and this value instead shapes
   * *priority*, steering items toward the least-measured KCs. For a narrow
   * single-unit session it is genuinely reachable and ends the session early.
   */
  targetSe: number;
  /** Hard ceiling on items administered. */
  maxItems: number;
  /** Do not stop before this many, even if SE targets are met early. */
  minItems: number;
  elo: EloParams;
  bkt: BktParams;
  propagation: PropagationParams;
  /** Blend factor for exploration; 0 = purely greedy on information. */
  explorationRate: number;
}

export const DEFAULT_CAT_CONFIG: CatConfig = {
  targetSe: 1.2,
  maxItems: 45,
  minItems: 8,
  elo: DEFAULT_ELO_PARAMS,
  bkt: DEFAULT_BKT_PARAMS,
  propagation: DEFAULT_PROPAGATION,
  explorationRate: 0.15,
};

export interface CatSessionState {
  abilities: Map<KcId, Ability>;
  pMastery: Map<KcId, number>;
  difficulties: Map<ItemId, ItemDifficulty>;
  administered: Set<ItemId>;
  /** How many items have exercised each KC, for coverage balancing. */
  exposure: Map<KcId, number>;
  itemCount: number;
}

export function createCatSession(
  targetKcs: readonly KcId[],
  priors: ReadonlyMap<KcId, number> = new Map(),
  config: CatConfig = DEFAULT_CAT_CONFIG,
): CatSessionState {
  const abilities = new Map<KcId, Ability>();
  const pMastery = new Map<KcId, number>();
  for (const kc of targetKcs) {
    const prior = priors.get(kc);
    // Seed theta from any inherited prior so placement resumes rather than restarts.
    abilities.set(kc, newAbility(prior === undefined ? 0 : Math.log(Math.max(prior, 1e-6) / Math.max(1 - prior, 1e-6))));
    pMastery.set(kc, prior ?? config.bkt.pInit);
  }
  return {
    abilities,
    pMastery,
    difficulties: new Map(),
    administered: new Set(),
    exposure: new Map(),
    itemCount: 0,
  };
}

/** How much more evidence a KC still needs, in [0, 1]. Zero once it is settled. */
function evidenceNeed(state: CatSessionState, kcId: KcId, config: CatConfig): number {
  const ability = state.abilities.get(kcId);
  if (!ability) return 0; // not a target of this session
  const se = abilityStandardError(ability);
  if (!Number.isFinite(se)) return 1; // never tested — maximum need
  if (se <= config.targetSe) return 0; // settled
  return Math.min(1, (se - config.targetSe) / config.targetSe);
}

export interface ScoredItem {
  item: CatItem;
  score: number;
}

/**
 * Score an item by the information it would contribute *where information is
 * still wanted*. Raw Fisher information alone would keep drilling the KC the
 * learner is nearest to, ignoring untouched ones; weighting by outstanding
 * need is what produces balanced coverage.
 */
export function scoreItem(state: CatSessionState, item: CatItem, config: CatConfig): number {
  const totalWeight = item.kcRefs.reduce((s, r) => s + r.weight, 0);
  if (totalWeight <= 0) return 0;

  let score = 0;
  for (const ref of item.kcRefs) {
    const need = evidenceNeed(state, ref.kc, config);
    if (need === 0) continue;
    const theta = state.abilities.get(ref.kc)?.theta ?? 0;
    const w = ref.weight / totalWeight;
    const info = fisherInformation(theta, item.difficultyB);
    // Down-weight KCs already seen a lot this session so coverage spreads out.
    const exposurePenalty = 1 / (1 + 0.35 * (state.exposure.get(ref.kc) ?? 0));
    score += w * info * need * exposurePenalty;
  }
  return score;
}

export interface SelectOptions {
  /** Deterministic RNG in [0,1) — injected so tests are reproducible. */
  random?: () => number;
}

/**
 * Pick the next item. Greedy on score, with a small exploration term so two
 * runs over the same bank do not administer an identical exam.
 */
export function selectNextItem(
  state: CatSessionState,
  bank: readonly CatItem[],
  config: CatConfig = DEFAULT_CAT_CONFIG,
  opts: SelectOptions = {},
): CatItem | null {
  const random = opts.random ?? Math.random;

  const candidates: ScoredItem[] = [];
  for (const item of bank) {
    if (state.administered.has(item.id)) continue;
    const score = scoreItem(state, item, config);
    if (score > 0) candidates.push({ item, score });
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));

  // Sample from the top of the ranking rather than always taking the argmax.
  const poolSize = Math.max(1, Math.ceil(candidates.length * config.explorationRate));
  const pool = candidates.slice(0, Math.min(poolSize, candidates.length));
  return pool[Math.floor(random() * pool.length)]?.item ?? candidates[0]!.item;
}

export interface RecordOptions {
  optionCount?: number;
}

/** Fold one graded response into the session state. */
export function recordResponse(
  state: CatSessionState,
  item: CatItem,
  correct: boolean,
  config: CatConfig = DEFAULT_CAT_CONFIG,
  opts: RecordOptions = {},
): CatSessionState {
  const difficulty = state.difficulties.get(item.id) ?? { b: item.difficultyB, n: 0 };
  const { abilities, difficulty: nextDifficulty } = updateElo(
    state.abilities,
    difficulty,
    item.kcRefs,
    correct,
    config.elo,
  );

  const pMastery = new Map(state.pMastery);
  const exposure = new Map(state.exposure);
  for (const ref of item.kcRefs) {
    const prev = pMastery.get(ref.kc) ?? config.bkt.pInit;
    // Partial attribution means partial credit: a 30%-weighted KC should not
    // absorb a full learning opportunity from an item mostly about something else.
    const updated = bktUpdate(prev, correct, config.bkt, opts.optionCount);
    pMastery.set(ref.kc, prev + ref.weight * (updated - prev));
    exposure.set(ref.kc, (exposure.get(ref.kc) ?? 0) + 1);
  }

  const difficulties = new Map(state.difficulties);
  difficulties.set(item.id, nextDifficulty);

  return {
    abilities,
    pMastery,
    difficulties,
    administered: new Set(state.administered).add(item.id),
    exposure,
    itemCount: state.itemCount + 1,
  };
}

export interface StopDecision {
  stop: boolean;
  reason: 'budget-exhausted' | 'targets-met' | 'bank-exhausted' | 'continue';
  /** KCs still above the SE target. */
  outstanding: KcId[];
}

export function shouldStop(
  state: CatSessionState,
  bank: readonly CatItem[],
  config: CatConfig = DEFAULT_CAT_CONFIG,
): StopDecision {
  const outstanding = [...state.abilities.keys()].filter(
    (kc) => evidenceNeed(state, kc, config) > 0,
  );

  if (state.itemCount >= config.maxItems) {
    return { stop: true, reason: 'budget-exhausted', outstanding };
  }
  if (state.itemCount >= config.minItems && outstanding.length === 0) {
    return { stop: true, reason: 'targets-met', outstanding };
  }
  if (selectNextItem(state, bank, config, { random: () => 0 }) === null) {
    return { stop: true, reason: 'bank-exhausted', outstanding };
  }
  return { stop: false, reason: 'continue', outstanding };
}

export interface PlacementResult {
  /** Directly measured KCs. */
  measured: ObservedResult[];
  /** KCs inferred from the prerequisite graph rather than asked about. */
  inferred: Map<KcId, PriorAdjustment>;
  itemsAdministered: number;
  stopReason: StopDecision['reason'];
}

/** Close out a placement session and mine the graph for everything it implies. */
export function finalizePlacement(
  state: CatSessionState,
  graph: KcGraph,
  stopReason: StopDecision['reason'],
  config: CatConfig = DEFAULT_CAT_CONFIG,
): PlacementResult {
  const measured: ObservedResult[] = [];
  for (const [kcId, ability] of state.abilities) {
    if (ability.n === 0) continue;
    measured.push({
      kcId,
      mastery: state.pMastery.get(kcId) ?? config.bkt.pInit,
      standardError: abilityStandardError(ability),
      observations: ability.n,
    });
  }
  return {
    measured,
    inferred: propagatePriors(graph, measured, config.propagation),
    itemsAdministered: state.itemCount,
    stopReason,
  };
}
