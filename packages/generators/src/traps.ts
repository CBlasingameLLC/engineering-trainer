import { checkBoolean, checkSymbolic, comparePhasors } from '@et/answer-engine';
import type {
  BooleanAnswer, ComplexAnswer, MisconceptionTrap, SymbolicAnswer,
} from '@et/content-schema';

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

/**
 * Drop any Boolean trap that is the same function as the answer.
 *
 * Sharper than the numeric and symbolic cases, because equivalence here is
 * decidable: a trap either denotes the same function as the key or it does
 * not, and the filter is a proof rather than a sample. The hazard is identical
 * though — a "forgot to flip the connective" trap for De Morgan collapses onto
 * the correct answer whenever the drawn expression happens to be self-dual, and
 * a collapsed trap diagnoses a *correct* answer as an error.
 */
export function separatedBooleanTraps(
  answer: BooleanAnswer,
  candidates: readonly MisconceptionTrap[],
): MisconceptionTrap[] {
  return candidates.filter((trap) => {
    if (trap.expression === undefined) return true;
    return !checkBoolean(trap.expression, { ...answer, maxLiterals: undefined }).correct;
  });
}

/**
 * The same backstop for phasor traps.
 *
 * A complex trap collapses onto the answer the same way a numeric one does, and
 * for the same reason — both are computed from the parameters that produce the
 * answer. The specific collapses here are worth naming: the conjugate trap
 * equals the answer whenever the reactance is zero (which is resonance), and
 * the magnitude-without-phase trap equals it whenever the phase is zero (which
 * is the same condition). Generators constrain their draws away from resonance
 * for exactly that reason; this is what catches the one that forgets.
 */
export function separatedComplexTraps(
  answer: ComplexAnswer,
  candidates: readonly MisconceptionTrap[],
): MisconceptionTrap[] {
  return candidates.filter((trap) => {
    if (!trap.complex) return true;
    const comparison = comparePhasors(
      { real: trap.complex.real, imag: trap.complex.imag },
      answer,
    );
    return !(comparison.magnitudeOk && comparison.angleOk);
  });
}
