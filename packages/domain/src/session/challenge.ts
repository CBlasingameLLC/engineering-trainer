import type { KcGraph } from '../kc-graph/graph.js';
import type { CourseId, KcId } from '../types.js';

/**
 * Challenge exams — the "boss fight" for a course.
 *
 * Passing marks a course as tested out and awards its crest. That is a real
 * claim about the learner, so the bar is deliberately not just "got most of
 * them right": a pass also requires *coverage*. Answering fifteen questions
 * correctly on the three topics you happen to know is not evidence about a
 * course, and a mechanic that accepted it would be lying to the person using it.
 */

export interface ChallengeConfig {
  /** Fraction of items that must be correct. */
  passThreshold: number;
  /** Fraction of the course's KCs the exam must actually touch. */
  coverageThreshold: number;
  /** Minimum items before a result means anything. */
  minItems: number;
  /** No KC may fall below this fraction correct, when it was tested more than once. */
  perKcFloor: number;
}

export const DEFAULT_CHALLENGE_CONFIG: ChallengeConfig = {
  passThreshold: 0.8,
  coverageThreshold: 0.7,
  minItems: 20,
  perKcFloor: 0.5,
};

export interface ChallengeResponse {
  kcIds: KcId[];
  correct: boolean;
}

export interface ChallengeResult {
  courseId: CourseId;
  passed: boolean;
  itemsAnswered: number;
  correctCount: number;
  scoreFraction: number;
  /** Fraction of the course's KCs the exam touched. */
  coverage: number;
  /** KCs that fell below the per-KC floor. */
  failedKcs: KcId[];
  /** Why it did not pass, in plain language. Empty when it did. */
  reasons: string[];
  /** Awarded only on a pass. */
  crest: boolean;
}

export function gradeChallenge(
  courseId: CourseId,
  graph: KcGraph,
  responses: readonly ChallengeResponse[],
  config: ChallengeConfig = DEFAULT_CHALLENGE_CONFIG,
): ChallengeResult {
  const courseKcs = [...graph.kcs.values()].filter((kc) => kc.courseId === courseId).map((kc) => kc.id);
  const courseKcSet = new Set(courseKcs);

  const correctCount = responses.filter((r) => r.correct).length;
  const itemsAnswered = responses.length;
  const scoreFraction = itemsAnswered === 0 ? 0 : correctCount / itemsAnswered;

  const touched = new Set<KcId>();
  const tally = new Map<KcId, { seen: number; right: number }>();
  for (const response of responses) {
    for (const kcId of response.kcIds) {
      if (!courseKcSet.has(kcId)) continue;
      touched.add(kcId);
      const entry = tally.get(kcId) ?? { seen: 0, right: 0 };
      entry.seen++;
      if (response.correct) entry.right++;
      tally.set(kcId, entry);
    }
  }

  const coverage = courseKcs.length === 0 ? 0 : touched.size / courseKcs.length;

  // Only judge a KC that was asked about more than once; a single miss is noise.
  const failedKcs = [...tally.entries()]
    .filter(([, t]) => t.seen > 1 && t.right / t.seen < config.perKcFloor)
    .map(([kcId]) => kcId)
    .sort();

  const reasons: string[] = [];
  if (itemsAnswered < config.minItems) {
    reasons.push(`only ${itemsAnswered} of ${config.minItems} items answered`);
  }
  if (scoreFraction < config.passThreshold) {
    reasons.push(
      `scored ${Math.round(scoreFraction * 100)}%, needs ${Math.round(config.passThreshold * 100)}%`,
    );
  }
  if (coverage < config.coverageThreshold) {
    reasons.push(
      `covered ${Math.round(coverage * 100)}% of the course, needs ${Math.round(config.coverageThreshold * 100)}%`,
    );
  }
  if (failedKcs.length > 0) {
    reasons.push(`${failedKcs.length} topic(s) below the per-topic floor`);
  }

  const passed = reasons.length === 0;
  return {
    courseId,
    passed,
    itemsAnswered,
    correctCount,
    scoreFraction,
    coverage,
    failedKcs,
    reasons,
    crest: passed,
  };
}

/** Is the learner plausibly ready to attempt the boss, or would it just be discouraging? */
export function challengeReadiness(
  courseId: CourseId,
  graph: KcGraph,
  mastery: ReadonlyMap<KcId, { composite: number; attempts: number }>,
): { ready: boolean; averageMastery: number; untested: number } {
  const courseKcs = [...graph.kcs.values()].filter((kc) => kc.courseId === courseId);
  if (courseKcs.length === 0) return { ready: false, averageMastery: 0, untested: 0 };

  const composites = courseKcs.map((kc) => mastery.get(kc.id)?.composite ?? 0);
  const averageMastery = composites.reduce((a, b) => a + b, 0) / composites.length;
  const untested = courseKcs.filter((kc) => (mastery.get(kc.id)?.attempts ?? 0) === 0).length;

  return {
    ready: averageMastery >= 0.6 && untested <= courseKcs.length * 0.25,
    averageMastery,
    untested,
  };
}
