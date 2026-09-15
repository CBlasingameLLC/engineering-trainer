import {
  DEFAULT_BKT_PARAMS,
  DEFAULT_ELO_PARAMS,
  GRADE_TO_PRIOR,
  applyAttemptToRetention,
  bktUpdate,
  computeMastery,
  decayRisk,
  newAbility,
  newRetention,
  seedFromCourseCompletion,
  updateElo,
  type Ability,
  type Kc,
  type KcGraph,
  type KcId,
  type KcMastery,
  type KcStateInput,
  type RetentionState,
} from '@et/domain';
import type { AttemptRecord, CompletedCourse, InferredPrior, Profile } from '@/storage/types';

/**
 * The learner model, rebuilt from the attempt log on every load.
 *
 * Nothing about mastery is stored as truth. Attempts are the only durable
 * record, and every ability, belief and retention figure is a projection over
 * them. That costs a replay at startup and buys the ability to change the
 * mastery parameters - slip and guess rates, Elo learning rate, decay
 * thresholds - and have the whole history re-scored under the new model rather
 * than being stuck with whatever the old one concluded.
 */

export interface LearnerModel {
  abilities: Map<KcId, Ability>;
  pMastery: Map<KcId, number>;
  retention: Map<KcId, RetentionState>;
  masteries: KcMastery[];
  byKc: Map<KcId, KcMastery>;
}

/**
 * Seed a KC that belongs to a course the learner has already taken.
 *
 * What is actually known is thin: they passed, with some grade, at some date.
 * The retention model is therefore given a single distant learning event rather
 * than a fabricated study history - see seedFromCourseCompletion for why
 * inventing one inflates stability badly enough to defeat decay detection.
 */
function seedCompletedCourse(
  graph: KcGraph,
  course: CompletedCourse,
  state: { pMastery: Map<KcId, number>; retention: Map<KcId, RetentionState>; abilities: Map<KcId, Ability> },
): void {
  const completedAt = new Date(course.completedAt);
  for (const kc of graph.kcs.values()) {
    if (kc.courseId !== course.code) continue;
    state.pMastery.set(kc.id, GRADE_TO_PRIOR[course.grade]);
    state.retention.set(kc.id, seedFromCourseCompletion(completedAt, course.grade));
    // No direct observations, so ability carries no information yet; the prior
    // shows up as belief, not as a measured theta.
    state.abilities.set(kc.id, newAbility(0));
  }
}

export interface BuildOptions {
  now?: Date;
}

export function buildLearnerModel(
  graph: KcGraph,
  profile: Profile,
  attempts: readonly AttemptRecord[],
  priors: readonly InferredPrior[],
  options: BuildOptions = {},
): LearnerModel {
  const now = options.now ?? new Date();

  const abilities = new Map<KcId, Ability>();
  const pMastery = new Map<KcId, number>();
  const retention = new Map<KcId, RetentionState>();

  for (const kc of graph.kcs.values()) {
    abilities.set(kc.id, newAbility(0));
    pMastery.set(kc.id, DEFAULT_BKT_PARAMS.pInit);
    retention.set(kc.id, newRetention(now));
  }

  // 1. Coursework the learner reported. Weakest evidence, applied first.
  for (const course of profile.completedCourses) {
    seedCompletedCourse(graph, course, { abilities, pMastery, retention });
  }

  // 2. Priors inferred through the prerequisite graph. Stronger than a course
  //    report, weaker than a direct answer, so they only raise an untouched KC.
  for (const prior of priors) {
    if (!graph.has(prior.kcId)) continue;
    const current = pMastery.get(prior.kcId) ?? DEFAULT_BKT_PARAMS.pInit;
    if (prior.prior > current) pMastery.set(prior.kcId, prior.prior);
  }

  // 3. Direct responses, replayed in order. Always wins over the above.
  const latencies = new Map<KcId, number[]>();
  for (const attempt of attempts) {
    const difficulty = { b: 0, n: 50 }; // item difficulty is calibrated in the bank, not here
    const updated = updateElo(abilities, difficulty, attempt.kcRefs, attempt.correct, DEFAULT_ELO_PARAMS);
    for (const [kcId, ability] of updated.abilities) abilities.set(kcId, ability);

    for (const ref of attempt.kcRefs) {
      const previous = pMastery.get(ref.kc) ?? DEFAULT_BKT_PARAMS.pInit;
      const next = bktUpdate(previous, attempt.correct, DEFAULT_BKT_PARAMS, attempt.optionCount);
      // Partial attribution earns partial belief movement.
      pMastery.set(ref.kc, previous + ref.weight * (next - previous));

      const seen = latencies.get(ref.kc) ?? [];
      const median = seen.length > 0 ? [...seen].sort((a, b) => a - b)[Math.floor(seen.length / 2)] : undefined;
      const current = retention.get(ref.kc) ?? newRetention(attempt.at);
      retention.set(ref.kc, applyAttemptToRetention(current, attempt, median));
      seen.push(attempt.latencyMs);
      latencies.set(ref.kc, seen);
    }
  }

  const masteries = [...graph.kcs.keys()].map((kcId) =>
    computeMastery(
      {
        kcId,
        pMastery: pMastery.get(kcId) ?? DEFAULT_BKT_PARAMS.pInit,
        ability: abilities.get(kcId) ?? newAbility(0),
        retention: retention.get(kcId) ?? newRetention(now),
      },
      now,
    ),
  );

  return {
    abilities,
    pMastery,
    retention,
    masteries,
    byKc: new Map(masteries.map((m) => [m.kcId, m])),
  };
}

/** Assemble the inputs decayRisk expects from a built model. */
export function stateInputs(model: LearnerModel, graph: KcGraph): KcStateInput[] {
  return [...graph.kcs.keys()].map((kcId) => ({
    kcId,
    pMastery: model.pMastery.get(kcId) ?? DEFAULT_BKT_PARAMS.pInit,
    ability: model.abilities.get(kcId) ?? newAbility(0),
    retention: model.retention.get(kcId)!,
  }));
}

export interface UpcomingRisk {
  kc: Kc;
  daysUntilThreshold: number | null;
  currentComposite: number;
  projectedComposite: number;
}

/**
 * Prerequisites that will have decayed below proficiency by the time the target
 * term starts. This is the report that earns its keep in August.
 */
export function upcomingDecay(
  model: LearnerModel,
  graph: KcGraph,
  horizonDays: number,
  now = new Date(),
): UpcomingRisk[] {
  return decayRisk(stateInputs(model, graph), { horizonDays, now })
    .map((risk) => {
      const kc = graph.kcs.get(risk.kcId);
      return kc
        ? {
            kc,
            daysUntilThreshold: risk.daysUntilThreshold,
            currentComposite: risk.currentComposite,
            projectedComposite: risk.projectedComposite,
          }
        : null;
    })
    .filter((r): r is UpcomingRisk => r !== null);
}
