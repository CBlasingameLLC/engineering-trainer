import { describe, expect, it } from 'vitest';
import { KcGraph } from '../src/kc-graph/graph.js';
import {
  DEFAULT_CAT_CONFIG,
  createCatSession,
  finalizePlacement,
  recordResponse,
  selectNextItem,
  shouldStop,
  type CatItem,
} from '../src/cat/session.js';
import { abilityStandardError, expectedScore } from '../src/mastery/elo.js';
import type { Kc, KcEdge } from '../src/types.js';

/**
 * End-to-end validation of the placement architecture.
 *
 * The claim under test: a ~45-item exam can place a learner across a whole
 * 24-KC course, because item selection spends the budget where information is
 * missing and the prerequisite graph supplies the rest. If this does not hold,
 * the product does not work, so it is asserted rather than assumed.
 */

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 0x100000000);
}

/** A course shaped like EE 2300: foundations, techniques built on them, then synthesis. */
function buildCourse(): { graph: KcGraph; bank: CatItem[]; kcIds: string[]; mathIds: string[] } {
  const foundations = ['sign-convention', 'ohm', 'kcl', 'kvl'];
  const reduction = ['series-parallel', 'voltage-divider', 'current-divider', 'delta-wye'];
  const techniques = ['nodal', 'supernode', 'mesh', 'supermesh', 'superposition', 'source-transform'];
  const equivalents = ['thevenin', 'norton', 'max-power'];
  const opamps = ['op-amp-ideal', 'inverting', 'non-inverting', 'summing', 'cascade'];
  const dynamics = ['capacitor-iv', 'inductor-iv', 'rc-natural', 'rlc-damping'];

  const kcIds = [...foundations, ...reduction, ...techniques, ...equivalents, ...opamps, ...dynamics];

  // Upstream math the EE placement exam never asks about directly. These exist
  // only to be inferred, which is the whole point of cross-course edges.
  const mathIds = ['math.linear-systems', 'math.first-order-ode', 'math.second-order-ode'];

  const kcs: Kc[] = [
    ...kcIds.map((id) => ({
      id, courseId: 'EE2300', title: id, unit: 'u', domain: 'circuits' as const,
      competencies: ['math-execution' as const], difficultyPrior: 0,
    })),
    ...mathIds.map((id) => ({
      id, courseId: 'MATH2472', title: id, unit: 'u', domain: 'math' as const,
      competencies: ['math-execution' as const], difficultyPrior: 0,
    })),
  ];

  const e = (from: string, to: string, strength = 0.9): KcEdge => ({ from, to, strength });
  const edges: KcEdge[] = [
    e('sign-convention', 'ohm'), e('ohm', 'kcl'), e('ohm', 'kvl'),
    e('kcl', 'series-parallel'), e('kvl', 'series-parallel'),
    e('series-parallel', 'voltage-divider'), e('series-parallel', 'current-divider'),
    e('series-parallel', 'delta-wye'),
    e('kcl', 'nodal'), e('nodal', 'supernode'),
    e('kvl', 'mesh'), e('mesh', 'supermesh'),
    e('nodal', 'superposition'), e('mesh', 'superposition'),
    e('voltage-divider', 'source-transform'), e('current-divider', 'source-transform'),
    e('superposition', 'thevenin'), e('source-transform', 'thevenin'),
    e('thevenin', 'norton'), e('thevenin', 'max-power'),
    e('nodal', 'op-amp-ideal'), e('op-amp-ideal', 'inverting'),
    e('op-amp-ideal', 'non-inverting'), e('inverting', 'summing'),
    e('summing', 'cascade'), e('non-inverting', 'cascade'),
    e('ohm', 'capacitor-iv'), e('ohm', 'inductor-iv'),
    e('capacitor-iv', 'rc-natural'), e('rc-natural', 'rlc-damping'),
    e('inductor-iv', 'rlc-damping'),
    // Cross-course: solving these circuits requires the math underneath them.
    e('math.linear-systems', 'nodal'), e('math.linear-systems', 'mesh'),
    e('math.first-order-ode', 'rc-natural'), e('math.second-order-ode', 'rlc-damping'),
  ];

  const difficulties = [-2, -1.25, -0.5, 0.25, 1, 1.75];
  const bank: CatItem[] = kcIds.flatMap((id) =>
    difficulties.map((b, i) => ({ id: `${id}-${i}`, kcRefs: [{ kc: id, weight: 1 }], difficultyB: b })),
  );

  return { graph: new KcGraph(kcs, edges), bank, kcIds, mathIds };
}

