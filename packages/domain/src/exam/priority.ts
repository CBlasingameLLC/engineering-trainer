import type { KcGraph } from '../kc-graph/graph.js';
import type { KcMastery } from '../mastery/composite.js';
import type { KcId } from '../types.js';
import type { ExamBlueprint } from './blueprint.js';

/**
 * Scheduling against the calendar.
 *
 * `termReadiness` already ranks by how *imminent* a topic is, but it measures
 * imminence in weeks and reads it off the coverage schedule — which says what
 * is being **taught**. This file reads it off the exams, which say what is
 * being **tested**, and the two lists are genuinely different. A unit can be
 * live all month and never examined. A unit finished three weeks ago can be
 * half of Monday's paper. Only one of those facts changes what is worth doing
 * this afternoon.
 *
 * The resolution matters as much as the source. A week is the right unit for
 * "this material arrives soon"; it is useless for "this is on Monday", which
 * is a question about days and, on a Saturday, about two of them.
 */

/**
 * How fast urgency falls off with distance to the exam, in days.
 *
 * Hyperbolic rather than exponential, and that is a real choice. An
 * exponential with any sensible half-life drives everything past a fortnight
 * to arithmetic zero, which turns a study planner into a cramming tool: the
 * only thing it can ever say is "revise the next exam", and the decayed
 * prerequisite that will sink the exam after it never surfaces until it is
 * also too late. The hyperbola keeps the near exam clearly on top — five days
 * out scores half what today does — while leaving a badly decayed component
 * six weeks away visible underneath rather than deleted.
 *
 * It is also the same shape as `termReadiness`'s week-based imminence, so the
 * two rankings disagree about magnitude and not about direction.
 */
const PROXIMITY_HORIZON_DAYS = 5;

/** 1 on the day, falling with distance, never reaching zero. */
export const examProximity = (daysAway: number): number =>
  daysAway < 0 ? 0 : 1 / (1 + Math.max(0, daysAway) / PROXIMITY_HORIZON_DAYS);

export type ExamRole = 'examined' | 'prerequisite';

export interface ExamPriority {
  kcId: KcId;
  /** The exam that makes this urgent. */
  examId: string;
  course: string;
  examTitle: string;
  examOn: string;
  daysAway: number;
  /** Whether the exam asks this directly, or leans on it. */
  role: ExamRole;
  /** Graph distance from the examined component. 0 when examined directly. */
  distance: number;
  composite: number;
  diagnosis: KcMastery['diagnosis'];
  urgency: number;
}

export interface ExamPriorityOptions {
  /** How far up the prerequisite chain to look. */
  maxDepth?: number;
  limit?: number;
  /** Components at or above this are considered ready and drop out. */
  threshold?: number;
}

/**
 * The same figure `termReadiness` uses for an untested component.
 *
 * An untested component is a real unknown rather than a measured gap, so it
 * ranks just below a confirmed failure at the same distance instead of above
 * it — while still ranking, because "you have never been asked this and it is
 * on Monday's paper" is exactly as actionable as a low score.
 */
const UNTESTED_SHORTFALL = 0.55;

export function examPriorities(
  graph: KcGraph,
  mastery: ReadonlyMap<KcId, KcMastery>,
  blueprints: readonly ExamBlueprint[],
  options: ExamPriorityOptions = {},
): ExamPriority[] {
  const maxDepth = options.maxDepth ?? 2;
  const threshold = options.threshold ?? 0.65;

  // A component examined by two exams belongs to the nearer one. Summing
  // instead would let three distant exams outrank Monday's, which is the exact
  // inversion this file exists to prevent.
  const best = new Map<KcId, ExamPriority>();

  for (const exam of blueprints) {
    if (exam.daysAway < 0) continue;
    const proximity = examProximity(exam.daysAway);

    const candidates: { kcId: KcId; strength: number; distance: number }[] = [];
    for (const kcId of exam.kcIds) {
      candidates.push({ kcId, strength: 1, distance: 0 });
      for (const ancestor of graph.ancestors(kcId, maxDepth)) {
        candidates.push({ kcId: ancestor.kcId, strength: ancestor.strength, distance: ancestor.distance });
      }
    }

    for (const candidate of candidates) {
      const m = mastery.get(candidate.kcId);
      const composite = m?.composite ?? 0;
      const diagnosis = m?.diagnosis ?? 'untested';
      if (diagnosis !== 'untested' && composite >= threshold) continue;

      const shortfall = diagnosis === 'untested' ? UNTESTED_SHORTFALL : threshold - composite;
      const urgency = shortfall * candidate.strength * proximity;

      const existing = best.get(candidate.kcId);
      if (existing && existing.urgency >= urgency) continue;

      best.set(candidate.kcId, {
        kcId: candidate.kcId,
        examId: exam.id,
        course: exam.course,
        examTitle: exam.title,
        examOn: exam.on,
        daysAway: exam.daysAway,
        role: candidate.distance === 0 ? 'examined' : 'prerequisite',
        distance: candidate.distance,
        composite,
        diagnosis,
        urgency: Number(urgency.toFixed(6)),
      });
    }
  }

  const ranked = [...best.values()].sort(
    (a, b) => b.urgency - a.urgency || a.daysAway - b.daysAway || a.kcId.localeCompare(b.kcId),
  );
  return options.limit === undefined ? ranked : ranked.slice(0, options.limit);
}

export interface ExamShare {
  exam: ExamBlueprint;
  /** Share of a combined session's items, 0..1. */
  share: number;
  items: number;
}

/**
 * Split a single session's items between several upcoming exams.
 *
 * Used by the triage diagnostic, where the question is not "how am I doing in
 * Circuits II" but "which of the three papers I sit this week is in the worst
 * shape". Shares follow proximity, so Monday's exam takes the largest slice
 * without the others dropping off the paper entirely — an exam that gets no
 * items produces no evidence, and the whole point of a triage run is to come
 * out knowing where all of them stand.
 */
export function examShares(
  blueprints: readonly ExamBlueprint[],
  totalItems: number,
): ExamShare[] {
  const live = blueprints.filter((b) => b.daysAway >= 0 && b.kcIds.length > 0);
  if (live.length === 0) return [];

  const weights = live.map((exam) => examProximity(exam.daysAway));
  const total = weights.reduce((sum, w) => sum + w, 0);

  const shares: ExamShare[] = live.map((exam, i) => {
    const share = (weights[i] ?? 0) / total;
    return { exam, share, items: Math.max(1, Math.floor(share * totalItems)) };
  });

  // Rounding down everywhere leaves a remainder; give it to the nearest exams.
  let assigned = shares.reduce((sum, s) => sum + s.items, 0);
  const byProximity = [...shares].sort((a, b) => a.exam.daysAway - b.exam.daysAway);
  for (let i = 0; assigned < totalItems && byProximity.length > 0; i += 1) {
    const entry = byProximity[i % byProximity.length];
    if (entry) {
      entry.items += 1;
      assigned += 1;
    }
  }

  return shares.sort((a, b) => a.exam.daysAway - b.exam.daysAway);
}
