import { useMemo, useState } from 'react';
import type { CourseGrade } from '@et/domain';
import { useApp } from '@/store';
import type { CompletedCourse } from '@/storage/types';

/**
 * Onboarding.
 *
 * Asks for the grade and the term a course ended, not just a checkbox. Both
 * matter: the grade sets the initial belief, and the end date is what the
 * retention model decays from. "I took Circuits I" without a date cannot
 * distinguish last spring from three years ago, which is the entire question.
 */

const GRADES: CourseGrade[] = ['A', 'B', 'C', 'unknown'];

const TERMS = ['2026 Spring', '2025 Fall', '2025 Spring', '2024 Fall', '2024 Spring'] as const;

/** Approximate end date of a term, good enough for a decay curve measured in months. */
function termEndDate(term: string): string {
  const [year, season] = term.split(' ');
  const month = season === 'Spring' ? '05' : '12';
  return `${year}-${month}-15T00:00:00.000Z`;
}

export function Onboarding(): React.ReactElement {
  const courses = useApp((s) => s.content?.courses ?? []);
  const complete = useApp((s) => s.completeOnboarding);

  const [selected, setSelected] = useState<Record<string, { grade: CourseGrade; term: string }>>({});
  const [targetTerm, setTargetTerm] = useState('2026 Fall');

  const chosen = useMemo(
    (): CompletedCourse[] =>
      Object.entries(selected).map(([code, v]) => ({
        code,
        grade: v.grade,
        completedAt: termEndDate(v.term),
      })),
    [selected],
  );

  const toggle = (code: string): void =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[code]) delete next[code];
      else next[code] = { grade: 'B', term: '2026 Spring' };
      return next;
    });

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-slate-900">What have you already taken?</h1>
      <p className="mt-2 max-w-xl text-sm text-slate-600">
        Grades set the starting belief; the term sets how long it has had to fade. A course finished
        last spring and one finished two years ago are very different starting points, and the
        placement exam is calibrated from both.
      </p>

      <div className="mt-8 space-y-2">
        {courses.map((course) => {
          const entry = selected[course.code];
          return (
            <div key={course.code} className="card p-4">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={Boolean(entry)}
                  onChange={() => toggle(course.code)}
                  className="h-4 w-4 rounded border-slate-300"
                  aria-label={`${course.code} ${course.title}`}
                />
                <span className="font-mono text-sm text-slate-500">{course.code}</span>
                <span className="text-sm font-medium text-slate-900">{course.title}</span>
                <span className="ml-auto text-xs text-slate-400">{course.kcs.length} concepts</span>
              </label>

              {entry && (
                <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3 pl-7">
                  <label className="flex items-center gap-2 text-sm">
                    <span className="label">Grade</span>
                    <select
                      value={entry.grade}
                      onChange={(e) =>
                        setSelected((p) => ({ ...p, [course.code]: { ...entry, grade: e.target.value as CourseGrade } }))
                      }
                      className="rounded border border-slate-300 px-2 py-1 text-sm"
                    >
                      {GRADES.map((g) => (
                        <option key={g} value={g}>
                          {g === 'unknown' ? 'not sure' : g}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="label">Finished</span>
                    <select
                      value={entry.term}
                      onChange={(e) => setSelected((p) => ({ ...p, [course.code]: { ...entry, term: e.target.value } }))}
                      className="rounded border border-slate-300 px-2 py-1 text-sm"
                    >
                      {TERMS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex items-center gap-4 border-t border-slate-200 pt-6">
        <label className="flex items-center gap-2 text-sm">
          <span className="label">Preparing for</span>
          <input
            value={targetTerm}
            onChange={(e) => setTargetTerm(e.target.value)}
            className="w-36 rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <button className="btn-primary ml-auto" onClick={() => void complete(chosen, targetTerm)}>
          {chosen.length === 0 ? 'Start fresh' : `Continue with ${chosen.length} course(s)`}
        </button>
      </div>
    </div>
  );
}
