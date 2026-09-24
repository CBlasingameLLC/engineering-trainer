import { describe, expect, it } from 'vitest';
import { booleanEquivalent, literalCount, parseBoolean } from '@et/answer-engine';
import { minimalSop, mintermsOf, rowsOf, sopFromMinterms, texTable } from '../src/logic-common.js';

/**
 * `minimalSop` decides the literal budget every simplification item is graded
 * against. A budget that is too tight rejects the correct answer; one that is
 * too loose accepts the unsimplified question. Both failures are silent, so the
 * function is checked against textbook cases with known minimal forms and,
 * more importantly, against the invariant that the minimal form must always be
 * equivalent to what it minimised.
 */

const VARS3 = ['A', 'B', 'C'];
const VARS4 = ['A', 'B', 'C', 'D'];

describe('minimalSop', () => {
  it('reduces the classic pair', () => {
    const { form, literals } = minimalSop("A*B + A*B'", ['A', 'B']);
    expect(literals).toBe(1);
    expect(booleanEquivalent(parseBoolean(form), parseBoolean('A'), ['A', 'B'])).toBe(true);
  });

  it('recognises a constant function', () => {
    expect(minimalSop("A + A'", ['A']).form).toBe('1');
    expect(minimalSop("A * A'", ['A']).form).toBe('0');
  });

  it('always produces something equivalent to its input', () => {
    // The invariant that matters. Checked exhaustively over every 3-variable
    // function, which is only 256 of them.
    for (let table = 0; table < 256; table++) {
      const minterms = Array.from({ length: 8 }, (_, i) => i).filter((i) => (table >> i) & 1);
      const source = sopFromMinterms(VARS3, minterms);
      const { form } = minimalSop(source, VARS3);
      expect(
        booleanEquivalent(parseBoolean(form), parseBoolean(source), VARS3),
        `function ${table} minimised to a different function`,
      ).toBe(true);
    }
  });

  it('never claims a budget its own minimal form exceeds', () => {
    // If the reported literal count were below what the form actually uses, a
    // correct answer would be rejected for being "not reduced".
    for (let table = 1; table < 255; table++) {
      const minterms = Array.from({ length: 8 }, (_, i) => i).filter((i) => (table >> i) & 1);
      const { form, literals } = minimalSop(sopFromMinterms(VARS3, minterms), VARS3);
      expect(literalCount(parseBoolean(form)), `function ${table}`).toBeLessThanOrEqual(literals);
    }
  });

  it('finds the known minimal form of a four-variable map', () => {
    // F(A,B,C,D) = Σm(0,1,2,3,4,5,6,7) is just A'.
    const source = sopFromMinterms(VARS4, [0, 1, 2, 3, 4, 5, 6, 7]);
    const { form, literals } = minimalSop(source, VARS4);
    expect(literals).toBe(1);
    expect(booleanEquivalent(parseBoolean(form), parseBoolean("A'"), VARS4)).toBe(true);
  });

  it('handles a map needing two groups', () => {
    // Σm(0,1,4,5) over ABCD is B'C'... check by equivalence rather than by form.
    const source = sopFromMinterms(VARS4, [0, 1, 4, 5]);
    const { form, literals } = minimalSop(source, VARS4);
    expect(booleanEquivalent(parseBoolean(form), parseBoolean(source), VARS4)).toBe(true);
    expect(literals).toBeLessThan(4 * 4);
  });
});

describe('minterms and tables', () => {
  it('round-trips minterms through a sum of products', () => {
    const minterms = [1, 3, 6];
    expect(mintermsOf(sopFromMinterms(VARS3, minterms), VARS3)).toEqual(minterms);
  });

  it('orders rows ascending with the first variable most significant', () => {
    expect(rowsOf('A', ['A', 'B']).map(Number)).toEqual([0, 0, 1, 1]);
    expect(rowsOf('B', ['A', 'B']).map(Number)).toEqual([0, 1, 0, 1]);
  });

  it('renders a blank cell for a row the question withholds', () => {
    const table = texTable(['p', 'q'], [true, null, false, true]);
    expect(table).toContain('\\;');
    expect(table).toContain('p & q & F');
  });
});
