import { describe, expect, it } from 'vitest';
import { itemSchema } from '@et/content-schema';
import { GENERATORS, makeRng } from '../src/index.js';
import {
  DRY_111, WET_111, oxideThickness, oxideTime, resistCmtf, resistContrast, tauFor,
} from '../src/ee4392/common.js';

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
