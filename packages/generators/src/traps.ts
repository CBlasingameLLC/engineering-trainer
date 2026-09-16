import { checkSymbolic } from '@et/answer-engine';
import type { MisconceptionTrap, SymbolicAnswer } from '@et/content-schema';

import { makeRng } from './rng.js';

type Tolerance = { rel?: number | undefined; abs?: number | undefined };

const slack = (tolerance: Tolerance, reference: number): number =>
  Math.max(tolerance.abs ?? 0, (tolerance.rel ?? 0) * Math.abs(reference));

/**
 * Drop any trap that cannot be told apart from the correct answer.
 *
 * Traps are computed from the same parameters as the answer, so particular
 * parameter draws can collapse them onto it — a voltage divider with
 * R1 = R2 makes the inverted-ratio trap numerically identical to the right
 * answer. Left in place, such a trap logs a misconception against a correct
 * response, which is worse than having no trap at all: it teaches the learner
 * they were wrong and corrupts the misconception feed that drives remediation.
 *
 * Generators constrain their parameters to avoid degenerate designs in the
 * first place. This is the structural backstop behind that, so a future
 * generator cannot reintroduce the bug.
 */
export function separatedTraps(
  correctValue: number,
  answerTolerance: Tolerance,
  candidates: readonly MisconceptionTrap[],
): MisconceptionTrap[] {
  return candidates.filter((trap) => {
    // Expression traps have no numeric value; they are separated by sampling in
    // `separatedExpressionTraps` instead.
    if (trap.value === undefined) return true;
    const margin = Math.max(slack(trap.tolerance ?? {}, trap.value), slack(answerTolerance, correctValue));
    return Math.abs(trap.value - correctValue) > margin;
  });
}

/**
 * Drop any symbolic trap that is algebraically equal to the correct answer.
 *
 * The same hazard as the numeric case and for the same reason: traps are built
 * from the parameters that build the answer, so particular draws collapse them.
 * Differentiating `sin(kx)` without the chain rule gives `cos(kx)` instead of
 * `k·cos(kx)` — a clean diagnosis for every k except 1, where the "mistake" is
 * the right answer and would be logged against a learner who did it correctly.
 *
 * Separation is decided by the grader rather than by string comparison, because
 * string comparison would keep a trap that merely *looks* different. If
 * `checkSymbolic` would accept the trap as a correct response, the learner who
 * writes it is right, and nothing about that is a misconception.
 */
export function separatedExpressionTraps(
  answer: SymbolicAnswer,
  candidates: readonly MisconceptionTrap[],
): MisconceptionTrap[] {
  // Deterministic sampling: a generator that passed this filter on one build
  // and failed it on the next would make the bank churn for no reason.
  const random = makeRng(0x5eed);
  return candidates.filter((trap) => {
    if (trap.expression === undefined) return true;
    const bare: SymbolicAnswer = { ...answer, residual: undefined };
    return !checkSymbolic(trap.expression, bare, { random, samples: 12 }).correct;
  });
}
