import { describe, expect, it } from 'vitest';
import { KcGraph } from '../src/kc-graph/graph.js';
import {
  DEFAULT_PROPAGATION,
  mergePriors,
  propagatePriors,
  type ObservedResult,
} from '../src/cat/propagation.js';
import {
  DEFAULT_CAT_CONFIG,
  createCatSession,
  finalizePlacement,
  recordResponse,
  scoreItem,
  selectNextItem,
  shouldStop,
  type CatItem,
} from '../src/cat/session.js';
import { expectedScore } from '../src/mastery/elo.js';
import type { Kc, KcEdge } from '../src/types.js';

const kc = (id: string): Kc => ({
  id, courseId: 'EE2300', title: id, unit: 'u', domain: 'circuits',
  competencies: ['math-execution'], difficultyPrior: 0,
});
const edge = (from: string, to: string, strength = 1): KcEdge => ({ from, to, strength });

/** ohm -> kcl -> nodal -> supernode */
const ladder = () =>
  new KcGraph(
    ['ohm', 'kcl', 'nodal', 'supernode'].map(kc),
    [edge('ohm', 'kcl'), edge('kcl', 'nodal'), edge('nodal', 'supernode')],
  );

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 0x100000000);
}

// ---------------------------------------------------------------------------

describe('propagatePriors', () => {
  const confident = (kcId: string, mastery: number): ObservedResult => ({
    kcId, mastery, standardError: 0.2, observations: 5,
  });

  it('infers prerequisite mastery from a confidently mastered dependent', () => {
    // Solving supernode problems is strong evidence for KCL and Ohm's law.
    const adj = propagatePriors(ladder(), [confident('supernode', 0.9)]);
    expect(adj.get('nodal')!.prior).toBeCloseTo(0.85 * 0.9, 10);
    expect(adj.get('kcl')!.prior).toBeCloseTo(0.85 ** 2 * 0.9, 10);
    expect(adj.get('ohm')!.prior).toBeCloseTo(0.85 ** 3 * 0.9, 10);
  });

  it('decays inferred confidence with distance', () => {
    const adj = propagatePriors(ladder(), [confident('supernode', 0.9)]);
    expect(adj.get('nodal')!.prior).toBeGreaterThan(adj.get('kcl')!.prior);
    expect(adj.get('kcl')!.prior).toBeGreaterThan(adj.get('ohm')!.prior);
  });

  it('bounds dependents from above when a prerequisite is confidently failed', () => {
    const adj = propagatePriors(ladder(), [confident('ohm', 0.1)]);
    // Relaxes toward 1 (no constraint) as the inference gets more remote.
    expect(adj.get('kcl')!.prior).toBeLessThan(adj.get('nodal')!.prior);
    expect(adj.get('nodal')!.prior).toBeLessThan(adj.get('supernode')!.prior);
    for (const a of adj.values()) expect(a.prior).toBeLessThanOrEqual(1);
  });

  it('ignores results that are not measured confidently enough', () => {
    const vague: ObservedResult = {
      kcId: 'supernode', mastery: 0.9, standardError: 99, observations: 5,
    };
    expect(propagatePriors(ladder(), [vague]).size).toBe(0);
  });

  it('refuses to infer an entire ancestry from a single lucky answer', () => {
    // BKT is fast: one correct free-response answer takes the 0.15 prior to
    // 0.79, past successThreshold. Without an observation floor that single
    // response would rewrite priors across every prerequisite above it.
    const oneShot: ObservedResult = {
      kcId: 'supernode', mastery: 0.79, standardError: 1.0, observations: 1,
    };
    expect(propagatePriors(ladder(), [oneShot]).size).toBe(0);

    const backed: ObservedResult = { ...oneShot, observations: 2 };
    expect(propagatePriors(ladder(), [backed]).size).toBeGreaterThan(0);
  });

  it('ignores middling results, which imply nothing in either direction', () => {
    expect(propagatePriors(ladder(), [confident('nodal', 0.5)]).size).toBe(0);
  });

  it('never overwrites a KC that was measured directly', () => {
    const adj = propagatePriors(ladder(), [confident('supernode', 0.9), confident('ohm', 0.95)]);
    expect(adj.has('ohm')).toBe(false);
    expect(adj.has('supernode')).toBe(false);
  });

  it('scales inference by edge strength', () => {
    const weak = new KcGraph(['a', 'b'].map(kc), [edge('a', 'b', 0.3)]);
    const strong = new KcGraph(['a', 'b'].map(kc), [edge('a', 'b', 1)]);
    const r = [confident('b', 0.9)];
    expect(propagatePriors(weak, r).get('a')!.prior).toBeLessThan(
      propagatePriors(strong, r).get('a')!.prior,
    );
  });

  it('keeps every inferred prior bounded within [0,1]', () => {
    const adj = propagatePriors(ladder(), [confident('supernode', 1), confident('ohm', 0)]);
    for (const a of adj.values()) {
      expect(a.prior).toBeGreaterThanOrEqual(0);
      expect(a.prior).toBeLessThanOrEqual(1);
    }
  });

  it('records the source KC so the gap report can explain the inference', () => {
    const adj = propagatePriors(ladder(), [confident('supernode', 0.9)]);
    expect(adj.get('ohm')).toMatchObject({ source: 'supernode', direction: 'from-dependent', distance: 3 });
  });

  it('respects the configured maximum depth', () => {
    const adj = propagatePriors(ladder(), [confident('supernode', 0.9)], {
      ...DEFAULT_PROPAGATION, maxDepth: 1,
    });
    expect([...adj.keys()]).toEqual(['nodal']);
  });
});

