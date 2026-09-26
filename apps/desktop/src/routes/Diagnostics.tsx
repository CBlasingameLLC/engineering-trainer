import { useMemo, useState } from 'react';
import { upcomingExams, type ExamBlueprint } from '@et/domain';
import { useApp, examSizeFor, DEFAULT_TRIAGE_SIZE } from '@/store';
import { examCandidates } from '@/content/exams';
import { Countdown, Empty, Panel, Rule } from '@/ui/shell';
import { IconChevron, IconClock, IconTarget } from '@/ui/icons';

/**
 * The diagnostics launcher.
 *
 * There is not one gap-finding test, because "where are my gaps" is not one
 * question. Asked about a degree it wants breadth and adaptive selection;
 * asked about Monday morning it wants the exam's own scope, fixed coverage and
 * a clock. A single placement run answers the first well and the second not at
 * all, which is why this screen offers scopes rather than a button.
 *
 * Each row states what it measures and what it costs, because the honest
 * difference between them is what makes choosing one meaningful.
 */

function ScopeRow({
  title,
  detail,
  items,
  meta,
  action,
  onLaunch,
  disabled,
  warning,
  testId,
}: {
  title: React.ReactNode;
  detail: React.ReactNode;
  items: number;
  meta?: React.ReactNode;
  action: string;
  onLaunch: () => void;
  disabled?: boolean;
  warning?: React.ReactNode;
  testId?: string;
}): React.ReactElement {
  return (
    <div className="border-b border-line px-3 py-2.5 last:border-b-0" data-testid={testId}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] font-semibold text-ink">{title}</span>
            {meta}
          </div>
          <p className="mt-1 text-[12px] leading-snug text-ink-dim">{detail}</p>
          {warning ? (
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-warn">{warning}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="tabular font-mono text-[11px] text-ink-faint">{items} items</span>
          <button
            type="button"
            className="btn-primary"
            onClick={onLaunch}
            disabled={disabled}
            data-testid={testId ? `${testId}-launch` : undefined}
          >
            {action}
            <IconChevron className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Diagnostics(): React.ReactElement {
  const content = useApp((s) => s.content);
  const blueprints = useApp((s) => s.examBlueprints)();
  const startExam = useApp((s) => s.startExam);
  const startTriage = useApp((s) => s.startTriage);
  const startPlacement = useApp((s) => s.startPlacement);
  const goTo = useApp((s) => s.goTo);
  const [picked, setPicked] = useState<string[]>([]);

  const ahead = useMemo(() => upcomingExams(blueprints), [blueprints]);

  // How much of each exam's scope the bank can actually ask about. An exam row
  // that promises 30 items and can serve 4 is worth knowing before sitting it,
  // not after.
  const supply = useMemo(() => {
    const map = new Map<string, { available: number; unitsWithoutItems: string[] }>();
    if (!content) return map;
    for (const exam of blueprints) {
      const candidates = examCandidates(content.items, new Set(exam.kcIds));
      const covered = new Set(candidates.map((c) => c.kcId));
      const missing = exam.units
        .filter((ref) => {
          const kcs = [...content.graph.kcs.values()]
            .filter((kc) => kc.courseId === ref.course && kc.unit === ref.unit);
          return kcs.length === 0 || kcs.every((kc) => !covered.has(kc.id));
        })
        .map((ref) => ref.unit);
      map.set(exam.id, { available: candidates.length, unitsWithoutItems: missing });
    }
    return map;
  }, [content, blueprints]);

  if (!content) return <Empty>Loading…</Empty>;

  const courseCodes = content.courses.map((c) => c.code);
  const selection = picked.length > 0 ? picked : courseCodes;

  const examRow = (exam: ExamBlueprint): React.ReactElement => {
    const stock = supply.get(exam.id);
    const wanted = examSizeFor(exam.minutes);
    const size = Math.min(wanted, stock?.available ?? 0);
    return (
      <ScopeRow
        key={exam.id}
        testId={`exam-${exam.id}`}
        title={`${exam.course} ${exam.title}`}
        meta={
          <>
            <Countdown days={exam.daysAway} />
            <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
              <IconClock className="h-3 w-3" />
              {exam.minutes}m{exam.minutesAssumed ? ' assumed' : ''}
            </span>
            {exam.cumulative ? (
              <span className="label border border-line px-1 py-px">Cumulative</span>
            ) : null}
          </>
        }
        detail={
          <>
            {exam.scope ?? exam.units.map((u) => u.unit).join(' · ')}
            {'. '}
            Timed and sealed — nothing is shown back until you hand in. The clock can run out
            without ending the sitting, and the report separates what the paper scored from what
            you actually know.
          </>
        }
        items={size}
        disabled={size === 0}
        warning={
          stock && stock.unitsWithoutItems.length > 0
            ? `No items yet for ${stock.unitsWithoutItems.join(', ')} — this paper cannot examine ${stock.unitsWithoutItems.length === 1 ? 'it' : 'them'}`
            : undefined
        }
        action="Sit"
        onLaunch={() => startExam(exam.id)}
      />
    );
  };

  return (
    <div className="mx-auto max-w-4xl px-5 py-6">
      <header className="mb-5">
        <div className="flex items-center gap-2">
          <IconTarget className="h-4 w-4 text-accent" />
          <h1 className="font-mono text-[15px] font-semibold uppercase tracking-[0.1em] text-ink">
            Diagnostics
          </h1>
        </div>
        <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-ink-dim">
          Four scopes, four different questions. A triage run tells you which paper is in the worst
          shape; an exam run tells you whether you would pass one; a placement run maps a whole
          course or the whole degree. Every one of them feeds the same model, so nothing is wasted
          whichever you pick.
        </p>
      </header>

      <div className="space-y-5">
        {ahead.length > 0 ? (
          <div>
            <Rule right={`${ahead.length} ahead`}>Across every exam</Rule>
            <Panel>
              <ScopeRow
                testId="triage"
                title="Exam triage"
                meta={<span className="label border border-accent-dim px-1 py-px text-accent">Start here</span>}
                detail={
                  <>
                    One untimed pass over every exam still ahead, with items shared out by how soon
                    each is sat — {ahead.map((e) => `${e.course} ${e.title}`).join(', ')}. Explanations
                    are shown as you go. Answers the question worth asking first: where should the
                    next few days go.
                  </>
                }
                items={DEFAULT_TRIAGE_SIZE}
                action="Run"
                onLaunch={() => startTriage()}
              />
            </Panel>
          </div>
        ) : null}

        {ahead.length > 0 ? (
          <div>
            <Rule>One exam, under its own conditions</Rule>
            <Panel>{ahead.map(examRow)}</Panel>
          </div>
        ) : null}

        <div>
          <Rule right={`${selection.length} of ${courseCodes.length} selected`}>Placement</Rule>
          <Panel>
            <div className="flex flex-wrap gap-1 border-b border-line px-3 py-2.5">
              {courseCodes.map((code) => {
                const on = picked.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    data-testid={`course-${code}`}
                    onClick={() =>
                      setPicked((prev) =>
                        prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
                      )
                    }
                    className={`border px-1.5 py-0.5 font-mono text-[11px] transition-colors ${
                      on
                        ? 'border-accent bg-accent text-accent-fg'
                        : 'border-line text-ink-dim hover:border-accent hover:text-accent'
                    }`}
                  >
                    {code}
                  </button>
                );
              })}
              {picked.length > 0 ? (
                <button type="button" className="btn-ghost" onClick={() => setPicked([])}>
                  Clear
                </button>
              ) : null}
            </div>
            <ScopeRow
              testId="placement"
              title={picked.length === 0 ? 'Full placement' : `Placement — ${picked.join(', ')}`}
              detail={
                <>
                  Adaptive across {selection.length === courseCodes.length ? 'every course in the graph' : 'the selected courses'},
                  choosing each question from how the last one went and propagating what it implies
                  through the prerequisite graph. The broadest picture available, and the one that
                  ignores the calendar entirely — select nothing above for everything.
                </>
              }
              items={45}
              action="Run"
              onLaunch={() => startPlacement(selection)}
            />
          </Panel>
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <button type="button" className="btn-secondary" onClick={() => goTo('dashboard')}>
          Back to briefing
        </button>
        <button type="button" className="btn-secondary" onClick={() => goTo('term')}>
          Term schedule
        </button>
      </div>
    </div>
  );
}
