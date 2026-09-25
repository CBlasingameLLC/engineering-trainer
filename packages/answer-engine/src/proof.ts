import type {
  Item, OrderingAnswer, ProofRubricAnswer, ProofSkeletonAnswer, SymbolicAnswer,
} from '@et/content-schema';
import type { CheckResult } from './check.js';
import { checkSymbolic } from './check.js';

/**
 * Grading for the three proof answer kinds.
 *
 * All three are decided, not inferred: an ordering is compared against the one
 * correct sequence, a skeleton grades each field with the grader that field's
 * kind already has, and a rubric is arithmetic over the criteria the learner
 * claims. Nothing here reads English, which is the whole reason these kinds
 * exist in this shape rather than as free text with a language model behind it.
 */

/** Per-step outcome, so the player can mark the parts rather than the whole. */
export interface SkeletonStepResult {
  readonly id: string;
  readonly correct: boolean;
  readonly feedback?: string;
  readonly misconception?: string;
}

export interface SkeletonResult extends CheckResult {
  readonly steps: readonly SkeletonStepResult[];
}

/**
 * Compare a submitted order against the one correct sequence.
 *
 * A distractor anywhere in the submission is reported before any ordering
 * complaint: including a line that assumes the conclusion is a different and
 * more interesting error than getting two valid lines the wrong way round, and
 * saying "wrong order" to someone who did the first would point them at the
 * wrong thing entirely.
 */
export function checkOrdering(order: readonly string[], answer: OrderingAnswer): CheckResult {
  if (order.length === 0) {
    return { correct: false, outcome: 'unparseable', feedback: 'No lines were arranged.' };
  }

  const distractor = answer.distractors.find((d) => order.includes(d.id));
  if (distractor) {
    return {
      correct: false,
      outcome: 'incorrect',
      misconception: distractor.misconception,
      feedback:
        `The line "${distractor.text}" does not belong in a correct proof of this claim. ` +
        `Every other line can be arranged into one; that one cannot appear at all.`,
    };
  }

  const expected = answer.lines.map((l) => l.id);
  if (order.length !== expected.length) {
    const missing = expected.filter((id) => !order.includes(id)).length;
    return {
      correct: false,
      outcome: 'incorrect',
      feedback:
        missing > 0
          ? `The proof is incomplete: ${missing} line${missing === 1 ? '' : 's'} of it ${missing === 1 ? 'is' : 'are'} unused.`
          : 'More lines were used than the proof contains.',
    };
  }

  const firstWrong = order.findIndex((id, i) => id !== expected[i]);
  if (firstWrong === -1) return { correct: true, outcome: 'correct' };

  return {
    correct: false,
    outcome: 'incorrect',
    feedback:
      `The lines are all present, but the order breaks at position ${firstWrong + 1}. ` +
      `A proof is only valid if every line follows from the ones above it.`,
  };
}

/**
 * Grade each field of a skeleton with the grader its own kind already has.
 *
 * Expression fields go through the symbolic sampler, so an equivalent form is
 * accepted — a learner who writes the inductive hypothesis as `k*(k+1)/2` and
 * one who writes `(k^2+k)/2` have both written it.
 */
export function checkProofSkeleton(
  responses: Readonly<Record<string, string>>,
  answer: ProofSkeletonAnswer,
  opts: { random?: () => number } = {},
): SkeletonResult {
  const steps: SkeletonStepResult[] = answer.steps.map((step) => {
    const given = responses[step.id];
    if (given === undefined || given.trim() === '') {
      return { id: step.id, correct: false, feedback: 'Not answered.' };
    }

    if (step.expect.kind === 'choice') {
      const picked = step.expect.options.find((o) => o.id === given.trim());
      if (!picked) return { id: step.id, correct: false, feedback: 'That is not one of the options.' };
      if (picked.id === step.expect.correctId) return { id: step.id, correct: true };
      return { id: step.id, correct: false, misconception: picked.misconception, feedback: 'Not this one.' };
    }

    const symbolic: SymbolicAnswer = {
      kind: 'symbolic',
      expression: step.expect.expression,
      variables: [...step.expect.variables],
      ...(step.expect.domain ? { domain: step.expect.domain } : {}),
    };
    const result = checkSymbolic(given, symbolic, opts.random ? { random: opts.random } : {});
    return {
      id: step.id,
      correct: result.correct,
      ...(result.feedback ? { feedback: result.feedback } : {}),
      ...(result.misconception ? { misconception: result.misconception } : {}),
    };
  });

  const wrong = steps.filter((s) => !s.correct);
  if (wrong.length === 0) return { correct: true, outcome: 'correct', steps };

  const named = wrong.find((s) => s.misconception);
  return {
    correct: false,
    outcome: 'incorrect',
    steps,
    ...(named?.misconception ? { misconception: named.misconception } : {}),
    feedback:
      wrong.length === answer.steps.length
        ? 'None of the parts is right yet. Work the base case first — the rest is built on it.'
        : `${answer.steps.length - wrong.length} of ${answer.steps.length} parts are right. ` +
          `The marked ones are not, and a proof with a gap in it proves nothing.`,
  };
}

export interface RubricResult extends CheckResult {
  /** Weighted fraction of the criteria claimed, 0 to 1. */
  readonly score: number;
}

/**
 * Score a written proof against the criteria the learner says it meets.
 *
 * This is self-reported and the model treats it as such: rubric items are
 * authored with a reduced `kcRefs` weight, which already scales both the Elo
 * update and the BKT blend. The value of the kind is that it is the only one
 * here that asks for the actual task; the cost is that its evidence is worth
 * less, and pretending otherwise would put a number on the screen that the
 * rest of this application exists to avoid.
 */
export function checkProofRubric(met: readonly string[], answer: ProofRubricAnswer): RubricResult {
  const known = new Map(answer.criteria.map((c) => [c.id, c.weight]));
  const unknown = met.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    return { correct: false, outcome: 'unparseable', score: 0, feedback: 'A criterion was reported that this rubric does not contain.' };
  }

  const total = answer.criteria.reduce((acc, c) => acc + c.weight, 0);
  const earned = [...new Set(met)].reduce((acc, id) => acc + (known.get(id) ?? 0), 0);
  const score = total === 0 ? 0 : earned / total;
  const missed = answer.criteria.filter((c) => !met.includes(c.id));

  if (score >= answer.passingScore) {
    return {
      correct: true,
      outcome: 'correct',
      score,
      feedback:
        missed.length === 0
          ? 'Every criterion met.'
          : `${Math.round(score * 100)}% of the rubric, which passes. Still missing: ${missed.map((c) => c.text).join('; ')}.`,
    };
  }

  return {
    correct: false,
    outcome: 'incorrect',
    score,
    feedback:
      `${Math.round(score * 100)}% of the rubric, below the ${Math.round(answer.passingScore * 100)}% this item asks for. ` +
      `Missing: ${missed.map((c) => c.text).join('; ')}.`,
  };
}

/** The model proof, which the player reveals only after a submission. */
export const modelProofFor = (item: Item): string | undefined =>
  item.answer.kind === 'proof-rubric' ? item.answer.model : undefined;
