import { useMemo } from 'react';
import {
  byCompetency,
  byCourse,
  competencyFindings,
  dailyQuest,
  examPriorities,
  rankMisconceptions,
  remediationPlan,
  rollUpFamilies,
  upcomingExams,
  type ExamBlueprint,
  type ExamPriority,
  type KcMastery,
} from '@et/domain';
import { useApp } from '@/store';
import { currentTerm, drillCandidates } from '@/content';
import { Countdown, DataRow, Empty, Meter, Panel } from '@/ui/shell';
import { IconChevron } from '@/ui/icons';

/**
 * The briefing.
 *
 * The screen opens with a sentence rather than a chart, and the sentence is
 * computed from the model rather than chosen from a list of templates. That is
 * the difference between a dashboard and a readout: every figure below is
 * available to be read, and the one thing a learner opening the app at eight in
 * the morning actually needs is the conclusion those figures add up to.
 *
 * It only ever states what has been measured. "Nothing in this exam's scope has
 * been measured yet" is a real and useful headline; inventing a readiness
 * figure out of untested components would make the most confident line on the
 * screen the least supported one.
 */

const PROFICIENT = 0.65;

/**
 * How many exams the readiness panel lists before it stops.
 *
 * A term declares a dozen, and a dozen rows is a list rather than a readout —
 * it pushes everything else off the fold to tell you about a final in eleven
 * weeks. The near ones are what this panel is for; the rest is a count and a
 * way through to the full set.
 */
const EXAMS_SHOWN = 5;
const pct = (v: number): string => `${Math.round(v * 100)}%`;

interface ExamReadiness {
  exam: ExamBlueprint;
  measured: KcMastery[];
  below: KcMastery[];
  decayed: KcMastery[];
  untested: number;
  total: number;
  /** Mean composite over measured components only. */
  readiness: number;
}

function readinessOf(exam: ExamBlueprint, byKc: ReadonlyMap<string, KcMastery>): ExamReadiness {
  const measured: KcMastery[] = [];
  for (const kcId of exam.kcIds) {
    const m = byKc.get(kcId);
    if (m && m.attempts > 0) measured.push(m);
  }
  const below = measured.filter((m) => m.composite < PROFICIENT);
  return {
    exam,
    measured,
    below,
    decayed: below.filter((m) => m.diagnosis === 'decayed'),
    untested: exam.kcIds.length - measured.length,
    total: exam.kcIds.length,
    readiness: measured.length > 0
      ? measured.reduce((sum, m) => sum + m.composite, 0) / measured.length
      : 0,
  };
}

const whenPhrase = (days: number): string =>
  days === 0 ? 'is today' : days === 1 ? 'is tomorrow' : `is in ${days} days`;

const plural = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);

function briefing(
  readiness: readonly ExamReadiness[],
  priorities: readonly ExamPriority[],
  titleOf: (kcId: string) => string,
): { headline: string; sub: string; tone: 'danger' | 'warn' | 'accent' | 'dim' } {
  const next = readiness[0];
  if (!next) {
    return {
      headline: 'No exams on the calendar.',
      sub: 'Practice is ranked by decay alone until the term declares one.',
      tone: 'dim',
    };
  }

  const { exam, below, decayed, measured, untested, total } = next;
  const name = `${exam.course} ${exam.title}`;
  const tone = exam.daysAway <= 2 ? 'danger' : exam.daysAway <= 7 ? 'warn' : 'accent';

  if (measured.length === 0) {
    return {
      headline: `${name} ${whenPhrase(exam.daysAway)} and none of its ${total} components have been measured.`,
      sub: `Sit the ${exam.title.toLowerCase()} paper, or run a triage pass across every exam still ahead — either one turns ${total} unknowns into a work queue in under half an hour.`,
      tone,
    };
  }

  const parts: string[] = [
    `${below.length} of ${measured.length} measured ${plural(measured.length, 'component')} ${below.length === 1 ? 'is' : 'are'} below proficient`,
  ];
  if (decayed.length > 0) {
    parts.push(`${decayed.length} of those decayed rather than never learned`);
  }
  if (untested > 0) {
    parts.push(`${untested} never asked about`);
  }

  const top = priorities[0];
  const sub = top
    ? top.role === 'prerequisite'
      ? `Start with ${titleOf(top.kcId)} — not on the paper itself, but ${name} leans on it and it ${top.diagnosis === 'untested' ? 'has never been tested' : `sits at ${pct(top.composite)}`}.`
      : `Start with ${titleOf(top.kcId)} — ${top.diagnosis === 'untested' ? 'never tested' : `${pct(top.composite)}, ${top.diagnosis}`} and examined directly.`
    : 'Nothing in scope is below the line.';

  return {
    headline: `${name} ${whenPhrase(exam.daysAway)}: ${parts.join(', ')}.`,
    sub,
    tone,
  };
}

