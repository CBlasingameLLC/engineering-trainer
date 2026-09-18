import type { Attempt } from '../types.js';

/**
 * Bayesian Knowledge Tracing — answers "has this been learned?"
 *
 * Two-state hidden Markov model per KC. This is the number behind the user's
 * mastery bar, but on its own it is over-optimistic: BKT has no forgetting
 * term, so P(L) never falls just because nine months went by. Pairing it with
 * FSRS retrievability is what fixes that (see `composite.ts`).
 */

export interface BktParams {
  /** P(L0) — prior probability the KC is already known. */
  pInit: number;
  /** P(T) — probability of transitioning unlearned -> learned per opportunity. */
  pTransit: number;
  /** P(S) — probability of answering wrong despite knowing it. */
  pSlip: number;
  /** P(G) — probability of answering right without knowing it. */
  pGuess: number;
}

export const DEFAULT_BKT_PARAMS: BktParams = {
  pInit: 0.15,
  pTransit: 0.12,
  pSlip: 0.1,
  pGuess: 0.05,
};

/**
 * Guess probability for an item. Multiple choice has a hard floor at 1/n —
 * treating a 4-option item as if guessing were impossible inflates mastery.
 */
export const guessFloor = (params: BktParams, optionCount?: number): number =>
  optionCount && optionCount > 1 ? Math.max(params.pGuess, 1 / optionCount) : params.pGuess;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * Posterior P(L | observation) — Bayes' rule conditioned on the response,
 * *before* the learning opportunity is applied.
 */
export function bktPosterior(pL: number, correct: boolean, params: BktParams, optionCount?: number): number {
  const slip = params.pSlip;
  const guess = guessFloor(params, optionCount);

  const numerator = correct ? pL * (1 - slip) : pL * slip;
  const denominator = correct
    ? pL * (1 - slip) + (1 - pL) * guess
    : pL * slip + (1 - pL) * (1 - guess);

  // Degenerate only if slip/guess are set to impossible values; fall back to prior.
  if (denominator <= Number.EPSILON) return pL;
  return clamp01(numerator / denominator);
}

/**
 * Full BKT step: condition on the observation, then apply the learning
 * opportunity. Answering an item is itself a chance to learn, which is why
 * P(L) can rise even after a wrong answer.
 */
export function bktUpdate(pL: number, correct: boolean, params: BktParams, optionCount?: number): number {
  const posterior = bktPosterior(pL, correct, params, optionCount);
  return clamp01(posterior + (1 - posterior) * params.pTransit);
}

/** Replay a sequence of attempts from a prior. Used to rebuild state from the log. */
export function bktReplay(
  attempts: readonly Attempt[],
  params: BktParams = DEFAULT_BKT_PARAMS,
  pInit = params.pInit,
): number {
  return attempts.reduce(
    (pL, a) => bktUpdate(pL, a.correct, params, a.optionCount),
    clamp01(pInit),
  );
}

/**
 * Seed P(L0) from an Elo ability estimate so placement results carry into
 * practice instead of restarting the learner model from scratch.
 */
export const priorFromAbility = (theta: number, difficultyPrior = 0): number =>
  clamp01(1 / (1 + Math.exp(-(theta - difficultyPrior))));
