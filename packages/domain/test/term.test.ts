import { describe, expect, it } from 'vitest';
import { KcGraph } from '../src/kc-graph/graph.js';
import {
  liveUnits, termFocus, termIsRunning, termLengthWeeks, termReadiness, termWeek,
  upcomingUnits, type TermInput,
} from '../src/session/term.js';
import type { Kc, KcEdge, KcId } from '../src/types.js';
import type { KcMastery } from '../src/mastery/composite.js';

/**
 * The term is a join between a syllabus and a prerequisite graph, and both
 * halves fail quietly. A unit name that matches nothing schedules nothing; a
 * readiness ranking that ignores how soon a unit starts produces a list that is
 * true and useless. These pin the parts that have no other evidence.
 */

const TERM: TermInput = {
  id: 'test-term',
  title: 'Test Term',
  startsOn: '2026-08-24',
  endsOn: '2026-12-07',
  courses: [
    {
      course: 'PHYS2335',
      blocks: [
        { fromWeek: 1, toWeek: 3, units: ['Oscillations'] },
        { fromWeek: 4, toWeek: 6, units: ['Mechanical Waves'] },
        { fromWeek: 7, toWeek: 9, units: ['Heat'] },
      ],
    },
    { course: 'EE4392', blocks: [] },
  ],
};

const kc = (id: string, courseId: string, unit: string): Kc => ({
  id,
  courseId,
  title: id,
  unit,
  domain: 'physics',
  competencies: ['concept'],
  difficultyPrior: 0,
});

const KCS: Kc[] = [
  kc('phys.shm', 'PHYS2335', 'Oscillations'),
  kc('phys.waves', 'PHYS2335', 'Mechanical Waves'),
  kc('phys.heat', 'PHYS2335', 'Heat'),
  { ...kc('math.ode', 'MATH3323', 'ODEs'), domain: 'math' },
  { ...kc('math.integrals', 'MATH2471', 'Integration'), domain: 'math' },
];

const EDGES: KcEdge[] = [
  { from: 'math.ode', to: 'phys.shm', strength: 0.8 },
  { from: 'math.integrals', to: 'phys.heat', strength: 0.7 },
  { from: 'phys.shm', to: 'phys.waves', strength: 0.6 },
];

const graph = (): KcGraph => new KcGraph(KCS, EDGES);

const mastery = (entries: Record<string, Partial<KcMastery>>): Map<KcId, KcMastery> => {
  const map = new Map<KcId, KcMastery>();
  for (const [id, partial] of Object.entries(entries)) {
    map.set(id, {
      kcId: id,
      pMastery: 0.5,
      retrievability: 1,
      composite: 0.5,
      band: 'developing',
      diagnosis: 'fragile',
      stabilityDays: 5,
      standardError: 1,
      attempts: 5,
      ...partial,
    });
  }
  return map;
};

/** Wednesday of the given term week, so no result sits on a boundary. */
const midWeek = (week: number): Date =>
  new Date(Date.parse('2026-08-24T00:00:00Z') + ((week - 1) * 7 + 2) * 24 * 3600 * 1000);

describe('term weeks', () => {
  it('counts week 1 from the stated start', () => {
    expect(termWeek(TERM, midWeek(1))).toBe(1);
    expect(termWeek(TERM, midWeek(5))).toBe(5);
  });

  it('reports a week before the term as non-positive rather than clamping it', () => {
    // "The term has not started" and "week 1" call for different screens, so
    // the distinction survives rather than being flattened to 1.
    const before = new Date(Date.parse('2026-08-10T00:00:00Z'));
    expect(termWeek(TERM, before)).toBeLessThan(1);
    expect(termIsRunning(TERM, before)).toBe(false);
  });

  it('knows when the term is over', () => {
    const after = new Date(Date.parse('2027-01-15T00:00:00Z'));
    expect(termWeek(TERM, after)).toBeGreaterThan(termLengthWeeks(TERM));
    expect(termIsRunning(TERM, after)).toBe(false);
  });
});

describe('what is live and what is coming', () => {
  it('reports the block covering the current week', () => {
    expect(liveUnits(TERM, midWeek(2)).map((u) => u.unit)).toEqual(['Oscillations']);
    expect(liveUnits(TERM, midWeek(5)).map((u) => u.unit)).toEqual(['Mechanical Waves']);
  });

  it('orders upcoming units by how soon they start', () => {
    const soon = upcomingUnits(TERM, 6, midWeek(2));
    expect(soon.map((u) => u.unit)).toEqual(['Mechanical Waves', 'Heat']);
    expect(soon[0]!.startsInWeeks).toBe(2);
    expect(soon[1]!.startsInWeeks).toBe(5);
  });

  it('excludes units outside the lookahead window', () => {
    expect(upcomingUnits(TERM, 2, midWeek(2)).map((u) => u.unit)).toEqual(['Mechanical Waves']);
  });
});

