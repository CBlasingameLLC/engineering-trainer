import { describe, expect, it } from 'vitest';
import type { ComplexAnswer } from '@et/content-schema';
import { angleDifference, checkComplex, magnitudeOf, parsePhasor } from '../src/index.js';

const parse = (raw: string) => {
  const result = parsePhasor(raw);
  if ('error' in result) throw new Error(`${raw}: ${result.error}`);
  return result.phasor;
};

const close = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) < eps;

describe('parsePhasor', () => {
  // Six textbooks, six notations. Rejecting five of them teaches notation
  // rather than circuits.
  it.each([
    ['3 + j4', 3, 4],
    ['3+4j', 3, 4],
    ['3 + 4i', 3, 4],
    ['3 - j4', 3, -4],
    ['-3 - j4', -3, -4],
    ['j4', 0, 4],
    ['-j4', 0, -4],
    ['j', 0, 1],
    ['-j', 0, -1],
    ['5', 5, 0],
    ['-2.5', -2.5, 0],
  ])('reads %s', (text, real, imag) => {
    const p = parse(text);
    expect(close(p.real, real), `real of ${text}: ${p.real}`).toBe(true);
    expect(close(p.imag, imag), `imag of ${text}: ${p.imag}`).toBe(true);
  });

  it.each(['5∠53.13°', '5 < 53.13', '5/_53.13', '5 angle 53.13', '5 cis 53.13', '5@53.13'])(
    'reads the polar form %s',
    (text) => {
      const p = parse(text);
      expect(close(magnitudeOf(p), 5, 1e-3)).toBe(true);
      expect(close(p.real, 3, 1e-3)).toBe(true);
      expect(close(p.imag, 4, 1e-3)).toBe(true);
    },
  );

  // Degrees unless the input says otherwise: every circuits text writes phase
  // in degrees, and a learner who means radians has made a mistake worth
  // catching rather than a notation to guess at.
  it('takes degrees by default and radians only when named', () => {
    expect(close(parse('5∠90').imag, 5, 1e-9)).toBe(true);
    expect(close(parse('5∠1.5708 rad').imag, 5, 1e-3)).toBe(true);
  });

  it('ignores a trailing unit', () => {
    expect(close(parse('5∠53.13° V').real, 3, 1e-3)).toBe(true);
    expect(close(parse('12 + j5 ohms').imag, 5)).toBe(true);
  });

  it('reports what it could not read rather than guessing', () => {
    expect(parsePhasor('')).toHaveProperty('error');
    expect(parsePhasor('about five')).toHaveProperty('error');
  });
});

describe('angleDifference', () => {
  // The wrap point is the whole reason this is not a subtraction: +179 and
  // -179 are two degrees apart, not 358.
  it('wraps', () => {
    expect(close(angleDifference(179, -179), -2)).toBe(true);
    expect(close(angleDifference(-179, 179), 2)).toBe(true);
    expect(close(angleDifference(10, 350), 20)).toBe(true);
  });
});

const impedance: ComplexAnswer = {
  kind: 'complex', real: 30, imag: 40, unit: 'ohm',
  tolerance: { magRel: 0.02, angleDeg: 2 },
};

describe('checkComplex', () => {
  it('accepts either notation for the same answer', () => {
    expect(checkComplex('30 + j40', impedance).correct).toBe(true);
    expect(checkComplex('50∠53.13°', impedance).correct).toBe(true);
    expect(checkComplex('50 < 53.13 ohms', impedance).correct).toBe(true);
  });

  // Naming which half went wrong is most of the diagnostic value: magnitude is
  // arithmetic, phase is almost always a sign convention.
  it('says which part is wrong', () => {
    const conjugate = checkComplex('30 - j40', impedance);
    expect(conjugate.correct).toBe(false);
    expect(conjugate.feedback).toMatch(/magnitude is right/i);

    const scaled = checkComplex('100∠53.13°', impedance);
    expect(scaled.correct).toBe(false);
    expect(scaled.feedback).toMatch(/phase is right/i);
  });

  it('diagnoses a tagged phasor trap by name', () => {
    const result = checkComplex('30 - j40', impedance, [
      {
        misconception: 'phasor.conjugate',
        complex: { real: 30, imag: -40 },
        feedback: 'You conjugated: a capacitive reactance is negative, an inductive one is not.',
      },
    ]);
    expect(result.misconception).toBe('phasor.conjugate');
  });

  // Every angle is the same phasor at zero magnitude, so demanding one would
  // fail a correct answer for the shape of its rounding error.
  it('does not demand a phase angle from a zero phasor', () => {
    const zero: ComplexAnswer = {
      kind: 'complex', real: 0, imag: 0, unit: 'V',
      tolerance: { magAbs: 1e-6, angleDeg: 1 },
    };
    expect(checkComplex('0', zero).correct).toBe(true);
    expect(checkComplex('0∠180', zero).correct).toBe(true);
  });

  it('accepts an answer across the wrap point', () => {
    const nearPi: ComplexAnswer = {
      kind: 'complex', real: -10, imag: -0.1, unit: 'V',
      tolerance: { magRel: 0.02, angleDeg: 3 },
    };
    expect(checkComplex('10∠-179.4°', nearPi).correct).toBe(true);
    expect(checkComplex('10∠179.6°', nearPi).correct).toBe(true);
  });
});
