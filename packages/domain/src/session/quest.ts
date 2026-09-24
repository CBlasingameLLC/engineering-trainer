import type { KcGraph } from '../kc-graph/graph.js';
import type { KcMastery } from '../mastery/composite.js';
import type { KcId } from '../types.js';

/**
 * The daily quest.
 *
 * Assembled by the scheduler rather than chosen by the learner, because the
 * material a learner would pick is reliably the material they are already
 * comfortable with. The quest mixes two things deliberately:
 *
 * - **due reviews**, which is where retention is won, and
 * - **frontier work**, meaning KCs whose prerequisites are all in place —
 *   the only new material that can actually be learned today.
 *
 * Anything locked behind an unmet prerequisite is excluded on purpose. Serving
 * it would produce a failure that says nothing about the KC being tested.
 */

export interface QuestOptions {
  /** Target number of items. */
  targetItems?: number;
  /** Share of the quest given to review rather than new material. */
  reviewShare?: number;
  now?: Date;
}

export interface Quest {
  /** Stable for a given day, so reopening the app does not reroll it. */
  id: string;
  /** KCs due for review, most urgent first. */
  reviewKcs: KcId[];
  /** New material the learner is ready for. */
  frontierKcs: KcId[];
  targetItems: number;
  /** One line describing what today's work is for. */
  rationale: string;
}

const MASTERED = 0.85;

/** Treat a KC as learned for the purpose of unlocking its dependents. */
const isMastered = (mastery: ReadonlyMap<KcId, KcMastery>, kc: KcId): boolean =>
  (mastery.get(kc)?.composite ?? 0) >= 0.65;

export function dailyQuest(
  graph: KcGraph,
  mastery: ReadonlyMap<KcId, KcMastery>,
  options: QuestOptions = {},
): Quest {
  const now = options.now ?? new Date();
  const targetItems = options.targetItems ?? 12;
  const reviewShare = options.reviewShare ?? 0.6;

  // Review candidates: seen before, and retention has slipped. Sorted by how
  // far it has fallen, so the most perishable is worked first.
  const reviewKcs = [...mastery.values()]
    .filter((m) => m.attempts > 0 && m.retrievability < 0.9 && m.pMastery > 0.3)
    .sort((a, b) => a.retrievability - b.retrievability)
    .map((m) => m.kcId);

  // Frontier: prerequisites satisfied, not yet mastered. `frontier` walks the
  // real prerequisite DAG, so cross-course edges gate this too.
  const frontierKcs = graph
    .frontier((kc) => isMastered(mastery, kc))
    .filter((kc) => (mastery.get(kc)?.composite ?? 0) < MASTERED);

  const reviewTarget = Math.round(targetItems * reviewShare);
  const chosenReview = reviewKcs.slice(0, Math.max(1, Math.ceil(reviewTarget / 2)));
  const chosenFrontier = frontierKcs.slice(0, Math.max(1, Math.ceil((targetItems - reviewTarget) / 2)));

  const rationale =
    chosenReview.length > 0 && chosenFrontier.length > 0
      ? `${chosenReview.length} topic(s) slipping, ${chosenFrontier.length} ready to start`
      : chosenReview.length > 0
        ? `${chosenReview.length} topic(s) slipping out of recall`
        : chosenFrontier.length > 0
          ? `${chosenFrontier.length} new topic(s) whose prerequisites are in place`
          : 'Nothing is due — take a placement exam to find where you stand';

  return {
    id: `quest-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    reviewKcs: chosenReview,
    frontierKcs: chosenFrontier,
    targetItems,
    rationale,
  };
}

/** Every KC a quest touches, for selecting items. */
export const questKcs = (quest: Quest): KcId[] => [...quest.reviewKcs, ...quest.frontierKcs];

export interface QuestProgress {
  answered: number;
  target: number;
  complete: boolean;
  fraction: number;
}

export const questProgress = (quest: Quest, answered: number): QuestProgress => ({
  answered,
  target: quest.targetItems,
  complete: answered >= quest.targetItems,
  fraction: Math.min(1, quest.targetItems === 0 ? 1 : answered / quest.targetItems),
});
