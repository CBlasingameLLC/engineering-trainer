import { describe, expect, it } from 'vitest';
import type { BooleanAnswer } from '@et/content-schema';
import {
  booleanEquivalent, booleanVariables, checkBoolean, evaluateBoolean,
  literalCount, parseBoolean, truthTable,
} from '../src/index.js';

/**
 * Two courses write Boolean algebra differently and both are correct. A digital
 * logic text writes `AB' + CD`; a discrete maths text writes
 * `(p ∧ ¬q) ∨ (r ∧ s)`. These tests pin that the parser accepts both, because
 * rejecting either would mark notation rather than understanding — and pin the
 * precedence, because getting that wrong changes the truth table silently
 * instead of failing.
 */

const tt = (source: string, vars: string[]): string =>
  truthTable(parseBoolean(source), vars).map((b) => (b ? '1' : '0')).join('');

describe('notation', () => {
  it('reads juxtaposition as AND', () => {
    expect(tt('AB', ['A', 'B'])).toBe('0001');
  });

  it('reads the postfix prime as negation', () => {
    expect(tt("A'", ['A'])).toBe('10');
    expect(tt("(A+B)'", ['A', 'B'])).toBe('1000');
    expect(tt("A'B", ['A', 'B'])).toBe('0100');
  });

  it('accepts engineering and mathematical spellings of the same function', () => {
    const forms = ["A'B + AB'", 'A xor B', 'A ^ B', '(¬A ∧ B) ∨ (A ∧ ¬B)', '(not A and B) or (A and not B)'];
    for (const form of forms) {
      expect(tt(form, ['A', 'B']), form).toBe('0110');
    }
  });

  it('accepts lowercase propositional variables', () => {
    expect(tt('p -> q', ['p', 'q'])).toBe('1101');
    expect(tt('p → q', ['p', 'q'])).toBe('1101');
    expect(tt('p implies q', ['p', 'q'])).toBe('1101');
  });

  it('keeps digits with their letter so X1X2 is two variables', () => {
    expect(booleanVariables(parseBoolean('X1X2'))).toEqual(['X1', 'X2']);
    expect(tt('X1X2', ['X1', 'X2'])).toBe('0001');
  });

  it('treats a keyword as an operator only when it stands alone', () => {
    // `or` is the operator; the `o` and `r` inside a longer run are variables.
    expect(booleanVariables(parseBoolean('a or b'))).toEqual(['a', 'b']);
    expect(booleanVariables(parseBoolean('ab'))).toEqual(['a', 'b']);
  });

  it('accepts constants', () => {
    expect(tt('A + 1', ['A'])).toBe('11');
    expect(tt('A * 0', ['A'])).toBe('00');
    expect(tt('A and true', ['A'])).toBe('01');
  });
});

describe('precedence', () => {
  it('binds NOT tighter than AND, and AND tighter than OR', () => {
    // A + BC is A + (B AND C), not (A + B) AND C.
    expect(tt('A + BC', ['A', 'B', 'C'])).toBe(tt('A + (B*C)', ['A', 'B', 'C']));
    expect(tt('A + BC', ['A', 'B', 'C'])).not.toBe(tt('(A + B)C', ['A', 'B', 'C']));
    expect(tt("A'B", ['A', 'B'])).toBe(tt("(A')B", ['A', 'B']));
  });

  it('binds AND tighter than XOR, and XOR tighter than OR', () => {
    expect(tt('A ^ B*C', ['A', 'B', 'C'])).toBe(tt('A ^ (B*C)', ['A', 'B', 'C']));
    expect(tt('A + B ^ C', ['A', 'B', 'C'])).toBe(tt('A + (B ^ C)', ['A', 'B', 'C']));
  });

  it('makes implication right-associative', () => {
    // p -> q -> r means p -> (q -> r). Reading it left-associatively changes the
    // truth table rather than failing, so this is pinned explicitly.
    expect(tt('p -> q -> r', ['p', 'q', 'r'])).toBe(tt('p -> (q -> r)', ['p', 'q', 'r']));
    expect(tt('p -> q -> r', ['p', 'q', 'r'])).not.toBe(tt('(p -> q) -> r', ['p', 'q', 'r']));
  });

  it('puts implication below OR and equivalence below implication', () => {
    expect(tt('A + B -> C', ['A', 'B', 'C'])).toBe(tt('(A + B) -> C', ['A', 'B', 'C']));
    expect(tt('A -> B <-> C', ['A', 'B', 'C'])).toBe(tt('(A -> B) <-> C', ['A', 'B', 'C']));
  });
});

