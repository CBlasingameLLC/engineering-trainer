import { z } from 'zod';
import { itemSchema, provenanceSchema } from './item.js';

/**
 * A content pack: the unit of authoring, verification and import.
 *
 * Packs are immutable once verified. Regenerating content produces a new
 * `packId` or a bumped `version` rather than editing in place, so the attempt
 * log always refers to the exact item a learner saw.
 */

export const SCHEMA_VERSION = '1.0.0';

export const packSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  packId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase dash-separated id'),
  version: z.number().int().positive().default(1),
  /** Course code this pack belongs to, e.g. "EE2300". */
  course: z.string().regex(/^[A-Z]{2,4}\d{4}$/, 'course code like "EE2300"'),
  title: z.string().min(1),
  provenance: provenanceSchema,
  items: z.array(itemSchema).min(1),
});

export type Pack = z.infer<typeof packSchema>;

export interface PackIssue {
  path: string;
  message: string;
}

export interface PackParseResult {
  ok: boolean;
  pack?: Pack;
  issues: PackIssue[];
}

/** Parse and validate a pack, returning every issue rather than throwing on the first. */
export function parsePack(input: unknown): PackParseResult {
  const result = packSchema.safeParse(input);
  if (result.success) {
    const issues = structuralIssues(result.data);
    return issues.length > 0
      ? { ok: false, issues }
      : { ok: true, pack: result.data, issues: [] };
  }
  return {
    ok: false,
    issues: result.error.issues.map((i) => ({
      path: i.path.join('.') || '(root)',
      message: i.message,
    })),
  };
}

/** Checks that span the whole pack rather than a single item. */
function structuralIssues(pack: Pack): PackIssue[] {
  const issues: PackIssue[] = [];

  const ids = pack.items.map((i) => i.id);
  const seen = new Set<string>();
  for (const [index, id] of ids.entries()) {
    if (seen.has(id)) issues.push({ path: `items.${index}.id`, message: `duplicate item id "${id}"` });
    seen.add(id);
  }

  // A pack tagged redistributable cannot contain personal-only items; that is
  // how third-party content would leak into a shippable build.
  if (pack.provenance.licenseTier === 'redistributable') {
    for (const [index, item] of pack.items.entries()) {
      if (item.provenance.licenseTier === 'personal-only') {
        issues.push({
          path: `items.${index}.provenance.licenseTier`,
          message: `item "${item.id}" is personal-only inside a redistributable pack`,
        });
      }
    }
  }

  return issues;
}

/** True when a pack may be bundled into a release build. */
export const isRedistributable = (pack: Pack): boolean =>
  pack.provenance.licenseTier === 'redistributable' &&
  pack.items.every((i) => i.provenance.licenseTier === 'redistributable');
