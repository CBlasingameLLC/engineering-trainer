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
 * A bare slash is an angle mark only when the text also says degrees.
 *
 * `5/53.1°` is how several textbooks set a phasor and `3/4` is three quarters,
 * and nothing in the string distinguishes them. Requiring the degree marker
 * keeps the notation available without turning a fraction into a phase.
 */
const SLASH_ANGLE = /\/(?=[^/]*(?:°|\bdeg))/;

/**
 * Read a phasor from text.
 *
 * Degrees unless the input says otherwise: every circuits textbook writes
 * phases in degrees, and a learner who types `1.05` meaning radians has made a
 * mistake worth catching rather than a notation the grader should guess at.
 */
export function parsePhasor(raw: string): { phasor: Phasor } | { error: string } {
  // Typographic dashes reach the box by the ordinary route — copied out of a
  // PDF, or typed on a phone — and `3 – j4` is the same answer as `3 - j4`.
  // `normalizeInput` already knows that, but the term splitting below reads
  // signs itself, so the substitution has to happen before it.
  const text = raw.trim().replace(/[\u2212\u2013\u2014]/g, '-');
  if (text === '') return { error: 'No answer entered.' };

  // Strip a trailing unit word; the magnitude carries the dimension and mixing
  // units into a phasor is not something any textbook does.
  const cleaned = text
    .replace(/\b(volts?|amps?|amperes?|ohms?|siemens|V|A|mA|kV|mV|k?ohms?|Ω|kΩ|MΩ)\b\s*$/i, '')
    .replace(/Ω\s*$/, '')
    .trim();

  const polar = ANGLE_MARK.exec(cleaned) ?? SLASH_ANGLE.exec(cleaned);
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
 * Split `a ± b` into signed terms.
 *
 * The one subtlety is that not every `-` starts a term: in `5e-3` it belongs to
 * the exponent, and splitting there turns one number into two.
 */
function splitTerms(text: string): string[] {
  const terms: string[] = [];
  let start = 0;
  for (let i = 1; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '+' && ch !== '-') continue;
    const previous = text[i - 1];
    if (previous === 'e' || previous === 'E') continue;
    terms.push(text.slice(start, i));
    start = i;
  }
  terms.push(text.slice(start));
  return terms.filter((t) => t !== '' && t !== '+' && t !== '-');
}

/**
 * `a ± jb` in any of its spellings.
 *
 * Each term goes through `readNumber`, which is the same reader the polar path
 * uses and the only one that knows about SI prefixes, unit words and
 * typographic characters. An earlier version did its own string surgery
 * instead — canonicalising `j4` to `4i` and then matching one anchored
 * pattern — and that is a second, partial number reader, which is this
 * repository's most frequently relearned mistake.
 *
 * It failed exactly where the parser was needed most. `4.7k∠30` parsed,
 * because polar hands the magnitude to `readNumber`; `4.7k - j2.2k` did not,
 * because canonicalising `j2.2` to `2.2i` strands the `k` past the anchor. An
 * impedance in kilohms is how Circuits II writes almost every answer it asks
 * for, so the rejected form was the common one, and a rejected answer does not
 * advance the session — the learner is simply stuck on the question.
 * `1.2e3 + j4.5e2` failed the same way, with the exponent stranded instead.
 */
function readRectangular(text: string): Phasor | null {
  const compact = text.replace(/\s+/g, '');
  if (!/[ij]/i.test(compact)) return null;

  let real = 0;
  let imag = 0;
  let sawImaginary = false;

  for (const term of splitTerms(compact)) {
    if (!/[ij]/i.test(term)) {
      const value = readNumber(term);
      if (value === null) return null;
      real += value;
      continue;
    }

    // The unit may lead or trail its magnitude — `j4.7k` and `4.7kj` are both
    // written — so removing it wherever it sits leaves the number either way.
    const magnitude = term.replace(/[ij]/i, '');
    // `j`, `+j` and `-j` are a magnitude of one with the sign in front.
    const value = /^[+-]?$/.test(magnitude) ? Number(`${magnitude}1`) : readNumber(magnitude);
    if (value === null || !Number.isFinite(value)) return null;
    imag += value;
    sawImaginary = true;
  }

  return sawImaginary ? { real, imag } : null;
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
