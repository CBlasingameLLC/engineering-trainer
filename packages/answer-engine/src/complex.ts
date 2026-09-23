import type { ComplexAnswer, MisconceptionTrap } from '@et/content-schema';
import { normalizeInput } from './normalize.js';

/**
 * Phasor grading.
 *
 * An AC course's answers are complex, and are written six different ways by
 * six different textbooks: `3 + j4`, `3 + 4i`, `5∠53.13°`, `5 < 53.13`,
 * `5/_53.13`, `5 cis 53.13`. Rejecting five of those teaches notation, not
 * circuits, so all of them parse.
 *
 * Grading is polar even though storage is rectangular, because that is where
 * the error lives. Magnitude right and phase inverted is one specific mistake —
 * a conjugate, usually from mixing up which reactance is negative — and a
 * rectangular comparison would report it as simply wrong, which is the least
 * useful true thing that can be said about it.
 */

export interface Phasor {
  real: number;
  imag: number;
}

export const magnitudeOf = (p: Phasor): number => Math.hypot(p.real, p.imag);
export const angleDegOf = (p: Phasor): number => (Math.atan2(p.imag, p.real) * 180) / Math.PI;

export const fromPolar = (magnitude: number, angleDeg: number): Phasor => ({
  real: magnitude * Math.cos((angleDeg * Math.PI) / 180),
  imag: magnitude * Math.sin((angleDeg * Math.PI) / 180),
});

/** Smallest signed difference between two angles, in degrees. */
export function angleDifference(a: number, b: number): number {
  const raw = ((a - b) % 360 + 540) % 360 - 180;
  return raw;
}

const ANGLE_MARK = /∠|<|\/_|\bangle\b|\bcis\b|@/;

/**
 * Read a phasor from text.
 *
 * Degrees unless the input says otherwise: every circuits textbook writes
 * phases in degrees, and a learner who types `1.05` meaning radians has made a
 * mistake worth catching rather than a notation the grader should guess at.
 */
export function parsePhasor(raw: string): { phasor: Phasor } | { error: string } {
  const text = raw.trim();
  if (text === '') return { error: 'No answer entered.' };

  // Strip a trailing unit word; the magnitude carries the dimension and mixing
  // units into a phasor is not something any textbook does.
  const cleaned = text
    .replace(/\b(volts?|amps?|amperes?|ohms?|siemens|V|A|mA|kV|mV|k?ohms?|Ω|kΩ|MΩ)\b\s*$/i, '')
    .replace(/Ω\s*$/, '')
    .trim();

  const polar = ANGLE_MARK.exec(cleaned);
  if (polar) {
    const magnitudeText = cleaned.slice(0, polar.index);
    let angleText = cleaned.slice(polar.index + polar[0].length);

    const radians = /\b(rad|radians?)\b/i.test(angleText);
    angleText = angleText.replace(/°|\bdeg(rees?)?\b|\brad(ians?)?\b/gi, '').trim();

    const magnitude = readNumber(magnitudeText);
    const angle = readNumber(angleText);
    if (magnitude === null || angle === null) {
      return { error: `Could not read "${raw}" as a phasor. Try 5∠53.1° or 3 + j4.` };
    }
    return { phasor: fromPolar(magnitude, radians ? (angle * 180) / Math.PI : angle) };
  }

  const rectangular = readRectangular(cleaned);
  if (rectangular) return { phasor: rectangular };

  const plain = readNumber(cleaned);
  if (plain !== null) return { phasor: { real: plain, imag: 0 } };

  return { error: `Could not read "${raw}" as a phasor. Try 5∠53.1° or 3 + j4.` };
}

function readNumber(text: string): number | null {
  const normalized = normalizeInput(text).replace(/[,\s]/g, '');
  if (normalized === '') return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/**
 * `a ± jb` in any of its spellings.
 *
 * Done in two steps because one regex covering every form was where the bugs
 * were: `-j4` has a sign that belongs to the imaginary term and no real part at
 * all, and a pattern that treats the leading `-` as the start of a real term
 * reads it as `+j4`. Canonicalising the imaginary unit to trail its magnitude
 * first turns every spelling into `a±bi`, which one anchored pattern reads.
 */
function readRectangular(text: string): Phasor | null {
  const compact = text.replace(/\s+/g, '');
  if (!/[ij]/i.test(compact)) return null;

  // `j4` -> `4i`, `4j` -> `4i`, a lone `j` -> `1i`, leaving signs where they
  // are. Whether a bare unit is the trailing form or a magnitude of one is
  // decided by what precedes it, which is why this cannot be a plain pattern.
  const canonical = compact.replace(
    /([ij])(\d+(?:\.\d+)?)?/gi,
    (_match, _unit: string, digits: string | undefined, offset: number) => {
      if (digits !== undefined) return `${digits}i`;
      return /\d$/.test(compact.slice(0, offset)) ? 'i' : '1i';
    },
  );

  // Lazy prefix, so the signed imaginary term binds last and a bare `-4i`
  // leaves no real part rather than claiming the sign for one.
  const match = /^(.*?)([+-]?\d+(?:\.\d+)?)i$/.exec(canonical);
  if (!match) return null;

  const realText = match[1] ?? '';
  const real = realText === '' ? 0 : Number(realText);
  const imag = Number(match[2]);
  if (!Number.isFinite(real) || !Number.isFinite(imag)) return null;
  return { real, imag };
}

export interface PhasorComparison {
  magnitudeOk: boolean;
  angleOk: boolean;
  magnitudeError: number;
  angleError: number;
}

export function comparePhasors(actual: Phasor, expected: ComplexAnswer): PhasorComparison {
  const target: Phasor = { real: expected.real, imag: expected.imag };
  const targetMagnitude = magnitudeOf(target);
  const slack = Math.max(
    expected.tolerance.magAbs ?? 0,
    (expected.tolerance.magRel ?? 0) * targetMagnitude,
    1e-12,
  );
  const magnitudeError = Math.abs(magnitudeOf(actual) - targetMagnitude);

  // At zero magnitude every angle is the same phasor, so demanding one would
  // fail a correct answer for the shape of its rounding error.
  const degenerate = targetMagnitude <= slack;
  const angleError = degenerate ? 0 : Math.abs(angleDifference(angleDegOf(actual), angleDegOf(target)));

  return {
    magnitudeOk: magnitudeError <= slack,
    angleOk: degenerate || angleError <= (expected.tolerance.angleDeg ?? 1),
    magnitudeError,
    angleError,
  };
}

/** Format for feedback: the polar form, which is how the answer was asked for. */
export const formatPhasor = (p: Phasor, unit = ''): string => {
  const magnitude = Number(magnitudeOf(p).toPrecision(4));
  const angle = Number(angleDegOf(p).toPrecision(4));
  return `${magnitude}${unit ? ` ${unit}` : ''} ∠ ${angle}°`;
};

export function matchPhasorTrap(
  actual: Phasor,
  answer: ComplexAnswer,
  traps: readonly MisconceptionTrap[],
): MisconceptionTrap | undefined {
  return traps.find((trap) => {
    if (!trap.complex) return false;
    const comparison = comparePhasors(actual, { ...answer, real: trap.complex.real, imag: trap.complex.imag });
    return comparison.magnitudeOk && comparison.angleOk;
  });
}
