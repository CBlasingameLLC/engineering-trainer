import { describe, expect, it } from 'vitest';
import type { Item, NumericAnswer, SymbolicAnswer, TruthTableAnswer } from '@et/content-schema';
import { normalizeInput, splitValueAndUnit } from '../src/normalize.js';
import {
  checkAnswer,
  checkChoice,
  checkNumeric,
  checkSymbolic,
  checkTruthTable,
  parseQuantity,
  toleranceFor,
} from '../src/check.js';

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 0x100000000);
}

describe('normalizeInput', () => {
  it('converts the Unicode ohm sign, which students type constantly', () => {
    expect(normalizeInput('5 kΩ')).toBe('5 kohm');
    expect(normalizeInput('4.7Ω')).toBe('4.7ohm');
  });

  it('converts the micro sign to a parseable prefix', () => {
    expect(normalizeInput('10 µF')).toBe('10 uF');
    expect(normalizeInput('10 μF')).toBe('10 uF');
  });

  it('expands a bare SI prefix with no unit', () => {
    expect(normalizeInput('4.7k')).toBe('4700');
    expect(normalizeInput('2.2M')).toBe('2200000');
    expect(normalizeInput('-3.3m')).toBe('-0.0033');
  });

  it('leaves a prefix alone when a unit follows, since mathjs handles that', () => {
    expect(normalizeInput('4.7 kohm')).toBe('4.7 kohm');
  });

  it('strips thousands separators without eating decimals', () => {
    expect(normalizeInput('3,200')).toBe('3200');
    expect(normalizeInput('1,000,000')).toBe('1000000');
  });

  it('normalises typographic minus signs and multiplication symbols', () => {
    expect(normalizeInput('−5')).toBe('-5');
    expect(normalizeInput('2 × 3')).toBe('2 * 3');
  });

  it('expands unit words learners spell out', () => {
    expect(normalizeInput('5 ohms')).toBe('5 ohm');
    expect(normalizeInput('12 volts')).toBe('12 V');
    expect(normalizeInput('3 amps')).toBe('3 A');
  });
});

describe('splitValueAndUnit', () => {
  it('separates the magnitude from the unit', () => {
    expect(splitValueAndUnit('5 kohm')).toEqual({ expression: '5', unit: 'kohm' });
  });

  it('reports no unit for a bare number', () => {
    expect(splitValueAndUnit('42')).toEqual({ expression: '42', unit: '' });
  });
});

describe('parseQuantity', () => {
  it('converts a prefixed unit into the target unit', () => {
    expect(parseQuantity('5 kohm', 'ohm')).toEqual({ value: 5000 });
    expect(parseQuantity('-3.2 mV', 'V')).toEqual({ value: -0.0032 });
  });

  it('treats a bare number as already being in the expected unit', () => {
    expect(parseQuantity('10', 'V')).toEqual({ value: 10 });
  });

  it('distinguishes a wrong-dimension answer from an unreadable one', () => {
    // "You answered in volts, this asks for ohms" is a real diagnosis and must
    // not be flattened into a generic parse failure.
    const dimension = parseQuantity('5 V', 'ohm');
    expect(dimension).toMatchObject({ error: 'wrong-dimension' });

    const garbage = parseQuantity('about five', 'ohm');
    expect(garbage).toMatchObject({ error: 'unparseable' });
  });

  it('rejects an empty response', () => {
    expect(parseQuantity('   ', 'V')).toMatchObject({ error: 'unparseable' });
  });

  it('evaluates arithmetic the learner leaves unsimplified', () => {
    expect(parseQuantity('12/4', 'V')).toEqual({ value: 3 });
  });
});

describe('toleranceFor', () => {
  it('takes the larger of the relative and absolute allowances', () => {
    expect(toleranceFor({ rel: 0.01, abs: 0.5 }, 10)).toBe(0.5);
    expect(toleranceFor({ rel: 0.01, abs: 0.05 }, 100)).toBe(1);
  });
});