describe('term focus', () => {
  it('resolves unit names to knowledge components', () => {
    const focus = termFocus(TERM, KCS, { now: midWeek(2), upcomingWeeks: 3 });
    expect(focus.liveKcs).toEqual(['phys.shm']);
    expect(focus.upcomingKcs).toEqual(['phys.waves']);
  });

  it('names a course on the term that has no knowledge map', () => {
    // A term listing a course the graph has never heard of is the normal state
    // while its material is being written. Silence would be the bug.
    const focus = termFocus(TERM, KCS, { now: midWeek(2) });
    expect(focus.coursesWithoutGraph).toEqual(['EE4392']);
  });

  it('a unit name that matches nothing contributes nothing and says so by omission', () => {
    const typo: TermInput = {
      ...TERM,
      courses: [{ course: 'PHYS2335', blocks: [{ fromWeek: 1, toWeek: 3, units: ['Oscilations'] }] }],
    };
    const focus = termFocus(typo, KCS, { now: midWeek(2) });
    expect(focus.live).toHaveLength(1);
    expect(focus.liveKcs).toEqual([]);
  });
});

describe('term readiness', () => {
  it('surfaces a decayed prerequisite of an upcoming unit', () => {
    const focus = termFocus(TERM, KCS, { now: midWeek(5), upcomingWeeks: 3 });
    const gaps = termReadiness(
      graph(),
      mastery({
        'phys.heat': { composite: 0.1, diagnosis: 'gap' },
        'math.integrals': { composite: 0.25, pMastery: 0.9, retrievability: 0.28, diagnosis: 'decayed' },
      }),
      focus,
    );
    const integrals = gaps.find((g) => g.kc === 'math.integrals');
    expect(integrals, JSON.stringify(gaps)).toBeDefined();
    expect(integrals!.neededBy).toBe('phys.heat');
    expect(integrals!.diagnosis).toBe('decayed');
    expect(integrals!.startsInWeeks).toBe(2);
  });

  it('ranks an imminent unit above a distant one, all else equal', () => {
    // Same shortfall, same edge strength; only the deadline differs. If this
    // ordering were wrong the list would be true and useless.
    const focus = termFocus(TERM, KCS, { now: midWeek(2), upcomingWeeks: 8 });
    const gaps = termReadiness(
      graph(),
      mastery({
        'math.ode': { composite: 0.2, diagnosis: 'gap' },
        'math.integrals': { composite: 0.2, diagnosis: 'gap' },
      }),
      focus,
    );
    const ode = gaps.findIndex((g) => g.kc === 'math.ode');
    const integrals = gaps.findIndex((g) => g.kc === 'math.integrals');
    expect(ode).toBeGreaterThanOrEqual(0);
    expect(integrals).toBeGreaterThanOrEqual(0);
    expect(ode).toBeLessThan(integrals);
  });

  it('includes an untested prerequisite rather than assuming it is fine', () => {
    // Otherwise the term view is quietest for the learner who has used the app
    // least, which is exactly backwards.
    const focus = termFocus(TERM, KCS, { now: midWeek(2), upcomingWeeks: 3 });
    const gaps = termReadiness(graph(), mastery({}), focus);
    expect(gaps.map((g) => g.kc)).toContain('math.ode');
    expect(gaps.find((g) => g.kc === 'math.ode')!.diagnosis).toBe('untested');
  });

  it('leaves out a prerequisite that is already solid', () => {
    const focus = termFocus(TERM, KCS, { now: midWeek(2), upcomingWeeks: 3 });
    const gaps = termReadiness(
      graph(),
      mastery({ 'math.ode': { composite: 0.92, pMastery: 0.95, retrievability: 0.97, diagnosis: 'solid' } }),
      focus,
    );
    expect(gaps.map((g) => g.kc)).not.toContain('math.ode');
  });

  it('does not report this week\'s own material as a prerequisite gap', () => {
    // phys.shm is live in week 2 and is a prerequisite of phys.waves, which is
    // upcoming. Telling the learner that the lecture they are sitting in is a
    // gap would be noise, not a diagnosis.
    const focus = termFocus(TERM, KCS, { now: midWeek(2), upcomingWeeks: 3 });
    const gaps = termReadiness(graph(), mastery({ 'phys.shm': { composite: 0.1, diagnosis: 'gap' } }), focus);
    const shm = gaps.find((g) => g.kc === 'phys.shm');
    // It may appear as live material worth practising, but never attributed to
    // a future unit as though it were a missing prerequisite.
    if (shm) expect(shm.startsInWeeks).toBe(0);
  });

  it('honours the limit', () => {
    const focus = termFocus(TERM, KCS, { now: midWeek(2), upcomingWeeks: 8 });
    expect(termReadiness(graph(), mastery({}), focus, { limit: 1 })).toHaveLength(1);
  });
});
