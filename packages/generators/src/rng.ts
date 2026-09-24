/**
 * Deterministic randomness for item generation.
 *
 * Every generated item must be reproducible from its seed. That is what lets
 * `pack verify` re-derive an answer independently, what lets a learner revisit
 * the exact item they missed, and what keeps a regenerated bank stable instead
 * of silently churning every item id.
 */

/** Mulberry32 — small, fast, good enough distribution for item parameters. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export const pick = <T>(rng: Rng, values: readonly T[]): T => {
  if (values.length === 0) throw new Error('pick: empty array');
  return values[Math.floor(rng() * values.length)]!;
};

/** Integer in [min, max]. */
export const intBetween = (rng: Rng, min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1));

/**
 * E24 series resistor values (5% tolerance) across the decades a student
 * actually meets in a lab. Generated circuits use real part values because
 * arbitrary floats teach nothing and read as fake.
 */
const E24_MANTISSA = [
  1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0,
  3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1,
] as const;

/** A resistance in ohms drawn from the E24 series, 100 ohm to 100 kohm. */
export function resistor(rng: Rng, opts: { minDecade?: number; maxDecade?: number } = {}): number {
  const decade = intBetween(rng, opts.minDecade ?? 2, opts.maxDecade ?? 4);
  return Number((pick(rng, E24_MANTISSA) * 10 ** decade).toPrecision(3));
}

/** A supply voltage students see on a bench: 1.5 V through 24 V. */
export const supplyVoltage = (rng: Rng): number =>
  pick(rng, [1.5, 3, 3.3, 5, 6, 9, 12, 15, 18, 24]);

/** A source current in the milliamp range, in mA. */
export const sourceCurrentMa = (rng: Rng): number =>
  pick(rng, [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 8, 10]);

/** E12 capacitance in farads, 1 nF to 100 uF. */
export function capacitance(rng: Rng): number {
  const mantissa = pick(rng, [1.0, 1.5, 2.2, 3.3, 4.7, 6.8]);
  const decade = intBetween(rng, -9, -5);
  return Number((mantissa * 10 ** decade).toPrecision(2));
}

/** Inductance in henries, 1 mH to 100 mH. */
export function inductance(rng: Rng): number {
  const mantissa = pick(rng, [1.0, 1.5, 2.2, 3.3, 4.7, 6.8]);
  const decade = intBetween(rng, -3, -1);
  return Number((mantissa * 10 ** decade).toPrecision(2));
}

/**
 * Draw until the sample satisfies a constraint.
 *
 * Generators use this to reject degenerate parameter draws — a divider whose
 * two resistors are nearly equal, say, which makes the inverted-ratio
 * misconception undetectable and the item pedagogically empty. The rng stays
 * deterministic because each rejected draw still advances it.
 */
export function resampleUntil<T>(
  rng: Rng,
  make: (rng: Rng) => T,
  acceptable: (value: T) => boolean,
  attempts = 64,
): T {
  let last = make(rng);
  for (let i = 0; i < attempts; i++) {
    if (acceptable(last)) return last;
    last = make(rng);
  }
  return last; // fall back rather than loop forever; the trap filter still guards
}

/**
 * Two resistors whose ratio is far enough from 1 for the swapped-resistor
 * misconception to produce a visibly different number.
 */
export function distinctResistorPair(
  rng: Rng,
  opts: { minRatio?: number; minDecade?: number; maxDecade?: number } = {},
): [number, number] {
  const minRatio = opts.minRatio ?? 1.5;
  return resampleUntil(
    rng,
    (r) => [resistor(r, opts), resistor(r, opts)] as [number, number],
    ([a, b]) => Math.max(a / b, b / a) >= minRatio,
  );
}

/**
 * Per-variant difficulty.
 *
 * A generator's nominal difficulty describes its *topic*, but individual draws
 * genuinely differ: a divider with a 10:1 ratio can be eyeballed, while 6.8k
 * against 4.7k cannot, and an RC problem asked at exactly one time constant is
 * easier than one at 1.5 because e^-1 is memorised.
 *
 * Emitting a single fixed difficulty per generator leaves every item for a KC
 * at the same point on the ability scale, which defeats adaptive selection:
 * Fisher information is maximised when item difficulty sits near learner
 * ability, so a bank with no spread cannot measure anyone who is not already at
 * that one point. Deriving difficulty from the actual parameters gives the
 * engine a range to bracket with, and reflects something true about the item.
 *
 * Each signal is in [-1, 1]: negative is easier, positive is harder.
 */
export function adjustDifficulty(base: number, signals: readonly number[], spread = 0.9): number {
  if (signals.length === 0) return base;
  const mean = signals.reduce((s, x) => s + clampSignal(x), 0) / signals.length;
  return Number(Math.min(4, Math.max(-4, base + spread * mean)).toFixed(3));
}