describe('checkNumeric', () => {
  const answer: NumericAnswer = {
    kind: 'numeric', value: 6.0, unit: 'V', tolerance: { rel: 0.01 },
  };

  it('accepts an answer inside tolerance', () => {
    expect(checkNumeric('6.0 V', answer).correct).toBe(true);
    expect(checkNumeric('5.97 V', answer).correct).toBe(true);
  });

  it('accepts equivalent unit spellings', () => {
    expect(checkNumeric('6000 mV', answer).correct).toBe(true);
    expect(checkNumeric('6 volts', answer).correct).toBe(true);
  });

  it('rejects an answer outside tolerance', () => {
    expect(checkNumeric('6.5 V', answer).correct).toBe(false);
  });

  it('diagnoses a known wrong value as a misconception', () => {
    // The point of traps: free-response items would otherwise lose the
    // diagnosis that multiple choice gets for free.
    const result = checkNumeric('6.67 V', answer, [
      {
        misconception: 'thevenin.source-not-suppressed',
        value: 6.67,
        tolerance: { rel: 0.01 },
        feedback: 'That is the result of leaving the current source in place.',
      },
    ]);
    expect(result.correct).toBe(false);
    expect(result.misconception).toBe('thevenin.source-not-suppressed');
    expect(result.feedback).toMatch(/current source/);
  });

  it('reports a wrong-dimension answer distinctly', () => {
    expect(checkNumeric('6 ohm', answer).outcome).toBe('wrong-dimension');
  });

  it('handles a zero expected value without demanding infinite precision', () => {
    const zero: NumericAnswer = { kind: 'numeric', value: 0, unit: 'A', tolerance: { abs: 1e-9 } };
    expect(checkNumeric('0 A', zero).correct).toBe(true);
    expect(checkNumeric('1 A', zero).correct).toBe(false);
  });
});

describe('checkSymbolic', () => {
  const divider: SymbolicAnswer = {
    kind: 'symbolic',
    expression: 'Vs*R2/(R1+R2)',
    variables: ['Vs', 'R1', 'R2'],
    domain: { Vs: [1, 20], R1: [100, 10000], R2: [100, 10000] },
  };
  const opts = { random: rng(5) };

  it('accepts an algebraically equivalent but structurally different form', () => {
    // A CAS `simplify` comparison marks this wrong; sampling does not. This is
    // the single most important behaviour in the symbolic checker.
    expect(checkSymbolic('Vs/(1+R1/R2)', divider, opts).correct).toBe(true);
    expect(checkSymbolic('(R2*Vs)/(R2+R1)', divider, opts).correct).toBe(true);
  });

  it('accepts the canonical form itself', () => {
    expect(checkSymbolic('Vs*R2/(R1+R2)', divider, opts).correct).toBe(true);
  });

  it('rejects the inverted divider, the classic error', () => {
    expect(checkSymbolic('Vs*R1/(R1+R2)', divider, opts).correct).toBe(false);
  });

  it('rejects an expression that agrees at one point but not in general', () => {
    expect(checkSymbolic('Vs/2', divider, opts).correct).toBe(false);
  });

  it('handles transcendental expressions', () => {
    const decay: SymbolicAnswer = {
      kind: 'symbolic', expression: 'V0*exp(-t/(R*C))',
      variables: ['V0', 't', 'R', 'C'],
      domain: { V0: [1, 10], t: [0, 5], R: [100, 1000], C: [1e-6, 1e-3] },
    };
    expect(checkSymbolic('V0/exp(t/(R*C))', decay, opts).correct).toBe(true);
    expect(checkSymbolic('V0*exp(t/(R*C))', decay, opts).correct).toBe(false);
  });

  it('reports an unreadable expression rather than marking it merely wrong', () => {
    const r = checkSymbolic('Vs*R2/(', divider, opts);
    expect(r.outcome).toBe('unparseable');
  });

  it('rejects an expression using variables the item never defined', () => {
    expect(checkSymbolic('Vs*Rx/(R1+R2)', divider, opts).correct).toBe(false);
  });

  it('rejects an empty response', () => {
    expect(checkSymbolic('', divider, opts).outcome).toBe('unparseable');
  });
});

describe('checkTruthTable', () => {
  const xorAnswer: TruthTableAnswer = {
    kind: 'truth-table', inputs: ['A', 'B'], output: 'F', rows: [false, true, true, false],
  };

  it('accepts an exactly matching table', () => {
    expect(checkTruthTable([false, true, true, false], xorAnswer).correct).toBe(true);
  });

  it('rejects a table with any row wrong', () => {
    expect(checkTruthTable([false, true, true, true], xorAnswer).correct).toBe(false);
  });

  it('rejects a table of the wrong size', () => {
    expect(checkTruthTable([false, true], xorAnswer).outcome).toBe('unparseable');
  });
});