export function Dashboard(): React.ReactElement {
  const model = useApp((s) => s.model);
  const content = useApp((s) => s.content);
  const profile = useApp((s) => s.profile);
  const blueprints = useApp((s) => s.examBlueprints)();
  const startQuest = useApp((s) => s.startQuest);
  const startExam = useApp((s) => s.startExam);
  const startTriage = useApp((s) => s.startTriage);
  const startKcs = useApp((s) => s.startKcs);
  const startDrill = useApp((s) => s.startDrill);
  const goTo = useApp((s) => s.goTo);
  const misconceptionEvents = useApp((s) => s.misconceptionEvents);

  const term = useMemo(() => (content ? currentTerm(content) : undefined), [content]);

  const view = useMemo(() => {
    if (!model || !content) return null;
    const { graph } = content;

    const ahead = upcomingExams(blueprints);
    const readiness = ahead.map((exam) => readinessOf(exam, model.byKc));
    const priorities = examPriorities(graph, model.byKc, blueprints, { limit: 14 });

    const tested = model.masteries.filter((m) => m.attempts > 0);
    const competencies = byCompetency(tested, graph.kcs);
    const ranked = rankMisconceptions(misconceptionEvents.map((e) => ({ ...e, at: new Date(e.at) })));
    const families = rollUpFamilies(ranked, content.misconceptionFamilies);

    // The join the radar has been waiting for since it was drawn.
    const plan = remediationPlan(families, competencies, drillCandidates(content.items), {
      limit: 3,
      attempted: model.attemptedItemIds,
    });
    const findings = competencyFindings(competencies, families);

    return {
      ahead, readiness, priorities, tested, competencies, families, plan, findings,
      quest: dailyQuest(graph, model.byKc),
      courses: byCourse(tested, graph.kcs).sort((a, b) => a.composite - b.composite),
      drillsDue: ranked.filter((r) => r.drillDue).length,
    };
  }, [model, content, blueprints, misconceptionEvents]);

  if (!view || !content || !model) {
    return <Empty>Loading…</Empty>;
  }

  const titleOf = (kcId: string): string => content.graph.kcs.get(kcId)?.title ?? kcId;
  const brief = briefing(view.readiness, view.priorities, titleOf);
  const hasData = view.tested.length > 0;
  const headlineTone = {
    danger: 'text-danger', warn: 'text-warn', accent: 'text-accent', dim: 'text-ink-dim',
  }[brief.tone];

  return (
    <div className="mx-auto max-w-[1360px] px-5 py-5" data-testid="dashboard">
      <header className="mb-4">
        <div className="mb-2 flex flex-wrap items-baseline gap-3">
          <span className="label">Briefing</span>
          <span className="h-px flex-1 bg-line" />
          <span className="label">
            {term ? `${term.title} · week ${Math.max(1, Math.ceil((Date.now() - Date.parse(`${term.startsOn}T00:00:00Z`)) / 604_800_000))}` : 'No term'}
          </span>
        </div>

        <h1
          className={`max-w-5xl text-[26px] font-semibold leading-[1.15] tracking-tightest ${headlineTone}`}
          data-testid="briefing-headline"
        >
          {brief.headline}
        </h1>
        <p className="mt-2 max-w-4xl text-[13px] leading-relaxed text-ink-dim" data-testid="briefing-sub">
          {brief.sub}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {view.ahead[0] ? (
            <button
              type="button"
              className="btn-primary"
              data-testid="briefing-sit"
              onClick={() => startExam(view.ahead[0]!.id)}
            >
              Sit {view.ahead[0].course} {view.ahead[0].title}
              <IconChevron className="h-3 w-3" />
            </button>
          ) : null}
          {view.ahead.length > 1 ? (
            <button type="button" className="btn-secondary" onClick={() => startTriage()}>
              Triage all {view.ahead.length}
            </button>
          ) : null}
          {hasData && view.quest.reviewKcs.length + view.quest.frontierKcs.length > 0 ? (
            <button type="button" className="btn-secondary" onClick={startQuest}>
              Daily quest
            </button>
          ) : null}
          <button type="button" className="btn-secondary" onClick={() => goTo('diagnostics')}>
            All diagnostics
          </button>
        </div>
      </header>

      <div className="panel mb-4">
        <DataRow
          entries={[
            {
              label: 'Days to next exam',
              value: view.ahead[0] ? view.ahead[0].daysAway : '—',
              tone: view.ahead[0] && view.ahead[0].daysAway <= 2 ? 'danger' : 'default',
            },
            {
              label: 'Measured components',
              value: `${view.tested.length}/${content.graph.kcs.size}`,
            },
            {
              label: 'Below proficient',
              value: view.tested.filter((m) => m.composite < PROFICIENT).length,
              tone: 'warn',
            },
            {
              label: 'Decayed, not lost',
              value: view.tested.filter((m) => m.diagnosis === 'decayed').length,
              tone: 'accent',
            },
            { label: 'Drills due', value: view.drillsDue, tone: view.drillsDue > 0 ? 'warn' : 'default' },
            { label: 'Streak', value: `${profile.streak.current}d` },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* ---------------- Exam readiness ---------------- */}
        <div className="space-y-4 lg:col-span-5">
          <Panel title="Exam readiness" right={<span className="label">{view.ahead.length} ahead</span>} testId="exam-readiness">
            {view.ahead.length === 0 ? (
              <Empty>No exams on the term.</Empty>
            ) : (
              view.readiness.slice(0, EXAMS_SHOWN).map((r) => (
                <div key={r.exam.id} className="border-b border-line px-3 py-2.5 last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] font-semibold text-ink">
                      {r.exam.course} {r.exam.title}
                    </span>
                    <Countdown days={r.exam.daysAway} />
                    <span className="flex-1" />
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => startExam(r.exam.id)}
                      title={`Sit ${r.exam.course} ${r.exam.title}`}
                    >
                      Sit
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Meter
                      value={r.measured.length === 0 ? 0 : r.readiness}
                      tone={r.readiness >= PROFICIENT ? 'mastered' : r.readiness >= 0.4 ? 'developing' : 'gap'}
                    />
                    <span className="tabular w-9 shrink-0 text-right font-mono text-[11px] text-ink-dim">
                      {r.measured.length === 0 ? '—' : pct(r.readiness)}
                    </span>
                  </div>
                  <div className="label mt-1">
                    {r.measured.length === 0
                      ? `${r.total} components, none measured`
                      : `${r.below.length} below · ${r.untested} untested · ${r.total} in scope`}
                  </div>
                  {r.exam.unitsWithoutKcs.length > 0 ? (
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-warn">
                      No knowledge map for {r.exam.unitsWithoutKcs.map((u) => u.unit).join(', ')}
                    </div>
                  ) : null}
                </div>
              ))
            )}
            {view.readiness.length > EXAMS_SHOWN ? (
              <div className="border-t border-line px-3 py-2">
                <button type="button" className="btn-ghost" onClick={() => goTo('diagnostics')}>
                  {view.readiness.length - EXAMS_SHOWN} more, further out
                </button>
              </div>
            ) : null}
          </Panel>

          <Panel
            title="Priority queue"
            right={<span className="label">exam-weighted</span>}
            testId="priority-queue"
          >
            {view.priorities.length === 0 ? (
              <Empty>
                {hasData
                  ? 'Nothing in exam scope is below the line.'
                  : 'Nothing measured yet — run a diagnostic and this fills in.'}
              </Empty>
            ) : (
              <>
                {view.priorities.slice(0, 9).map((p) => (
                  <div key={p.kcId} className="flex items-center gap-2 border-b border-line px-3 py-1.5 last:border-b-0">
                    <span className="tabular w-8 shrink-0 font-mono text-[10px] text-ink-faint">
                      {p.daysAway}d
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] text-ink">{titleOf(p.kcId)}</div>
                      <div className="label mt-0.5 truncate">
                        {p.course} {p.examTitle}
                        {p.role === 'prerequisite' ? ' · prerequisite' : ''}
                        {p.diagnosis === 'untested' ? ' · never tested' : ` · ${pct(p.composite)} ${p.diagnosis}`}
                      </div>
                    </div>
                    <button type="button" className="btn-ghost shrink-0" onClick={() => startKcs([p.kcId])}>
                      Study
                    </button>
                  </div>
                ))}
                <div className="border-t border-line px-3 py-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    data-testid="study-priority-queue"
                    onClick={() => startKcs(view.priorities.slice(0, 9).map((p) => p.kcId))}
                  >
                    Work the top {Math.min(9, view.priorities.length)}
                  </button>
                </div>
              </>
            )}
          </Panel>
        </div>

        {/* ---------------- Competency → remediation ---------------- */}
        <div className="space-y-4 lg:col-span-4">
          <Panel title="Habits worth fixing" right={<span className="label">competency join</span>} testId="remediation">
            {view.plan.length === 0 ? (
              <Empty>
                {view.families.length === 0
                  ? 'No recurring errors recorded yet. They accumulate as you answer.'
                  : 'No habit has enough evidence behind it to drill.'}
              </Empty>
            ) : (
              view.plan.map((step) => (
                <div key={step.family.id} className="border-b border-line px-3 py-2.5 last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="tabular font-mono text-[10px] text-ink-faint">{step.rank}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-semibold text-ink">
                      {step.family.title}
                    </span>
                    {step.crossCourse ? (
                      <span className="label border border-warn/50 px-1 py-px text-warn">
                        {step.courses.length} courses
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-ink-dim">{step.family.description}</p>
                  <div className="label mt-1.5">
                    {step.competency} at {pct(step.competencyComposite)}
                    {step.relativeShortfall > 0
                      ? ` · ${pct(step.relativeShortfall)} below your other axes`
                      : ''}
                    {' · '}
                    {step.totalHits} {plural(step.totalHits, 'hit')}
                  </div>
                  <div className="mt-1.5">
                    {step.drill.length > 0 ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => startDrill(step.target)}
                      >
                        Drill {step.drill.length} items
                      </button>
                    ) : (
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                        Diagnosed — no item can test it yet
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </Panel>

          <Panel title="Competency axes" testId="competency-axes">
            {view.findings.length === 0 ? (
              <Empty>Nothing measured yet.</Empty>
            ) : (
              view.findings.map((f) => (
                <div key={f.competency} className="flex items-center gap-3 border-b border-line px-3 py-1.5 last:border-b-0">
                  <div className="w-28 shrink-0">
                    <div className="truncate font-mono text-[11px] text-ink">{f.competency}</div>
                    {f.standoutWeakness ? (
                      <div className="label text-warn">your weak axis</div>
                    ) : null}
                  </div>
                  <Meter
                    value={f.testedCount === 0 ? 0 : f.composite}
                    tone={f.composite >= PROFICIENT ? 'mastered' : f.composite >= 0.4 ? 'developing' : 'gap'}
                  />
                  <span className="tabular w-9 shrink-0 text-right font-mono text-[11px] text-ink-dim">
                    {f.testedCount === 0 ? '—' : pct(f.composite)}
                  </span>
                </div>
              ))
            )}
          </Panel>
        </div>

        {/* ---------------- Course standing ---------------- */}
        <div className="space-y-4 lg:col-span-3">
          <Panel title="By course" testId="course-standing">
            {view.courses.length === 0 ? (
              <Empty>Nothing measured yet.</Empty>
            ) : (
              view.courses.map((c) => (
                <div key={c.key} className="border-b border-line px-3 py-1.5 last:border-b-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[11px] text-ink">{c.key}</span>
                    <span className="flex-1" />
                    <span className="tabular font-mono text-[11px] text-ink-dim">{pct(c.composite)}</span>
                  </div>
                  <Meter
                    className="mt-1"
                    value={c.composite}
                    tone={c.composite >= PROFICIENT ? 'mastered' : c.composite >= 0.4 ? 'developing' : 'gap'}
                  />
                  <div className="label mt-0.5">{c.testedCount} of {c.kcCount} tested</div>
                </div>
              ))
            )}
          </Panel>

          <Panel title="Elsewhere">
            <div className="flex flex-col items-start gap-px p-2">
              <button type="button" className="btn-ghost w-full justify-start" onClick={() => goTo('term')}>
                Term schedule
              </button>
              <button type="button" className="btn-ghost w-full justify-start" onClick={() => goTo('skillTree')}>
                Knowledge map
              </button>
              <button type="button" className="btn-ghost w-full justify-start" onClick={() => goTo('circuitLab')}>
                Circuit lab
              </button>
              <button type="button" className="btn-ghost w-full justify-start" onClick={() => goTo('misconceptions')}>
                Error feed{view.drillsDue > 0 ? ` · ${view.drillsDue} due` : ''}
              </button>
              <button type="button" className="btn-ghost w-full justify-start" onClick={() => goTo('credentials')}>
                Credentials
              </button>
              <button type="button" className="btn-ghost w-full justify-start" onClick={() => goTo('report')}>
                Last gap report
              </button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
