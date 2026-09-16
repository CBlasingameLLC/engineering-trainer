import type { KcId, MisconceptionId } from '../types.js';

/**
 * Ranking recurring errors, and deciding when one has earned a drill.
 *
 * Every wrong answer already carries a diagnosis: distractors and traps are
 * tagged with the specific error that produces them, and those tags have been
 * recorded since the first placement exam. Nothing read them. That is the gap
 * this closes — the evidence was complete and the loop it exists to serve was
 * never built.
 *
 * The hard part is not counting. It is deciding which of a hundred logged
 * errors is worth a learner's attention today, and that is a judgement about
 * three different things:
 *
 *   - **Recency.** Five sign errors last March and none since is a *solved*
 *     problem. Raw totals cannot tell that apart from five errors this week,
 *     and would rank a habit the learner already broke above one they still
 *     have.
 *   - **Spread.** The same error under six different KCs is a habit; six hits
 *     under one KC is confusion about one topic. The first is both more
 *     valuable to fix and invisible to any per-course view — it is the whole
 *     argument for the competency axis, applied to errors.
 *   - **Direction.** Whether it is getting better matters more than the level.
 *     An error that is fading needs no intervention; the same count trending
 *     upward does.
 */

export interface MisconceptionHit {
  misconceptionId: MisconceptionId;
  kcId: KcId;
  at: Date;
}

export interface MisconceptionConfig {
  /** Hits inside this many days count toward firing a drill. */
  windowDays: number;
  /** How many hits inside the window before a targeted drill is warranted. */
  drillThreshold: number;
  /** Days over which a hit's contribution to the score halves. */
  halfLifeDays: number;
  /** Errors last seen longer ago than this are treated as resolved and hidden. */
  staleDays: number;
}

/**
 * The window and threshold come straight from the design: three hits in a
 * fortnight. They are deliberately forgiving — two hits is a coincidence, and a
 * drill fired on a coincidence trains the learner to ignore drills.
 *
 * The half-life is shorter than the window on purpose, so that within a single
 * window a hit from yesterday outranks one from ten days ago. Setting them
 * equal would make the ranking flat across the window and the feed would
 * reorder itself only when hits expired, which reads as stale.
 */
export const DEFAULT_MISCONCEPTION_CONFIG: MisconceptionConfig = {
  windowDays: 14,
  drillThreshold: 3,
  halfLifeDays: 10,
  staleDays: 90,
};

export type MisconceptionTrend = 'new' | 'worsening' | 'steady' | 'fading';

export interface RankedMisconception {
  misconceptionId: MisconceptionId;
  /** Every recorded hit, newest first. */
  hits: MisconceptionHit[];
  totalHits: number;
  /** Hits inside the drill window. */
  recentHits: number;
  /** Distinct KCs this error has appeared under, newest first. */
  kcs: KcId[];
  /** Distinct courses, derived from the KC id prefix. */
  courses: string[];
  /**
   * True when the error crosses a course boundary — the signal that it is a
   * habit rather than a local confusion, and the one a gradebook cannot show.
   */
  crossCourse: boolean;
  lastSeen: Date;
  /** Recency-weighted frequency, scaled by spread. The ranking key. */
  score: number;
  trend: MisconceptionTrend;
  /** True when the window threshold is met and a targeted drill is warranted. */
  drillDue: boolean;
}

const DAY_MS = 86_400_000;

const ageInDays = (at: Date, now: Date): number => (now.getTime() - at.getTime()) / DAY_MS;

/** The course a KC belongs to, e.g. `ee2300.thevenin` -> `ee2300`. */
export const courseOfKc = (kcId: KcId): string => kcId.split('.')[0] ?? kcId;

/**
 * Rank every distinct misconception in the log.
 *
 * Pure and replayable, like everything else in this package: the same event log
 * always produces the same ranking for a given `now`, so a feed can be
 * recomputed from the attempt history rather than maintained incrementally.
 */
export function rankMisconceptions(
  events: readonly MisconceptionHit[],
  now: Date = new Date(),
  config: MisconceptionConfig = DEFAULT_MISCONCEPTION_CONFIG,
): RankedMisconception[] {
  const byId = new Map<MisconceptionId, MisconceptionHit[]>();
  for (const event of events) {
    if (ageInDays(event.at, now) > config.staleDays) continue;
    const bucket = byId.get(event.misconceptionId);
    if (bucket) bucket.push(event);
    else byId.set(event.misconceptionId, [event]);
  }

  const ranked: RankedMisconception[] = [];

  for (const [misconceptionId, raw] of byId) {
    const hits = [...raw].sort((a, b) => b.at.getTime() - a.at.getTime());
    const recentHits = hits.filter((h) => ageInDays(h.at, now) <= config.windowDays).length;

    // Exponential recency weighting. A hit contributes 1 the day it happens and
    // half that after one half-life, so an error the learner has stopped making
    // sinks on its own rather than needing to be expired by a cutoff.
    const weighted = hits.reduce(
      (sum, hit) => sum + 0.5 ** (ageInDays(hit.at, now) / config.halfLifeDays),
      0,
    );

    const kcs = [...new Set(hits.map((h) => h.kcId))];
    const courses = [...new Set(kcs.map(courseOfKc))];

    // Spread multiplier, logarithmic so the second KC matters much more than
    // the ninth: the jump from "one topic" to "more than one topic" is the
    // qualitative change, and everything past that is degree.
    const spread = 1 + 0.5 * Math.log2(kcs.length);

    ranked.push({
      misconceptionId,
      hits,
      totalHits: hits.length,
      recentHits,
      kcs,
      courses,
      crossCourse: courses.length > 1,
      lastSeen: hits[0]!.at,
      score: weighted * spread,
      trend: trendOf(hits, now, config),
      drillDue: recentHits >= config.drillThreshold,
    });
  }

  return ranked.sort(
    (a, b) => b.score - a.score || b.totalHits - a.totalHits || a.misconceptionId.localeCompare(b.misconceptionId),
  );
}

/**
 * Direction of travel, by comparing the two halves of the window.
 *
 * Deliberately crude. A regression over six data points would be false
 * precision, and the only decision this feeds is which of three words to put
 * next to the count. What it must get right is the asymmetry: an error seen
 * only in the older half is fading even if the count is high, and that is the
 * case a raw total gets exactly backwards.
 */
function trendOf(
  hits: readonly MisconceptionHit[],
  now: Date,
  config: MisconceptionConfig,
): MisconceptionTrend {
  const half = config.windowDays / 2;
  let recent = 0;
  let previous = 0;

  for (const hit of hits) {
    const age = ageInDays(hit.at, now);
    if (age <= half) recent++;
    else if (age <= config.windowDays) previous++;
  }

  // Nothing in the earlier half means there is no trend yet, only a first
  // appearance. Calling that "worsening" because recent > 0 would label every
  // error in a learner's first session as deteriorating — which is both false
  // and, worse, indistinguishable from the case that genuinely is. Reserving
  // the word for a real comparison is what lets it carry weight later.
  if (previous === 0) return 'new';

  if (recent > previous) return 'worsening';
  if (recent < previous) return 'fading';
  return 'steady';
}
