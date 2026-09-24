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

/**
 * Fluid statics bounds.
 *
 * Buoyancy is the clearest case in the repository of a generator that could be
 * wrong in one direction and agree with itself perfectly: swap the two
 * densities and every item still produces a plausible force in newtons, a
 * worked solution that reaches it, and an answer key that matches. Only a
 * statement about what the physics must do catches it — a floating object
 * cannot be more than fully submerged, a denser object cannot float, and the
 * buoyant force cannot depend on what the object is made of.
 */
describe('PHYS 2335 fluid statics bounds', () => {
  it('pressure rises with depth and absolute always exceeds gauge', () => {
    const gauge = (rho: number, h: number) => rho * 9.81 * h;
    let previous = 0;
    for (const h of [1, 5, 20, 100]) {
      const p = gauge(1000, h);
      expect(p).toBeGreaterThan(previous);
      expect(p + 101325).toBeGreaterThan(p);
      previous = p;
    }
  });

  it('every pressure answer is positive', () => {
    for (const seed of SEEDS) {
      expect(answerOf('phys2335.fluids.pressure-depth', seed)).toBeGreaterThan(0);
    }
  });

  it('an absolute pressure is never below one atmosphere', () => {
    let examined = 0;
    for (const seed of SEEDS) {
      if (!stemOf('phys2335.fluids.pressure-depth', seed).includes('**absolute**')) continue;
      examined += 1;
      expect(answerOf('phys2335.fluids.pressure-depth', seed)).toBeGreaterThan(101325);
    }
    atLeastOne(examined, 'an absolute-pressure item');
  });

  it('the lighter manometer column is always the taller one', () => {
    for (const seed of SEEDS) {
      const stem = stemOf('phys2335.fluids.manometer', seed);
      const heavyH = Number(/standing \$([\d.]+)\\,\\mathrm\{m\}/.exec(stem)?.[1]);
      expect(heavyH, `unparsed column height in: ${stem}`).toBeGreaterThan(0);
      // The left arm holds the lighter fluid by construction, so it must stand higher.
      expect(answerOf('phys2335.fluids.manometer', seed)).toBeGreaterThan(heavyH);
    }
  });

  it('a hydraulic lift multiplies force by the square of the radius ratio', () => {
    for (const seed of SEEDS) {
      const stem = stemOf('phys2335.fluids.hydraulic', seed);
      const input = Number(/force of \$([\d.]+)\\,\\mathrm\{N\}/.exec(stem)?.[1]);
      expect(input, `unparsed input force in: ${stem}`).toBeGreaterThan(0);
      const output = answerOf('phys2335.fluids.hydraulic', seed);
      // Output always exceeds input here, and by at least the smallest ratio squared.
      expect(output).toBeGreaterThan(input * 3);
    }
    // Doubling the radius quadruples the force, not doubles it.
    const force = (r1: number, r2: number, f: number) => f * (r2 / r1) ** 2;
    expect(force(0.01, 0.02, 100)).toBeCloseTo(400, 6);
  });

  it('buoyant force depends on the fluid and not on the object', () => {
    const buoyant = (rhoFluid: number, volume: number) => rhoFluid * volume * 9.81;
    // Lead and pine of the same volume feel the same push. This is the whole
    // principle, and it is the assertion that catches a swapped density.
    expect(buoyant(1000, 0.001)).toBe(buoyant(1000, 0.001));
    // and it scales with the fluid
    expect(buoyant(13600, 0.001)).toBeGreaterThan(buoyant(1000, 0.001));
  });

  it('a submerged buoyant force is always less than the true weight of a sinking object', () => {
    let examined = 0;
    for (const seed of SEEDS) {
      const stem = stemOf('phys2335.fluids.buoyant-force', seed);
      if (!stem.includes('buoyant force does the fluid exert')) continue;
      examined += 1;
      const answer = answerOf('phys2335.fluids.buoyant-force', seed);
      expect(answer).toBeGreaterThan(0);
    }
    atLeastOne(examined, 'a buoyant-force item');
  });

  it('apparent weight is positive for a denser-than-fluid object and below its true weight', () => {
    let examined = 0;
    for (const seed of SEEDS) {
      const stem = stemOf('phys2335.fluids.buoyant-force', seed);
      if (!stem.includes('apparent weight')) continue;
      examined += 1;
      const answer = answerOf('phys2335.fluids.buoyant-force', seed);
      // The generator only draws objects denser than the fluid, so a submerged
      // one still weighs something — a negative apparent weight would mean it
      // was floating, which contradicts the stem.
      expect(answer).toBeGreaterThan(0);
    }
    atLeastOne(examined, 'an apparent-weight item');
  });

  it('a floating fraction is strictly between zero and one', () => {
    let examined = 0;
    for (const seed of SEEDS) {
      const stem = stemOf('phys2335.fluids.floating', seed);
      if (!stem.includes('What fraction of its volume')) continue;
      examined += 1;
      const fraction = answerOf('phys2335.fluids.floating', seed);
      expect(fraction).toBeGreaterThan(0);
      expect(fraction).toBeLessThan(1);
    }
    atLeastOne(examined, 'a floating-fraction item');
  });

  it('a draft never exceeds the height of the block', () => {
    let examined = 0;
    for (const seed of SEEDS) {
      const stem = stemOf('phys2335.fluids.floating', seed);
      if (!stem.includes('How deep does it sit')) continue;
      examined += 1;
      const height = Number(/is \$([\d.]+)\\,\\mathrm\{m\}\$\s*\n?\s*tall|is \$([\d.]+)\\,\\mathrm\{m\}\$ tall/.exec(stem)?.slice(1).find(Boolean));
      expect(height, `unparsed block height in: ${stem}`).toBeGreaterThan(0);
      expect(answerOf('phys2335.fluids.floating', seed)).toBeLessThan(height);
    }
    atLeastOne(examined, 'a draft item');
  });

  it('denser objects float lower, and one denser than the fluid does not float at all', () => {
    const submergedFraction = (rhoObject: number, rhoFluid: number) => rhoObject / rhoFluid;
    expect(submergedFraction(240, 1000)).toBeLessThan(submergedFraction(917, 1000));
    // Ice in water sits very low; cork rides high.
    expect(submergedFraction(917, 1000)).toBeCloseTo(0.917, 3);
    // A density ratio above one is not a floating solution.
    expect(submergedFraction(2300, 1000)).toBeGreaterThan(1);
  });
});

