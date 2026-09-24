import { trimNumber } from '../rng.js';

/**
 * Units for a process course, written the way the lectures write them.
 *
 * `engineering()` is wrong for almost everything here, and for two different
 * reasons. Most of these units are compound — µm²/hr, mJ/cm², cm⁻² — and a
 * compound unit has no single symbol to prefix. That much matches the physics
 * helpers in `phys2335/common.ts`.
 *
 * Lengths are the interesting case, because a micrometre genuinely *is* a
 * prefixed metre and folding it is the rule working correctly. It is still
 * wrong here. The course states oxide thickness in micrometres and litho
 * features in nanometres, so that is the unit the answer is stored in — which
 * also means a learner who types the bare number they just computed is graded
 * against the number they just computed. Rendering `\mathrm{\mu m}` would fold
 * 0.477 to 4.77e-7 and leave explanation-agreement comparing a correct worked
 * solution against a correct answer key and reporting a mismatch.
 *
 * Putting the prefix in its own group renders identically and leaves the
 * number bare for the gate to read. `tools/pack-cli/test/verify.test.ts` pins
 * both halves of that, so this is a decision with a test behind it rather than
 * a convention someone has to remember.
 */

/** Micrometres — oxide thickness, proximity gaps, die edge. */
export const um = (value: number, sigFigs = 4): string =>
  `${trimNumber(value, sigFigs)}\\,\\mu\\mathrm{m}`;

/** Nanometres — exposure wavelengths, resolution, depth of focus. */
export const nm = (value: number, sigFigs = 4): string =>
  `${trimNumber(value, sigFigs)}\\,\\mathrm{{n}m}`;

/** Any unit that takes no prefix at all: hours, mJ/cm^2, cm^-2, dimensionless. */
export const unit = (value: number, symbol: string, sigFigs = 4): string =>
  `${trimNumber(value, sigFigs)}\\,\\mathrm{${symbol}}`;

/**
 * A number that may be very large or very small, written the way a process
 * engineer writes it.
 *
 * `trimNumber` falls back to JavaScript's own formatting outside a narrow
 * range, which puts `2e-11` into the middle of a LaTeX expression — not a
 * typesetting error so much as a different notation appearing halfway through
 * a derivation. Doping concentrations and diffusivities live entirely outside
 * that range, so they need this rather than `plain`.
 *
 * The verifier reads `a \times 10^{b}` as one number, so a worked solution
 * written this way still agrees with its own answer key.
 */
export function sci(value: number, symbol?: string, sigFigs = 3): string {
  const units = symbol ? `\\,\\mathrm{${symbol}}` : '';
  if (value === 0) return `0${units}`;
  const magnitude = Math.abs(value);
  // Inside this range ordinary decimal notation is what anyone would write.
  if (magnitude >= 1e-3 && magnitude < 1e4) return `${trimNumber(value, sigFigs)}${units}`;
  const exponent = Math.floor(Math.log10(magnitude));
  const mantissa = value / 10 ** exponent;
  return `${trimNumber(mantissa, sigFigs)} \\times 10^{${exponent}}${units}`;
}

/** A dopant concentration, per cubic centimetre. */
export const concentration = (value: number, sigFigs = 3): string => sci(value, 'cm^{-3}', sigFigs);

/** A dose, per square centimetre. */
export const dose = (value: number, sigFigs = 3): string => sci(value, 'cm^{-2}', sigFigs);

/** A plain number with no unit — contrast, CMTF, MTF, Cp, yield. */
export const plain = (value: number, sigFigs = 4): string => trimNumber(value, sigFigs);

/** Degrees celsius. The brace gives KaTeX a base to raise the degree sign on. */
export const celsius = (value: number, sigFigs = 4): string =>
  `${trimNumber(value, sigFigs)}\\,{}^{\\circ}\\mathrm{C}`;

/**
 * Deal-Grove rate constants for Si(111), as tabulated in L04.
 *
 * B is the parabolic constant in µm²/hr and `ba` the linear constant B/A in
 * µm/hr. `tauDry` is the fictitious time offset the dry model needs below
 * about 20 nm, where growth runs anomalously fast and the model alone does not
 * capture it.
 *
 * These are the lecture's numbers rather than the textbook's. The two disagree
 * by a factor of about a thousand in the Arrhenius prefactors, which resolves
 * to a µm/min against µm/hr convention rather than to a disagreement about
 * physics — and the lecture's table is what the exams are written against.
 */
export interface RateConstants {
  /** Parabolic rate constant B, µm²/hr. */
  b: number;
  /** Linear rate constant B/A, µm/hr. */
  ba: number;
}

export const DRY_111: Record<number, RateConstants & { tau: number }> = {
  800: { b: 1.3e-3, ba: 2.54e-3, tau: 9.0 },
  900: { b: 4.02e-3, ba: 1.6e-2, tau: 1.2 },
  1000: { b: 1.05e-2, ba: 7.58e-2, tau: 0.37 },
  1100: { b: 2.37e-2, ba: 2.86e-1, tau: 0.076 },
  1200: { b: 4.79e-2, ba: 9.0e-1, tau: 0.027 },
};

