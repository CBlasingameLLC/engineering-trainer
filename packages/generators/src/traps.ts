import type { MisconceptionTrap } from '@et/content-schema';

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
    const margin = Math.max(slack(trap.tolerance, trap.value), slack(answerTolerance, correctValue));
    return Math.abs(trap.value - correctValue) > margin;
  });
}