describe('mergePriors', () => {
  it('lets direct measurement win over inference', () => {
    const measured = new Map([['a', 0.2]]);
    const inferred = propagatePriors(ladder(), [
      { kcId: 'supernode', mastery: 0.9, standardError: 0.2, observations: 5 },
    ]);
    const merged = mergePriors(measured, inferred);
    expect(merged.get('a')).toBe(0.2);
    expect(merged.get('nodal')).toBeCloseTo(0.85 * 0.9, 10);
  });
});

// ---------------------------------------------------------------------------

const bankFor = (kcIds: string[], difficulties = [-1.5, -0.5, 0.5, 1.5]): CatItem[] =>
  kcIds.flatMap((id) =>
    difficulties.map((b, i) => ({
      id: `${id}-${i}`,
      kcRefs: [{ kc: id, weight: 1 }],
      difficultyB: b,
    })),
  );

describe('scoreItem', () => {
  const kcs = ['ohm', 'kcl'];

  it('scores an item matched to current ability above a mismatched one', () => {
    const state = createCatSession(kcs);
    const matched = { id: 'm', kcRefs: [{ kc: 'ohm', weight: 1 }], difficultyB: 0 };
    const tooHard = { id: 'h', kcRefs: [{ kc: 'ohm', weight: 1 }], difficultyB: 4 };
    expect(scoreItem(state, matched, DEFAULT_CAT_CONFIG)).toBeGreaterThan(
      scoreItem(state, tooHard, DEFAULT_CAT_CONFIG),
    );
  });

  it('scores an item zero once its KCs are all settled', () => {
    let state = createCatSession(['ohm']);
    const item = { id: 'i', kcRefs: [{ kc: 'ohm', weight: 1 }], difficultyB: 0 };
    for (let i = 0; i < 20; i++) {
      state = recordResponse(state, { ...item, id: `i${i}` }, i % 2 === 0);
    }
    expect(scoreItem(state, item, DEFAULT_CAT_CONFIG)).toBe(0);
  });

  it('scores an item for KCs outside the session at zero', () => {
    const state = createCatSession(['ohm']);
    const foreign = { id: 'f', kcRefs: [{ kc: 'not-in-session', weight: 1 }], difficultyB: 0 };
    expect(scoreItem(state, foreign, DEFAULT_CAT_CONFIG)).toBe(0);
  });
});