describe('checkChoice', () => {
  const item = {
    answer: { kind: 'choice', correctId: 'b' },
    options: [
      { id: 'a', text: 'wrong', misconception: 'kvl.sign-error', rationale: 'Sign dropped in the loop.' },
      { id: 'b', text: 'right' },
      { id: 'c', text: 'also wrong' },
    ],
  } as unknown as Item;

  it('accepts the correct option', () => {
    expect(checkChoice('b', item).correct).toBe(true);
  });

  it('surfaces the misconception behind a tagged distractor', () => {
    const r = checkChoice('a', item);
    expect(r.correct).toBe(false);
    expect(r.misconception).toBe('kvl.sign-error');
    expect(r.feedback).toMatch(/Sign dropped/);
  });

  it('marks an untagged distractor wrong without inventing a diagnosis', () => {
    const r = checkChoice('c', item);
    expect(r.correct).toBe(false);
    expect(r.misconception).toBeUndefined();
  });

  it('rejects an unknown option id', () => {
    expect(checkChoice('zzz', item).outcome).toBe('unparseable');
  });
});

describe('checkAnswer dispatch', () => {
  const numericItem = {
    answer: { kind: 'numeric', value: 5, unit: 'V', tolerance: { rel: 0.01 } },
    options: [], misconceptionTraps: [],
  } as unknown as Item;

  it('routes a typed response to the numeric checker', () => {
    expect(checkAnswer({ kind: 'text', value: '5 V' }, numericItem).correct).toBe(true);
  });

  it('rejects a response of the wrong shape with a useful message', () => {
    const r = checkAnswer({ kind: 'choice', optionId: 'a' }, numericItem);
    expect(r.correct).toBe(false);
    expect(r.feedback).toMatch(/expects a typed value/);
  });

  it('defers circuit items to the simulator', () => {
    const circuitItem = {
      answer: { kind: 'circuit', measurements: [] }, options: [], misconceptionTraps: [],
    } as unknown as Item;
    expect(checkAnswer({ kind: 'text', value: 'x' }, circuitItem).feedback).toMatch(/simulator/);
  });
});

describe('symbolic answers determined only up to a constant', () => {
  /**
   * `∫x^3 dx = x^4/4 + C` is how every calculus course writes the answer, so
   * the grader has to accept the whole family. It learns that the family is
   * admissible from the item declaring its answer to be an antiderivative —
   * not from guessing, and not from a flag an author has to remember to set.
   */
  const antiderivative: SymbolicAnswer = {
    kind: 'symbolic',
    expression: 'x^4/4',
    variables: ['x'],
    domain: { x: [1, 4] },
    residual: { kind: 'antiderivative-of', expression: 'x^3', variable: 'x' },
  };

  it('accepts the bare antiderivative', () => {
    expect(checkSymbolic('x^4/4', antiderivative).correct).toBe(true);
  });

  it('accepts a named constant of integration', () => {
    expect(checkSymbolic('x^4/4 + C', antiderivative).correct).toBe(true);
  });

  it('accepts a specific numeric constant', () => {
    expect(checkSymbolic('x^4/4 - 12', antiderivative).correct).toBe(true);
  });

  it('accepts an algebraically different but equivalent form', () => {
    expect(checkSymbolic('0.25*x*x*x*x + C', antiderivative).correct).toBe(true);
  });

  it('rejects a difference that is not constant', () => {
    // Off by a term in x, which is a real error rather than a choice of constant.
    const result = checkSymbolic('x^4/4 + x', antiderivative);
    expect(result.correct).toBe(false);
    expect(result.feedback).toContain('constant');
  });

  it('rejects a wrong antiderivative even with a constant attached', () => {
    expect(checkSymbolic('x^3/3 + C', antiderivative).correct).toBe(false);
  });

  it('still demands exact agreement when the answer is not an antiderivative', () => {
    // Without the residual the constant is not free, and `+ C` is just wrong.
    const plain: SymbolicAnswer = { kind: 'symbolic', expression: 'x^4/4', variables: ['x'], domain: { x: [1, 4] } };
    expect(checkSymbolic('x^4/4 + C', plain).correct).toBe(false);
    expect(checkSymbolic('x^4/4', plain).correct).toBe(true);
  });

  it('does not let a built-in constant absorb an error', () => {
    // `e` parses as a symbol but is a known value; treating it as a free
    // constant would make `x^4/4 + e` and `x^4/4 + e*x` indistinguishable.
    expect(checkSymbolic('x^4/4 + e', antiderivative).correct).toBe(true);
    expect(checkSymbolic('x^4/4 + e*x', antiderivative).correct).toBe(false);
  });
});
