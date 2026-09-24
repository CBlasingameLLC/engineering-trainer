import React, { useMemo } from 'react';
import { termFocus, termLengthWeeks, termReadiness, type ScheduledUnit } from '@et/domain';
import { useApp } from '@/store';
import { currentTerm } from '@/content';
import { DIAGNOSIS_COPY } from '@/ui/bands';

/**
 * The term in progress.
 *
 * Every other view in the app answers "what do you know". This one answers
 * "what do you need to know, and by when", and the difference is the whole
 * reason it exists: the mastery model will keep proposing the most decayed
 * prerequisite in the degree, which is the right answer to its own question and
 * the wrong thing to be shown the week before an exam on something else.
 *
 * The readiness list is the part worth having. "Your integration has faded and
 * the unit that needs it starts in two weeks" is a sentence no syllabus and no
 * gradebook can produce, because it needs both halves — the schedule and the
 * measured decay — and nothing usually holds both.
 */

function whenLabel(startsInWeeks: number): string {
  if (startsInWeeks <= 0) return 'running now';
  if (startsInWeeks === 1) return 'starts next week';
  return `starts in ${startsInWeeks} weeks`;
}

/**
 * A scheduled unit has three states, not two, and the third one used to be
 * invisible.
 *
 * A unit may map to no knowledge components at all — the course is on the term
 * and has no graph yet. It may map to components that carry no items — the
 * graph is written and the bank is not. Or it may be servable.
 *
 * `startKcs` returns silently when the chosen components turn up no items, so
 * the middle case produced a button that looked enabled, did nothing when
 * pressed, and gave no reason. The two empty cases need different sentences
 * because they are different pieces of news: one says the app does not know
 * about this topic, the other says it knows about it and cannot ask about it
 * yet.
 */
function UnitRow(
  { unit, kcs, mappedKcs, onStudy }: {
    unit: ScheduledUnit;
    /** Components that can actually serve an item. This is what the button draws from. */
    kcs: readonly string[];
    /** Every component in the unit, servable or not. The two differ while a graph is ahead of its bank. */
    mappedKcs: readonly string[];
    onStudy: () => void;
  },
): React.ReactElement {
  const reason = kcs.length > 0
    ? undefined
    : mappedKcs.length > 0
      ? 'This unit is in the knowledge map but has no questions in the bank yet'
      : 'No knowledge components map to this unit yet';
  return (
    <li className="flex flex-wrap items-center gap-2 border-t border-slate-100 py-2 first:border-t-0 dark:border-slate-800">
      <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{unit.course}</span>
      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{unit.unit}</span>
      <span className="text-xs text-slate-400 dark:text-slate-500">
        weeks {unit.fromWeek}–{unit.toWeek}
      </span>
      {unit.note && (
        <span className="text-xs italic text-amber-700 dark:text-amber-400">{unit.note}</span>
      )}
      <button
        className="btn-secondary ml-auto text-xs"
        data-testid="study-unit"
        data-course={unit.course}
        data-unit={unit.unit}
        // What this button will actually draw from. Carried on the element
        // because it is the button's payload, which also lets a driver check
        // that a unit session served material from that unit rather than from
        // the whole course — the scoping is the entire point of the control.
        data-kcs={kcs.join(' ')}
        disabled={reason !== undefined}
        title={reason}
        onClick={onStudy}
      >
        Study this
      </button>
      {reason && (
        <span className="w-full text-xs text-slate-400 dark:text-slate-500">{reason}</span>
      )}
    </li>
  );
}

