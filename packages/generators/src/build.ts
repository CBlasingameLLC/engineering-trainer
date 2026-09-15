import { itemSchema, type Item, type Pack } from '@et/content-schema';
import { makeRng } from './rng.js';
import type { Generator } from './types.js';

/**
 * Turning generators into packs.
 *
 * Item ids embed the generator id and the seed, so any item in the bank can be
 * regenerated exactly. That is what makes a bank reproducible rather than a
 * pile of frozen output: regenerating never silently renumbers items, and a
 * learner revisiting a missed question gets the same question.
 */

export interface BuildOptions {
  /** How many variants to draw from each generator. */
  variantsPerGenerator: number;
  /** Base seed; variant n uses baseSeed + n. */
  baseSeed?: number;
}

export interface BuildIssue {
  itemId: string;
  path: string;
  message: string;
}

export interface BuildResult {
  items: Item[];
  issues: BuildIssue[];
}

/** Generate `count` variants from one generator, validating each against the schema. */
export function buildItems(
  generator: Generator,
  options: BuildOptions,
): BuildResult {
  const baseSeed = options.baseSeed ?? 1;
  const items: Item[] = [];
  const issues: BuildIssue[] = [];
  const seenStems = new Set<string>();

  for (let n = 0; n < options.variantsPerGenerator; n++) {
    const seed = baseSeed + n;
    const generated = generator.generate(makeRng(seed), seed);

    // Distinct seeds can still land on identical parameters. A duplicate item
    // would be selected twice by the CAT engine and double-count as evidence,
    // so drop it rather than let it inflate a mastery estimate.
    if (seenStems.has(generated.stem)) continue;
    seenStems.add(generated.stem);

    const candidate = {
      ...generated,
      id: `${generator.id}.s${seed}`,
      seed,
      provenance: {
        producer: 'generator' as const,
        sourceRef: generator.id,
        licenseTier: 'redistributable' as const,
        createdAt: new Date(0).toISOString(),
      },
    };

    const parsed = itemSchema.safeParse(candidate);
    if (parsed.success) {
      items.push(parsed.data);
    } else {
      for (const issue of parsed.error.issues) {
        issues.push({
          itemId: candidate.id,
          path: issue.path.join('.') || '(root)',
          message: issue.message,
        });
      }
    }
  }

  return { items, issues };
}

export interface PackBuildOptions extends BuildOptions {
  packId: string;
  course: string;
  title: string;
}

/** Build a complete redistributable pack from a set of generators. */
export function buildPack(
  generators: readonly Generator[],
  options: PackBuildOptions,
): { pack: Pack; issues: BuildIssue[] } {
  const items: Item[] = [];
  const issues: BuildIssue[] = [];

  for (const generator of generators) {
    const result = buildItems(generator, options);
    items.push(...result.items);
    issues.push(...result.issues);
  }

  return {
    pack: {
      schemaVersion: '1.0.0',
      packId: options.packId,
      version: 1,
      course: options.course,
      title: options.title,
      provenance: {
        producer: 'generator',
        sourceRef: '@et/generators',
        licenseTier: 'redistributable',
        createdAt: new Date(0).toISOString(),
      },
      items,
    },
    issues,
  };
}
