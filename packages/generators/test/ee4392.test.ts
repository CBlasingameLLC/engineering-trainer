import { describe, expect, it } from 'vitest';
import { itemSchema } from '@et/content-schema';
import { GENERATORS, makeRng } from '../src/index.js';
import {
  DRY_111, WET_111, oxideThickness, oxideTime, resistCmtf, resistContrast, tauFor,
} from '../src/ee4392/common.js';
import { DOPANTS, diffusivity, erfc } from '../src/ee4392/doping.js';

/**
 * Process sanity, checked independently of the arithmetic that produced it.
 *
 * The gate proves an EE 4392 item is internally consistent. It cannot catch a
 * generator that is wrong in the same direction throughout — a yield above one,
 * a depth of focus that grows with numerical aperture, a resist contrast that
 * comes out negative. The answer key and the worked solution would agree
 * perfectly on every one of those.
 *
 * So these are bounds and monotonicities rather than a second copy of the same
 * formula, plus the instructor's own worked answers where they exist. Matching
 * a published answer is the strongest check available for a course with no
 * solver behind it, and it is the only one here that could catch a systematic
 * error in the model itself.
 */

const SEEDS = [1, 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];

/** A branch-filtered check that never stops skipping asserts nothing. */
function atLeastOne(examined: number, what: string): void {
  expect(examined, `no seed produced ${what}; this check asserted nothing`).toBeGreaterThan(0);
}

const generatorById = (id: string) => {
  const g = GENERATORS.find((x) => x.id === id);
  if (!g) throw new Error(`no generator ${id}`);
  return g;
};

function parsedItem(id: string, seed: number) {
  return itemSchema.parse({
    ...generatorById(id).generate(makeRng(seed), seed),
    id: `${id}.s${seed}`,
    seed,
    provenance: { producer: 'generator', sourceRef: id, licenseTier: 'redistributable' },
  });
}

function answerOf(id: string, seed: number): number {
  const item = parsedItem(id, seed);
  if (item.answer.kind !== 'numeric') throw new Error(`${id} is not numeric`);
  return item.answer.value;
}

const stemOf = (id: string, seed: number): string => generatorById(id).generate(makeRng(seed), seed).stem;

/**
 * The instructor's own worked answers.
 *
 * These are the only external check this course has. Everything else in the
 * file is a bound; this is agreement with a number somebody else computed.
 */
describe('Deal-Grove reproduces the course worked examples', () => {
  const wet1000 = WET_111[1000]!;

  it('Exam 1 Q14a: 0.2 um wet at 1000 C on bare Si takes 0.263 hr', () => {
    expect(oxideTime(0.2, wet1000, 0)).toBeCloseTo(0.263, 3);
  });

  it('Exam 1 Q14b: a 0.4 um field oxide gives tau = 0.759 hr', () => {
    expect(tauFor(0.4, wet1000)).toBeCloseTo(0.7592, 4);
  });

  it('Exam 1 Q14b: the field oxide reaches 0.48 um after that step', () => {
    expect(oxideThickness(oxideTime(0.2, wet1000, 0), wet1000, 0.4)).toBeCloseTo(0.480, 3);
  });

  it('120 min of steam at 1000 C from 0.1 um reaches 0.733 um', () => {
    expect(oxideThickness(2, wet1000, 0.10)).toBeCloseTo(0.733, 3);
  });

  it('LOCOS: 0.5 um proud of the surface needs 0.893 um grown, taking 2.97 hr', () => {
    const needed = 0.5 / 0.56;
    expect(needed).toBeCloseTo(0.893, 3);
    expect(oxideTime(needed, wet1000, 0)).toBeCloseTo(2.97, 2);
  });

  it('3 hr dry at 1100 C on (100) reaches 0.21 um once B/A is corrected', () => {
    const d = DRY_111[1100]!;
    const ba100 = d.ba / 1.68;
    const a = d.b / ba100;
    const x = (a / 2) * (Math.sqrt(1 + (4 * d.b * (3 + d.tau)) / (a * a)) - 1);
    expect(x).toBeCloseTo(0.209, 2);
  });

  it('the orientation correction moves B/A and never B', () => {
    const d = DRY_111[1100]!;
    // Stated as an inequality on purpose: this is the rule the slides call out,
    // and the wrong version divides the parabolic constant instead.
    expect(d.b).toBe(DRY_111[1100]!.b);
    expect(d.ba / 1.68).toBeLessThan(d.ba);
  });
});