/** Run a full placement against a simulated learner of known per-KC ability. */
function runPlacement(trueTheta: Map<string, number>, seed: number, maxItems = 45) {
  const { graph, bank, kcIds, mathIds } = buildCourse();
  const config = { ...DEFAULT_CAT_CONFIG, maxItems };
  const random = rng(seed);

  let state = createCatSession(kcIds);
  let decision = shouldStop(state, bank, config);
  while (!decision.stop) {
    const item = selectNextItem(state, bank, config, { random });
    if (!item) break;
    const theta = trueTheta.get(item.kcRefs[0]!.kc) ?? 0;
    state = recordResponse(state, item, random() < expectedScore(theta, item.difficultyB), config);
    decision = shouldStop(state, bank, config);
  }

  return {
    state, graph, kcIds, mathIds,
    result: finalizePlacement(state, graph, decision.reason, config),
  };
}

describe('EE 2300-shaped placement exam', () => {
  const kcIds = buildCourse().kcIds;

  it('covers a 24-KC course within a 45-item budget', () => {
    const uniform = new Map(kcIds.map((id) => [id, 0.5]));
    const { state } = runPlacement(uniform, 2026);

    expect(state.itemCount).toBeLessThanOrEqual(45);
    // Every KC gets at least one look; nothing is left entirely unmeasured.
    const touched = [...state.abilities.values()].filter((a) => a.n > 0).length;
    expect(touched).toBe(kcIds.length);
  });

  it('spends the budget evenly rather than drilling one KC', () => {
    const uniform = new Map(kcIds.map((id) => [id, 0.5]));
    const { state } = runPlacement(uniform, 7);
    const exposures = [...state.exposure.values()];
    expect(Math.max(...exposures)).toBeLessThanOrEqual(4);
  });

  it('infers upstream math it never asked a single question about', () => {
    // The core claim, in its real form. The EE 2300 exam contains no calculus
    // items at all, but solving nodal analysis and RLC transients implies the
    // linear algebra and ODE machinery underneath. That inference is what makes
    // cross-course placement affordable.
    const strong = new Map(kcIds.map((id) => [id, 2.4]));
    const { result, mathIds } = runPlacement(strong, 11, 90);

    const measuredIds = new Set(result.measured.map((m) => m.kcId));
    for (const mathId of mathIds) {
      expect(measuredIds.has(mathId)).toBe(false); // never administered
    }

    expect(result.inferred.size).toBeGreaterThan(0);
    const inferredMath = mathIds.filter((id) => result.inferred.has(id));
    expect(inferredMath.length).toBeGreaterThan(0);

    for (const adj of result.inferred.values()) {
      expect(adj.prior).toBeGreaterThanOrEqual(0);
      expect(adj.prior).toBeLessThanOrEqual(1);
      expect(adj.distance).toBeGreaterThan(0);
    }
  });

  it('infers weak upstream math when the circuits built on it fail', () => {
    const weak = new Map(kcIds.map((id) => [id, -2.4]));
    const { result, mathIds } = runPlacement(weak, 13, 90);
    const inferredMath = mathIds.filter((id) => result.inferred.has(id));
    expect(inferredMath.length).toBeGreaterThan(0);
    for (const id of inferredMath) {
      expect(result.inferred.get(id)!.direction).toBe('from-dependent');
    }
  });

  it('separates a strong learner from a weak one', () => {
    const strong = new Map(kcIds.map((id) => [id, 2.2]));
    const weak = new Map(kcIds.map((id) => [id, -2.2]));

    const s = runPlacement(strong, 3);
    const w = runPlacement(weak, 3);

    const mean = (r: ReturnType<typeof runPlacement>) =>
      r.result.measured.reduce((acc, m) => acc + m.mastery, 0) / r.result.measured.length;

    // Absolute levels depend on how thinly the budget spreads; the property
    // that matters is a wide, unambiguous separation between the two learners.
    expect(mean(s)).toBeGreaterThan(0.7);
    expect(mean(w)).toBeLessThan(0.3);
    expect(mean(s) - mean(w)).toBeGreaterThan(0.5);
  });

  it('localises a targeted weakness to the right KCs', () => {
    // Strong everywhere except the op-amp chain — the shape of a real gap.
    const opamps = new Set(['op-amp-ideal', 'inverting', 'non-inverting', 'summing', 'cascade']);
    const theta = new Map(kcIds.map((id) => [id, opamps.has(id) ? -2.5 : 2.0]));

    const { result } = runPlacement(theta, 5, 60);
    const measured = new Map(result.measured.map((m) => [m.kcId, m.mastery]));

    const opampMean =
      [...opamps].reduce((s, id) => s + (measured.get(id) ?? 0), 0) / opamps.size;
    const otherIds = kcIds.filter((id) => !opamps.has(id));
    const otherMean =
      otherIds.reduce((s, id) => s + (measured.get(id) ?? 0), 0) / otherIds.length;

    expect(opampMean).toBeLessThan(0.4);
    expect(otherMean).toBeGreaterThan(0.7);
    expect(otherMean - opampMean).toBeGreaterThan(0.4);
  });

  it('never propagates a claim that contradicts direct measurement', () => {
    const opamps = new Set(['op-amp-ideal', 'inverting', 'non-inverting', 'summing', 'cascade']);
    const theta = new Map(kcIds.map((id) => [id, opamps.has(id) ? -2.5 : 2.0]));
    const { result } = runPlacement(theta, 5, 60);

    const measuredIds = new Set(result.measured.map((m) => m.kcId));
    for (const kcId of result.inferred.keys()) {
      expect(measuredIds.has(kcId)).toBe(false);
    }
  });

  it('always terminates', () => {
    for (const seed of [1, 42, 777, 2026]) {
      for (const theta of [-2, 0, 2]) {
        const { state } = runPlacement(new Map(kcIds.map((id) => [id, theta])), seed);
        expect(state.itemCount).toBeLessThanOrEqual(45);
        expect(state.itemCount).toBeGreaterThan(0);
      }
    }
  });

  it('reaches its SE target when focused on a narrow unit', () => {
    // Placement across a whole course is budget-bound; a single-unit session is
    // not, and there the SE target should actually be achievable.
    const { bank } = buildCourse();
    const config = { ...DEFAULT_CAT_CONFIG, maxItems: 30, minItems: 3 };
    const narrow = ['nodal', 'supernode'];
    const narrowBank = bank.filter((i) => narrow.includes(i.kcRefs[0]!.kc));
    const random = rng(19);

    let state = createCatSession(narrow);
    let decision = shouldStop(state, narrowBank, config);
    while (!decision.stop) {
      const item = selectNextItem(state, narrowBank, config, { random })!;
      state = recordResponse(state, item, random() < expectedScore(0.5, item.difficultyB), config);
      decision = shouldStop(state, narrowBank, config);
    }

    expect(decision.reason).not.toBe('budget-exhausted');
    for (const kc of narrow) {
      expect(abilityStandardError(state.abilities.get(kc)!)).toBeLessThanOrEqual(config.targetSe);
    }
  });
});
