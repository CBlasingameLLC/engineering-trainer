import { describe, expect, it } from 'vitest';
import { KcGraph } from '../src/kc-graph/graph.js';
import {
  DEFAULT_EXAM_MINUTES, daysUntil, examBlueprints, pastExams, upcomingExams,
  type TermCourseExams,
} from '../src/exam/blueprint.js';
import { assembleExam, type ExamCandidate } from '../src/exam/assemble.js';
import { gradeExam, type ExamResponse } from '../src/exam/grade.js';
import { examPriorities, examProximity, examShares } from '../src/exam/priority.js';
import type { Kc, KcEdge, KcId } from '../src/types.js';
import type { KcMastery } from '../src/mastery/composite.js';

/**
 * An exam is the first object in this package that is anchored to a date
 * rather than a week, and almost everything that can go wrong with it is a
 * quiet arithmetic error: a day lost to a timezone, a chapter silently missing
 * from a paper, a score that conflates not knowing with not reaching. None of
 * those announce themselves at runtime.
 */

const kc = (id: string, courseId: string, unit: string): Kc => ({
  id, courseId, title: id, unit, domain: 'circuits', competencies: ['math-execution'], difficultyPrior: 0,
});

const KCS: Kc[] = [
  kc('ee3300.rlc-damping', 'EE3300', 'Second-Order Circuits'),
  kc('ee3300.rlc-roots', 'EE3300', 'Second-Order Circuits'),
  kc('ee3300.rlc-step', 'EE3300', 'Second-Order Circuits'),
  kc('ee3300.phasor', 'EE3300', 'Sinusoidal Steady State'),
  kc('ee3300.laplace-pairs', 'EE3300', 'The s-Domain'),
  kc('ee2300.rc-step', 'EE2300', 'Energy Storage and Transients'),
  { ...kc('math2472.parts', 'MATH2472', 'Integration'), domain: 'math' },
  kc('ee3300.bode', 'EE3300', 'Frequency Response'),
];

const EDGES: KcEdge[] = [
  { from: 'math2472.parts', to: 'ee3300.laplace-pairs', strength: 0.8 },
  { from: 'ee2300.rc-step', to: 'ee3300.rlc-step', strength: 0.7 },
];

const graph = (): KcGraph => new KcGraph(KCS, EDGES);

const unitOfKc = new Map(KCS.map((k) => [k.id, { course: k.courseId, unit: k.unit }]));

const COURSES: TermCourseExams[] = [
  {
    course: 'EE3300',
    exams: [
      {
        id: 'exam-1',
        title: 'Exam 1',
        on: '2026-09-28',
        cumulative: false,
        scope: 'Chapters 8, 9, 10 and 12',
        units: [
          { course: 'EE3300', unit: 'Second-Order Circuits' },
          { course: 'EE3300', unit: 'Sinusoidal Steady State' },
          { course: 'EE3300', unit: 'The s-Domain' },
          { course: 'EE2300', unit: 'Energy Storage and Transients' },
        ],
      },
      {
        id: 'exam-2',
        title: 'Exam 2',
        on: '2026-11-05',
        minutes: 90,
        cumulative: false,
        units: [{ course: 'EE3300', unit: 'Frequency Response' }],
      },
    ],
  },
  {
    course: 'PHYS2335',
    exams: [
      {
        id: 'exam-0',
        title: 'Exam 0',
        on: '2026-09-02',
        cumulative: false,
        units: [{ course: 'EE3300', unit: 'Sinusoidal Steady State' }],
      },
    ],
  },
];

const NOW = new Date('2026-09-26T15:00:00Z');

