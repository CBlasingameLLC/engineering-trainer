import type { ItemId, KcId, KcRef, MisconceptionId } from '../types.js';
import type { ExamBlueprint, ExamUnitRef } from './blueprint.js';

/**
 * Grading a sat exam.
 *
 * The design decision that matters here is that there are **two scores**, kept
 * apart on purpose, for the same reason `M = P × R` keeps its factors apart.
 *
 * - `scoreAtBell` is what the paper would have been worth if it had been
 *   collected when the time ran out. It is the exam result.
 * - `scoreOverall` counts everything, including whatever was answered after
 *   the clock expired. It is what the learner knows.
 *
 * Collapsing them loses the finding. Someone who answers 26 of 30 correctly
 * but reaches only 18 of them inside the time has a pace problem and not a
 * circuits problem, and a single percentage cannot say which — it reports the
 * same number as someone who knew 18 and guessed the rest. The gap between the
 * two scores *is* the time-management result, measured rather than asserted,
 * which is why the exam lets the clock expire and keeps going instead of
 * stopping and throwing away the rest of the evidence.
 */

export interface ExamResponse {
  itemId: ItemId;
  kcRefs: readonly KcRef[];
  correct: boolean;
  /** Time spent on this item alone. */
  latencyMs: number;
  misconceptions: readonly MisconceptionId[];
  /** Milliseconds from the start of the exam at which this was submitted. */
  atElapsedMs: number;
}

/**
 * What the clock says about the sitting.
 *
 * `not-attempted` is separated from a low score because an unstarted paper is
 * not a failed one, and a diagnosis built on it would be fabricated.
 */
export type TimeFinding =
  | 'not-attempted'
  | 'finished-early'
  | 'finished-in-time'
  | 'ran-over'
  | 'ran-over-badly';

export interface ExamTiming {
  allowedMs: number;
  /** Wall-clock actually used, overtime included. */
  usedMs: number;
  answered: number;
  /** Answered before the clock expired. */
  inTime: number;
  /** Answered after it expired. */
  overtime: number;
  /** Seconds per item the paper allows, and what the sitting actually ran at. */
  msPerItemAllowed: number;
  msPerItemInTime: number;
  finding: TimeFinding;
}

export interface ExamKcResult {
  kcId: KcId;
  /** Weighted by `kcRefs`, so a 70/30 item counts 0.7 here and 0.3 elsewhere. */
  asked: number;
  correct: number;
  correctAtBell: number;
  askedAtBell: number;
  /** Fraction correct over everything asked. */
  score: number;
}

export interface ExamUnitResult extends ExamUnitRef {
  asked: number;
  correct: number;
  score: number;
}

export interface ExamResult {
  examId: string;
  course: string;
  title: string;
  /** Items on the paper, whether or not they were reached. */
  served: number;
  timing: ExamTiming;
  /** What the paper would have scored at the bell, 0..1. */
  scoreAtBell: number;
  /** What was known, counting overtime answers, 0..1. */
  scoreOverall: number;
  byKc: ExamKcResult[];
  byUnit: ExamUnitResult[];
  misconceptions: { misconceptionId: MisconceptionId; count: number }[];
  /** Components below the mark, weakest first — the queue to work from. */
  weakest: ExamKcResult[];
}

/**
 * Below this, a component is reported as needing work.
 *
 * Deliberately above a pass mark. The question a practice exam answers is not
 * "did this scrape through" but "will this hold up on Monday", and a component
 * answered right three times in five is not something to walk into an exam on.
 */
export const EXAM_WEAK_THRESHOLD = 0.7;

function findTiming(allowedMs: number, responses: readonly ExamResponse[], served: number): ExamTiming {
  const answered = responses.length;
  const inTime = responses.filter((r) => r.atElapsedMs <= allowedMs).length;
  const overtime = answered - inTime;
  const usedMs = responses.reduce((max, r) => Math.max(max, r.atElapsedMs), 0);

  const finding = ((): TimeFinding => {
    if (answered === 0) return 'not-attempted';
    if (overtime === 0) {
      // Finishing the whole paper with a quarter of the time unused is worth
      // distinguishing from finishing it on the buzzer; they call for
      // different advice and only one of them is a warning.
      return inTime >= served && usedMs <= allowedMs * 0.75 ? 'finished-early' : 'finished-in-time';
    }
    return overtime > served * 0.25 ? 'ran-over-badly' : 'ran-over';
  })();

  return {
    allowedMs,
    usedMs,
    answered,
    inTime,
    overtime,
    msPerItemAllowed: served > 0 ? allowedMs / served : 0,
    msPerItemInTime: inTime > 0 ? Math.min(usedMs, allowedMs) / inTime : 0,
    finding,
  };
}

