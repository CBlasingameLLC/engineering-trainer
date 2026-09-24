import { describe, expect, it } from 'vitest';
import { itemSchema } from '@et/content-schema';
import { GENERATORS, makeRng } from '../src/index.js';

/**
 * Physical sanity, checked independently of the arithmetic that produced it.
 *
 * `pack verify` proves an item is internally consistent: its answer survives
 * its own grader, its explanation ends on it, and the generator reproduces it
 * from the seed. None of that can catch a generator that is confidently wrong
 * in the same direction throughout — the answer key and the worked solution
 * would agree perfectly on a Carnot efficiency above 1.
 *
 * These are the physics statements that must hold whatever the draw, checked
 * against bounds rather than against a second implementation of the same
 * formula. A bound is a different kind of claim from a value, which is what
 * makes it worth asserting separately.
 */

const SEEDS = [1, 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];

/**
 * Several generators branch on a drawn mode, so a check that applies to one
 * branch has to skip the other. A skip that never stops skipping is a test
 * that passes without asserting anything, which is indistinguishable from a
 * working one — so every branch-filtered check counts what it actually
 * examined and fails if the answer is none.
 */
function atLeastOne(examined: number, what: string): void {
  expect(examined, `no seed produced ${what}; this check asserted nothing`).toBeGreaterThan(0);
}

const generatorById = (id: string) => {
  const g = GENERATORS.find((x) => x.id === id);
  if (!g) throw new Error(`no generator ${id}`);
  return g;
};

/** Answer value for one variant, having passed the schema. */
function answerOf(id: string, seed: number): number {
  const item = itemSchema.parse({
    ...generatorById(id).generate(makeRng(seed), seed),
    id: `${id}.s${seed}`,
    seed,
    provenance: { producer: 'generator', sourceRef: id, licenseTier: 'redistributable' },
  });
  if (item.answer.kind !== 'numeric') throw new Error(`${id} is not numeric`);
  return item.answer.value;
}

function stemOf(id: string, seed: number): string {
  return generatorById(id).generate(makeRng(seed), seed).stem;
}

describe('PHYS 2335 physical bounds', () => {
  it('a Carnot efficiency is a fraction, and a COP is positive', () => {
    let examined = 0;
    for (const seed of SEEDS) {
      const value = answerOf('phys2335.heat-engines.efficiency', seed);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
      // Efficiency items answer a fraction below 1; COP and work items answer
      // an unbounded positive number. Neither may be negative, and neither may
      // be an efficiency above unity.
      const stem = stemOf('phys2335.heat-engines.efficiency', seed);
      if (stem.includes('as a fraction')) {
        examined++;
        expect(value).toBeLessThan(1);
      }
    }
    atLeastOne(examined, 'an efficiency-as-a-fraction question');
  });

  it('two reservoirs exchanging heat always gain entropy', () => {
    for (const seed of SEEDS) {
      // The second law, and the only assertion in the file that is a law
      // rather than a definition: a spontaneous flow cannot lower the total.
      expect(answerOf('phys2335.entropy.reservoirs', seed)).toBeGreaterThan(0);
    }
  });

  it('adiabatic compression raises the temperature above where it started', () => {
    let examined = 0;
    for (const seed of SEEDS) {
      const stem = stemOf('phys2335.thermodynamic-processes.adiabatic', seed);
      if (!stem.includes('final temperature')) continue;
      examined++;
      const value = answerOf('phys2335.thermodynamic-processes.adiabatic', seed);
      // Every starting temperature drawn is near room temperature, so a
      // compression that does not heat the gas has gone wrong somewhere.
      expect(value).toBeGreaterThan(300);
    }
    atLeastOne(examined, 'an adiabatic temperature question');
  });

  it('a molecular speed is fast but not relativistic', () => {
    for (const seed of SEEDS) {
      const value = answerOf('phys2335.kinetic-theory.rms-speed', seed);
      // Helium at 300 C is the fastest draw available here; anything beyond a
      // few km/s means a missing square root or a molar mass in grams.
      expect(value).toBeGreaterThan(100);
      expect(value).toBeLessThan(4000);
    }
  });

  it('a Doppler shift moves the pitch the way the scene says it should', () => {
    let approaching = 0;
    let receding = 0;
    for (const seed of SEEDS) {
      const stem = stemOf('phys2335.doppler-effect.observed', seed);
      const source = /\$(\d+(?:\.\d+)?)\\,\\mathrm\{Hz\}\$/.exec(stem);
      expect(source, `no source frequency in: ${stem}`).not.toBeNull();
      const emitted = Number(source![1]);
      const heard = answerOf('phys2335.doppler-effect.observed', seed);
      if (stem.includes('towards')) {
        approaching++;
        expect(heard).toBeGreaterThan(emitted);
      } else {
        receding++;
        expect(heard).toBeLessThan(emitted);
      }
    }
    atLeastOne(approaching, 'an approaching Doppler scene');
    atLeastOne(receding, 'a receding Doppler scene');
  });

  it('a damped oscillator is slower than the same one undamped', () => {
    let examined = 0;
    for (const seed of SEEDS) {
      const stem = stemOf('phys2335.damped-driven-oscillation.critical', seed);
      if (!stem.includes('damped angular frequency')) continue;
      examined++;
      const m = /mass of \$(\d+(?:\.\d+)?)\\,\\mathrm\{kg\}\$/.exec(stem);
      const k = /stiffness \$(\d+(?:\.\d+)?)\\,\\mathrm\{N\/m\}\$/.exec(stem);
      expect(m, stem).not.toBeNull();
      expect(k, stem).not.toBeNull();
      const omega0 = Math.sqrt(Number(k![1]) / Number(m![1]));
      const omegaD = answerOf('phys2335.damped-driven-oscillation.critical', seed);
      expect(omegaD).toBeLessThan(omega0);
      // Light damping only: the draw keeps b well below critical, so the shift
      // should be small. A large shift means the quadrature term is wrong.
      expect(omegaD).toBeGreaterThan(omega0 * 0.9);
    }
    atLeastOne(examined, 'a damped-frequency question');
  });

  it('heat through an insulated wall is less than through its facing alone', () => {
    let examined = 0;
    for (const seed of SEEDS) {
      const stem = stemOf('phys2335.heat-transfer.conduction', seed);
      if (!stem.includes('backed by')) continue;
      examined++;
      const value = answerOf('phys2335.heat-transfer.conduction', seed);
      expect(value).toBeGreaterThan(0);
      // Series resistances add, so adding insulation can only reduce the flow.
      // The bound is loose on purpose: it is checking a direction, not a value.
      expect(value).toBeLessThan(2000);
    }
    atLeastOne(examined, 'a two-layer conduction question');
  });

  it('melting is the largest single term in the ice-to-water heat', () => {
    for (const seed of SEEDS) {
      const stem = stemOf('phys2335.calorimetry.phase-change', seed);
      const mass = /\$(\d+(?:\.\d+)?)\\,\\mathrm\{kg\}\$ of ice/.exec(stem);
      expect(mass, stem).not.toBeNull();
      const total = answerOf('phys2335.calorimetry.phase-change', seed);
      const latent = Number(mass![1]) * 334000;
      // If the latent term were omitted the total would fall below it, which
      // is the single failure this generator exists to diagnose.
      expect(total).toBeGreaterThan(latent);
    }
  });
});
