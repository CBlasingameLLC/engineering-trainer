import type { KcGraph } from '../kc-graph/graph.js';
import type { KcMastery } from '../mastery/composite.js';
import type { Kc, KcId } from '../types.js';

/**
 * The current term, joined to the knowledge graph.
 *
 * The rest of `packages/domain` answers "what does this learner know". This
 * file answers "what do they need to know **by when**", and the two produce
 * different work. Left alone, the scheduler will keep proposing the most
 * decayed prerequisite in the whole degree; that is the right answer to its
 * own question and the wrong thing to do the week before a thermodynamics
 * exam.
 *
 * The valuable output is not "study what you are covering now" — a learner can
 * work that out unaided. It is `termReadiness`: the prerequisites of what is
 * *about to be covered*, ranked by how far they have slipped. That is the
 * product's whole thesis with a deadline attached, and it is the one thing a
 * syllabus cannot tell you and a gradebook cannot either.
 *
 * Shapes mirror `@et/content-schema`'s `Term` structurally rather than
 * importing it: this package stays free of the content contract, the same way
 * it stays free of I/O.
 */

export interface TermBlockInput {
  fromWeek: number;
  toWeek: number;
  units: readonly string[];
  note?: string | undefined;
}

export interface TermCourseInput {
  course: string;
  blocks: readonly TermBlockInput[];
}

