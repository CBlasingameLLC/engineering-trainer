import { useMemo } from 'react';
import {
  DEFAULT_MISCONCEPTION_CONFIG,
  diagnosableMisconceptions,
  rankMisconceptions,
  rollUpFamilies,
  type MisconceptionTrend,
  type RankedMisconception,
} from '@et/domain';
import { drillCandidates } from '@/content';
import { useApp } from '@/store';
import { MathText } from '@/ui/Math';

/**
 * The misconception feed.
 *
 * Every wrong answer has carried a diagnosis since the first placement exam —
 * distractors and traps name the specific error that produces them, and those
 * tags were recorded and stored. Nothing read them, which meant the app could
 * say "you missed nine questions" and never "you drop signs", although it held
 * the evidence for the second all along.
 *
 * The ordering principle is that a habit outranks an incident. An error seen
 * under six topics is worth more attention than one seen six times under one,
 * and an error last seen in March is worth none at all however often it
 * happened — so the feed is sorted by recency-weighted frequency scaled by
 * spread, not by a raw count.
 */

const TREND_STYLE: Record<MisconceptionTrend, { label: string; className: string }> = {
  new: { label: 'new', className: 'bg-slate-100 text-slate-600' },
  worsening: { label: 'getting worse', className: 'bg-red-50 text-red-700' },
  steady: { label: 'steady', className: 'bg-slate-100 text-slate-600' },
  fading: { label: 'fading', className: 'bg-emerald-50 text-emerald-700' },
};

export function Misconceptions(): React.ReactElement {
  const content = useApp((s) => s.content);
  const events = useApp((s) => s.misconceptionEvents);
  const lastDrill = useApp((s) => s.lastDrill);
  const startDrill = useApp((s) => s.startDrill);
  const goTo = useApp((s) => s.goTo);

  const ranked = useMemo(
    () => rankMisconceptions(events.map((e) => ({ ...e, at: new Date(e.at) }))),
    [events],
  );

  const families = useMemo(
    () => (content ? rollUpFamilies(ranked, content.misconceptionFamilies) : []),
    [ranked, content],
  );

  // Which errors the bank can actually build a drill for. An offer that leads
  // to an empty session is worse than no offer.
  const drillable = useMemo(
    () => (content ? diagnosableMisconceptions(drillCandidates(content.items)) : new Set<string>()),
    [content],
  );

  const titleOf = (id: string): string => content?.misconceptionTitles.get(id) ?? id;

  // The most recent explanation the learner actually saw for this error. Better
  // than a generic remediation card, because it names the number they wrote.
  const feedbackFor = useMemo(() => {
    const byMisconception = new Map<string, string>();
    for (const item of content?.items ?? []) {
      for (const trap of item.misconceptionTraps) {
        if (!byMisconception.has(trap.misconception)) byMisconception.set(trap.misconception, trap.feedback);
      }
      for (const option of item.options) {
        if (option.misconception && option.rationale && !byMisconception.has(option.misconception)) {
          byMisconception.set(option.misconception, option.rationale);
        }
      }
    }
    return byMisconception;
  }, [content]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="flex items-baseline gap-4">
        <h1 className="text-lg font-semibold text-slate-900">Recurring errors</h1>
        <button className="text-sm text-slate-500 hover:text-slate-900" onClick={() => goTo('dashboard')}>
          Back to dashboard
        </button>
      </header>

      {lastDrill && (
        <section
          className="mt-4 rounded-md border border-slate-200 bg-white p-4"
          data-testid="drill-result"
        >
          <h2 className="text-sm font-medium text-slate-900">
            Drill finished — {titleOf(lastDrill.misconceptionId)}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {lastDrill.correct} of {lastDrill.asked} correct.{' '}
            {lastDrill.refired === 0 ? (
              <span className="text-emerald-700">
                The error did not reappear once. That is the result worth having — every item in a
                drill is one that <em>could</em> have caught it.
              </span>
            ) : (
              <span className="text-amber-800">
                It reappeared {lastDrill.refired} time{lastDrill.refired === 1 ? '' : 's'}. Worth
                another pass.
              </span>
            )}
          </p>
        </section>
      )}

      {ranked.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">
          No recurring errors recorded yet. Wrong answers get tagged with the specific mistake that
          produces them, so this fills in as you work — and stays empty if nothing repeats.
        </p>
      ) : (
        <>
          {families.some((f) => f.crossCourse) && (
            <section className="mt-6" data-testid="habit-rollup">
              <h2 className="text-sm font-medium text-slate-900">Habits crossing course boundaries</h2>
              <p className="mt-1 text-xs text-slate-500">
                The same mistake in more than one course is one habit, not several problems. This is
                the view a gradebook cannot produce.
              </p>
              <div className="mt-3 space-y-2">
                {families
                  .filter((f) => f.crossCourse)
                  .map((family) => (
                    <div
                      key={family.family.id}
                      className="rounded-md border border-amber-200 bg-amber-50 p-3"
                      data-family-id={family.family.id}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-amber-900">{family.family.title}</span>
                        <span className="text-xs text-amber-700">
                          {family.totalHits} across {family.courses.map((c) => c.toUpperCase()).join(', ')}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-amber-800">{family.family.description}</p>
                    </div>
                  ))}
              </div>
            </section>
          )}

          <section className="mt-8">
            <h2 className="text-sm font-medium text-slate-900">Ranked by what is costing you now</h2>
            <ul className="mt-3 space-y-3">
              {ranked.map((entry) => (
                <MisconceptionCard
                  key={entry.misconceptionId}
                  entry={entry}
                  title={titleOf(entry.misconceptionId)}
                  familyTitle={content?.misconceptionFamilies.get(entry.misconceptionId)?.title}
                  feedback={feedbackFor.get(entry.misconceptionId)}
                  canDrill={drillable.has(entry.misconceptionId)}
                  onDrill={() => startDrill(entry.misconceptionId)}
                />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

interface CardProps {
  entry: RankedMisconception;
  title: string;
  familyTitle: string | undefined;
  feedback: string | undefined;
  canDrill: boolean;
  onDrill: () => void;
}

function MisconceptionCard({
  entry, title, familyTitle, feedback, canDrill, onDrill,
}: CardProps): React.ReactElement {
  const trend = TREND_STYLE[entry.trend];

  return (
    <li className="card p-4" data-misconception-id={entry.misconceptionId}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-medium text-slate-900">{title}</span>
        {familyTitle && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{familyTitle}</span>
        )}
        <span className={`rounded px-1.5 py-0.5 text-xs ${trend.className}`}>{trend.label}</span>
        {entry.drillDue && (
          <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-800">drill due</span>
        )}
      </div>

      <p className="mt-1 text-xs text-slate-500">
        {entry.totalHits} time{entry.totalHits === 1 ? '' : 's'} total, {entry.recentHits} in the last{' '}
        {DEFAULT_MISCONCEPTION_CONFIG.windowDays} days · {entry.kcs.length} topic
        {entry.kcs.length === 1 ? '' : 's'}
        {entry.crossCourse ? ` · ${entry.courses.map((c) => c.toUpperCase()).join(' and ')}` : ''}
      </p>

      {feedback && (
        <MathText className="mt-2 block text-sm leading-relaxed text-slate-700">{feedback}</MathText>
      )}

      <div className="mt-3">
        {canDrill ? (
          <button className="btn-primary text-sm" onClick={onDrill}>
            Drill this
          </button>
        ) : (
          <p className="text-xs text-slate-400">
            No items in the bank can currently catch this error, so a drill would not be able to tell
            you whether it is fixed.
          </p>
        )}
      </div>
    </li>
  );
}
