import { z } from 'zod';

/**
 * The misconception catalog: what is invariant about an error.
 *
 * Deliberately thin, because most of the explaining is already done elsewhere.
 * Every distractor and every trap carries feedback written against the *item* —
 * "you entered 6.67 V, which is what you get if you leave the current source in
 * place" — and that beats any generic remediation card, because it is about the
 * number the learner actually wrote. Duplicating it here would create two
 * descriptions of one error that drift apart.
 *
 * What the item cannot know is the thing this file exists for: which other
 * errors are the same mistake wearing different notation. A sign dropped in a
 * KVL loop and a sign dropped in a characteristic root are one habit, and no
 * item, course or pack is in a position to say so. Families are the only claim
 * here that needs to be stated centrally, and the payoff is a diagnosis
 * unreachable from any per-course view.
 */

const slug = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, 'lowercase dot/dash separated slug');

export const misconceptionFamilySchema = z.object({
  id: slug,
  title: z.string().min(1),
  /** What the whole family has in common, in one line. */
  description: z.string().min(1),
  /**
   * The competency this habit belongs to, so the feed can line up with the
   * radar the dashboard already draws.
   */
  competency: z.enum(['math-execution', 'concept', 'modeling', 'strategy', 'numeracy', 'visual']),
});

export const misconceptionEntrySchema = z.object({
  id: slug,
  /** Human-readable name, since the id is a slug and title-casing it reads badly. */
  title: z.string().min(1),
  family: slug,
});

export const misconceptionCatalogSchema = z.object({
  schemaVersion: z.string().default('1.0.0'),
  families: z.array(misconceptionFamilySchema).min(1),
  misconceptions: z.array(misconceptionEntrySchema).min(1),
});

export type MisconceptionFamily = z.infer<typeof misconceptionFamilySchema>;
export type MisconceptionEntry = z.infer<typeof misconceptionEntrySchema>;
export type MisconceptionCatalog = z.infer<typeof misconceptionCatalogSchema>;

export interface MisconceptionCatalogResult {
  ok: boolean;
  catalog?: MisconceptionCatalog;
  issues: { path: string; message: string }[];
}

export function parseMisconceptionCatalog(raw: unknown): MisconceptionCatalogResult {
  const parsed = misconceptionCatalogSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message })),
    };
  }

  const issues: { path: string; message: string }[] = [];
  const families = new Set(parsed.data.families.map((f) => f.id));
  const seen = new Set<string>();

  for (const entry of parsed.data.misconceptions) {
    if (!families.has(entry.family)) {
      issues.push({
        path: `misconceptions.${entry.id}.family`,
        message: `references unknown family "${entry.family}"`,
      });
    }
    if (seen.has(entry.id)) {
      issues.push({ path: `misconceptions.${entry.id}`, message: 'declared more than once' });
    }
    seen.add(entry.id);
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, catalog: parsed.data, issues: [] };
}