export interface TermInput {
  id: string;
  title: string;
  startsOn: string;
  endsOn: string;
  courses: readonly TermCourseInput[];
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** Midnight UTC for a `YYYY-MM-DD` string, so week arithmetic has no timezone in it. */
const dayOf = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

/**
 * Which week of the term a date falls in, 1-based.
 *
 * Before the term starts this is 0 or negative, and after it ends it exceeds
 * the term's length. Both are returned rather than clamped, because "the term
 * has not started" and "week 1" are different situations and the caller is the
 * one that knows what to do about each.
 */
export function termWeek(term: TermInput, now: Date = new Date()): number {
  const elapsed = now.getTime() - dayOf(term.startsOn);
  return Math.floor(elapsed / MS_PER_WEEK) + 1;
}

export const termLengthWeeks = (term: TermInput): number =>
  Math.max(1, Math.ceil((dayOf(term.endsOn) - dayOf(term.startsOn)) / MS_PER_WEEK));

export const termIsRunning = (term: TermInput, now: Date = new Date()): boolean => {
  const week = termWeek(term, now);
  return week >= 1 && week <= termLengthWeeks(term);
};

export interface ScheduledUnit {
  course: string;
  unit: string;
  fromWeek: number;
  toWeek: number;
  note?: string | undefined;
  /** Weeks until this unit starts. 0 while it is running, negative once past. */
  startsInWeeks: number;
}

/** Every unit the term schedules, flattened and annotated against `now`. */
export function scheduledUnits(term: TermInput, now: Date = new Date()): ScheduledUnit[] {
  const week = termWeek(term, now);
  const out: ScheduledUnit[] = [];
  for (const course of term.courses) {
    for (const block of course.blocks) {
      for (const unit of block.units) {
        out.push({
          course: course.course,
          unit,
          fromWeek: block.fromWeek,
          toWeek: block.toWeek,
          ...(block.note === undefined ? {} : { note: block.note }),
          startsInWeeks: week >= block.fromWeek && week <= block.toWeek ? 0 : block.fromWeek - week,
        });
      }
    }
  }
  return out;
}

export const liveUnits = (term: TermInput, now: Date = new Date()): ScheduledUnit[] =>
  scheduledUnits(term, now).filter((u) => u.startsInWeeks === 0);

/** Units starting within the next `weeks`, soonest first. */
export function upcomingUnits(term: TermInput, weeks = 3, now: Date = new Date()): ScheduledUnit[] {
  return scheduledUnits(term, now)
    .filter((u) => u.startsInWeeks > 0 && u.startsInWeeks <= weeks)
    .sort((a, b) => a.startsInWeeks - b.startsInWeeks || a.course.localeCompare(b.course));
}

export interface TermFocus {
  week: number;
  running: boolean;
  live: ScheduledUnit[];
  upcoming: ScheduledUnit[];
  /** KCs of the live units. */
  liveKcs: KcId[];
  /** KCs of the upcoming units. */
  upcomingKcs: KcId[];
  /** Courses on the term with no knowledge components at all. */
  coursesWithoutGraph: string[];
}

const unitKey = (course: string, unit: string): string => `${course}\u0000${unit}`;

/**
 * Resolve the term's unit names against the graph.
 *
 * A unit name that matches nothing contributes no KCs, which is silent by
 * nature — so the courses that resolved to nothing at all are reported
 * separately. A course on the term with no graph yet is a normal state while
 * its material is still being written, not an error.
 */
export function termFocus(
  term: TermInput,
  kcs: Iterable<Kc>,
  options: { upcomingWeeks?: number; now?: Date } = {},
): TermFocus {
  const now = options.now ?? new Date();
  const byUnit = new Map<string, KcId[]>();
  const coursesWithKcs = new Set<string>();
  for (const kc of kcs) {
    coursesWithKcs.add(kc.courseId);
    const key = unitKey(kc.courseId, kc.unit);
    const list = byUnit.get(key);
    if (list) list.push(kc.id);
    else byUnit.set(key, [kc.id]);
  }

  const live = liveUnits(term, now);
  const upcoming = upcomingUnits(term, options.upcomingWeeks ?? 3, now);
  const resolve = (units: readonly ScheduledUnit[]): KcId[] => [
    ...new Set(units.flatMap((u) => byUnit.get(unitKey(u.course, u.unit)) ?? [])),
  ];

  return {
    week: termWeek(term, now),
    running: termIsRunning(term, now),
    live,
    upcoming,
    liveKcs: resolve(live),
    upcomingKcs: resolve(upcoming),
    coursesWithoutGraph: term.courses.map((c) => c.course).filter((c) => !coursesWithKcs.has(c)),
  };
}

export interface ReadinessGap {
  /** The prerequisite that has slipped. */
  kc: KcId;
  /** The KC on the term that depends on it. */
  neededBy: KcId;
  course: string;
  unit: string;
  /** Weeks until the dependent unit starts; 0 if it is already running. */
  startsInWeeks: number;
  composite: number;
  diagnosis: KcMastery['diagnosis'];
  /** Ranking score: low mastery, strong dependence and an imminent unit all raise it. */
  urgency: number;
}

const PREREQUISITE_THRESHOLD = 0.65;

/**
 * Prerequisites of the term's near-future material that are not ready.
 *
 * This is the whole point of having a term at all. A decayed prerequisite is
 * worth fixing at any time; a decayed prerequisite of the unit that starts in
 * eleven days is worth fixing *now*, and nothing else in the app can tell those
 * two apart.
 *
 * Ranking multiplies three things, and each of them changes the answer:
 *
 * - **How far it has slipped.** A KC at 0.2 is worth more attention than one at
 *   0.6, and an untested one is worth asking about rather than assuming.
 * - **How strongly the coming material leans on it.** The graph's edge weights
 *   already say this, and a weak edge should not outrank a strong one.
 * - **How soon.** Something already running beats something three weeks out.
 *
 * `untested` is deliberately included rather than filtered. "You have never
 * been asked about integration by parts and the unit that needs it starts
 * Monday" is exactly as actionable as a measured gap, and excluding it would
 * mean the term view is quietest for the learner who has used the app least.
 */
export function termReadiness(
  graph: KcGraph,
  mastery: ReadonlyMap<KcId, KcMastery>,
  focus: TermFocus,
  options: { maxDepth?: number; limit?: number } = {},
): ReadinessGap[] {
  const maxDepth = options.maxDepth ?? 3;
  const unitOf = new Map<KcId, ScheduledUnit>();
  for (const unit of [...focus.live, ...focus.upcoming]) {
    for (const kc of graph.kcs.values()) {
      if (kc.courseId === unit.course && kc.unit === unit.unit) unitOf.set(kc.id, unit);
    }
  }

  // A term KC is its own prerequisite for this purpose only if it is already
  // being covered — there is no point warning that next month's topic is
  // unlearned, which is what "next month's topic" means.
  const best = new Map<KcId, ReadinessGap>();

  for (const [target, unit] of unitOf) {
    const candidates: { kc: KcId; strength: number; distance: number }[] = graph
      .ancestors(target, maxDepth)
      .map((n) => ({ kc: n.kcId, strength: n.strength, distance: n.distance }));
    if (unit.startsInWeeks === 0) candidates.push({ kc: target, strength: 1, distance: 0 });

    for (const candidate of candidates) {
      // A prerequisite that is itself on the term's live schedule is being
      // taught right now, so reporting it as a gap would be telling the learner
      // that this week's lecture is a problem.
      if (candidate.distance > 0 && unitOf.get(candidate.kc)?.startsInWeeks === 0) continue;

      const m = mastery.get(candidate.kc);
      const composite = m?.composite ?? 0;
      const diagnosis = m?.diagnosis ?? 'untested';
      if (diagnosis !== 'untested' && composite >= PREREQUISITE_THRESHOLD) continue;

      // An untested KC is a real unknown but not a measured gap, so it sits
      // just below a confirmed one of the same depth rather than above it.
      const shortfall = diagnosis === 'untested' ? 0.55 : PREREQUISITE_THRESHOLD - composite;
      const imminence = 1 / (1 + Math.max(0, unit.startsInWeeks));
      const urgency = shortfall * candidate.strength * imminence;

      const existing = best.get(candidate.kc);
      if (!existing || urgency > existing.urgency) {
        best.set(candidate.kc, {
          kc: candidate.kc,
          neededBy: target,
          course: unit.course,
          unit: unit.unit,
          startsInWeeks: unit.startsInWeeks,
          composite,
          diagnosis,
          urgency: Number(urgency.toFixed(6)),
        });
      }
    }
  }

  const ranked = [...best.values()].sort((a, b) => b.urgency - a.urgency || a.kc.localeCompare(b.kc));
  return options.limit === undefined ? ranked : ranked.slice(0, options.limit);
}
