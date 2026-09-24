import { describe, expect, it } from 'vitest';
import { checkTermUnits, parseTerm, type Term } from '../src/term.js';

const base = {
  id: '2026-fall',
  title: 'Fall 2026',
  startsOn: '2026-08-24',
  endsOn: '2026-12-11',
  courses: [
    { course: 'PHYS2335', blocks: [{ fromWeek: 1, toWeek: 3, units: ['Oscillations'] }] },
  ],
};

describe('term schema', () => {
  it('accepts a well-formed term', () => {
    const result = parseTerm(base);
    expect(result.issues).toEqual([]);
    expect(result.term?.courses[0]?.course).toBe('PHYS2335');
  });

  it('rejects a block that ends before it starts', () => {
    const result = parseTerm({
      ...base,
      courses: [{ course: 'PHYS2335', blocks: [{ fromWeek: 5, toWeek: 2, units: ['Oscillations'] }] }],
    });
    expect(result.term).toBeUndefined();
    expect(result.issues.map((i) => i.message).join(' ')).toContain('toWeek must not precede fromWeek');
  });

  it('rejects a term that ends before it starts', () => {
    const result = parseTerm({ ...base, endsOn: '2026-08-01' });
    expect(result.term).toBeUndefined();
  });

  it('reports a course listed twice', () => {
    const result = parseTerm({ ...base, courses: [...base.courses, ...base.courses] });
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.message).join(' ')).toContain('listed twice');
  });

  it('allows a course with no blocks yet', () => {
    // A course on the term whose material has not been written is a normal
    // state, not an error. Refusing it would force the schedule to lie about
    // what the learner is actually taking.
    const result = parseTerm({ ...base, courses: [...base.courses, { course: 'EE4392', blocks: [] }] });
    expect(result.ok).toBe(true);
  });
});

describe('unit names as the join', () => {
  const term = parseTerm({
    ...base,
    courses: [
      { course: 'PHYS2335', blocks: [{ fromWeek: 1, toWeek: 3, units: ['Oscillations', 'Optics'] }] },
      { course: 'EE4392', blocks: [] },
    ],
  }).term as Term;

  const known = new Map([['PHYS2335', new Set(['Oscillations', 'Mechanical Waves'])]]);

  it('names a unit that does not exist, and lists the ones that do', () => {
    // A typo here binds to nothing and schedules nothing, which is
    // indistinguishable from a quiet week at runtime. There is no later
    // symptom, so this check is the only thing that catches it.
    const issues = checkTermUnits(term, known);
    const optics = issues.find((i) => i.message.includes('"Optics"'));
    expect(optics).toBeDefined();
    expect(optics!.message).toContain('Mechanical Waves');
    expect(optics!.path).toBe('courses.0.blocks.0.units.1');
  });

  it('reports a course with no curriculum separately from a bad unit name', () => {
    const issues = checkTermUnits(term, known);
    const missing = issues.find((i) => i.message.includes('no curriculum document'));
    expect(missing?.path).toBe('courses.1.course');
  });

  it('is silent when everything resolves', () => {
    const clean = parseTerm(base).term as Term;
    expect(checkTermUnits(clean, known)).toEqual([]);
  });
});
