import { describe, expect, it } from 'vitest';
import { itemSchema } from '@et/content-schema';
import { checkAnswer, toleranceFor } from '@et/answer-engine';
import { GENERATORS, buildItems, buildPack, generatorById, makeRng } from '../src/index.js';
import type { Generator } from '../src/types.js';

/**
 * Content quality gate.
 *
 * A generator with a wrong answer key is worse than no generator: it teaches
 * the wrong thing and poisons the mastery estimate with false negatives. Every
 * generator is therefore checked three ways — schema validity, self-consistency
 * through the real answer engine, and independent re-derivation of the physics.
 */

const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

/** Generate one variant and attach the fields `buildItems` would add. */
function variant(generator: Generator, seed: number) {
  const generated = generator.generate(makeRng(seed), seed);
  return {
    ...generated,
    id: `${generator.id}.s${seed}`,
    seed,
    provenance: {
      producer: 'generator' as const,
      sourceRef: generator.id,
      licenseTier: 'redistributable' as const,
    },
  };
}

describe('generator registry', () => {
  it('registers every generator under a unique id', () => {
    const ids = GENERATORS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers a meaningful share of the EE 2300 graph', () => {
    const kcs = new Set(GENERATORS.flatMap((g) => g.kcRefs.map((r) => r.kc)));
    expect(GENERATORS.length).toBeGreaterThanOrEqual(15);
    expect(kcs.size).toBeGreaterThanOrEqual(15);
  });

  it('looks generators up by id', () => {
    expect(generatorById('ee2300.thevenin.resistance')).toBeDefined();
    expect(generatorById('nope')).toBeUndefined();
  });
});