export function Term(): React.ReactElement {
  const content = useApp((s) => s.content);
  const model = useApp((s) => s.model);
  const goTo = useApp((s) => s.goTo);
  const startUnit = useApp((s) => s.startUnit);
  const startKcs = useApp((s) => s.startKcs);

  const term = useMemo(() => (content ? currentTerm(content) : undefined), [content]);

  const focus = useMemo(
    () => (content && term ? termFocus(term, content.graph.kcs.values(), { upcomingWeeks: 4 }) : null),
    [content, term],
  );

  // Two maps, because a unit whose components carry no items is a different
  // state from a unit with no components, and the row says so. The servable
  // map is what the button advertises and draws from, so `data-kcs` cannot
  // promise material the session will not find.
  const { kcsForUnit, mappedKcsForUnit } = useMemo(() => {
    const servable = new Map<string, string[]>();
    const mapped = new Map<string, string[]>();
    if (!content) return { kcsForUnit: servable, mappedKcsForUnit: mapped };

    const withItems = new Set<string>();
    for (const item of content.items) {
      for (const ref of item.kcRefs) withItems.add(ref.kc);
    }

    for (const kc of content.graph.kcs.values()) {
      const key = `${kc.courseId}\u0000${kc.unit}`;
      const into = (map: Map<string, string[]>) => {
        const list = map.get(key);
        if (list) list.push(kc.id);
        else map.set(key, [kc.id]);
      };
      into(mapped);
      if (withItems.has(kc.id)) into(servable);
    }
    return { kcsForUnit: servable, mappedKcsForUnit: mapped };
  }, [content]);

  const readiness = useMemo(
    () => (content && model && focus ? termReadiness(content.graph, model.byKc, focus, { limit: 8 }) : []),
    [content, model, focus],
  );

  if (!content || !term || !focus) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">No term declared</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Add a term document under <code>content/terms/</code> to see what is live this week and which
          prerequisites are not ready for it.
        </p>
        <button className="btn-secondary mt-4" onClick={() => goTo('dashboard')}>Back</button>
      </div>
    );
  }

  const length = termLengthWeeks(term);
  const position = focus.running
    ? `Week ${focus.week} of ${length}`
    : focus.week < 1
      ? 'Not started yet'
      : 'Term finished';

  return (
    <div className="mx-auto max-w-3xl p-6" data-testid="term-view">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{term.title}</h1>
        <span className="text-sm text-slate-500 dark:text-slate-400" data-testid="term-week">{position}</span>
        <button className="btn-secondary ml-auto text-xs" onClick={() => goTo('dashboard')}>Dashboard</button>
      </div>

      {/* The readiness list comes first on purpose. What is live this week is
          something the learner already knows; what has quietly decayed
          underneath what is coming next is not. */}
      <section className="card mt-4 p-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Not ready for what is coming</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Prerequisites of the next four weeks&rsquo; material, ranked by how far they have slipped and how
          soon they are needed.
        </p>
        {readiness.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400" data-testid="readiness-clear">
            Nothing is flagged. Either the prerequisites are in place or there is not enough evidence yet —
            a placement exam settles which.
          </p>
        ) : (
          <ul className="mt-3" data-testid="readiness-list">
            {readiness.map((gap) => {
              const kc = content.graph.kcs.get(gap.kc);
              return (
                <li
                  key={gap.kc}
                  className="flex flex-wrap items-center gap-2 border-t border-slate-100 py-2 first:border-t-0 dark:border-slate-800"
                  data-kc-id={gap.kc}
                >
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${DIAGNOSIS_COPY[gap.diagnosis].chip}`}
                    title={DIAGNOSIS_COPY[gap.diagnosis].detail}
                  >
                    {DIAGNOSIS_COPY[gap.diagnosis].label}
                  </span>
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {kc?.title ?? gap.kc}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {kc?.courseId ?? ''} · needed by {gap.course} {gap.unit}, {whenLabel(gap.startsInWeeks)}
                  </span>
                  <button
                    className="btn-secondary ml-auto text-xs"
                    data-testid="shore-up"
                    onClick={() => startKcs([gap.kc])}
                  >
                    Shore this up
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card mt-4 p-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Covering now</h2>
        {focus.live.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Nothing is scheduled for this week.
          </p>
        ) : (
          <ul className="mt-2" data-testid="live-units">
            {focus.live.map((unit) => (
              <UnitRow
                key={`${unit.course}-${unit.unit}`}
                unit={unit}
                kcs={kcsForUnit.get(`${unit.course}\u0000${unit.unit}`) ?? []}
                mappedKcs={mappedKcsForUnit.get(`${unit.course}\u0000${unit.unit}`) ?? []}
                onStudy={() => startUnit(unit.course, unit.unit)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="card mt-4 p-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Coming up</h2>
        {focus.upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Nothing in the next four weeks.</p>
        ) : (
          <ul className="mt-2" data-testid="upcoming-units">
            {focus.upcoming.map((unit) => (
              <UnitRow
                key={`${unit.course}-${unit.unit}`}
                unit={unit}
                kcs={kcsForUnit.get(`${unit.course}\u0000${unit.unit}`) ?? []}
                mappedKcs={mappedKcsForUnit.get(`${unit.course}\u0000${unit.unit}`) ?? []}
                onStudy={() => startUnit(unit.course, unit.unit)}
              />
            ))}
          </ul>
        )}
      </section>

      {content.termCoursesWithoutGraph.length > 0 && (
        // Said out loud rather than quietly omitted. A course on the term that
        // the app knows nothing about is a real state of affairs, and a term
        // view that hid it would be disagreeing with the term.
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400" data-testid="courses-without-graph">
          On your term but not yet mapped: {content.termCoursesWithoutGraph.join(', ')}. These have no
          knowledge components, so nothing above accounts for them.
        </p>
      )}
    </div>
  );
}