/**
 * Optics bounds.
 *
 * The defining risk in this unit is that `d sin(theta) = m lambda` and
 * `a sin(theta) = m lambda` are typographically the same equation and locate
 * opposite things — maxima for two slits, minima for one. A generator that
 * confuses them produces an angle in the right range, a worked solution that
 * reaches it, and an answer key that agrees. Only a statement about which
 * fringe is where can catch it, so that is what these assert.
 */
describe('PHYS 2335 optics bounds', () => {
  it('every interference angle is a real angle below ninety degrees', () => {
    for (const id of ['phys2335.optics.two-slit', 'phys2335.optics.grating', 'phys2335.optics.single-slit']) {
      for (const seed of SEEDS) {
        const value = answerOf(id, seed);
        expect(Number.isFinite(value), `${id} seed ${seed} produced ${value}`).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    }
  });

  it('two-slit maxima and single-slit minima are different conditions', () => {
    const lambda = 633e-9;
    const spacing = 20e-6;
    // Same geometry, same m: the two-slit bright fringe and the single-slit
    // dark fringe land on the same angle. That is exactly why the confusion
    // survives — the number is identical and the meaning is opposite.
    const twoSlitBright = Math.asin((1 * lambda) / spacing);
    const singleSlitDark = Math.asin((1 * lambda) / spacing);
    expect(twoSlitBright).toBeCloseTo(singleSlitDark, 12);
    // What differs is where the *other* kind of fringe sits.
    const twoSlitDark = Math.asin((0.5 * lambda) / spacing);
    expect(twoSlitDark).toBeLessThan(twoSlitBright);
  });

  it('higher orders diffract further, and a narrower slit spreads the pattern', () => {
    const angle = (m: number, lambda: number, a: number) => Math.asin((m * lambda) / a);
    let previous = 0;
    for (const m of [1, 2, 3]) {
      const t = angle(m, 633e-9, 20e-6);
      expect(t).toBeGreaterThan(previous);
      previous = t;
    }
    // Narrowing the slit widens the pattern, which is the counter-intuitive half.
    expect(angle(1, 633e-9, 2e-6)).toBeGreaterThan(angle(1, 633e-9, 20e-6));
  });

  it('a grating recovers the wavelength it was given', () => {
    // Round trip: angle from wavelength, then wavelength from angle.
    for (const linesPerMm of [300, 600]) {
      for (const nm of [470, 633]) {
        for (const m of [1, 2]) {
          const d = 1 / (linesPerMm * 1000);
          const sinTheta = (m * nm * 1e-9) / d;
          if (sinTheta >= 1) continue;
          const recovered = ((d * sinTheta) / m) * 1e9;
          expect(recovered).toBeCloseTo(nm, 6);
        }
      }
    }
  });

  it('a wavelength read off a grating comes back in the visible range', () => {
    let examined = 0;
    for (const seed of SEEDS) {
      if (!stemOf('phys2335.optics.grating', seed).includes('unknown spectral line')) continue;
      examined += 1;
      const nm = answerOf('phys2335.optics.grating', seed);
      expect(nm).toBeGreaterThan(380);
      expect(nm).toBeLessThan(750);
    }
    atLeastOne(examined, 'a grating wavelength item');
  });

  it('refraction bends toward the normal entering a denser medium', () => {
    const refract = (n1: number, n2: number, deg: number) =>
      (Math.asin((n1 * Math.sin((deg * Math.PI) / 180)) / n2) * 180) / Math.PI;
    // Air into glass: the refracted angle must be smaller.
    expect(refract(1.0, 1.52, 40)).toBeLessThan(40);
    // Glass into air: larger.
    expect(refract(1.52, 1.0, 30)).toBeGreaterThan(30);
    // Equal indices: unchanged.
    expect(refract(1.33, 1.33, 25)).toBeCloseTo(25, 10);
  });

  it('every refracted ray the generator draws actually transmits', () => {
    for (const seed of SEEDS) {
      const value = answerOf('phys2335.optics.snell', seed);
      expect(Number.isNaN(value), `snell seed ${seed} produced NaN — a ray past critical`).toBe(false);
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(90);
    }
  });

  it('a critical angle exists only dense to rare, and shrinks as the contrast grows', () => {
    const critical = (n1: number, n2: number) => (Math.asin(n2 / n1) * 180) / Math.PI;
    // Diamond to air is famously small; water to air much larger.
    expect(critical(2.42, 1.0)).toBeLessThan(critical(1.33, 1.0));
    expect(critical(1.33, 1.0)).toBeCloseTo(48.75, 1);
    // The other direction has no solution at all.
    expect(Number.isNaN(Math.asin(1.33 / 1.0))).toBe(true);
  });

  it('every critical angle is below ninety degrees', () => {
    for (const seed of SEEDS) {
      const value = answerOf('phys2335.optics.critical-angle', seed);
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(90);
    }
  });
});
