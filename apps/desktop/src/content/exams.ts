import {
  examBlueprints,
  type ExamBlueprint,
  type ExamCandidate,
  type ExamUnitRef,
  type TermCourseExams,
} from '@et/domain';
import { examUnits, type Term } from '@et/content-schema';
import type { Item } from '@et/content-schema';
import type { LoadedContent } from './index.js';

/**
 * The join between the term document and the exam engine.
 *
 * `packages/domain` mirrors the term's shape rather than importing the content
 * contract, so something has to translate — and this is the only place that
 * does. In particular the `COURSE:Unit` notation on an exam scope is resolved
 * here, by `examUnits` from the schema package, and never again downstream:
 * the domain receives `{course, unit}` pairs that are already correct.
 */

export function termCourseExams(term: Term): TermCourseExams[] {
  return term.courses
    .filter((course) => course.exams.length > 0)
    .map((course) => ({
      course: course.course,
      exams: course.exams.map((exam) => ({
        id: exam.id,
        title: exam.title,
        on: exam.on,
        units: examUnits(course.course, exam),
        minutes: exam.minutes,
        scope: exam.scope,
        cumulative: exam.cumulative,
      })),
    }));
}

export function examsForTerm(
  content: LoadedContent,
  term: Term | undefined,
  now: Date = new Date(),
): ExamBlueprint[] {
  if (!term) return [];
  return examBlueprints(termCourseExams(term), [...content.graph.kcs.values()], now);
}

/** Which unit owns each knowledge component, for scoping and for reporting. */
export function unitOfKcMap(content: LoadedContent): Map<string, ExamUnitRef> {
  const map = new Map<string, ExamUnitRef>();
  for (const kc of content.graph.kcs.values()) {
    map.set(kc.id, { course: kc.courseId, unit: kc.unit });
  }
  return map;
}

/**
 * Items eligible to sit on a paper, filed under their highest-weighted
 * component.
 *
 * The same rule `generatorsForCourse` uses, and for the same reason: an item
 * that is 80% one component and 20% another is a question about the first, and
 * filing it under both would let one question count as coverage of two topics.
 */
export function examCandidates(items: readonly Item[], inScope: ReadonlySet<string>): ExamCandidate[] {
  const out: ExamCandidate[] = [];
  for (const item of items) {
    const primary = [...item.kcRefs].sort((a, b) => b.weight - a.weight)[0];
    if (!primary || !inScope.has(primary.kc)) continue;
    out.push({ itemId: item.id, kcId: primary.kc, difficultyB: item.difficultyB });
  }
  return out;
}
