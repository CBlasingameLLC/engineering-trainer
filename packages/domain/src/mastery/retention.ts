import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from 'ts-fsrs';
import type { Attempt } from '../types.js';

/**
 * FSRS layer — answers "is it still there?"
 *
 * This is the half of the model a gradebook cannot see. BKT says a KC was
 * learned; FSRS says how much of it survives today. The gap between those two
 * numbers is the product.
 */

export interface RetentionState {
  card: Card;
}

const scheduler = fsrs(generatorParameters({ enable_fuzz: false }));

export const newRetention = (now: Date = new Date()): RetentionState => ({
  card: createEmptyCard(now),
});

export interface GradeInputs {
  correct: boolean;
  latencyMs: number;
  hintsUsed: number;
  /** Rolling median latency for this KC; used to judge fluency, not just accuracy. */
  medianLatencyMs?: number;
}

/**
 * Map a graded attempt onto an FSRS rating.
 *
 * Fluency matters: a correct answer that took three times as long as usual, or
 * needed a hint, is weaker evidence of retention than a fast clean one, and
 * scheduling it as if it were identical would push the next review too far out.
 */
export function gradeFromAttempt(input: GradeInputs): Grade {
  if (!input.correct) return Rating.Again;
  if (input.hintsUsed > 0) return Rating.Hard;

  const median = input.medianLatencyMs;
  if (median && median > 0) {
    if (input.latencyMs > 2 * median) return Rating.Hard;
    if (input.latencyMs < 0.6 * median) return Rating.Easy;
  }
  return Rating.Good;
}

/** Advance the retention state by one review. */
export function reviewRetention(
  state: RetentionState,
  grade: Grade,
  now: Date = new Date(),
): RetentionState {
  return { card: scheduler.next(state.card, now, grade).card };
}

/**
 * Retrievability R(t) in [0,1]: the probability of successful recall right now.
 * A brand-new card has no memory to decay, so it reports 0 rather than 1.
 */
export function retrievability(state: RetentionState, now: Date = new Date()): number {
  const r = scheduler.get_retrievability(state.card, now, false);
  return typeof r === 'number' ? r : 0;
}

export const dueAt = (state: RetentionState): Date => state.card.due;

export const isDue = (state: RetentionState, now: Date = new Date()): boolean =>
  state.card.due.getTime() <= now.getTime();

/** Memory stability in days — how slowly this KC decays. */
export const stability = (state: RetentionState): number => state.card.stability;

/**
 * Prior strength a completed course confers, keyed on the grade earned.
 *
 * Nothing here is observed by the app — the learner simply tells us they passed
 * EE 2300 last spring. The honest model of that is ONE distant learning event,
 * not a review history.
 *
 * This matters more than it looks. Synthesising a plausible-looking series of
 * study sessions and feeding it to FSRS inflates stability enormously (a
 * semester of fabricated reviews yields S ~ 270 days, so a year-old
 * prerequisite reports R ~ 0.88 and looks perfectly retained). FSRS grows
 * stability when a *scheduled* interval is met, and classroom practice is
 * massed, not scheduled. Seeding a single event yields S of 1-8 days and
 * R ~ 0.44-0.58 at nine months, which is the honest read on untouched
 * coursework — and it lets the placement exam supply the first real retrieval
 * evidence instead of arguing with a fiction.
 */
export type CourseGrade = 'A' | 'B' | 'C' | 'unknown';

const GRADE_TO_RATING: Record<CourseGrade, Grade> = {
  A: Rating.Easy,
  B: Rating.Good,
  C: Rating.Hard,
  unknown: Rating.Good,
};

/** BKT prior implied by having passed the course with a given grade. */
export const GRADE_TO_PRIOR: Record<CourseGrade, number> = {
  A: 0.85,
  B: 0.7,
  C: 0.55,
  unknown: 0.65,
};

/**
 * Seed retention for a KC from a course the learner completed before using the
 * app. Represents exactly what is known: one demonstrated recall, long ago.
 */
export function seedFromCourseCompletion(
  completedAt: Date,
  grade: CourseGrade = 'unknown',
): RetentionState {
  return reviewRetention(newRetention(completedAt), GRADE_TO_RATING[grade], completedAt);
}

export const applyAttemptToRetention = (
  state: RetentionState,
  attempt: Attempt,
  medianLatencyMs?: number,
): RetentionState =>
  reviewRetention(
    state,
    gradeFromAttempt({
      correct: attempt.correct,
      latencyMs: attempt.latencyMs,
      hintsUsed: attempt.hintsUsed,
      medianLatencyMs,
    }),
    attempt.at,
  );

export { Rating };
export type { Grade, Card };
