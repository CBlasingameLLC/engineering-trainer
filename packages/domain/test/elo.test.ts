import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ELO_PARAMS,
  abilityStandardError,
  expectedScore,
  fisherInformation,
  newAbility,
  uncertaintyK,
  updateElo,
  type Ability,
  type ItemDifficulty,
} from '../src/mastery/elo.js';
import type { KcId } from '../src/types.js';

/** Deterministic LCG so convergence tests are reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('expectedScore', () => {
  it('is 0.5 when ability equals difficulty', () => {
    expect(expectedScore(0, 0)).toBeCloseTo(0.5, 10);
    expect(expectedScore(1.7, 1.7)).toBeCloseTo(0.5, 10);
  });

  it('rises with ability and falls with difficulty', () => {
    expect(expectedScore(2, 0)).toBeGreaterThan(0.85);
    expect(expectedScore(-2, 0)).toBeLessThan(0.15);
  });
});

describe('uncertaintyK', () => {
  it('decays monotonically with observation count', () => {
    const ks = [0, 1, 5, 20, 100].map((n) => uncertaintyK(n, DEFAULT_ELO_PARAMS));
    for (let i = 1; i < ks.length; i++) expect(ks[i]!).toBeLessThan(ks[i - 1]!);
  });
});

describe('fisherInformation', () => {
  it('is maximised when difficulty matches ability', () => {
    const matched = fisherInformation(0.5, 0.5);
    expect(matched).toBeGreaterThan(fisherInformation(0.5, 2.5));
    expect(matched).toBeGreaterThan(fisherInformation(0.5, -1.5));
    expect(matched).toBeCloseTo(0.25, 10);
  });
});

describe('updateElo', () => {
  const kc: KcId = 'ee2300.kvl';

  it('raises ability on a correct answer and lowers it on a wrong one', () => {
    const abilities = new Map<KcId, Ability>([[kc, newAbility(0)]]);
    const item: ItemDifficulty = { b: 0, n: 0 };

    const up = updateElo(abilities, item, [{ kc, weight: 1 }], true);
    const down = updateElo(abilities, item, [{ kc, weight: 1 }], false);

    expect(up.abilities.get(kc)!.theta).toBeGreaterThan(0);
    expect(down.abilities.get(kc)!.theta).toBeLessThan(0);
  });

  it('moves item difficulty opposite to the learner', () => {
    const abilities = new Map<KcId, Ability>([[kc, newAbility(0)]]);
    const res = updateElo(abilities, { b: 0, n: 0 }, [{ kc, weight: 1 }], true);
    // A correct answer is evidence the item was easier than assumed.
    expect(res.difficulty.b).toBeLessThan(0);
  });

  it('distributes updates across KCs in proportion to attribution', () => {
    const major: KcId = 'ee2300.nodal';
    const minor: KcId = 'ee2300.op-amp-ideal';
    const abilities = new Map<KcId, Ability>([
      [major, newAbility(0)],
      [minor, newAbility(0)],
    ]);

    const res = updateElo(
      abilities,
      { b: 0, n: 0 },
      [
        { kc: major, weight: 0.7 },
        { kc: minor, weight: 0.3 },
      ],
      true,
    );

    const dMajor = res.abilities.get(major)!.theta;
    const dMinor = res.abilities.get(minor)!.theta;
    expect(dMajor).toBeGreaterThan(dMinor);
    expect(dMajor / dMinor).toBeCloseTo(0.7 / 0.3, 6);
  });

  it('accumulates information so the standard error shrinks', () => {
    let abilities = new Map<KcId, Ability>([[kc, newAbility(0)]]);
    let difficulty: ItemDifficulty = { b: 0, n: 0 };
    expect(abilityStandardError(abilities.get(kc)!)).toBe(Number.POSITIVE_INFINITY);

    const seen: number[] = [];
    for (let i = 0; i < 25; i++) {
      const r = updateElo(abilities, difficulty, [{ kc, weight: 1 }], i % 2 === 0);
      abilities = r.abilities;
      difficulty = r.difficulty;
      seen.push(abilityStandardError(abilities.get(kc)!));
    }
    expect(seen.at(-1)!).toBeLessThan(seen[0]!);
    expect(seen.at(-1)!).toBeLessThan(0.5);
  });

  it('rejects items with no KC attribution', () => {
    expect(() => updateElo(new Map(), { b: 0, n: 0 }, [], true)).toThrow(/no KC attribution/);
  });

  it('rejects non-positive total weight', () => {
    expect(() =>
      updateElo(new Map(), { b: 0, n: 0 }, [{ kc: 'x', weight: 0 }], true),
    ).toThrow(/positive value/);
  });

  it('converges toward a simulated learner\'s true ability', () => {
    // Simulate a learner of known ability answering a fixed-difficulty bank.
    // Elo should recover that ability from responses alone.
    const random = rng(42);
    for (const trueTheta of [-1.5, 0, 1.2]) {
      let abilities = new Map<KcId, Ability>([[kc, newAbility(0)]]);
      const difficulties = [-1.5, -0.75, 0, 0.75, 1.5];

      for (let i = 0; i < 500; i++) {
        const b = difficulties[i % difficulties.length]!;
        const correct = random() < expectedScore(trueTheta, b);
        // Hold item difficulty fixed: we are testing ability recovery.
        abilities = updateElo(abilities, { b, n: 999 }, [{ kc, weight: 1 }], correct).abilities;
      }

      expect(abilities.get(kc)!.theta).toBeCloseTo(trueTheta, 0);
    }
  });
});