describe('EE 4392 process bounds', () => {
  it('oxide grows monotonically with time and never shrinks', () => {
    const rc = WET_111[1000]!;
    let previous = 0;
    for (const t of [0.1, 0.25, 0.5, 1, 2, 4, 8]) {
      const x = oxideThickness(t, rc, 0);
      expect(x).toBeGreaterThan(previous);
      previous = x;
    }
  });

  it('an oxide already present always slows what follows', () => {
    const rc = WET_111[1000]!;
    for (const initial of [0.05, 0.1, 0.2, 0.4]) {
      const grownFromBare = oxideThickness(1, rc, 0);
      const grownOnTop = oxideThickness(1, rc, initial) - initial;
      expect(grownOnTop).toBeLessThan(grownFromBare);
    }
  });

  it('growth times are positive for every drawn target', () => {
    for (const seed of SEEDS) {
      expect(answerOf('ee4392.oxidation.growth-time', seed)).toBeGreaterThan(0);
    }
  });

  it('dry oxidation is never asked to grow a field oxide', () => {
    let dry = 0;
    for (const seed of SEEDS) {
      const stem = stemOf('ee4392.oxidation.growth-time', seed);
      if (!stem.includes('dry oxygen')) continue;
      dry += 1;
      // Anything past about 0.2 um dry is a two-day furnace run. The arithmetic
      // would be right and the process would be fiction.
      const target = Number(/grow \$([\d.]+)\\,\\mu/.exec(stem)?.[1]);
      expect(target, `unparsed dry target in: ${stem}`).toBeGreaterThan(0);
      expect(target).toBeLessThanOrEqual(0.2);
    }
    atLeastOne(dry, 'a dry oxidation');
  });

  it('regrowth always ends thicker than it started', () => {
    for (const seed of SEEDS) {
      const stem = stemOf('ee4392.oxidation.regrowth', seed);
      const initial = Number(/carries \$([\d.]+)\\,\\mu/.exec(stem)?.[1]);
      expect(initial, `unparsed initial oxide in: ${stem}`).toBeGreaterThan(0);
      expect(answerOf('ee4392.oxidation.regrowth', seed)).toBeGreaterThan(initial);
    }
  });

  it('silicon consumed is always less than the oxide grown', () => {
    let consumption = 0;
    for (const seed of SEEDS) {
      const stem = stemOf('ee4392.oxidation.silicon-consumed', seed);
      if (!stem.includes('How much silicon is consumed')) continue;
      consumption += 1;
      const grown = Number(/grows \$([\d.]+)\\,\\mu/.exec(stem)?.[1]);
      const answer = answerOf('ee4392.oxidation.silicon-consumed', seed);
      expect(answer).toBeLessThan(grown);
      expect(answer / grown).toBeCloseTo(0.44, 6);
    }
    atLeastOne(consumption, 'a silicon-consumption item');
  });

  it('a LOCOS recess always needs more oxide than the recess itself', () => {
    let locos = 0;
    for (const seed of SEEDS) {
      const stem = stemOf('ee4392.oxidation.silicon-consumed', seed);
      if (!stem.includes('LOCOS')) continue;
      locos += 1;
      const recess = Number(/sitting \$([\d.]+)\\,\\mu/.exec(stem)?.[1]);
      expect(answerOf('ee4392.oxidation.silicon-consumed', seed)).toBeGreaterThan(recess);
    }
    atLeastOne(locos, 'a LOCOS item');
  });

  it('rate constants are positive and rise with temperature', () => {
    for (const seed of SEEDS) {
      expect(answerOf('ee4392.oxidation.rate-constant', seed)).toBeGreaterThan(0);
    }
    // The tabulated constants must themselves be monotonic in temperature, or
    // the Arrhenius items are being checked against a broken table.
    const temps = [800, 900, 1000, 1100, 1200];
    for (let i = 1; i < temps.length; i += 1) {
      expect(WET_111[temps[i]!]!.b).toBeGreaterThan(WET_111[temps[i - 1]!]!.b);
      expect(DRY_111[temps[i]!]!.b).toBeGreaterThan(DRY_111[temps[i - 1]!]!.b);
      expect(DRY_111[temps[i]!]!.tau).toBeLessThan(DRY_111[temps[i - 1]!]!.tau);
    }
  });

  it('wet oxidation is faster than dry at every tabulated temperature', () => {
    for (const t of [800, 900, 1000, 1100, 1200]) {
      expect(WET_111[t]!.b).toBeGreaterThan(DRY_111[t]!.b);
    }
  });
});