export function gradeExam(
  blueprint: ExamBlueprint,
  served: readonly { itemId: ItemId; kcId: KcId }[],
  responses: readonly ExamResponse[],
  unitOfKc: ReadonlyMap<KcId, ExamUnitRef>,
): ExamResult {
  const allowedMs = blueprint.minutes * 60_000;
  const timing = findTiming(allowedMs, responses, served.length);

  // Weighted by `kcRefs` for the same reason Elo is: an item that is 70% one
  // component and 30% another is evidence about both, in that proportion.
  const kcTally = new Map<KcId, ExamKcResult>();
  const bump = (kcId: KcId, weight: number, correct: boolean, atBell: boolean): void => {
    const entry = kcTally.get(kcId) ?? {
      kcId,
      asked: 0,
      correct: 0,
      correctAtBell: 0,
      askedAtBell: 0,
      score: 0,
    };
    entry.asked += weight;
    if (correct) entry.correct += weight;
    if (atBell) {
      entry.askedAtBell += weight;
      if (correct) entry.correctAtBell += weight;
    }
    kcTally.set(kcId, entry);
  };

  for (const response of responses) {
    const atBell = response.atElapsedMs <= allowedMs;
    for (const ref of response.kcRefs) bump(ref.kc, ref.weight, response.correct, atBell);
  }

  // Items never reached count against the bell score — leaving a question blank
  // is not the same as not having been asked it, and on the real paper it is
  // worth zero.
  const answeredIds = new Set(responses.map((r) => r.itemId));
  const unreached = served.filter((s) => !answeredIds.has(s.itemId));
  for (const item of unreached) bump(item.kcId, 1, false, true);

  for (const entry of kcTally.values()) {
    entry.score = entry.asked > 0 ? entry.correct / entry.asked : 0;
  }

  // Everything reported back is restricted to the exam's own scope.
  //
  // An item is evidence about every component its `kcRefs` name, and those
  // reach outside the paper: a chapter 12 question weighted 0.8 s-domain and
  // 0.2 frequency response is a perfectly good item and says a little about
  // frequency response, which is not on this exam. Left in, the breakdown
  // grows rows for units the paper never examined and scores them off a
  // fragment of one answer — "Frequency Response 100%" from a 0.2 weight,
  // sitting in a list the learner reads as what the exam covered.
  //
  // The evidence is not discarded: the full weighted tally stays in `byKc`,
  // and the learner model replays from the attempt log rather than from this,
  // so those components still move. It is only the *report* that is held to
  // the exam's scope, because that is what the report claims to be about.
  const inScope = new Set(blueprint.kcIds);
  const scopedUnits = new Set(blueprint.units.map((ref) => `${ref.course}\u0000${ref.unit}`));

  const unitTally = new Map<string, ExamUnitResult>();
  for (const entry of kcTally.values()) {
    const ref = unitOfKc.get(entry.kcId);
    if (!ref) continue;
    const key = `${ref.course}\u0000${ref.unit}`;
    if (!scopedUnits.has(key)) continue;
    const unit = unitTally.get(key) ?? { ...ref, asked: 0, correct: 0, score: 0 };
    unit.asked += entry.asked;
    unit.correct += entry.correct;
    unitTally.set(key, unit);
  }
  for (const unit of unitTally.values()) {
    unit.score = unit.asked > 0 ? unit.correct / unit.asked : 0;
  }

  const misconceptionTally = new Map<MisconceptionId, number>();
  for (const response of responses) {
    for (const id of response.misconceptions) {
      misconceptionTally.set(id, (misconceptionTally.get(id) ?? 0) + 1);
    }
  }

  const correctAtBell = responses.filter((r) => r.correct && r.atElapsedMs <= allowedMs).length;
  const correctOverall = responses.filter((r) => r.correct).length;

  const byKc = [...kcTally.values()].sort((a, b) => a.kcId.localeCompare(b.kcId));

  return {
    examId: blueprint.id,
    course: blueprint.course,
    title: blueprint.title,
    served: served.length,
    timing,
    scoreAtBell: served.length > 0 ? correctAtBell / served.length : 0,
    scoreOverall: served.length > 0 ? correctOverall / served.length : 0,
    byKc,
    byUnit: [...unitTally.values()].sort((a, b) => a.score - b.score || a.unit.localeCompare(b.unit)),
    misconceptions: [...misconceptionTally.entries()]
      .map(([misconceptionId, count]) => ({ misconceptionId, count }))
      .sort((a, b) => b.count - a.count || a.misconceptionId.localeCompare(b.misconceptionId)),
    weakest: byKc
      .filter((k) => inScope.has(k.kcId) && k.asked > 0 && k.score < EXAM_WEAK_THRESHOLD)
      .sort((a, b) => a.score - b.score || b.asked - a.asked || a.kcId.localeCompare(b.kcId)),
  };
}