describe.each(GENERATORS.map((g) => [g.id, g] as const))('%s', (_id, generator) => {
  it('produces schema-valid items across many seeds', () => {
    for (const seed of SEEDS) {
      const parsed = itemSchema.safeParse(variant(generator, seed));
      if (!parsed.success) {
        throw new Error(
          `seed ${seed}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        );
      }
    }
  });

  it('is deterministic for a given seed', () => {
    for (const seed of [1, 17, 99]) {
      expect(variant(generator, seed)).toEqual(variant(generator, seed));
    }
  });

  it('accepts its own stated answer through the real answer engine', () => {
    // The core self-consistency check, and the same one `pack verify` runs
    // against LLM-authored items.
    for (const seed of SEEDS) {
      const item = itemSchema.parse(variant(generator, seed));
      const response =
        item.answer.kind === 'choice'
          ? ({ kind: 'choice', optionId: item.answer.correctId } as const)
          : ({ kind: 'text', value: String((item.answer as { value: number }).value) } as const);

      const result = checkAnswer(response, item);
      expect(result.correct, `seed ${seed} rejected its own answer: ${result.feedback ?? ''}`).toBe(true);
    }
  });

  it('never places a misconception trap on top of the correct answer', () => {
    // A trap overlapping the right answer diagnoses a correct response as an
    // error — worse than having no trap at all.
    for (const seed of SEEDS) {
      const item = itemSchema.parse(variant(generator, seed));
      if (item.answer.kind !== 'numeric') continue;
      for (const trap of item.misconceptionTraps) {
        const slack = Math.max(
          toleranceFor(trap.tolerance, trap.value),
          toleranceFor(item.answer.tolerance, item.answer.value),
        );
        expect(
          Math.abs(trap.value - item.answer.value),
          `seed ${seed}: trap ${trap.misconception} collides with the answer`,
        ).toBeGreaterThan(slack);
      }
    }
  });

  it('writes a worked solution and a transferable principle', () => {
    for (const seed of [1, 23, 57]) {
      const item = itemSchema.parse(variant(generator, seed));
      expect(item.explanation.steps.length).toBeGreaterThanOrEqual(2);
      expect(item.explanation.principle.length).toBeGreaterThan(20);
      expect(item.stem.length).toBeGreaterThan(20);
    }
  });

  it('declares a difficulty inside the calibrated range', () => {
    expect(generator.difficultyB).toBeGreaterThanOrEqual(-4);
    expect(generator.difficultyB).toBeLessThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// Independent re-derivation of the physics.
// ---------------------------------------------------------------------------

/** Pull the numeric answer from a generated item. */
function answerOf(generator: Generator, seed: number): number {
  const item = itemSchema.parse(variant(generator, seed));
  if (item.answer.kind !== 'numeric') throw new Error('expected a numeric answer');
  return item.answer.value;
}

/** Recover the quantities a stem states, so the check does not reuse the generator's own maths. */
function quantitiesFrom(stem: string): number[] {
  // Values render as "4.7\,\text{kΩ}"; recover magnitude and SI prefix.
  const matches = [...stem.matchAll(/(-?[\d.]+)\\,\\text\{(\\mu |[a-zA-Z])?\\?([a-zA-Z]+)?\}/g)];
  const prefixes: Record<string, number> = {
    G: 1e9, M: 1e6, k: 1e3, m: 1e-3, n: 1e-9, p: 1e-12, '\\mu ': 1e-6, u: 1e-6,
  };
  return matches.map(([, num, prefix]) => Number(num) * (prefix ? (prefixes[prefix] ?? 1) : 1));
}

describe('physics cross-checks', () => {
  it('voltage divider output never exceeds its source', () => {
    const g = generatorById('ee2300.voltage-divider.output')!;
    for (const seed of SEEDS) {
      const item = itemSchema.parse(variant(g, seed));
      const [vs] = quantitiesFrom(item.stem);
      const vout = answerOf(g, seed);
      expect(vout).toBeGreaterThan(0);
      expect(vout).toBeLessThan(vs! * 1.0001);
    }
  });

  it('current divider branch current never exceeds the source current', () => {
    const g = generatorById('ee2300.current-divider.branch')!;
    for (const seed of SEEDS) {
      const item = itemSchema.parse(variant(g, seed));
      const [is] = quantitiesFrom(item.stem);
      const i1 = answerOf(g, seed);
      expect(i1).toBeGreaterThan(0);
      expect(i1).toBeLessThan(is! * 1.0001);
    }
  });

  it('series-parallel equivalent lies between the parallel pair and the full series sum', () => {
    const g = generatorById('ee2300.series-parallel.equivalent')!;
    for (const seed of SEEDS) {
      const item = itemSchema.parse(variant(g, seed));
      const [r1, r2, r3] = quantitiesFrom(item.stem) as [number, number, number];
      const expected = r1 + (r2 * r3) / (r2 + r3);
      expect(answerOf(g, seed)).toBeCloseTo(expected, 6);
      // Independent bound: adding a parallel branch can only lower resistance.
      expect(expected).toBeLessThan(r1 + r2 + r3);
      expect(expected).toBeGreaterThan(r1);
    }
  });

  it('nodal solution satisfies KCL at the node', () => {
    // Re-derives nothing: substitutes the answer back into the physical law and
    // checks the currents actually sum to zero.
    const g = generatorById('ee2300.nodal-analysis.two-source')!;
    for (const seed of SEEDS) {
      const item = itemSchema.parse(variant(g, seed));
      const [vs1, r1, vs2, r3, r2] = quantitiesFrom(item.stem) as number[];
      const va = answerOf(g, seed);
      const residual = (va - vs1!) / r1! + va / r2! + (va - vs2!) / r3!;
      const scale = Math.max(Math.abs(va / r2!), 1e-12);
      expect(Math.abs(residual) / scale).toBeLessThan(1e-9);
    }
  });

  it('mesh solution matches an independent series-parallel reduction', () => {
    // Two genuinely different solution methods must agree.
    const g = generatorById('ee2300.mesh-analysis.two-loop')!;
    for (const seed of SEEDS) {
      const item = itemSchema.parse(variant(g, seed));
      const [vs, r1, r3, r2] = quantitiesFrom(item.stem) as number[];
      const byReduction = vs! / (r1! + (r2! * r3!) / (r2! + r3!));
      expect(answerOf(g, seed)).toBeCloseTo(byReduction, 9);
    }
  });

  it('Thevenin resistance is strictly below the un-suppressed series sum', () => {
    const g = generatorById('ee2300.thevenin.resistance')!;
    for (const seed of SEEDS) {
      const item = itemSchema.parse(variant(g, seed));
      const [, r1, r2, r3] = quantitiesFrom(item.stem) as number[];
      const rth = answerOf(g, seed);
      expect(rth).toBeCloseTo(r3! + (r1! * r2!) / (r1! + r2!), 6);
      // Suppressing the source must reduce the resistance seen at the terminals.
      expect(rth).toBeLessThan(r1! + r2! + r3!);
      expect(rth).toBeGreaterThan(r3!);
    }
  });

  it('Thevenin voltage is independent of the series output resistance', () => {
    const g = generatorById('ee2300.thevenin.voltage')!;
    for (const seed of SEEDS) {
      const item = itemSchema.parse(variant(g, seed));
      const [vs, r1, r2] = quantitiesFrom(item.stem) as number[];
      expect(answerOf(g, seed)).toBeCloseTo((vs! * r2!) / (r1! + r2!), 9);
    }
  });

  it('maximum transferred power equals exactly half the total at the match', () => {
    const power = generatorById('ee2300.max-power-transfer.load')!;
    const vth = generatorById('ee2300.thevenin.voltage')!;
    const rth = generatorById('ee2300.thevenin.resistance')!;
    for (const seed of SEEDS) {
      // The three generators share a topology and seed, so they describe the
      // same network — which makes this a genuine cross-generator check.
      const v = answerOf(vth, seed);
      const r = answerOf(rth, seed);
      const pMax = answerOf(power, seed);
      expect(pMax).toBeCloseTo((v * v) / (4 * r), 12);
      // At the match the source delivers V^2/(2R) total; the load gets half.
      expect(pMax).toBeCloseTo((v * v) / (2 * r) / 2, 12);
    }
  });

  it('Norton current is consistent with the Thevenin pair', () => {
    const norton = generatorById('ee2300.norton.current')!;
    const vth = generatorById('ee2300.thevenin.voltage')!;
    const rth = generatorById('ee2300.thevenin.resistance')!;
    for (const seed of SEEDS) {
      expect(answerOf(norton, seed)).toBeCloseTo(answerOf(vth, seed) / answerOf(rth, seed), 12);
    }
  });

  it('RC step response lands between its initial and final values', () => {
    const g = generatorById('ee2300.first-order-step.capacitor')!;
    for (const seed of SEEDS) {
      const item = itemSchema.parse(variant(g, seed));
      const vt = answerOf(g, seed);
      // Recover the stated final and initial voltages from the explanation.
      const identify = item.explanation.steps.find((s) => s.includes('x_\\infty ='))!;
      const nums = [...identify.matchAll(/=\s*(-?[\d.]+)\s*(?:V|\$)/g)].map((m) => Number(m[1]));
      const [v0, vFinal] = nums as [number, number];
      const [lo, hi] = v0 <= vFinal ? [v0, vFinal] : [vFinal, v0];
      expect(vt).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(vt).toBeLessThanOrEqual(hi + 1e-9);
    }
  });

  it('RLC classification agrees with the alpha-omega comparison in its own solution', () => {
    const g = generatorById('ee2300.second-order-rlc.classify')!;
    for (const seed of SEEDS) {
      const item = itemSchema.parse(variant(g, seed));
      if (item.answer.kind !== 'choice') throw new Error('expected a choice answer');

      const alpha = Number(/\\alpha = \\dfrac\{[^}]+\}\{2\([^)]+\)\} = ([\d.e+-]+)/.exec(
        item.explanation.steps.join(' '),
      )?.[1]);
      const omega0 = Number(/\\omega_0 = \\dfrac\{1\}\{\\sqrt\{[^}]+\}\} = ([\d.e+-]+)/.exec(
        item.explanation.steps.join(' '),
      )?.[1]);
      expect(Number.isFinite(alpha)).toBe(true);
      expect(Number.isFinite(omega0)).toBe(true);

      const expectedId = alpha > omega0 * 1.001 ? 'a' : alpha < omega0 * 0.999 ? 'c' : 'b';
      expect(item.answer.correctId).toBe(expectedId);
    }
  });

  it('marks the correct RLC option without a misconception tag', () => {
    const g = generatorById('ee2300.second-order-rlc.classify')!;
    for (const seed of SEEDS) {
      const item = itemSchema.parse(variant(g, seed));
      if (item.answer.kind !== 'choice') continue;
      const { correctId } = item.answer; // bind: narrowing is lost inside callbacks
      const correct = item.options.find((o) => o.id === correctId)!;
      expect(correct.misconception).toBeUndefined();
      // Every wrong option should still teach something.
      for (const o of item.options.filter((x) => x.id !== correctId)) {
        expect(o.rationale ?? '').not.toBe('');
      }
    }
  });
});

describe('buildItems', () => {
  it('embeds the seed in the id so any item can be regenerated', () => {
    const g = generatorById('ee2300.ohms-law.solve')!;
    const { items } = buildItems(g, { variantsPerGenerator: 5, baseSeed: 100 });
    expect(items[0]!.id).toBe('ee2300.ohms-law.solve.s100');
    expect(items[0]!.seed).toBe(100);
  });

  it('drops duplicate variants that distinct seeds happen to produce', () => {
    // A duplicate would be administered twice and double-count as evidence.
    const g = generatorById('ee2300.ohms-law.solve')!;
    const { items } = buildItems(g, { variantsPerGenerator: 200, baseSeed: 1 });
    expect(new Set(items.map((i) => i.stem)).size).toBe(items.length);
  });

  it('reports no schema issues for any registered generator', () => {
    for (const g of GENERATORS) {
      const { issues } = buildItems(g, { variantsPerGenerator: 20, baseSeed: 1 });
      expect(issues, `${g.id}: ${JSON.stringify(issues)}`).toHaveLength(0);
    }
  });
});

describe('buildPack', () => {
  it('assembles a redistributable pack from every generator', () => {
    const { pack, issues } = buildPack(GENERATORS, {
      packId: 'ee2300-core-v1',
      course: 'EE2300',
      title: 'Circuits I core bank',
      variantsPerGenerator: 8,
    });
    expect(issues).toHaveLength(0);
    expect(pack.items.length).toBeGreaterThan(80);
    expect(pack.provenance.licenseTier).toBe('redistributable');
    expect(new Set(pack.items.map((i) => i.id)).size).toBe(pack.items.length);
  });
});
