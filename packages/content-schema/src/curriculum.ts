import { z } from 'zod';
import { COMPETENCIES, DOMAINS } from './item.js';

/**
 * Course and knowledge-component definitions.
 *
 * Kept separate from item packs because the KC graph is the stable spine: item
 * banks are regenerated constantly, but the concept map for Circuits I changes
 * only when the curriculum does.
 */

const slug = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, 'lowercase dot/dash separated slug');

export const kcSchema = z.object({
  id: slug,
  title: z.string().min(1),
  /** Grouping within the course, e.g. "DC Analysis Techniques". */
  unit: z.string().min(1),
  domain: z.enum(DOMAINS),
  /** At least one; a KC exercising no competency cannot be diagnosed. */
  competencies: z.array(z.enum(COMPETENCIES)).min(1),
  difficultyPrior: z.number().min(-4).max(4).default(0),
  description: z.string().optional(),
  /**
   * Prerequisite KC ids. May reference other courses — that cross-course edge
   * is what lets a Circuits II diagnosis point at Calculus II.
   */
  prerequisites: z
    .array(z.union([slug, z.object({ kc: slug, strength: z.number().gt(0).max(1) })]))
    .default([]),
});

export const courseSchema = z.object({
  code: z.string().regex(/^[A-Z]{2,4}\d{4}$/, 'course code like "EE2300"'),
  title: z.string().min(1),
  institution: z.string().default('Texas State University'),
  catalogYear: z.number().int().min(2000).max(2100).default(2026),
  /** Tier 1 is a prerequisite for what the learner takes next; see the degree plan. */
  tier: z.number().int().min(1).max(4).default(2),
  credits: z.number().positive().optional(),
  kcs: z.array(kcSchema).min(1),
});

export type KcDefinition = z.infer<typeof kcSchema>;
export type CourseDefinition = z.infer<typeof courseSchema>;

export interface CurriculumIssue {
  path: string;
  message: string;
}

export interface CurriculumParseResult {
  ok: boolean;
  course?: CourseDefinition;
  issues: CurriculumIssue[];
}

export function parseCourse(input: unknown): CurriculumParseResult {
  const result = courseSchema.safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message })),
    };
  }

  const issues: CurriculumIssue[] = [];
  const ids = new Set<string>();
  for (const [index, kc] of result.data.kcs.entries()) {
    if (ids.has(kc.id)) issues.push({ path: `kcs.${index}.id`, message: `duplicate KC id "${kc.id}"` });
    ids.add(kc.id);
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, course: result.data, issues: [] };
}

/** Normalise the shorthand prerequisite form into explicit weighted edges. */
export function prerequisiteEdges(
  kc: KcDefinition,
): { from: string; to: string; strength: number }[] {
  return kc.prerequisites.map((p) =>
    typeof p === 'string'
      ? { from: p, to: kc.id, strength: 0.9 }
      : { from: p.kc, to: kc.id, strength: p.strength },
  );
}
