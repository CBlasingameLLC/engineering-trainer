import { trimNumber, unfoldedUnit } from '../rng.js';

/**
 * Physics quantities are written the way a physics text writes them.
 *
 * `engineering()` folds an SI prefix into the number, which is right for a
 * schematic — 4700 ohms is 4.7 kilohms and nobody writes it otherwise. It is
 * wrong here for three separate reasons, and each one has a different failure:
 *
 * - A temperature of 1500 K becomes `1.5 kK`, which is not a unit anyone uses.
 * - A mass is stored and written in kilograms, so the prefix is already in the
 *   unit. Folding it again multiplies by a thousand.
 * - A compound unit has no single symbol to prefix. `m/s` begins with a prefix
 *   letter and is not prefixed, and neither is `mol`.
 *
 * The last two are what `PREFIXABLE_UNITS` in the verifier now guards against.
 * This helper is the other half of that agreement: it emits no prefix at all,
 * so what the learner reads and what the gate parses are the same number.
 */
export const q = (value: number, symbol: string, sigFigs = 4): string =>
  `${trimNumber(value, sigFigs)}\\,\\mathrm{${symbol}}`;

/** Degrees celsius, with a base for the degree sign so KaTeX has something to
 *  raise. A bare `^\circ` at the start of a group is a parse error. */
export const celsius = (value: number, sigFigs = 4): string =>
  `${trimNumber(value, sigFigs)}\\,{}^{\\circ}\\mathrm{C}`;

/** Kelvin. Absolute, always — which is the point of most of this unit. */
export const kelvin = (value: number, sigFigs = 4): string => q(value, 'K', sigFigs);

export const KELVIN_OFFSET = 273.15;
export const toKelvin = (celsiusValue: number): number => celsiusValue + KELVIN_OFFSET;

/** Universal gas constant, J/(mol K). */
export const R_GAS = 8.314;
/** Boltzmann constant, J/K. */
export const K_BOLTZMANN = 1.381e-23;
/** Stefan-Boltzmann constant, W/(m^2 K^4). */
export const SIGMA_SB = 5.670e-8;
/** Standard atmosphere, Pa. */
export const ATM = 101325;
/** Reference intensity for the decibel scale, W/m^2. */
export const I_REFERENCE = 1e-12;
/** Standard gravity, m/s^2. */
export const G_EARTH = 9.81;
/** Speed of sound in air at 20 C, m/s. */
export const V_SOUND = 343;

/** Specific heat capacities, J/(kg K), and latent heats, J/kg. */
export const WATER = { c: 4186, cIce: 2090, cSteam: 2010, lFusion: 334000, lVapour: 2.26e6 } as const;

/**
 * Round a drawn value so the question reads like a physics problem rather than
 * like a random number. Parameters are drawn, not chosen, so without this a
 * stem asks for the rms speed of a gas at 412.7739 K.
 */
export const tidy = (value: number, step: number): number =>
  Number((Math.round(value / step) * step).toPrecision(12));

/**
 * Lengths stated in a prefixed unit, written so the verifier does not fold the
 * prefix away. See `unfoldedUnit` for why this is not `q(value, 'nm')`.
 *
 * Optics needs all three: wavelengths in nanometres, slit geometry in
 * micrometres, fringe spacing on a screen in millimetres.
 */
export const nanometres = (value: number, sigFigs = 4): string => unfoldedUnit(value, 'n', 'm', sigFigs);
export const micrometres = (value: number, sigFigs = 4): string => unfoldedUnit(value, '\\mu', 'm', sigFigs);
export const millimetres = (value: number, sigFigs = 4): string => unfoldedUnit(value, 'm', 'm', sigFigs);
