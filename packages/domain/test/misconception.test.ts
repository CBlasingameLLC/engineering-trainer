import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MISCONCEPTION_CONFIG,
  assembleDrill,
  rankMisconceptions,
  rollUpFamilies,
  uncataloguedMisconceptions,
  type DrillCandidate,
  type FamilyRef,
  type MisconceptionHit,
} from '../src/index.js';

/**
 * These tests pin judgements rather than arithmetic. The engine's job is to
 * decide which of a hundred logged errors deserves attention today, and the
 * ways that decision can go wrong — ranking a solved habit above a live one,
 * calling a fading error "worsening", building a drill out of items that cannot
 * catch the error — are all silent failures that produce a plausible-looking
 * feed. Each one gets a test.
 */

const NOW = new Date('2026-09-16T12:00:00Z');
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * 86_400_000);

const hit = (misconceptionId: string, kcId: string, ageDays: number): MisconceptionHit => ({
  misconceptionId,
  kcId,
  at: daysAgo(ageDays),
});

describe('rankMisconceptions', () => {
  it('ranks a live habit above a solved one with more total hits', () => {
    const events = [
      // Solved: six hits, all months old.
      ...[60, 62, 64, 66, 68, 70].map((d) => hit('old.error', 'ee2300.kvl', d)),
      // Live: three hits this week.
      ...[1, 3, 5].map((d) => hit('live.error', 'ee2300.thevenin', d)),
    ];

    const ranked = rankMisconceptions(events, NOW);
    expect(ranked[0]!.misconceptionId).toBe('live.error');
    expect(ranked[0]!.totalHits).toBeLessThan(ranked[1]!.totalHits);
  });

  it('drops errors that have not recurred inside the stale window', () => {
    const ranked = rankMisconceptions([hit('ancient.error', 'ee2300.kcl', 200)], NOW);
    expect(ranked).toEqual([]);
  });

  it('fires a drill at the threshold and not before', () => {
    const two = rankMisconceptions([hit('e', 'ee2300.kvl', 1), hit('e', 'ee2300.kvl', 3)], NOW);
    expect(two[0]!.drillDue).toBe(false);

    const three = rankMisconceptions(
      [hit('e', 'ee2300.kvl', 1), hit('e', 'ee2300.kvl', 3), hit('e', 'ee2300.kvl', 5)],
      NOW,
    );
    expect(three[0]!.drillDue).toBe(true);
    expect(three[0]!.recentHits).toBe(3);
  });

  it('does not count hits outside the window toward a drill', () => {
    const events = [
      hit('e', 'ee2300.kvl', 1),
      hit('e', 'ee2300.kvl', 2),
      hit('e', 'ee2300.kvl', 40), // outside the 14-day window
    ];
    const ranked = rankMisconceptions(events, NOW);
    expect(ranked[0]!.recentHits).toBe(2);
    expect(ranked[0]!.drillDue).toBe(false);
    expect(ranked[0]!.totalHits).toBe(3);
  });

  it('scores a habit spread across KCs above one confined to a single topic', () => {
    const spread = [
      hit('spread', 'ee2300.kvl', 2),
      hit('spread', 'ee2300.op-amp-inverting', 3),
      hit('spread', 'math3323.second-order-ode', 4),
    ];
    const local = [
      hit('local', 'ee2300.thevenin', 2),
      hit('local', 'ee2300.thevenin', 3),
      hit('local', 'ee2300.thevenin', 4),
    ];

    const ranked = rankMisconceptions([...spread, ...local], NOW);
    expect(ranked[0]!.misconceptionId).toBe('spread');
    expect(ranked[0]!.kcs).toHaveLength(3);
    expect(ranked[0]!.crossCourse).toBe(true);
    expect(ranked[1]!.crossCourse).toBe(false);
  });

  it('reads direction of travel from the two halves of the window', () => {
    const worsening = rankMisconceptions(
      [hit('w', 'k', 1), hit('w', 'k', 2), hit('w', 'k', 10)],
      NOW,
    );
    expect(worsening[0]!.trend).toBe('worsening');

    const fading = rankMisconceptions(
      [hit('f', 'k', 9), hit('f', 'k', 11), hit('f', 'k', 13)],
      NOW,
    );
    expect(fading[0]!.trend).toBe('fading');
  });

  it('calls a first appearance new rather than worsening', () => {
    // Everything logged in one sitting has an empty earlier half, so a naive
    // recent > previous test labels a learner's entire first session as
    // deteriorating — and then the word means nothing when it is real.
    const firstSession = rankMisconceptions(
      [hit('n', 'ee2300.kvl', 0), hit('n', 'ee2300.kvl', 0), hit('n', 'ee2300.kvl', 0)],
      NOW,
    );
    expect(firstSession[0]!.trend).toBe('new');
    // Still counts toward a drill: no trend is not the same as no evidence.
    expect(firstSession[0]!.drillDue).toBe(true);
  });

  it('reserves worsening for an actual increase over the earlier half', () => {
    const real = rankMisconceptions(
      [hit('w', 'k', 1), hit('w', 'k', 2), hit('w', 'k', 3), hit('w', 'k', 10)],
      NOW,
    );
    expect(real[0]!.trend).toBe('worsening');
  });

  it('is a pure projection: the same log always ranks the same way', () => {
    const events = [hit('a', 'ee2300.kvl', 2), hit('b', 'math2471.derivative-basics', 3), hit('a', 'ee2300.kcl', 4)];
    expect(rankMisconceptions(events, NOW)).toEqual(rankMisconceptions([...events].reverse(), NOW));
  });

  it('derives courses from the KC prefix', () => {
    const ranked = rankMisconceptions(
      [hit('x', 'ee2300.kvl', 1), hit('x', 'math3376.linear-systems', 2)],
      NOW,
    );
    expect(ranked[0]!.courses.sort()).toEqual(['ee2300', 'math3376']);
  });
});

