import { describe, expect, it } from 'vitest';
import { checkTermUnits, examUnits, parseTerm, type Term } from '../src/term.js';

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

/**
 * The `COURSE:Unit` prefix, which had no unit test at all.
 *
 * Its only coverage was one hard-coded assertion in the exam e2e driver, naming
 * the one paper in the term whose scope borrows a unit from another course —
 * and that paper's date passed, so diagnostics stopped offering it and the
 * assertion stopped running. A feature guarded only by a dated fixture is a
 * feature that quietly stops being guarded.
 */
describe('examUnits', () => {
  const exam = (units: string[]) => ({ id: 'exam-1', title: 'Exam 1', on: '2026-09-28', cumulative: false, units });

  it('attributes a bare unit name to the course that owns the exam', () => {
    expect(examUnits('EE3300', exam(['Second-Order Circuits']))).toEqual([
      { course: 'EE3300', unit: 'Second-Order Circuits' },
    ]);
  });

  it('resolves a unit borrowed from another course', () => {
    // EE3300's first exam tests chapter 7, which EE2300's curriculum owns.
    // Confining the scope to its own course would mean either omitting that
    // material or duplicating the component — and duplicating it splits the
    // learner's evidence across two components that mean the same thing.
    expect(examUnits('EE3300', exam(['EE2300:Energy Storage and Transients']))).toEqual([
      { course: 'EE2300', unit: 'Energy Storage and Transients' },
    ]);
  });

  it('mixes both in one scope, in order', () => {
    const resolved = examUnits('EE3300', exam(['Sinusoidal Steady State', 'EE2300:Energy Storage and Transients']));
    expect(resolved.map((r) => r.course)).toEqual(['EE3300', 'EE2300']);
  });

  it('splits on the first colon only, so a unit name may contain one', () => {
    expect(examUnits('PHYS2335', exam(['EE2300:Thevenin: equivalents']))).toEqual([
      { course: 'EE2300', unit: 'Thevenin: equivalents' },
    ]);
  });

  it('is empty for an exam that states no units', () => {
    expect(examUnits('EE3300', exam([]))).toEqual([]);
  });
});
