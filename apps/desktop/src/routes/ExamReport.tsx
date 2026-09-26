import { useMemo } from 'react';
import type { ExamResult, TimeFinding } from '@et/domain';
import { useApp } from '@/store';
import { Countdown, DataRow, Empty, Meter, Panel, Rule, Stat } from '@/ui/shell';

/**
 * What a sat paper produced.
 *
 * The screen is built around the two scores, because they are the finding. A
 * single percentage cannot distinguish someone who knew eighteen of thirty
 * from someone who knew twenty-six and reached eighteen, and those two people
 * should spend the weekend doing completely different things. Showing them
 * side by side, with the gap named, is the whole reason the clock is allowed
 * to expire without ending the sitting.
 */

const pct = (v: number): string => `${Math.round(v * 100)}%`;
/**
 * A duration, in whichever unit does not round it away.
 *
 * Minutes alone report a three-minute sitting as "0m of 75m", which reads as a
 * bug rather than as a fast run — and the one figure a pace finding rests on
 * should never round to zero.
 */
const mins = (ms: number): string =>
  ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))}s` : `${Math.round(ms / 60_000)}m`;

function timeNote(result: ExamResult): { headline: string; detail: string; tone: 'accent' | 'warn' | 'danger' | 'dim' } {
  const { timing } = result;
  const spare = Math.max(0, timing.allowedMs - timing.usedMs);
  const over = Math.max(0, timing.usedMs - timing.allowedMs);

  const notes: Record<TimeFinding, { headline: string; detail: string; tone: 'accent' | 'warn' | 'danger' | 'dim' }> = {
    'not-attempted': {
      headline: 'Not attempted',
      detail: 'Nothing was answered, so there is no result to read. An unstarted paper is not a failed one.',
      tone: 'dim',
    },
    'finished-early': {
      headline: `Finished with ${mins(spare)} to spare`,
      detail:
        'Pace is not the constraint here. Whatever this paper found is about the material, and you can afford to spend longer checking work on the day.',
      tone: 'accent',
    },
    'finished-in-time': {
      headline: 'Finished inside the time',
      detail:
        `Used ${mins(timing.usedMs)} of ${mins(timing.allowedMs)}. There is not much slack, so anything that slows you down on the day comes straight out of the last question.`,
      tone: 'accent',
    },
    'ran-over': {
      headline: `${timing.overtime} question${timing.overtime === 1 ? '' : 's'} landed after the bell`,
      detail:
        `Those ${timing.overtime} would have been blank on the real paper. You are running at about ${mins(timing.msPerItemInTime)} a question against a budget of ${mins(timing.msPerItemAllowed)}.`,
      tone: 'warn',
    },
    'ran-over-badly': {
      headline: `${timing.overtime} of ${result.served} questions landed after the bell`,
      detail:
        `You went ${mins(over)} past the time. At ${mins(timing.msPerItemInTime)} a question against a ${mins(timing.msPerItemAllowed)} budget, pace is costing more marks here than the material is.`,
      tone: 'danger',
    },
  };
  return notes[timing.finding];
}

function ResultBlock({ result }: { result: ExamResult }): React.ReactElement {
  const content = useApp((s) => s.content);
  const startKcs = useApp((s) => s.startKcs);
  const note = timeNote(result);

  const titleOf = (kcId: string): string => content?.graph.kcs.get(kcId)?.title ?? kcId;
  const gap = result.scoreOverall - result.scoreAtBell;

  return (
    <div className="space-y-4" data-testid={`exam-result-${result.examId}`}>
      <Panel
        title={`${result.course} ${result.title}`}
        right={<span className="tabular font-mono text-[11px] text-ink-faint">{result.served} questions</span>}
      >
        <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
          <div className="px-4 py-3">
            <Stat
              value={pct(result.scoreAtBell)}
              label="Scored at the bell"
              tone={result.scoreAtBell >= 0.7 ? 'accent' : result.scoreAtBell >= 0.5 ? 'warn' : 'danger'}
              sub="what the paper was worth"
            />
            <Meter
              className="mt-2"
              value={result.scoreAtBell}
              tone={result.scoreAtBell >= 0.7 ? 'mastered' : result.scoreAtBell >= 0.5 ? 'developing' : 'gap'}
            />
          </div>
          <div className="px-4 py-3">
            <Stat
              value={pct(result.scoreOverall)}
              label="Known overall"
              tone={result.scoreOverall >= 0.7 ? 'accent' : result.scoreOverall >= 0.5 ? 'warn' : 'danger'}
              sub="counting answers after time"
            />
            <Meter
              className="mt-2"
              value={result.scoreOverall}
              tone={result.scoreOverall >= 0.7 ? 'mastered' : result.scoreOverall >= 0.5 ? 'developing' : 'gap'}
            />
          </div>
        </div>

        <div className="border-b border-line px-4 py-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <span
              className={`font-mono text-[13px] font-semibold ${
                note.tone === 'danger' ? 'text-danger'
                  : note.tone === 'warn' ? 'text-warn'
                  : note.tone === 'accent' ? 'text-accent'
                  : 'text-ink-dim'
              }`}
            >
              {note.headline}
            </span>
            {gap > 0.01 ? (
              <span className="label">
                {pct(gap)} of this paper was knowledge you have and did not get credit for
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-ink-dim">{note.detail}</p>
        </div>

        <DataRow
          entries={[
            { label: 'Answered', value: `${result.timing.answered}/${result.served}` },
            { label: 'In time', value: result.timing.inTime },
            {
              label: 'After the bell',
              value: result.timing.overtime,
              tone: result.timing.overtime > 0 ? 'warn' : 'default',
            },
            { label: 'Time used', value: mins(result.timing.usedMs) },
            { label: 'Allowed', value: mins(result.timing.allowedMs) },
          ]}
        />
      </Panel>

      {result.byUnit.length > 0 ? (
        <div>
          <Rule>By unit</Rule>
          <Panel>
            {result.byUnit.map((unit) => (
              <div
                key={`${unit.course}-${unit.unit}`}
                className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[12px] text-ink">{unit.unit}</div>
                  <div className="label mt-0.5">{unit.course}</div>
                </div>
                <div className="w-28 shrink-0">
                  <Meter
                    value={unit.score}
                    tone={unit.score >= 0.7 ? 'mastered' : unit.score >= 0.5 ? 'developing' : 'gap'}
                  />
                </div>
                <span
                  className={`tabular w-10 shrink-0 text-right font-mono text-[12px] ${
                    unit.score >= 0.7 ? 'text-accent' : unit.score >= 0.5 ? 'text-warn' : 'text-danger'
                  }`}
                >
                  {pct(unit.score)}
                </span>
              </div>
            ))}
          </Panel>
        </div>
      ) : null}

      {result.weakest.length > 0 ? (
        <div>
          <Rule right="worst first">Work queue</Rule>
          <Panel>
            {result.weakest.slice(0, 10).map((kc) => (
              <div key={kc.kcId} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-ink">{titleOf(kc.kcId)}</div>
                  <div className="label mt-0.5 truncate">{kc.kcId}</div>
                </div>
                <span className="tabular shrink-0 font-mono text-[11px] text-ink-faint">
                  {kc.correct.toFixed(1)}/{kc.asked.toFixed(1)}
                </span>
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  onClick={() => startKcs([kc.kcId])}
                >
                  Drill
                </button>
              </div>
            ))}
            {result.weakest.length > 0 ? (
              <div className="border-t border-line px-3 py-2">
                <button
                  type="button"
                  className="btn-primary"
                  data-testid="drill-all-weak"
                  onClick={() => startKcs(result.weakest.slice(0, 10).map((k) => k.kcId))}
                >
                  Practise all {Math.min(10, result.weakest.length)}
                </button>
              </div>
            ) : null}
          </Panel>
        </div>
      ) : (
        <Panel title="Work queue">
          <Empty>Nothing on this paper fell below the mark.</Empty>
        </Panel>
      )}

      {result.misconceptions.length > 0 ? (
        <div>
          <Rule>Errors this paper caught</Rule>
          <Panel>
            {result.misconceptions.map((m) => (
              <div
                key={m.misconceptionId}
                className="flex items-center gap-3 border-b border-line px-3 py-1.5 last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-dim">
                  {m.misconceptionId}
                </span>
                <span className="tabular shrink-0 font-mono text-[11px] text-warn">×{m.count}</span>
              </div>
            ))}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}

export function ExamReport(): React.ReactElement {
  const outcome = useApp((s) => s.lastPaper);
  const blueprints = useApp((s) => s.examBlueprints)();
  const goTo = useApp((s) => s.goTo);

  const dates = useMemo(
    () => new Map(blueprints.map((b) => [b.id, b.daysAway])),
    [blueprints],
  );

  if (!outcome || outcome.results.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-6">
        <Panel title="No paper sat yet">
          <Empty>
            Run a diagnostic first.
            <div className="mt-3">
              <button type="button" className="btn-primary" onClick={() => goTo('diagnostics')}>
                Diagnostics
              </button>
            </div>
          </Empty>
        </Panel>
      </div>
    );
  }

  const triage = outcome.kind === 'triage';

  return (
    <div className="mx-auto max-w-4xl px-5 py-6" data-testid="exam-report">
      <header className="mb-5">
        <h1 className="font-mono text-[15px] font-semibold uppercase tracking-[0.1em] text-ink">
          {triage ? 'Triage results' : 'Exam result'}
        </h1>
        <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-ink-dim">
          {triage
            ? 'One pass across every exam still ahead. Each block below is scored only against its own paper, so the three are directly comparable — the lowest one is where the next few days belong.'
            : 'Two scores, kept apart on purpose. One is what this paper was worth; the other is what you know. The distance between them is a pace problem rather than a knowledge one, and only the pair can tell you which you have.'}
        </p>
      </header>

      <div className="space-y-8">
        {outcome.results
          .slice()
          .sort((a, b) => (dates.get(a.examId) ?? 0) - (dates.get(b.examId) ?? 0))
          .map((result) => (
            <div key={result.examId}>
              {triage ? (
                <div className="mb-2 flex items-center gap-2">
                  <Countdown days={dates.get(result.examId) ?? 0} />
                  <span className="h-px flex-1 bg-line" />
                </div>
              ) : null}
              <ResultBlock result={result} />
            </div>
          ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => goTo('dashboard')}>
          Briefing
        </button>
        <button type="button" className="btn-secondary" onClick={() => goTo('diagnostics')}>
          Run another
        </button>
        <button type="button" className="btn-secondary" onClick={() => goTo('misconceptions')}>
          Error feed
        </button>
        <button type="button" className="btn-secondary" onClick={() => goTo('report')}>
          Full gap report
        </button>
      </div>
    </div>
  );
}
