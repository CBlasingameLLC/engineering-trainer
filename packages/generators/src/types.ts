import type { Item, KcRefInput } from '@et/content-schema';
import type { Rng } from './rng.js';

/**
 * A parameterized item generator.
 *
 * One generator plus a closed-form solver replaces roughly fifty hand-written
 * items, and cannot produce a wrong answer key: the answer is computed from the
 * same parameters used to render the question, not transcribed from a source.
 */

/** An item minus the fields the harness fills in (id, provenance). */
export type GeneratedItem = Omit<Item, 'id' | 'provenance'>;

export interface Generator {
  /** Stable identifier; becomes the item id prefix. */
  id: string;
  title: string;
  kcRefs: KcRefInput[];
  /** Nominal difficulty on the logit scale before response data refines it. */
  difficultyB: number;
  generate(rng: Rng, seed: number): GeneratedItem;
}

/** Standard relative tolerance for a computed numeric answer. */
export const DEFAULT_TOLERANCE = { rel: 0.02 } as const;
