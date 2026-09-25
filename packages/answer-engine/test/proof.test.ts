import { describe, expect, it } from 'vitest';
import type { OrderingAnswer, ProofRubricAnswer, ProofSkeletonAnswer } from '@et/content-schema';
import { checkOrdering, checkProofRubric, checkProofSkeleton } from '../src/proof.js';

/**
 * The proof kinds, which are what let this engine grade the thing MATH 2358
 * actually examines.
 *
 * `proof.ts` imports `checkSymbolic` from `check.ts`, and `check.ts` imports
 * the three graders back for its dispatch. That cycle is fine because both
 * sides are function declarations, resolved when called rather than when the
 * module initialises — but it is exactly the kind of thing that typechecks and
 * then throws at runtime, so these tests exercise the real imports.
 */

const ordering: OrderingAnswer = {
  kind: 'ordering',
  lines: [
    { id: 'assume', text: 'Assume n is even, so n = 2k for some integer k.' },
    { id: 'sub', text: 'Then n^2 = (2k)^2 = 4k^2.' },
    { id: 'factor', text: 'So n^2 = 2(2k^2), which is twice an integer.' },
    { id: 'conclude', text: 'Therefore n^2 is even.' },
  ],
  distractors: [
    { id: 'begs', text: 'Assume n^2 is even, which is what we want to show.', misconception: 'proof.assumes-the-conclusion' },
  ],
};

describe('ordering', () => {
  it('accepts the stored order', () => {
    expect(checkOrdering(['assume', 'sub', 'factor', 'conclude'], ordering).correct).toBe(true);
  });

  it('rejects a permutation and says where it breaks', () => {
    const r = checkOrdering(['assume', 'factor', 'sub', 'conclude'], ordering);
    expect(r.correct).toBe(false);
    expect(r.feedback).toContain('position 2');
  });

  it('reports a distractor as its own misconception, not as a wrong order', () => {
    // Including a line that assumes the conclusion is a different error from
    // getting two valid lines the wrong way round, and naming it "wrong order"
    // would point the learner at the wrong thing.
    const r = checkOrdering(['begs', 'sub', 'factor', 'conclude'], ordering);
    expect(r.correct).toBe(false);
    expect(r.misconception).toBe('proof.assumes-the-conclusion');
    expect(r.feedback).not.toContain('order');
  });

  it('names an incomplete proof as incomplete', () => {
    const r = checkOrdering(['assume', 'sub'], ordering);
    expect(r.correct).toBe(false);
    expect(r.feedback).toContain('incomplete');
  });

  it('refuses an empty submission rather than calling it wrong', () => {
    expect(checkOrdering([], ordering).outcome).toBe('unparseable');
  });
});

const skeleton: ProofSkeletonAnswer = {
  kind: 'proof-skeleton',
  steps: [
    {
      id: 'base',
      prompt: 'Evaluate the left side at n = 1.',
      expect: { kind: 'expression', expression: '1', variables: ['n'] },
    },
    {
      id: 'hypothesis',
      prompt: 'State the inductive hypothesis: the sum to k equals what?',
      expect: { kind: 'expression', expression: 'k*(k+1)/2', variables: ['k'] },
    },
    {
      id: 'target',
      prompt: 'What must the inductive step establish?',
      expect: {
        kind: 'choice',
        correctId: 'kplus1',
        options: [
          { id: 'kplus1', text: 'The sum to k+1 equals (k+1)(k+2)/2' },
          { id: 'same', text: 'The sum to k equals k(k+1)/2', misconception: 'induction.hypothesis-restated-as-goal' },
        ],
      },
    },
  ],
};

describe('proof skeleton', () => {
  it('accepts every field answered correctly', () => {
    const r = checkProofSkeleton({ base: '1', hypothesis: 'k*(k+1)/2', target: 'kplus1' }, skeleton);
    expect(r.correct).toBe(true);
    expect(r.steps.every((s) => s.correct)).toBe(true);
  });

  it('accepts an equivalent algebraic form of a field', () => {
    // The whole reason expression fields go through the sampler: a learner who
    // writes (k^2+k)/2 has written the inductive hypothesis.
    const r = checkProofSkeleton({ base: '1', hypothesis: '(k^2 + k)/2', target: 'kplus1' }, skeleton);
    expect(r.correct).toBe(true);
  });

  it('marks the individual failing field rather than the whole item', () => {
    const r = checkProofSkeleton({ base: '1', hypothesis: 'k*(k+1)', target: 'kplus1' }, skeleton);
    expect(r.correct).toBe(false);
    expect(r.steps.find((s) => s.id === 'base')?.correct).toBe(true);
    expect(r.steps.find((s) => s.id === 'hypothesis')?.correct).toBe(false);
    expect(r.feedback).toContain('2 of 3');
  });

  it('carries the misconception from a wrong choice field', () => {
    const r = checkProofSkeleton({ base: '1', hypothesis: 'k*(k+1)/2', target: 'same' }, skeleton);
    expect(r.correct).toBe(false);
    expect(r.misconception).toBe('induction.hypothesis-restated-as-goal');
  });

  it('treats an unanswered field as wrong, not as absent', () => {
    const r = checkProofSkeleton({ base: '1', target: 'kplus1' }, skeleton);
    expect(r.correct).toBe(false);
    expect(r.steps.find((s) => s.id === 'hypothesis')?.feedback).toBe('Not answered.');
  });
});

const rubric: ProofRubricAnswer = {
  kind: 'proof-rubric',
  model: 'Suppose sqrt(3) = p/q in lowest terms...',
  criteria: [
    { id: 'setup', text: 'Assumes the negation and writes it in lowest terms', weight: 1 },
    { id: 'algebra', text: 'Derives that 3 divides p', weight: 2 },
    { id: 'contradiction', text: 'Reaches a contradiction with lowest terms', weight: 2 },
  ],
  passingScore: 0.75,
};

describe('proof rubric', () => {
  it('passes at or above the threshold', () => {
    const r = checkProofRubric(['setup', 'algebra', 'contradiction'], rubric);
    expect(r.correct).toBe(true);
    expect(r.score).toBe(1);
  });

  it('weights criteria rather than counting them', () => {
    // Two of three criteria, but the heavy ones: 4 of 5 is 80%, which passes.
    const r = checkProofRubric(['algebra', 'contradiction'], rubric);
    expect(r.score).toBeCloseTo(0.8, 10);
    expect(r.correct).toBe(true);
    // And the light one alone is 20%, which does not.
    expect(checkProofRubric(['setup'], rubric).correct).toBe(false);
  });

  it('names what was missed', () => {
    const r = checkProofRubric(['setup', 'algebra'], rubric);
    expect(r.correct).toBe(false);
    expect(r.feedback).toContain('contradiction with lowest terms');
  });

  it('does not let a repeated criterion count twice', () => {
    expect(checkProofRubric(['algebra', 'algebra'], rubric).score).toBeCloseTo(0.4, 10);
  });

  it('refuses a criterion the rubric does not contain', () => {
    expect(checkProofRubric(['invented'], rubric).outcome).toBe('unparseable');
  });
});
