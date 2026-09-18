import type { Attempt, KcId, KcRef } from '../types.js';

/**
 * Elo layer — answers "how hard should the next question be?"
 *
 * Fast-converging and cold-start friendly, so it drives *item selection*
 * during adaptive placement. It is deliberately NOT the number shown to the
 * user: Elo has no notion of forgetting. See `composite.ts`.
 *
 * Model is Rasch/1PL: P(correct) = sigma(theta_kc - b_item).
 */

export interface EloParams {
  /** Numerator of the uncertainty-scaled learning rate. */
  a: number;
  /** Decay of the learning rate with observation count. */
  c: number;
  /** Item difficulty moves slower than learner ability. */
  itemRate: number;
}

export const DEFAULT_ELO_PARAMS: EloParams = { a: 0.8, c: 0.05, itemRate: 0.4 };

export interface Ability {
  /** Latent ability on the logit scale. */
  theta: number;
  /** Observations incorporated. */
  n: number;
  /**
   * Accumulated Fisher information, sum of w^2 * P(1-P). The standard error of
   * the theta estimate is 1/sqrt(info), which is what the CAT stopping rule
   * tests against.
   */
  info: number;
}

export interface ItemDifficulty {
  /** Difficulty on the logit scale, same units as theta. */
  b: number;
  n: number;
}

export const newAbility = (theta = 0): Ability => ({ theta, n: 0, info: 0 });

export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/** Probability that a learner of ability `theta` answers an item of difficulty `b`. */
export const expectedScore = (theta: number, b: number): number => sigmoid(theta - b);

/**
 * Uncertainty-scaled learning rate (Pelanek). Early observations move the
 * estimate a long way; later ones refine it. Without this, Elo either crawls
 * during placement or never settles during practice.
 */
export const uncertaintyK = (n: number, p: EloParams): number => p.a / (1 + p.c * n);

/** Standard error of the ability estimate. Infinite until any information exists. */
export const abilityStandardError = (a: Ability): number =>
  a.info <= 0 ? Number.POSITIVE_INFINITY : 1 / Math.sqrt(a.info);

/**
 * Fisher information an item of difficulty `b` yields about ability `theta`.
 * Maximised when b === theta, which is the basis of adaptive item selection.
 */
export const fisherInformation = (theta: number, b: number): number => {
  const p = expectedScore(theta, b);
  return p * (1 - p);
};

export interface EloUpdate {
  abilities: Map<KcId, Ability>;
  difficulty: ItemDifficulty;
}

/**
 * Apply one graded response.
 *
 * Multivariate: an item attributed 70% nodal-analysis / 30% ideal-op-amp
 * updates both KCs in proportion. The expected score uses the weighted mean
 * ability across the item's KCs, because that is what the learner actually
 * brought to bear on the item.
 */
export function updateElo(
  abilities: Map<KcId, Ability>,
  difficulty: ItemDifficulty,
  kcRefs: KcRef[],
  correct: boolean,
  params: EloParams = DEFAULT_ELO_PARAMS,
): EloUpdate {
  if (kcRefs.length === 0) throw new Error('updateElo: item has no KC attribution');

  const totalWeight = kcRefs.reduce((s, r) => s + r.weight, 0);
  if (totalWeight <= 0) throw new Error('updateElo: KC weights must sum to a positive value');

  // Weighted-mean ability actually applied to this item.
  const effectiveTheta =
    kcRefs.reduce((s, r) => s + r.weight * (abilities.get(r.kc)?.theta ?? 0), 0) / totalWeight;

  const p = expectedScore(effectiveTheta, difficulty.b);
  const y = correct ? 1 : 0;
  const err = y - p;

  const nextAbilities = new Map(abilities);
  for (const ref of kcRefs) {
    const prev = abilities.get(ref.kc) ?? newAbility();
    const w = ref.weight / totalWeight;
    nextAbilities.set(ref.kc, {
      theta: prev.theta + uncertaintyK(prev.n, params) * w * err,
      n: prev.n + 1,
      // Information is weighted by attribution squared: a 30%-weighted item
      // tells us far less about that KC than a dedicated one does.
      info: prev.info + w * w * fisherInformation(effectiveTheta, difficulty.b),
    });
  }

  return {
    abilities: nextAbilities,
    difficulty: {
      b: difficulty.b - params.itemRate * uncertaintyK(difficulty.n, params) * err,
      n: difficulty.n + 1,
    },
  };
}

/** Convenience wrapper for replaying a stored attempt. */
export const applyAttempt = (
  abilities: Map<KcId, Ability>,
  difficulty: ItemDifficulty,
  attempt: Attempt,
  params: EloParams = DEFAULT_ELO_PARAMS,
): EloUpdate => updateElo(abilities, difficulty, attempt.kcRefs, attempt.correct, params);