describe('truth tables', () => {
  it('orders rows ascending with the first variable most significant', () => {
    // A=0,B=0 / 0,1 / 1,0 / 1,1 — the order every textbook prints.
    expect(tt('A', ['A', 'B'])).toBe('0011');
    expect(tt('B', ['A', 'B'])).toBe('0101');
  });

  it('evaluates a stated assignment', () => {
    const node = parseBoolean("A'B + C");
    expect(evaluateBoolean(node, { A: false, B: true, C: false })).toBe(true);
    expect(evaluateBoolean(node, { A: true, B: true, C: false })).toBe(false);
  });
});

describe('equivalence is exhaustive, not sampled', () => {
  it('proves De Morgan', () => {
    const vars = ['A', 'B'];
    expect(booleanEquivalent(parseBoolean("(A*B)'"), parseBoolean("A' + B'"), vars)).toBe(true);
    expect(booleanEquivalent(parseBoolean("(A+B)'"), parseBoolean("A' * B'"), vars)).toBe(true);
  });

  it('accepts a simplification that drops a variable entirely', () => {
    // AB + AB' = A. Inferring the variable list from the expressions would
    // compare over {A} alone and miss that they agree for every B too.
    expect(booleanEquivalent(parseBoolean("AB + AB'"), parseBoolean('A'), ['A', 'B'])).toBe(true);
  });

  it('separates functions that agree on most rows but not all', () => {
    // AND and XOR agree on three of four assignments. A sampling grader could
    // pass this pair; enumeration cannot.
    expect(booleanEquivalent(parseBoolean('A*B'), parseBoolean('A^B'), ['A', 'B'])).toBe(false);
  });
});

describe('checkBoolean', () => {
  const sop: BooleanAnswer = { kind: 'boolean', expression: "A'B + AB'", variables: ['A', 'B'] };

  it('accepts any equivalent form', () => {
    for (const form of ['A ^ B', "AB' + A'B", '(A+B)(AB)\'', 'A xor B']) {
      expect(checkBoolean(form, sop).correct, form).toBe(true);
    }
  });

  it('rejects a different function', () => {
    expect(checkBoolean('A*B', sop).correct).toBe(false);
  });

  it('names a variable the problem never mentioned', () => {
    const result = checkBoolean('A + Z', sop);
    expect(result.correct).toBe(false);
    expect(result.outcome).toBe('unparseable');
    expect(result.feedback).toContain('Z');
  });

  it('reports a parse failure as unparseable rather than wrong', () => {
    // The learner never got to be right or wrong, so it must not be recorded
    // as a miss against their mastery estimate.
    const result = checkBoolean('A + ', sop);
    expect(result.outcome).toBe('unparseable');
  });

  it('enforces a literal budget on simplification tasks', () => {
    // Without the budget a minimisation question accepts its own input.
    const simplify: BooleanAnswer = {
      kind: 'boolean', expression: 'A', variables: ['A', 'B'], maxLiterals: 1,
    };
    expect(checkBoolean('A', simplify).correct).toBe(true);
    const unreduced = checkBoolean("AB + AB'", simplify);
    expect(unreduced.correct).toBe(false);
    expect(unreduced.feedback).toContain('not reduced');
  });

  it('attributes a wrong expression to a tagged misconception', () => {
    const traps = [{
      misconception: 'boolean.demorgan-conjunction-kept',
      expression: "A' * B'",
      feedback: 'You negated both terms but kept the AND.',
    }];
    const answer: BooleanAnswer = { kind: 'boolean', expression: "A' + B'", variables: ['A', 'B'] };
    const result = checkBoolean("A'B'", answer, traps);
    expect(result.correct).toBe(false);
    expect(result.misconception).toBe('boolean.demorgan-conjunction-kept');
  });
});

describe('literalCount', () => {
  it('counts occurrences, not distinct variables', () => {
    expect(literalCount(parseBoolean('A'))).toBe(1);
    expect(literalCount(parseBoolean("AB + AB'"))).toBe(4);
    expect(literalCount(parseBoolean("A'B'C + AB"))).toBe(5);
  });
});