describe('daysUntil', () => {
  it('counts whole calendar days, not elapsed milliseconds', () => {
    expect(daysUntil('2026-09-28', new Date('2026-09-26T00:00:00Z'))).toBe(2);
    expect(daysUntil('2026-09-28', new Date('2026-09-26T23:30:00Z'))).toBe(2);
    expect(daysUntil('2026-09-26', NOW)).toBe(0);
    expect(daysUntil('2026-09-24', NOW)).toBe(-2);
  });

  // The whole reason for reducing both sides to a day index. A naive
  // millisecond subtraction reports 1 here, because 20:00 local on the 27th in
  // Chicago is 01:00 UTC on the 28th and the exam's own midnight has passed.
  it('reads `now` as its local calendar day', () => {
    const lateEvening = new Date('2026-09-28T01:00:00Z');
    const localDay = new Date(
      lateEvening.getFullYear(), lateEvening.getMonth(), lateEvening.getDate(), 12,
    );
    expect(daysUntil('2026-09-29', localDay)).toBe(1);
  });
});

describe('examBlueprints', () => {
  const blueprints = examBlueprints(COURSES, KCS, NOW);

  it('resolves a scope that crosses into another course', () => {
    const exam1 = blueprints.find((b) => b.id === 'EE3300:exam-1');
    expect(exam1?.kcIds).toContain('ee2300.rc-step');
    expect(exam1?.kcIds).toHaveLength(6);
  });

  it('marks an assumed duration rather than presenting it as read', () => {
    expect(blueprints.find((b) => b.id === 'EE3300:exam-1')?.minutesAssumed).toBe(true);
    expect(blueprints.find((b) => b.id === 'EE3300:exam-1')?.minutes).toBe(DEFAULT_EXAM_MINUTES);
    expect(blueprints.find((b) => b.id === 'EE3300:exam-2')?.minutesAssumed).toBe(false);
    expect(blueprints.find((b) => b.id === 'EE3300:exam-2')?.minutes).toBe(90);
  });

  it('separates past from upcoming, counting today as upcoming', () => {
    expect(upcomingExams(blueprints).map((b) => b.id)).toEqual(['EE3300:exam-1', 'EE3300:exam-2']);
    expect(pastExams(blueprints).map((b) => b.id)).toEqual(['PHYS2335:exam-0']);
  });

  it('names scope entries that resolve to no components', () => {
    const orphan = examBlueprints(
      [{ course: 'EE3300', exams: [{
        id: 'x', title: 'X', on: '2026-10-01', cumulative: false,
        units: [{ course: 'EE3300', unit: 'Three-Phase' }],
      }] }],
      KCS, NOW,
    );
    expect(orphan[0]?.unitsWithoutKcs).toEqual([{ course: 'EE3300', unit: 'Three-Phase' }]);
    expect(orphan[0]?.kcIds).toEqual([]);
  });
});