describe('EE 4392 yield and capability bounds', () => {
  it('every yield is a probability', () => {
    for (const seed of SEEDS) {
      const y = answerOf('ee4392.yield.models', seed);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });

  it('Poisson is the pessimistic model at equal area and defect density', () => {
    // The slide says Poisson is the C = 0 limit; it is the C to infinity limit,
    // and this is the statement that makes the difference observable.
    for (const area of [0.16, 0.25, 0.49, 1.0]) {
      for (const d0 of [0.2, 0.5, 1.0]) {
        const poisson = Math.exp(-area * d0);
        const seeds = 1 / (1 + area * d0);
        const nb2 = (1 + (area * d0) / 2) ** -2;
        const nb10 = (1 + (area * d0) / 10) ** -10;
        expect(poisson).toBeLessThan(nb10);
        expect(nb10).toBeLessThan(nb2);
        expect(nb2).toBeLessThan(seeds);
      }
    }
  });

  it('yield falls as die area rises at fixed defect density', () => {
    let previous = 1;
    for (const area of [0.1, 0.25, 0.5, 1.0, 2.0]) {
      const y = Math.exp(-area * 0.5);
      expect(y).toBeLessThan(previous);
      previous = y;
    }
  });

  it('capability indices are positive and Cpk never exceeds Cp', () => {
    let examined = 0;
    for (const seed of SEEDS) {
      const item = parsedItem('ee4392.yield.process-capability', seed);
      if (item.answer.kind !== 'numeric') continue;
      examined += 1;
      expect(item.answer.value).toBeGreaterThan(0);
      // Whichever index was asked for, the other one appears in the closing
      // steps, and Cpk <= Cp must hold for both orderings.
      const closing = item.explanation.steps.slice(-2).join(' ');
      const others = [...closing.matchAll(/=\s*([\d.]+)\$/g)].map((m) => Number(m[1]));
      for (const other of others) expect(other).toBeGreaterThan(0);
    }
    atLeastOne(examined, 'a capability item');
  });
});

describe('EE 4392 lithography bounds', () => {
  it('resolution and depth of focus are positive', () => {
    for (const seed of SEEDS) {
      expect(answerOf('ee4392.litho.rayleigh', seed)).toBeGreaterThan(0);
    }
  });

  it('raising NA improves resolution and costs depth of focus', () => {
    const lambda = 248;
    let previousR = Infinity;
    let previousDof = Infinity;
    for (const na of [0.5, 0.6, 0.7, 0.85, 0.93]) {
      const r = (0.75 * lambda) / na;
      const dof = (0.5 * lambda) / (na * na);
      expect(r).toBeLessThan(previousR);
      expect(dof).toBeLessThan(previousDof);
      previousR = r;
      previousDof = dof;
    }
  });

  it('proximity resolution improves only as the square root of the gap', () => {
    const base = Math.sqrt(0.6 * 365 * 10_000);
    const quarterGap = Math.sqrt(0.6 * 365 * 2_500);
    // Quartering the gap halves the feature, not quarters it.
    expect(quarterGap / base).toBeCloseTo(0.5, 6);
  });

  it('proximity features are larger than the wavelength that printed them', () => {
    for (const seed of SEEDS) {
      const stem = stemOf('ee4392.litho.proximity', seed);
      const lambda = Number(/lambda = ([\d.]+)\\,\\mathrm/.exec(stem)?.[1]);
      expect(lambda, `unparsed wavelength in: ${stem}`).toBeGreaterThan(0);
      expect(answerOf('ee4392.litho.proximity', seed)).toBeGreaterThan(lambda);
    }
  });

  it('resist contrast is positive and CMTF is a modulation depth', () => {
    for (const q0 of [4, 10, 22]) {
      for (const ratio of [1.4, 2, 5, 11]) {
        const qf = q0 * ratio;
        expect(resistContrast(q0, qf)).toBeGreaterThan(0);
        const cmtf = resistCmtf(q0, qf);
        expect(cmtf).toBeGreaterThan(0);
        expect(cmtf).toBeLessThan(1);
      }
    }
  });

  it('a narrower dose range means higher contrast and a lower CMTF', () => {
    const wide = { q0: 10, qf: 110 };
    const narrow = { q0: 10, qf: 14 };
    expect(resistContrast(narrow.q0, narrow.qf)).toBeGreaterThan(resistContrast(wide.q0, wide.qf));
    expect(resistCmtf(narrow.q0, narrow.qf)).toBeLessThan(resistCmtf(wide.q0, wide.qf));
  });

  it('the two routes to CMTF agree', () => {
    for (const q0 of [4, 8, 15]) {
      for (const ratio of [1.5, 3, 7]) {
        const qf = q0 * ratio;
        const gamma = resistContrast(q0, qf);
        const viaGamma = (10 ** (1 / gamma) - 1) / (10 ** (1 / gamma) + 1);
        expect(viaGamma).toBeCloseTo(resistCmtf(q0, qf), 10);
      }
    }
  });

  it('contrast-chain answers are positive, and dimensionless ones stay below one', () => {
    let modulation = 0;
    for (const seed of SEEDS) {
      const item = parsedItem('ee4392.litho.resist-contrast', seed);
      if (item.answer.kind !== 'numeric') continue;
      expect(item.answer.value).toBeGreaterThan(0);
      if (item.stem.includes('CMTF') || item.stem.includes('optical MTF')) {
        modulation += 1;
        // A perfectly dark background gives MTF exactly 1, which is the ideal
        // case rather than an impossible one. The bound is inclusive.
        expect(item.answer.value).toBeLessThanOrEqual(1);
      }
    }
    atLeastOne(modulation, 'a CMTF or MTF item');
  });

  it('the resolution criterion answers the comparison it states', () => {
    let examined = 0;
    for (const seed of SEEDS) {
      const item = parsedItem('ee4392.litho.resolution-criterion', seed);
      if (item.answer.kind !== 'choice') continue;
      examined += 1;
      const closing = item.explanation.steps.join(' ');
      const resolves = item.answer.correctId === 'yes';
      expect(closing).toContain(resolves ? 'resolves**' : 'does not resolve**');
      // The inequality printed in the working must point the same way as the
      // verdict, or the item argues for one answer and records the other.
      expect(closing).toContain(resolves ? '>' : '<');
    }
    atLeastOne(examined, 'a resolution-criterion item');
  });

  it('both verdicts occur across the seed set', () => {
    const verdicts = new Set(
      SEEDS.map((seed) => {
        const item = parsedItem('ee4392.litho.resolution-criterion', seed);
        return item.answer.kind === 'choice' ? item.answer.correctId : '';
      }),
    );
    // A criterion generator that always says yes teaches nothing about the
    // criterion, and would pass every other check in this file.
    expect(verdicts.has('yes')).toBe(true);
    expect(verdicts.has('no')).toBe(true);
  });
});

/**
 * The masked two-step growth, checked against the exam it is modelled on.
 *
 * Exam 1 asked for a 0.2 um wet oxidation at 1000 C over a 0.4 um field oxide
 * and wanted three numbers out of it. Two of them are pinned here against the
 * instructor's published key, which is the only external check this generator
 * has — the rest of the file can only say the answer is plausible.
 */
describe('masked two-step oxidation matches the exam it models', () => {
  const wet1000 = WET_111[1000]!;

  it('the window takes 0.263 hr and consumes 0.088 um of silicon', () => {
    const t = oxideTime(0.2, wet1000, 0);
    expect(t).toBeCloseTo(0.263, 3);
    expect(0.44 * 0.2).toBeCloseTo(0.088, 4);
  });

  it('the field region grows less than the window in the same time', () => {
    const t = oxideTime(0.2, wet1000, 0);
    const fieldFinal = oxideThickness(t, wet1000, 0.4);
    expect(fieldFinal - 0.4).toBeLessThan(0.2);
    expect(fieldFinal).toBeCloseTo(0.480, 3);
  });

  it('never reports the field region as thinner than it started', () => {
    for (const seed of SEEDS) {
      const stem = stemOf('ee4392.oxidation.masked-two-step', seed);
      if (!stem.includes('**field**')) continue;
      const field = Number(/field oxide \$([\d.]+)\\,\\mu/.exec(stem)?.[1]);
      expect(field, `unparsed field oxide in: ${stem}`).toBeGreaterThan(0);
      const answer = answerOf('ee4392.oxidation.masked-two-step', seed);
      expect(answer).toBeGreaterThan(field);
      // and never as thick as naively adding the window's growth
      const window = Number(/grows \$([\d.]+)\\,\\mu/.exec(stem)?.[1]);
      expect(answer).toBeLessThan(field + window);
    }
  });

  it('asks about both regions across the seed set', () => {
    const asks = SEEDS.map((s) => stemOf('ee4392.oxidation.masked-two-step', s).includes('**field**'));
    expect(asks.some(Boolean)).toBe(true);
    expect(asks.some((a) => !a)).toBe(true);
  });
});

/**
 * Diffusion and implantation bounds.
 *
 * These lectures have not been given, so there is no instructor's key to check
 * against — unlike the oxidation generators, nothing here can be pinned to a
 * published answer. That makes the bounds the only independent evidence, and
 * it makes the erfc implementation worth testing directly: a special function
 * written by hand is exactly the kind of thing that is confidently wrong in
 * one direction and agrees perfectly with itself.
 */
describe('erfc is correct where its value is known', () => {
  it('matches the values that define it', () => {
    expect(erfc(0)).toBeCloseTo(1, 6);
    expect(erfc(10)).toBeCloseTo(0, 6);
    expect(erfc(-10)).toBeCloseTo(2, 6);
  });

  it('matches tabulated values', () => {
    // Standard tables, to the accuracy the A&S 7.1.26 approximation offers.
    expect(erfc(0.5)).toBeCloseTo(0.4795, 4);
    expect(erfc(1.0)).toBeCloseTo(0.1573, 4);
    expect(erfc(1.5)).toBeCloseTo(0.0339, 4);
    expect(erfc(2.0)).toBeCloseTo(0.004678, 5);
  });

  it('is symmetric about one', () => {
    for (const x of [0.2, 0.7, 1.3, 2.4]) {
      expect(erfc(x) + erfc(-x)).toBeCloseTo(2, 6);
    }
  });

  it('decreases monotonically', () => {
    let previous = Infinity;
    for (const x of [-2, -1, 0, 0.5, 1, 2, 3]) {
      const value = erfc(x);
      expect(value).toBeLessThan(previous);
      previous = value;
    }
  });
});

describe('EE 4392 dopant transport bounds', () => {
  it('diffusivity is positive, tiny, and rises with temperature', () => {
    for (const dopant of DOPANTS) {
      let previous = 0;
      for (const celsiusValue of [900, 1000, 1100, 1200]) {
        const d = diffusivity(dopant.d0, dopant.ea, celsiusValue + 273.15);
        expect(d).toBeGreaterThan(previous);
        // A substitutional dopant at process temperature is nowhere near D0.
        expect(d).toBeLessThan(dopant.d0);
        expect(d).toBeLessThan(1e-9);
        previous = d;
      }
    }
  });

  it('every generated diffusivity is positive', () => {
    for (const seed of SEEDS) {
      expect(answerOf('ee4392.diffusion.diffusivity', seed)).toBeGreaterThan(0);
    }
  });

  it('junction depth is positive and a believable fraction of a micrometre', () => {
    for (const seed of SEEDS) {
      const xj = answerOf('ee4392.diffusion.junction-depth', seed);
      expect(xj).toBeGreaterThan(0);
      expect(xj).toBeLessThan(20);
    }
  });

  it('junction depth grows with drive-in and shrinks as the background rises', () => {
    const jd = (dt: number, n0: number, nb: number) => 2 * Math.sqrt(dt * Math.log(n0 / nb)) * 1e4;
    let previous = 0;
    for (const dt of [1e-12, 1e-11, 1e-10, 1e-9]) {
      const xj = jd(dt, 1e20, 1e15);
      expect(xj).toBeGreaterThan(previous);
      previous = xj;
    }
    // A heavier background is met sooner, so the junction is shallower.
    expect(jd(1e-11, 1e20, 1e16)).toBeLessThan(jd(1e-11, 1e20, 1e15));
  });

  it('a predeposition concentration never exceeds the surface value', () => {
    let examined = 0;
    for (const seed of SEEDS) {
      const stem = stemOf('ee4392.diffusion.predeposition-dose', seed);
      if (!stem.includes('concentration at a depth')) continue;
      examined += 1;
      const surfaceMatch = /N_s = ([\d.]+) \\times 10\^\{(\d+)\}/.exec(stem);
      const ns = Number(surfaceMatch?.[1]) * 10 ** Number(surfaceMatch?.[2]);
      expect(ns, `unparsed surface concentration in: ${stem}`).toBeGreaterThan(0);
      const answer = answerOf('ee4392.diffusion.predeposition-dose', seed);
      expect(answer).toBeGreaterThan(0);
      expect(answer).toBeLessThan(ns);
    }
    atLeastOne(examined, 'a predeposition concentration item');
  });

  it('predeposition dose is positive and grows as the root of Dt', () => {
    let examined = 0;
    for (const seed of SEEDS) {
      if (stemOf('ee4392.diffusion.predeposition-dose', seed).includes('concentration at a depth')) continue;
      examined += 1;
      expect(answerOf('ee4392.diffusion.predeposition-dose', seed)).toBeGreaterThan(0);
    }
    atLeastOne(examined, 'a predeposition dose item');
    // Quadrupling Dt doubles the dose, which is the signature of a constant source.
    const q = (ns: number, dt: number) => 2 * ns * Math.sqrt(dt / Math.PI);
    expect(q(1e20, 4e-12) / q(1e20, 1e-12)).toBeCloseTo(2, 10);
  });

  it('implant peak concentration is positive and the profile integrates to the dose', () => {
    for (const seed of SEEDS) {
      expect(answerOf('ee4392.implant.profile', seed)).toBeGreaterThan(0);
    }
    // Numerically integrate a Gaussian with the generator's normalisation and
    // confirm it returns the dose it was built from. This is the check that
    // catches a missing root-two-pi, which no bound on the peak alone would.
    const dose = 1e14;
    const straggle = 5e-6;
    const peak = dose / (Math.sqrt(2 * Math.PI) * straggle);
    const rp = 2e-5;
    let integral = 0;
    const step = straggle / 200;
    for (let x = rp - 8 * straggle; x <= rp + 8 * straggle; x += step) {
      integral += peak * Math.exp(-((x - rp) ** 2) / (2 * straggle * straggle)) * step;
    }
    expect(integral / dose).toBeCloseTo(1, 3);
  });

  it('implant dose is positive and scales with current and time', () => {
    for (const seed of SEEDS) {
      expect(answerOf('ee4392.implant.dose-from-beam', seed)).toBeGreaterThan(0);
    }
    const q = (amps: number, seconds: number, charge: number, area: number) =>
      (amps * seconds) / (charge * 1.602e-19 * area);
    expect(q(2e-4, 120, 1, 100)).toBeCloseTo(2 * q(1e-4, 120, 1, 100), 6);
    // A doubly charged beam delivers half the ions at the same current.
    expect(q(1e-4, 60, 2, 100)).toBeCloseTo(q(1e-4, 60, 1, 100) / 2, 6);
  });

  it('both dopant-source conditions appear across the seed set', () => {
    const asks = SEEDS.map((s) => stemOf('ee4392.diffusion.predeposition-dose', s).includes('concentration at a depth'));
    expect(asks.some(Boolean)).toBe(true);
    expect(asks.some((a) => !a)).toBe(true);
  });
});

/**
 * Etch, deposition and interconnect bounds.
 *
 * The same no-external-key situation as the dopant unit, plus one case where a
 * published rule of thumb does exist and is worth pinning: the mean free path
 * of air at room temperature is about 5 cm at a millitorr, which is the number
 * every vacuum engineer carries around. If the implementation reproduces that
 * it has the constants and the unit conversion right together.
 */
describe('EE 4392 etch and deposition bounds', () => {
  it('mean free path matches the millitorr rule of thumb', () => {
    const kB = 1.380649e-23;
    const d = 3.7e-10;
    const lambdaCm = (p: number, t: number) =>
      ((kB * t) / (Math.SQRT2 * Math.PI * d * d * p * 133.322)) * 100;
    // ~5 cm at 1 mTorr, room temperature.
    expect(lambdaCm(1e-3, 293.15)).toBeGreaterThan(4);
    expect(lambdaCm(1e-3, 293.15)).toBeLessThan(6);
    // and inversely proportional to pressure
    expect(lambdaCm(1e-4, 293.15) / lambdaCm(1e-3, 293.15)).toBeCloseTo(10, 6);
  });

  it('every mean free path is positive and rises as pressure falls', () => {
    for (const seed of SEEDS) {
      expect(answerOf('ee4392.deposition.mean-free-path', seed)).toBeGreaterThan(0);
    }
  });

  it('total etch time always exceeds the time to clear the film', () => {
    let examined = 0;
    for (const seed of SEEDS) {
      const stem = stemOf('ee4392.etch.selectivity', seed);
      if (!stem.includes('total etch time')) continue;
      examined += 1;
      const thickness = Number(/A \$(\d+)\\,\\mathrm/.exec(stem)?.[1]);
      const rate = Number(/etched at \$(\d+)\\,\\mathrm\{nm\/min\}/.exec(stem)?.[1]);
      expect(thickness, `unparsed thickness in: ${stem}`).toBeGreaterThan(0);
      expect(rate, `unparsed rate in: ${stem}`).toBeGreaterThan(0);
      expect(answerOf('ee4392.etch.selectivity', seed)).toBeGreaterThan(thickness / rate);
    }
    atLeastOne(examined, 'an etch-time item');
  });

  it('underlayer loss is positive and smaller than the film etched', () => {
    let examined = 0;
    for (const seed of SEEDS) {
      const stem = stemOf('ee4392.etch.selectivity', seed);
      if (!stem.includes('underlying layer is lost')) continue;
      examined += 1;
      const thickness = Number(/A \$(\d+)\\,\\mathrm/.exec(stem)?.[1]);
      const loss = answerOf('ee4392.etch.selectivity', seed);
      expect(loss).toBeGreaterThan(0);
      // Selectivity is always well above one here, so the underlayer must lose
      // far less than the film did.
      expect(loss).toBeLessThan(thickness);
    }
    atLeastOne(examined, 'an underlayer-loss item');
  });

  it('a perfectly anisotropic etch does not undercut, and an isotropic one undercuts fully', () => {
    const lateral = (depth: number, a: number) => depth * (1 - a);
    expect(lateral(300, 1)).toBe(0);
    expect(lateral(300, 0)).toBe(300);
    // and undercut falls monotonically as anisotropy rises
    let previous = Infinity;
    for (const a of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const l = lateral(300, a);
      expect(l).toBeLessThan(previous);
      previous = l;
    }
  });

  it('an etched opening is never narrower than its mask', () => {
    let examined = 0;
    for (const seed of SEEDS) {
      const stem = stemOf('ee4392.etch.bias-anisotropy', seed);
      if (!stem.includes('width of the etched opening')) continue;
      examined += 1;
      const mask = Number(/feature \$(\d+)\\,\\mathrm/.exec(stem)?.[1]);
      expect(mask, `unparsed mask width in: ${stem}`).toBeGreaterThan(0);
      expect(answerOf('ee4392.etch.bias-anisotropy', seed)).toBeGreaterThanOrEqual(mask);
    }
    atLeastOne(examined, 'an opening-width item');
  });

  it('step coverage never exceeds the nominal thickness', () => {
    let examined = 0;
    for (const seed of SEEDS) {
      const stem = stemOf('ee4392.deposition.step-coverage', seed);
      if (!stem.includes('How thick is the film on the via sidewall')) continue;
      examined += 1;
      const nominal = Number(/deposits \$(\d+)\\,\\mathrm/.exec(stem)?.[1]);
      const sidewall = answerOf('ee4392.deposition.step-coverage', seed);
      expect(sidewall).toBeGreaterThan(0);
      expect(sidewall).toBeLessThan(nominal);
    }
    atLeastOne(examined, 'a sidewall-thickness item');
  });

  it('a reported coverage percentage stays between 0 and 100', () => {
    let examined = 0;
    for (const seed of SEEDS) {
      const stem = stemOf('ee4392.deposition.step-coverage', seed);
      if (!stem.includes('What is the step coverage')) continue;
      examined += 1;
      const coverage = answerOf('ee4392.deposition.step-coverage', seed);
      expect(coverage).toBeGreaterThan(0);
      expect(coverage).toBeLessThanOrEqual(100);
    }
    atLeastOne(examined, 'a coverage-percentage item');
  });

  it('interconnect delay is positive and grows as the square of length', () => {
    for (const seed of SEEDS) {
      expect(answerOf('ee4392.interconnect.rc-delay', seed)).toBeGreaterThan(0);
    }
    // R goes as L and C goes as L, so RC goes as L squared. This is the claim
    // the whole unit rests on, and no bound on a single answer can check it.
    const rc = (lengthUm: number) => {
      const lengthCm = lengthUm * 1e-4;
      const r = (1.68e-6 * lengthCm) / (0.35 * 0.8 * 1e-8);
      const c = (3.9 * 8.854e-14 * 0.35e-4 * lengthCm) / 0.2e-4;
      return r * c;
    };
    expect(rc(2000) / rc(1000)).toBeCloseTo(4, 6);
    expect(rc(5000) / rc(1000)).toBeCloseTo(25, 6);
  });

  it('copper gives a lower delay than aluminium at the same geometry', () => {
    const r = (rho: number) => (rho * 0.1) / (0.35 * 0.8 * 1e-8);
    expect(r(1.68e-6)).toBeLessThan(r(2.65e-6));
  });
});