describe('rollUpFamilies', () => {
  const signs: FamilyRef = {
    id: 'sign-convention-discipline',
    title: 'Sign discipline',
    description: 'Losing or inverting a sign.',
    competency: 'math-execution',
  };
  const families = new Map([
    ['ee2300.kvl-sign', signs],
    ['ode.root-sign', signs],
  ]);

  it('joins the same habit across course boundaries', () => {
    const ranked = rankMisconceptions(
      [
        hit('ee2300.kvl-sign', 'ee2300.kvl', 1),
        hit('ee2300.kvl-sign', 'ee2300.mesh-analysis', 3),
        hit('ode.root-sign', 'math3323.second-order-ode', 2),
      ],
      NOW,
    );

    const [rollup] = rollUpFamilies(ranked, families);
    expect(rollup!.family.id).toBe('sign-convention-discipline');
    expect(rollup!.members).toHaveLength(2);
    expect(rollup!.totalHits).toBe(3);
    // The finding the whole feature exists for: one habit, two courses.
    expect(rollup!.crossCourse).toBe(true);
    expect(rollup!.courses.sort()).toEqual(['ee2300', 'math3323']);
  });

  it('keeps uncatalogued misconceptions out of families but still reports them', () => {
    const ranked = rankMisconceptions([hit('brand.new', 'ee2300.kvl', 1)], NOW);
    expect(rollUpFamilies(ranked, families)).toEqual([]);
    expect(uncataloguedMisconceptions(ranked, families)).toEqual(['brand.new']);
  });

  it('marks a family due when any member is due', () => {
    const ranked = rankMisconceptions(
      [
        hit('ee2300.kvl-sign', 'ee2300.kvl', 1),
        hit('ee2300.kvl-sign', 'ee2300.kvl', 2),
        hit('ee2300.kvl-sign', 'ee2300.kvl', 3),
        hit('ode.root-sign', 'math3323.second-order-ode', 4),
      ],
      NOW,
    );
    expect(rollUpFamilies(ranked, families)[0]!.drillDue).toBe(true);
  });
});

describe('assembleDrill', () => {
  const candidate = (
    id: string,
    kcId: string,
    difficultyB: number,
    diagnoses: string[],
  ): DrillCandidate => ({ itemId: id, kcId, difficultyB, diagnoses });

  const bank: DrillCandidate[] = [
    candidate('a1', 'ee2300.kvl', 0.0, ['sign-dropped']),
    candidate('a2', 'ee2300.kvl', 1.8, ['sign-dropped']),
    candidate('b1', 'ee2300.mesh-analysis', 0.2, ['sign-dropped']),
    candidate('c1', 'math3323.second-order-ode', 0.1, ['sign-dropped']),
    candidate('z1', 'ee2300.thevenin', 0.0, ['source-not-suppressed']),
  ];

  it('serves only items that can actually catch the error', () => {
    const drill = assembleDrill('sign-dropped', bank);
    expect(drill.map((d) => d.itemId)).not.toContain('z1');
    expect(drill.every((d) => d.diagnoses.includes('sign-dropped'))).toBe(true);
  });

  it('returns nothing when no item can diagnose the misconception', () => {
    // Better to offer no drill than one that cannot detect whether it worked.
    expect(assembleDrill('never-tagged', bank)).toEqual([]);
  });

  it('spreads across KCs before repeating one', () => {
    const drill = assembleDrill('sign-dropped', bank, { size: 3 });
    expect(new Set(drill.map((d) => d.kcId)).size).toBe(3);
  });

  it('prefers items the learner has not already seen', () => {
    const drill = assembleDrill('sign-dropped', bank, {
      size: 1,
      attempted: new Set(['a1', 'b1', 'c1']),
    });
    expect(drill[0]!.itemId).toBe('a2');
  });

  it('aims below the ability estimate rather than at it', () => {
    // Measuring wants difficulty at ability; remediation wants it answerable.
    const drill = assembleDrill('sign-dropped', bank, { size: 1, ability: 2.0 });
    expect(drill[0]!.difficultyB).toBeCloseTo(1.8, 5);

    const easier = assembleDrill('sign-dropped', bank, { size: 1, ability: 0.65 });
    expect(easier[0]!.difficultyB).toBeCloseTo(0.0, 5);
  });

  it('tops up past one-per-KC when the drill is larger than the KC count', () => {
    const drill = assembleDrill('sign-dropped', bank, { size: 4 });
    expect(drill).toHaveLength(4);
    expect(new Set(drill.map((d) => d.itemId)).size).toBe(4);
  });

  it('uses the documented defaults', () => {
    expect(DEFAULT_MISCONCEPTION_CONFIG).toEqual({
      windowDays: 14,
      drillThreshold: 3,
      halfLifeDays: 10,
      staleDays: 90,
    });
  });
});