describe('assembleExam', () => {
  const candidates: ExamCandidate[] = KCS.flatMap((k) =>
    Array.from({ length: 6 }, (_, i) => ({
      itemId: `${k.id}.s${i}`, kcId: k.id, difficultyB: -1 + i * 0.4,
    })),
  );
  const blueprint = examBlueprints(COURSES, KCS, NOW).find((b) => b.id === 'EE3300:exam-1')!;

  it('asks every component in scope before asking any of them twice', () => {
    const paper = assembleExam(blueprint, candidates, unitOfKc, { size: 5, seed: 7 });
    expect(new Set(paper.items.map((i) => i.kcId)).size).toBe(5);
  });

  it('reaches every unit in scope, including the borrowed one', () => {
    const paper = assembleExam(blueprint, candidates, unitOfKc, { size: 12, seed: 7 });
    const units = new Set(paper.items.map((i) => unitOfKc.get(i.kcId)?.unit));
    expect(units).toContain('Energy Storage and Transients');
    expect(units.size).toBe(4);
    expect(paper.unitsWithoutItems).toEqual([]);
  });

  // The characteristic failure of a "closest to ability" rule reused here: it
  // serves the easiest items in the pool and reports a pass on a component the
  // learner cannot do at exam difficulty.
  it('spans difficulty rather than clustering at one end', () => {
    const paper = assembleExam(blueprint, candidates, unitOfKc, { size: 15, seed: 3 });
    const spread = Math.max(...paper.items.map((i) => i.difficultyB))
      - Math.min(...paper.items.map((i) => i.difficultyB));
    expect(spread).toBeGreaterThan(1.5);
  });

  it('is reproducible from a seed and varies between seeds', () => {
    const a = assembleExam(blueprint, candidates, unitOfKc, { size: 12, seed: 11 });
    const b = assembleExam(blueprint, candidates, unitOfKc, { size: 12, seed: 11 });
    const c = assembleExam(blueprint, candidates, unitOfKc, { size: 12, seed: 12 });
    expect(a.items.map((i) => i.itemId)).toEqual(b.items.map((i) => i.itemId));
    expect(a.items.map((i) => i.itemId)).not.toEqual(c.items.map((i) => i.itemId));
  });

  it('prefers unseen items', () => {
    const attempted = new Set(candidates.filter((c) => c.itemId.endsWith('.s0')).map((c) => c.itemId));
    const paper = assembleExam(blueprint, candidates, unitOfKc, { size: 5, seed: 5, attempted });
    expect(paper.items.every((i) => !attempted.has(i.itemId))).toBe(true);
  });

  it('says so when the bank cannot fill the paper', () => {
    const thin = candidates.filter((c) => c.itemId.endsWith('.s0'));
    const paper = assembleExam(blueprint, thin, unitOfKc, { size: 30, seed: 1 });
    expect(paper.short).toBe(true);
    expect(paper.items).toHaveLength(6);
  });

  it('names a unit it could not examine instead of quietly dropping it', () => {
    const missing = candidates.filter((c) => c.kcId !== 'ee3300.phasor');
    const paper = assembleExam(blueprint, missing, unitOfKc, { size: 12, seed: 1 });
    expect(paper.unitsWithoutItems).toEqual([{ course: 'EE3300', unit: 'Sinusoidal Steady State' }]);
  });
});

