import { z } from 'zod';

/**
 * The current term: which courses are being taken now, and which unit of each
 * is live in which week.
 *
 * Everything else in this repository is about what a learner knows. This is the
 * one document about *when* they need to know it, and it exists because the two
 * questions have different answers. The mastery model will happily propose a
 * decayed prerequisite from a course finished eighteen months ago; that is
 * correct and, three days before a thermodynamics exam, useless.
 *
 * The schedule is expressed in weeks rather than dates because that is how a
 * syllabus is written, and because a term that slips by a week should be fixed
 * by editing one date rather than forty. `startsOn` converts.
 *
 * A unit name here must match the `unit` field on the course's KCs exactly —
 * that string is the join. It is checked on load rather than trusted, because a
 * typo would silently schedule nothing and look identical to a quiet week.
 *
 * A course with no curriculum document yet may still be listed. It will not
 * contribute KCs, and the loader says so rather than dropping it: "this is on
 * your term and has no knowledge map" is a useful thing to be told, and the
 * alternative is a term document that quietly disagrees with the term.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date as YYYY-MM-DD');

export const termBlockSchema = z
  .object({
    /** First week of the term in which these units are covered, 1-based. */
    fromWeek: z.number().int().min(1).max(30),
    /** Last week, inclusive. A one-week block has `toWeek === fromWeek`. */
    toWeek: z.number().int().min(1).max(30),
    /** Unit names, matching the `unit` field on this course's KCs. */
    units: z.array(z.string().min(1)).min(1),
    /** Optional note: an exam, a lab, a project deadline. */
    note: z.string().optional(),
  })
  .refine((b) => b.toWeek >= b.fromWeek, {
    message: 'toWeek must not precede fromWeek',
    path: ['toWeek'],
  });

/**
 * A scheduled exam.
 *
 * Exams carry a date where coverage blocks carry a week, and the difference is
 * deliberate. A block is written in weeks because that is how a syllabus
 * states it, and because a term that slips by a week is then one line to fix
 * rather than forty. An exam is a specific morning, and the quantity that
 * drives every decision near it is how many *days* away it is — a week number
 * cannot tell Saturday from the Monday two days later, and that distinction is
 * the entire value of scheduling around an exam at all.
 *
 * An exam is also the first thing in this repository that makes a course's
 * scope exceed its own graph, which is why `units` entries may name another
 * course. EE 3300's first exam examines the first-order response: Nilsson
 * chapter 7, re-taught in week 3 of Circuits II and tested alongside chapter 8,
 * but owned by EE 2300's curriculum because that is the course it belongs to.
 * A scope confined to its own course would have to either omit that material
 * or duplicate the component into EE 3300, and duplicating it would split the
 * learner's evidence across two components that mean the same thing.
 */
export const termExamSchema = z.object({
  /** Unique within its course: "exam-1", "test-2", "final". */
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase dash separated slug'),
  title: z.string().min(1),
  /** The day it is sat. */
  on: isoDate,
  /**
   * Units examined. A bare name is a unit of the course that owns the exam;
   * `COURSE:Unit Name` names one belonging to another course.
   */
  units: z.array(z.string().min(1)).min(1),
  /**
   * How long the exam runs.
   *
   * Optional because most syllabi state it for the final and for nothing else.
   * A missing duration is the honest state and the app says so rather than
   * printing an invented number as though it were read off a document.
   */
  minutes: z.number().int().min(5).max(600).optional(),
  /** The scope as the course itself words it: "chapters 8, 9, 10 and 12". */
  scope: z.string().optional(),
  /** Cumulative exams change what is worth revising, so they say so. */
  cumulative: z.boolean().default(false),
});

export const termCourseSchema = z.object({
  course: z.string().regex(/^[A-Z]{2,4}\d{4}$/, 'course code like "PHYS2335"'),
  blocks: z.array(termBlockSchema).default([]),
  exams: z.array(termExamSchema).default([]),
});

export const termSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase dash separated slug'),
    title: z.string().min(1),
    /** The Monday of week 1. Everything else is counted from here. */
    startsOn: isoDate,
    endsOn: isoDate,
    courses: z.array(termCourseSchema).min(1),
  })
  .refine((t) => t.endsOn > t.startsOn, {
    message: 'endsOn must fall after startsOn',
    path: ['endsOn'],
  });

export type Term = z.infer<typeof termSchema>;
export type TermCourse = z.infer<typeof termCourseSchema>;
export type TermBlock = z.infer<typeof termBlockSchema>;
export type TermExam = z.infer<typeof termExamSchema>;

export interface TermIssue {
  path: string;
  message: string;
}

