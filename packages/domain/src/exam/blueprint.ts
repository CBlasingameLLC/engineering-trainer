import type { Kc, KcId } from '../types.js';

/**
 * Exams, as the thing the rest of the term is measured against.
 *
 * `session/term.ts` answers "what is being covered, and what does it lean on".
 * This file answers "what is being *tested*, and when", and the two are not the
 * same list. A unit can be live all month and never examined; a unit finished
 * three weeks ago can be half of Monday's paper. Only the exam says which.
 *
 * The shapes mirror `@et/content-schema`'s term contract structurally rather
 * than importing it, for the same reason the rest of this package does: the
 * mastery model stays verifiable without a bundler, a content directory or any
 * I/O. Unit references arrive already resolved to `{course, unit}` pairs —
 * the `COURSE:Unit` notation is parsed once, on load, and never here.
 */

/** A unit reference resolved to the course whose graph owns it. */
export interface ExamUnitRef {
  course: string;
  unit: string;
}

export interface TermExamInput {
  id: string;
  title: string;
  /** `YYYY-MM-DD`. */
  on: string;
  units: readonly ExamUnitRef[];
  minutes?: number | undefined;
  scope?: string | undefined;
  cumulative: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How many calendar days until a date, from the point of view of someone
 * standing in their own timezone.
 *
 * Both sides are reduced to a whole-day index before subtracting, and they have
 * to be reduced *differently*: the exam is a bare calendar date with no
 * timezone at all, while `now` is an instant that must be read as the local
 * day it falls on. Subtracting the raw milliseconds instead — the obvious
 * version, and what the week arithmetic elsewhere in this package gets away
 * with — puts anyone west of UTC a day out for most of their waking hours. A
 * week being off by a few hours rounds away; "your exam is in 2 days" turning
 * into 3 does not, and it is the number every urgency figure in the app is
 * built on.
 */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const target = Math.floor(Date.parse(`${iso}T00:00:00Z`) / MS_PER_DAY);
  const today = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / MS_PER_DAY);
  return target - today;
}

/**
 * How long an exam runs when its syllabus never said.
 *
 * Most syllabi state a duration for the final and for nothing else, so this is
 * the common case rather than the exceptional one. A standard lecture period
 * is the right guess, and `minutesAssumed` carries the fact that it *is* a
 * guess all the way to the screen — an invented number presented as though it
 * were read off a document is the failure mode this repository keeps finding.
 */
export const DEFAULT_EXAM_MINUTES = 75;

export interface ExamBlueprint {
  /** `EE3300:exam-1` — unique across the term, since exam ids repeat per course. */
  id: string;
  course: string;
  title: string;
  on: string;
  /** Calendar days from now. Negative once the exam is past. */
  daysAway: number;
  minutes: number;
  /** True when `minutes` is the default rather than something a syllabus stated. */
  minutesAssumed: boolean;
  scope?: string | undefined;
  cumulative: boolean;
  units: readonly ExamUnitRef[];
  /** Every knowledge component the scope resolves to. */
  kcIds: KcId[];
  /** Scope entries that resolved to no components at all. */
  unitsWithoutKcs: ExamUnitRef[];
}

export interface TermCourseExams {
  course: string;
  exams: readonly TermExamInput[];
}

const unitKey = (course: string, unit: string): string => `${course}\u0000${unit}`;

/** Resolve every exam on the term against the knowledge graph. */
export function examBlueprints(
  courses: readonly TermCourseExams[],
  kcs: Iterable<Kc>,
  now: Date = new Date(),
): ExamBlueprint[] {
  const byUnit = new Map<string, KcId[]>();
  for (const kc of kcs) {
    const key = unitKey(kc.courseId, kc.unit);
    const list = byUnit.get(key);
    if (list) list.push(kc.id);
    else byUnit.set(key, [kc.id]);
  }

  const out: ExamBlueprint[] = [];
  for (const course of courses) {
    for (const exam of course.exams) {
      const kcIds: KcId[] = [];
      const unitsWithoutKcs: ExamUnitRef[] = [];
      for (const ref of exam.units) {
        const found = byUnit.get(unitKey(ref.course, ref.unit));
        if (!found || found.length === 0) unitsWithoutKcs.push(ref);
        else kcIds.push(...found);
      }

      out.push({
        id: `${course.course}:${exam.id}`,
        course: course.course,
        title: exam.title,
        on: exam.on,
        daysAway: daysUntil(exam.on, now),
        minutes: exam.minutes ?? DEFAULT_EXAM_MINUTES,
        minutesAssumed: exam.minutes === undefined,
        ...(exam.scope === undefined ? {} : { scope: exam.scope }),
        cumulative: exam.cumulative,
        units: exam.units,
        kcIds: [...new Set(kcIds)],
        unitsWithoutKcs,
      });
    }
  }

  return out.sort((a, b) => a.on.localeCompare(b.on) || a.id.localeCompare(b.id));
}

/**
 * Exams still ahead, soonest first.
 *
 * An exam sat today counts as ahead until the day is over. Dropping it at
 * midnight on the morning of would remove the one thing worth showing on the
 * one day it matters most.
 */
export const upcomingExams = (blueprints: readonly ExamBlueprint[]): ExamBlueprint[] =>
  blueprints.filter((b) => b.daysAway >= 0);

export const pastExams = (blueprints: readonly ExamBlueprint[]): ExamBlueprint[] =>
  blueprints.filter((b) => b.daysAway < 0).reverse();