describe('gradeExam', () => {
  const blueprint = examBlueprints(COURSES, KCS, NOW).find((b) => b.id === 'EE3300:exam-1')!;
  const allowed = blueprint.minutes * 60_000;

  const served = [
    { itemId: 'a', kcId: 'ee3300.rlc-damping' },
    { itemId: 'b', kcId: 'ee3300.phasor' },
    { itemId: 'c', kcId: 'ee3300.laplace-pairs' },
    { itemId: 'd', kcId: 'ee2300.rc-step' },
  ];

  const respond = (
    itemId: string, kcId: KcId, correct: boolean, atElapsedMs: number,
  ): ExamResponse => ({
    itemId, kcRefs: [{ kc: kcId, weight: 1 }], correct, latencyMs: 60_000,
    misconceptions: correct ? [] : ['sign.dropped'], atElapsedMs,
  });

  // The finding the two-score split exists for: everything answered correctly,
  // half of it after the bell. One score cannot say that.
  it('separates what the paper scored from what the learner knows', () => {
    const result = gradeExam(blueprint, served, [
      respond('a', 'ee3300.rlc-damping', true, allowed * 0.3),
      respond('b', 'ee3300.phasor', true, allowed * 0.9),
      respond('c', 'ee3300.laplace-pairs', true, allowed * 1.4),
      respond('d', 'ee2300.rc-step', true, allowed * 1.8),
    ], unitOfKc);

    expect(result.scoreAtBell).toBeCloseTo(0.5, 5);
    expect(result.scoreOverall).toBeCloseTo(1, 5);
    expect(result.timing.finding).toBe('ran-over-badly');
    expect(result.timing.inTime).toBe(2);
    expect(result.timing.overtime).toBe(2);
  });

  it('counts an unreached item as wrong at the bell', () => {
    const result = gradeExam(blueprint, served, [
      respond('a', 'ee3300.rlc-damping', true, 1000),
    ], unitOfKc);
    expect(result.scoreAtBell).toBeCloseTo(0.25, 5);
    expect(result.byKc.find((k) => k.kcId === 'ee3300.phasor')?.score).toBe(0);
  });

  it('distinguishes an unstarted paper from a failed one', () => {
    const result = gradeExam(blueprint, served, [], unitOfKc);
    expect(result.timing.finding).toBe('not-attempted');
  });

  it('calls a comfortable finish early and a tight one merely in time', () => {
    const early = gradeExam(blueprint, served,
      served.map((s, i) => respond(s.itemId, s.kcId, true, allowed * 0.1 * (i + 1))), unitOfKc);
    expect(early.timing.finding).toBe('finished-early');

    const tight = gradeExam(blueprint, served,
      served.map((s, i) => respond(s.itemId, s.kcId, true, allowed * (0.7 + 0.075 * i))), unitOfKc);
    expect(tight.timing.finding).toBe('finished-in-time');
  });

  it('splits weighted items across their components', () => {
    const result = gradeExam(blueprint, [{ itemId: 'w', kcId: 'ee3300.rlc-damping' }], [{
      itemId: 'w',
      kcRefs: [{ kc: 'ee3300.rlc-damping', weight: 0.7 }, { kc: 'math2472.parts', weight: 0.3 }],
      correct: false, latencyMs: 1000, misconceptions: [], atElapsedMs: 1000,
    }], unitOfKc);
    expect(result.byKc.find((k) => k.kcId === 'ee3300.rlc-damping')?.asked).toBeCloseTo(0.7, 5);
    expect(result.byKc.find((k) => k.kcId === 'math2472.parts')?.asked).toBeCloseTo(0.3, 5);
  });

  // An item is evidence about every component it names, and those reach past
  // the paper. Reporting them as units the exam covered is how a breakdown ends
  // up claiming 100% on a chapter the exam never asked about.
  it('keeps the breakdown inside the exam scope even when an item reaches outside it', () => {
    const result = gradeExam(blueprint, [{ itemId: 'x', kcId: 'ee3300.laplace-pairs' }], [{
      itemId: 'x',
      kcRefs: [{ kc: 'ee3300.laplace-pairs', weight: 0.8 }, { kc: 'ee3300.bode', weight: 0.2 }],
      correct: true, latencyMs: 1000, misconceptions: [], atElapsedMs: 1000,
    }], unitOfKc);

    expect(result.byUnit.map((u) => u.unit)).toEqual(['The s-Domain']);
    expect(result.byUnit.some((u) => u.unit === 'Frequency Response')).toBe(false);
    // The evidence itself is not thrown away — only the report is scoped.
    expect(result.byKc.find((k) => k.kcId === 'ee3300.bode')?.asked).toBeCloseTo(0.2, 5);
  });

  it('never queues an out-of-scope component as work from this paper', () => {
    const result = gradeExam(blueprint, [{ itemId: 'x', kcId: 'ee3300.laplace-pairs' }], [{
      itemId: 'x',
      kcRefs: [{ kc: 'ee3300.laplace-pairs', weight: 0.5 }, { kc: 'ee3300.bode', weight: 0.5 }],
      correct: false, latencyMs: 1000, misconceptions: [], atElapsedMs: 1000,
    }], unitOfKc);
    expect(result.weakest.map((w) => w.kcId)).toEqual(['ee3300.laplace-pairs']);
  });

  it('ranks the weakest components and tallies misconceptions', () => {
    const result = gradeExam(blueprint, served, [
      respond('a', 'ee3300.rlc-damping', false, 1000),
      respond('b', 'ee3300.phasor', false, 2000),
      respond('c', 'ee3300.laplace-pairs', true, 3000),
      respond('d', 'ee2300.rc-step', true, 4000),
    ], unitOfKc);
    expect(result.weakest.map((w) => w.kcId)).toEqual(['ee3300.phasor', 'ee3300.rlc-damping']);
    expect(result.misconceptions).toEqual([{ misconceptionId: 'sign.dropped', count: 2 }]);
  });
});

