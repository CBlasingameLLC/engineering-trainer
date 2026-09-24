import type { ItemId, KcId, MisconceptionId } from '../types.js';

/**
 * Assembling a targeted drill.
 *
 * A drill aimed at a misconception is a different object from a drill aimed at
 * a knowledge component, and the difference is what makes it worth building.
 * A KC drill asks "do you understand Thevenin equivalents"; a misconception
 * drill asks "do you still drop the sign", and to answer that it must be built
 * only from items that *can* catch the error — an item with no trap for it
 * grades the learner without ever testing the thing being remediated, so a
 * clean run would prove nothing.
 */

/** The minimum an item must expose to be drillable. Content types stay outside this package. */
export interface DrillCandidate {
  itemId: ItemId;
  /** Primary KC, used to spread a drill across topics. */
  kcId: KcId;
  difficultyB: number;
  /** Misconceptions this item is able to diagnose, via a tagged trap or distractor. */
  diagnoses: readonly MisconceptionId[];
}

export interface DrillOptions {
  /** How many items to serve. */
  size?: number;
  /** Items already attempted; re-serving one tests recall of the item, not the concept. */
  attempted?: ReadonlySet<ItemId>;
  /**
   * Ability estimate, if known. Drill items are chosen slightly *below* it:
   * remediation that opens with a question the learner cannot answer confirms
   * the failure instead of correcting it.
   */
  ability?: number;
}

export const DEFAULT_DRILL_SIZE = 5;

/**
 * How far below the learner's ability a drill aims.
 *
 * Adaptive testing maximises information by matching difficulty to ability,
 * which is right when the goal is *measuring* and wrong when the goal is
 * *fixing*. A remediation set should be answerable, so the learner meets the
 * error in a context they can otherwise handle and the correction is the only
 * thing they have to think about. Two-thirds of a logit is roughly a 65%
 * success rate — enough traction to keep going, still enough to catch the slip.
 */
const REMEDIATION_OFFSET = 0.65;

export function assembleDrill(
  misconceptionId: MisconceptionId,
  candidates: readonly DrillCandidate[],
  options: DrillOptions = {},
): DrillCandidate[] {
  const size = options.size ?? DEFAULT_DRILL_SIZE;
  const attempted = options.attempted ?? new Set<ItemId>();

  const diagnostic = candidates.filter((c) => c.diagnoses.includes(misconceptionId));
  if (diagnostic.length === 0) return [];

  const target = options.ability !== undefined ? options.ability - REMEDIATION_OFFSET : undefined;
  const distance = (c: DrillCandidate): number =>
    target === undefined ? 0 : Math.abs(c.difficultyB - target);

  // Fresh items first, then closest to the remediation difficulty. Ties break
  // on id so a drill is reproducible from the same inputs.
  const ordered = [...diagnostic].sort((a, b) => {
    const seenA = attempted.has(a.itemId) ? 1 : 0;
    const seenB = attempted.has(b.itemId) ? 1 : 0;
    return seenA - seenB || distance(a) - distance(b) || a.itemId.localeCompare(b.itemId);
  });

  // Spread across KCs before repeating one. A drill that is five variants of a
  // single generator tests whether the learner has memorised that question,
  // not whether the habit is gone — and the habit is the point, so seeing it
  // survive a change of topic is the evidence worth collecting.
  const chosen: DrillCandidate[] = [];
  const usedKcs = new Set<KcId>();

  for (const candidate of ordered) {
    if (chosen.length >= size) break;
    if (usedKcs.has(candidate.kcId)) continue;
    chosen.push(candidate);
    usedKcs.add(candidate.kcId);
  }

  // Top up from what is left once every distinct KC has been used once.
  for (const candidate of ordered) {
    if (chosen.length >= size) break;
    if (chosen.includes(candidate)) continue;
    chosen.push(candidate);
  }

  return chosen;
}

/** Every misconception any of these items can diagnose. */
export function diagnosableMisconceptions(
  candidates: readonly DrillCandidate[],
): ReadonlySet<MisconceptionId> {
  const out = new Set<MisconceptionId>();
  for (const candidate of candidates) for (const id of candidate.diagnoses) out.add(id);
  return out;
}
