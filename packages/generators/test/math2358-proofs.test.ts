import { describe, expect, it } from 'vitest';
import { IDENTITIES, CLAIMS, RUBRIC_TASKS } from '../src/math2358/proofs.js';

/**
 * The summation identities the induction skeletons are built on, checked
 * against brute-force summation.
 *
 * A skeleton item's fields all come from the same two functions, so the item
 * is internally consistent whether or not the identity is true — the grader
 * would happily accept a learner's correct algebra against a false claim. The
 * only way to catch that is to sum the terms independently, which is what this
 * does.
 */
const evaluate = (expr: string, value: number): number =>
   
  Number(new Function('k', `return ${expr.replace(/\^/g, '**')};`)(value));

describe('the summation identities are true', () => {
  for (const identity of IDENTITIES) {
    it(`sum of ${identity.summand} matches its closed form`, () => {
      for (let n = 1; n <= 12; n += 1) {
        let total = 0;
        for (let i = 1; i <= n; i += 1) total += evaluate(identity.termAt(String(i)), 0);
        expect(evaluate(identity.closedAt(String(n)), 0)).toBeCloseTo(total, 9);
      }
    });

    it(`closed form at k+1 equals closed form at k plus the (k+1)th term for ${identity.summand}`, () => {
      // This is exactly what the skeleton's "bridge" step asserts, so if it
      // were false the item would be marking a correct learner wrong.
      for (const k of [1, 2, 5, 9]) {
        const lhs = evaluate(identity.closedAt(String(k + 1)), 0);
        const rhs = evaluate(identity.closedAt(String(k)), 0) + evaluate(identity.termAt(String(k + 1)), 0);
        expect(lhs).toBeCloseTo(rhs, 9);
      }
    });
  }
});

describe('the ordered proofs are well formed', () => {
  it('gives every claim at least four lines and a distractor', () => {
    for (const claim of CLAIMS) {
      expect(claim.lines.length).toBeGreaterThanOrEqual(4);
      expect(claim.distractor.misconception).toMatch(/\./);
    }
  });

  it('never repeats a line within a proof', () => {
    // A duplicate line has two valid positions, so the single stored order
    // would reject a correct arrangement.
    for (const claim of CLAIMS) {
      expect(new Set(claim.lines).size).toBe(claim.lines.length);
    }
  });

  it('does not put the distractor among the real lines', () => {
    for (const claim of CLAIMS) {
      expect(claim.lines).not.toContain(claim.distractor.text);
    }
  });
});

describe('the rubrics are scorable', () => {
  it('cannot be passed on the lightest criteria alone', () => {
    // A rubric whose passing score is reachable without the substantive
    // criteria would certify a proof that skipped the hard part.
    for (const task of RUBRIC_TASKS) {
      const weights = task.criteria.map((c) => c.weight).sort((a, b) => a - b);
      const total = weights.reduce((a, b) => a + b, 0);
      const allButHeaviest = weights.slice(0, -1).reduce((a, b) => a + b, 0);
      expect(allButHeaviest / total).toBeLessThan(0.75 + 1e-9);
    }
  });

  it('has unique criterion ids and a model proof', () => {
    for (const task of RUBRIC_TASKS) {
      expect(new Set(task.criteria.map((c) => c.id)).size).toBe(task.criteria.length);
      expect(task.model.length).toBeGreaterThan(80);
    }
  });
});