describe('examProximity and examShares', () => {
  it('falls off with distance without ever reaching zero', () => {
    expect(examProximity(0)).toBe(1);
    expect(examProximity(5)).toBeCloseTo(0.5, 5);
    // The property an exponential would break: a distant exam stays visible.
    expect(examProximity(45)).toBeGreaterThan(0.05);
    expect(examProximity(45)).toBeLessThan(examProximity(10));
    expect(examProximity(-1)).toBe(0);
  });

  it('gives every upcoming exam items, with the nearest taking the largest slice', () => {
    const shares = examShares(examBlueprints(COURSES, KCS, NOW), 30);
    expect(shares.map((s) => s.exam.id)).toEqual(['EE3300:exam-1', 'EE3300:exam-2']);
    expect(shares[0]!.items).toBeGreaterThan(shares[1]!.items);
    expect(shares.every((s) => s.items >= 1)).toBe(true);
    expect(shares.reduce((sum, s) => sum + s.items, 0)).toBe(30);
  });
});

describe('examPriorities', () => {
  const blueprints = examBlueprints(COURSES, KCS, NOW);

  const mastery = (entries: Record<string, number>): Map<KcId, KcMastery> => {
    const map = new Map<KcId, KcMastery>();
    for (const [id, composite] of Object.entries(entries)) {
      map.set(id, {
        kcId: id, pMastery: composite, retrievability: 1, composite,
        band: 'developing', diagnosis: 'fragile', stabilityDays: 5,
        standardError: 1, attempts: 5,
      });
    }
    return map;
  };

  // The inversion this module exists to prevent: a worse component on a distant
  // exam must not outrank a weak one sat in two days.
  it('puts a nearer exam above a more decayed component on a distant one', () => {
    // Everything else on the near exam is scored as ready, so the comparison
    // is between two measured components and not between one of them and an
    // untested neighbour.
    const ranked = examPriorities(graph(), mastery({
      'ee3300.rlc-damping': 0.45, 'ee3300.rlc-roots': 0.9, 'ee3300.rlc-step': 0.9,
      'ee3300.phasor': 0.9, 'ee3300.laplace-pairs': 0.9, 'ee2300.rc-step': 0.9,
      'math2472.parts': 0.9, 'ee3300.bode': 0.05,
    }), blueprints);
    expect(ranked[0]?.kcId).toBe('ee3300.rlc-damping');
    expect(ranked.find((r) => r.kcId === 'ee3300.bode')).toBeDefined();
  });

  it('reaches prerequisites through the graph and labels them as such', () => {
    const ranked = examPriorities(graph(), mastery({ 'math2472.parts': 0.2 }), blueprints);
    const parts = ranked.find((r) => r.kcId === 'math2472.parts');
    expect(parts?.role).toBe('prerequisite');
    expect(parts?.distance).toBe(1);
    expect(parts?.examId).toBe('EE3300:exam-1');
  });

  it('ranks an untested component without letting it outrank a measured failure', () => {
    const ranked = examPriorities(graph(), mastery({ 'ee3300.rlc-damping': 0.0 }), blueprints);
    const untested = ranked.find((r) => r.kcId === 'ee3300.phasor');
    expect(untested?.diagnosis).toBe('untested');
    expect(ranked[0]?.kcId).toBe('ee3300.rlc-damping');
  });

  it('ignores exams already sat', () => {
    const ranked = examPriorities(graph(), mastery({}), blueprints);
    expect(ranked.every((r) => r.examId !== 'PHYS2335:exam-0')).toBe(true);
  });

  it('drops components that are already ready', () => {
    const ranked = examPriorities(graph(), mastery({ 'ee3300.rlc-damping': 0.9 }), blueprints);
    expect(ranked.find((r) => r.kcId === 'ee3300.rlc-damping')).toBeUndefined();
  });
});