describe('selectNextItem', () => {
  it('never re-administers an item', () => {
    let state = createCatSession(['ohm']);
    const bank = bankFor(['ohm']);
    const seen = new Set<string>();
    for (let i = 0; i < bank.length; i++) {
      const item = selectNextItem(state, bank, DEFAULT_CAT_CONFIG, { random: () => 0 });
      if (!item) break;
      expect(seen.has(item.id)).toBe(false);
      seen.add(item.id);
      state = recordResponse(state, item, true);
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it('returns null when the bank has nothing informative left', () => {
    const state = createCatSession(['ohm']);
    expect(selectNextItem(state, [], DEFAULT_CAT_CONFIG, { random: () => 0 })).toBeNull();
  });

  it('spreads coverage across KCs instead of drilling one', () => {
    // Without the exposure penalty, greedy information-maximising would keep
    // asking about whichever KC happens to sit nearest the item difficulties.
    let state = createCatSession(['ohm', 'kcl', 'nodal']);
    const bank = bankFor(['ohm', 'kcl', 'nodal']);
    const random = rng(7);
    for (let i = 0; i < 9; i++) {
      const item = selectNextItem(state, bank, DEFAULT_CAT_CONFIG, { random });
      if (!item) break;
      state = recordResponse(state, item, true);
    }
    for (const id of ['ohm', 'kcl', 'nodal']) {
      expect(state.exposure.get(id) ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('recordResponse', () => {
  it('attributes BKT movement in proportion to item weight', () => {
    const state = createCatSession(['major', 'minor']);
    const next = recordResponse(
      state,
      { id: 'i', kcRefs: [{ kc: 'major', weight: 0.8 }, { kc: 'minor', weight: 0.2 }], difficultyB: 0 },
      true,
    );
    const dMajor = next.pMastery.get('major')! - state.pMastery.get('major')!;
    const dMinor = next.pMastery.get('minor')! - state.pMastery.get('minor')!;
    expect(dMajor).toBeGreaterThan(dMinor);
    expect(dMajor / dMinor).toBeCloseTo(0.8 / 0.2, 6);
  });

  it('treats a lucky multiple-choice answer as weaker evidence', () => {
    const state = createCatSession(['ohm']);
    const item: CatItem = { id: 'i', kcRefs: [{ kc: 'ohm', weight: 1 }], difficultyB: 0 };
    const free = recordResponse(state, item, true, DEFAULT_CAT_CONFIG);
    const mc = recordResponse(state, item, true, DEFAULT_CAT_CONFIG, { optionCount: 4 });
    expect(mc.pMastery.get('ohm')!).toBeLessThan(free.pMastery.get('ohm')!);
  });

  it('is immutable with respect to the previous state', () => {
    const state = createCatSession(['ohm']);
    const before = state.pMastery.get('ohm');
    recordResponse(state, { id: 'i', kcRefs: [{ kc: 'ohm', weight: 1 }], difficultyB: 0 }, true);
    expect(state.pMastery.get('ohm')).toBe(before);
    expect(state.itemCount).toBe(0);
  });
});

describe('shouldStop', () => {
  const bank = bankFor(['ohm', 'kcl'], [-2, -1, 0, 1, 2, 3, -3, 0.5, -0.5, 1.5]);

  it('does not stop before the minimum item count', () => {
    const state = createCatSession(['ohm', 'kcl']);
    expect(shouldStop(state, bank).stop).toBe(false);
  });

  it('stops when the item budget is exhausted', () => {
    const config = { ...DEFAULT_CAT_CONFIG, maxItems: 3, minItems: 1 };
    let state = createCatSession(['ohm', 'kcl']);
    const random = rng(3);
    for (let i = 0; i < 3; i++) {
      const item = selectNextItem(state, bank, config, { random })!;
      state = recordResponse(state, item, true, config);
    }
    expect(shouldStop(state, bank, config)).toMatchObject({ stop: true, reason: 'budget-exhausted' });
  });

  it('stops when the bank runs dry', () => {
    const tiny = bankFor(['ohm'], [0]);
    const config = { ...DEFAULT_CAT_CONFIG, minItems: 1 };
    let state = createCatSession(['ohm']);
    state = recordResponse(state, tiny[0]!, true, config);
    expect(shouldStop(state, tiny, config)).toMatchObject({ stop: true, reason: 'bank-exhausted' });
  });

  it('terminates within the budget for a simulated learner', () => {
    // The guarantee that matters operationally: placement always ends.
    const config = { ...DEFAULT_CAT_CONFIG, maxItems: 45 };
    const kcIds = ['ohm', 'kcl', 'nodal', 'supernode'];
    const big = bankFor(kcIds, [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, -2.5, 3]);
    const random = rng(99);

    let state = createCatSession(kcIds);
    let guard = 0;
    while (!shouldStop(state, big, config).stop) {
      const item = selectNextItem(state, big, config, { random })!;
      const correct = random() < expectedScore(0.8, item.difficultyB);
      state = recordResponse(state, item, correct, config);
      expect(++guard).toBeLessThanOrEqual(config.maxItems + 1);
    }
    expect(state.itemCount).toBeLessThanOrEqual(config.maxItems);
    expect(state.itemCount).toBeGreaterThanOrEqual(config.minItems);
  });
});

describe('finalizePlacement', () => {
  it('reports measured KCs and mines the graph for the rest', () => {
    const graph = ladder();
    const config = { ...DEFAULT_CAT_CONFIG, minItems: 1 };
    let state = createCatSession(['supernode']);

    // A confident run of correct answers on the hardest KC in the ladder.
    for (let i = 0; i < 30; i++) {
      state = recordResponse(
        state,
        { id: `s${i}`, kcRefs: [{ kc: 'supernode', weight: 1 }], difficultyB: 0.5 },
        true,
        config,
      );
    }

    const result = finalizePlacement(state, graph, 'targets-met', config);
    expect(result.measured.map((m) => m.kcId)).toEqual(['supernode']);
    // Never asked about these, but they are implied by the result.
    expect([...result.inferred.keys()].sort()).toEqual(['kcl', 'nodal', 'ohm']);
    expect(result.itemsAdministered).toBe(30);
  });

  it('omits KCs with no evidence from the measured set', () => {
    const state = createCatSession(['ohm', 'kcl']);
    const result = finalizePlacement(state, ladder(), 'bank-exhausted');
    expect(result.measured).toHaveLength(0);
  });
});