export const WET_111: Record<number, RateConstants> = {
  800: { b: 9.14e-2, ba: 4.19e-2 },
  900: { b: 1.88e-1, ba: 2.77e-1 },
  1000: { b: 3.44e-1, ba: 1.36 },
  1100: { b: 5.77e-1, ba: 5.32 },
  1200: { b: 9.02e-1, ba: 1.72e1 },
};

export const OXIDATION_TEMPERATURES = [800, 900, 1000, 1100, 1200] as const;

/**
 * B/A ratios by crystal orientation, relative to (100).
 *
 * Deal and Grove worked on (111), which has the highest atomic packing density
 * on the growth plane and therefore the fastest reaction-limited growth. The
 * industry substrate is (100), so the tabulated (111) linear constant is
 * divided by 1.68 to use it — and B is never touched, because diffusion
 * through an amorphous oxide does not see the lattice underneath it.
 */
export const ORIENTATION_BA: Record<string, number> = {
  '111': 1.68,
  '110': 1.4,
  '100': 1.0,
};

/** Fraction of a grown oxide that lies below the original silicon surface. */
export const SI_CONSUMED_FRACTION = 0.44;
/** Fraction that lies above it. The two are the 2.2x volume expansion restated. */
export const OXIDE_ABOVE_FRACTION = 0.56;

/** Linear constant A = B / (B/A), µm. */
export const aFrom = (rc: RateConstants): number => rc.b / rc.ba;

/**
 * The fictitious time offset that shifts the growth curve through an oxide
 * already on the wafer. Zero for wet growth on bare silicon, which is why the
 * exam's multi-step problems put the wet step second.
 */
export const tauFor = (initial: number, rc: RateConstants): number =>
  (initial * initial) / rc.b + initial / rc.ba;

/**
 * The oxide thickness a tabulated `tau` corresponds to.
 *
 * Tau is not free: it is defined as the time the wafer would have needed to
 * reach some fictitious initial oxide, so it implies that thickness. For the
 * dry table that works out at roughly 22-24 nm at every temperature, which is
 * the 23 nm native-oxide figure the lecture quotes arriving from the other
 * direction.
 *
 * It matters because a dry growth time is `t = x0^2/B + x0/(B/A) - tau`, and
 * asking for a target *below* this thickness returns a negative time. The
 * model simply does not describe that region — it is the anomalous fast-growth
 * regime tau exists to paper over — so a generator must not draw a target
 * there rather than reporting a negative furnace time.
 */
export function thicknessAtTau(rc: RateConstants, tau: number): number {
  const a = aFrom(rc);
  return (a / 2) * (Math.sqrt(1 + (4 * rc.b * tau) / (a * a)) - 1);
}

/** Deal-Grove solved for thickness: the growth curve at time `t` after `tau`. */
export function oxideThickness(t: number, rc: RateConstants, initial = 0): number {
  const a = aFrom(rc);
  const tau = tauFor(initial, rc);
  return (a / 2) * (Math.sqrt(1 + (4 * rc.b * (t + tau)) / (a * a)) - 1);
}

/** Deal-Grove solved for time: the other direction, and the commoner exam ask. */
export function oxideTime(target: number, rc: RateConstants, initial = 0): number {
  return (target * target) / rc.b + target / rc.ba - tauFor(initial, rc);
}

/**
 * Exposure wavelengths in nm, by source name as the lectures list them.
 *
 * `article` is carried rather than derived because the rule is about how the
 * name is said, not how it is spelt: "an h-line" and "an i-line" take *an*
 * despite starting with consonants, and "a KrF" takes *a* despite starting
 * with one that is said as a consonant anyway. Deriving it from the first
 * letter produces "a i-line source" in a third of the bank.
 */
export const EXPOSURE_SOURCES: readonly { name: string; lambda: number; article: string }[] = [
  { name: 'g-line', lambda: 436, article: 'a' },
  { name: 'h-line', lambda: 405, article: 'an' },
  { name: 'i-line', lambda: 365, article: 'an' },
  { name: 'KrF excimer', lambda: 248, article: 'a' },
  { name: 'ArF excimer', lambda: 193, article: 'an' },
];

/** Resist contrast from the two dose limits. Base ten, as the course writes it. */
export const resistContrast = (q0: number, qf: number): number => 1 / Math.log10(qf / q0);

/** Critical modulation transfer function — what the resist needs to discriminate. */
export const resistCmtf = (q0: number, qf: number): number => (qf - q0) / (qf + q0);

/** Optical modulation transfer function — what the aerial image supplies. */
export const opticalMtf = (iMax: number, iMin: number): number => (iMax - iMin) / (iMax + iMin);

/**
 * Round a drawn value so a stem reads like a process spec rather than a random
 * number: oxide targets come in round tens of nanometres, doses in whole
 * mJ/cm².
 */
export const tidy = (value: number, step: number): number =>
  Number((Math.round(value / step) * step).toPrecision(12));