const clampSignal = (x: number): number => Math.min(1, Math.max(-1, x));

/**
 * How awkward a ratio is to compute mentally. A 10:1 ratio is easy; values
 * within a factor of 1.5 of each other require actual arithmetic.
 */
export function ratioDifficulty(a: number, b: number): number {
  const ratio = Math.max(a / b, b / a);
  // ratio 10+ -> -1 (easy); ratio 1.5 -> +1 (hard)
  return clampSignal(1 - 2 * ((Math.log10(ratio) - Math.log10(1.5)) / (1 - Math.log10(1.5))));
}

/** Round mantissas (1, 2, 5) are easier to carry through a calculation. */
export function mantissaDifficulty(value: number): number {
  const mantissa = Math.abs(value) / 10 ** Math.floor(Math.log10(Math.abs(value)));
  const round = [1, 1.5, 2, 2.5, 3, 5];
  return round.some((r) => Math.abs(mantissa - r) < 0.05) ? -1 : 1;
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

const SI_PREFIXES: [number, string][] = [
  [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''],
  [1e-3, 'm'], [1e-6, '\\mu '], [1e-9, 'n'], [1e-12, 'p'],
];

/**
 * Render a quantity in engineering notation with an SI prefix, the way it would
 * be written on a schematic. `4700` becomes `4.7\,\mathrm{k\Omega}`, not `4700 Ω`.
 *
 * The unit is set in `\mathrm`, not `\text`. They look identical for `mA` and
 * differ completely for the two units that matter most here: `\Omega` and
 * `\mu` are maths-mode macros, and `\text{k\Omega}` asks KaTeX to typeset a
 * maths macro in text mode. Every resistance and every microamp in the bank
 * went through that path.
 *
 * The result carries no `$` delimiters, so it composes inside a larger
 * expression — `$R_1 = ${ohms(r1)}$`. Written into prose it must be wrapped;
 * `pack verify`'s `latex-delimiters` check is what enforces that, because the
 * failure is silent everywhere else.
 */
export function engineering(value: number, unit: string, sigFigs = 3): string {
  if (value === 0) return `0\\,\\mathrm{${unit}}`;
  const magnitude = Math.abs(value);
  const entry = SI_PREFIXES.find(([factor]) => magnitude >= factor) ?? SI_PREFIXES.at(-1)!;
  const [factor, prefix] = entry;
  const scaled = value / factor;
  return `${trimNumber(scaled, sigFigs)}\\,\\mathrm{${prefix}${unit}}`;
}

/**
 * The same quantity, delimited and ready to drop into prose.
 *
 * `A ${qty(volts(vs))} source drives...` is the common case, and the one that
 * was wrong in 860 items.
 */
export const qty = (rendered: string): string => `$${rendered}$`;

/** Drop trailing zeros so 4.70 reads as 4.7 while 4.75 keeps its precision. */
export function trimNumber(value: number, sigFigs = 4): string {
  if (!Number.isFinite(value)) return String(value);
  const fixed = Number(value.toPrecision(sigFigs));
  return String(fixed);
}

/**
 * A prefixed unit written so the verifier reads the number in front of it.
 *
 * `engineering()` exists because a schematic writes 4700 ohms as 4.7 k, and
 * `extractNumbers` folds that prefix back in so the two agree. That is right
 * whenever the stored value is in the base unit. It is wrong whenever the
 * course states quantities in the prefixed unit and the answer is stored that
 * way too — a wavelength of 633 nm, an oxide 0.4 um thick, a fringe 353 mm
 * across. Rendering those as `\mathrm{nm}` folds 633 to 6.33e-7, so a correct
 * worked solution disagrees with a correct answer key and the gate reports the
 * item as broken.
 *
 * Bracing the prefix renders identically and leaves the number bare. This is
 * the single spelling for that; two courses had independently invented two,
 * which is how the second one shipped the bug the first had already fixed.
 * `tools/pack-cli/test/verify.test.ts` pins both halves.
 */
export function unfoldedUnit(value: number, prefix: string, base: string, sigFigs = 4): string {
  return `${trimNumber(value, sigFigs)}\\,\\mathrm{{${prefix}}${base}}`;
}

/** Ohms with the LaTeX omega symbol. */
export const ohms = (value: number): string => engineering(value, '\\Omega');
export const volts = (value: number): string => engineering(value, 'V');
export const amps = (value: number): string => engineering(value, 'A');
export const farads = (value: number): string => engineering(value, 'F');
export const henries = (value: number): string => engineering(value, 'H');
export const seconds = (value: number): string => engineering(value, 's');