export interface TermParseResult {
  ok: boolean;
  term?: Term;
  issues: TermIssue[];
}

export function parseTerm(input: unknown): TermParseResult {
  const result = termSchema.safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message })),
    };
  }

  const term = result.data;
  const issues: TermIssue[] = [];

  const seen = new Set<string>();
  for (const [ci, course] of term.courses.entries()) {
    if (seen.has(course.course)) {
      issues.push({ path: `courses.${ci}.course`, message: `${course.course} is listed twice` });
    }
    seen.add(course.course);

    // Overlapping blocks within one course are allowed — a lab can run
    // alongside lectures — but an exact duplicate is a copy-paste slip.
    const spans = new Set<string>();
    for (const [bi, block] of course.blocks.entries()) {
      const key = `${block.fromWeek}-${block.toWeek}:${[...block.units].sort().join(',')}`;
      if (spans.has(key)) {
        issues.push({ path: `courses.${ci}.blocks.${bi}`, message: 'duplicate block' });
      }
      spans.add(key);
    }

    // An exam outside the term's own dates is always a typo, and it is a
    // costly one: every urgency figure in the app is a countdown to one of
    // these dates, so a year slip silently reprioritises the whole term.
    const examIds = new Set<string>();
    for (const [ei, exam] of course.exams.entries()) {
      if (examIds.has(exam.id)) {
        issues.push({ path: `courses.${ci}.exams.${ei}.id`, message: `${exam.id} is listed twice` });
      }
      examIds.add(exam.id);

      if (exam.on < term.startsOn || exam.on > term.endsOn) {
        issues.push({
          path: `courses.${ci}.exams.${ei}.on`,
          message: `${exam.on} falls outside the term (${term.startsOn} to ${term.endsOn})`,
        });
      }
    }
  }

  return { ok: issues.length === 0, term, issues };
}

/** A unit reference resolved to the course that owns it. */
export interface ResolvedUnitRef {
  course: string;
  unit: string;
}

/**
 * Split an exam's unit references into `{course, unit}` pairs.
 *
 * The `COURSE:Unit` prefix is parsed in exactly one place, here, and every
 * consumer downstream works with the resolved pair. `packages/domain` mirrors
 * the term's shape structurally rather than importing this contract, so a
 * second copy of this parser would have to live over there — and two parsers
 * for one notation is how the two drift.
 */
export function examUnits(owningCourse: string, exam: TermExam): ResolvedUnitRef[] {
  return exam.units.map((raw) => {
    const split = raw.indexOf(':');
    if (split < 0) return { course: owningCourse, unit: raw };
    return { course: raw.slice(0, split), unit: raw.slice(split + 1) };
  });
}

/**
 * Check every unit name against the units the curriculum actually declares.
 *
 * The join between a term and the KC graph is a plain string, so a typo binds
 * to nothing and schedules nothing — which looks exactly like a week with no
 * material in it. Taking the known units as an argument keeps this package free
 * of any dependency on the graph.
 */
export function checkTermUnits(
  term: Term,
  unitsByCourse: ReadonlyMap<string, ReadonlySet<string>>,
): TermIssue[] {
  const issues: TermIssue[] = [];
  for (const [ci, course] of term.courses.entries()) {
    const known = unitsByCourse.get(course.course);
    if (!known) {
      issues.push({
        path: `courses.${ci}.course`,
        message: `${course.course} has no curriculum document yet, so its weeks carry no knowledge components`,
      });
      continue;
    }
    for (const [bi, block] of course.blocks.entries()) {
      for (const [ui, unit] of block.units.entries()) {
        if (!known.has(unit)) {
          issues.push({
            path: `courses.${ci}.blocks.${bi}.units.${ui}`,
            message: `"${unit}" is not a unit of ${course.course} (known: ${[...known].join(', ')})`,
          });
        }
      }
    }

    // Exam scopes resolve against whichever course owns each unit, which is
    // not always the course sitting the exam.
    for (const [ei, exam] of course.exams.entries()) {
      for (const [ui, ref] of examUnits(course.course, exam).entries()) {
        const owner = unitsByCourse.get(ref.course);
        if (!owner) {
          issues.push({
            path: `courses.${ci}.exams.${ei}.units.${ui}`,
            message: `${ref.course} has no curriculum document, so "${ref.unit}" cannot be examined`,
          });
          continue;
        }
        if (!owner.has(ref.unit)) {
          issues.push({
            path: `courses.${ci}.exams.${ei}.units.${ui}`,
            message: `"${ref.unit}" is not a unit of ${ref.course} (known: ${[...owner].join(', ')})`,
          });
        }
      }
    }
  }
  return issues;
}
