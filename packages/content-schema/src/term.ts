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

export const termCourseSchema = z.object({
  course: z.string().regex(/^[A-Z]{2,4}\d{4}$/, 'course code like "PHYS2335"'),
  blocks: z.array(termBlockSchema).default([]),
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
  }

  return { ok: issues.length === 0, term, issues };
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
  }
  return issues;
}
