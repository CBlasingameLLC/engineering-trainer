import { useMemo } from 'react';
import {
  byCompetency, byDomain, challengeReadiness, dailyQuest, levelProgress, streakAsOf,
  type Competency,
} from '@et/domain';
import { useApp } from '@/store';
import { upcomingDecay } from '@/features/learner-model';
import { BAND_STYLE, DIAGNOSIS_COPY, pct } from '@/ui/bands';

/**
 * Dashboard.
 *
 * Leads with what is about to go wrong rather than with a score. A progress
 * number is a reward; a list of prerequisites that will be soft by the time the
 * dependent course starts is something to act on, and it is the thing no
 * gradebook can tell you.
 */

const COMPETENCY_COPY: Record<Competency, string> = {
  'math-execution': 'Carrying out the algebra and calculus accurately',
  concept: 'Qualitative and physical understanding',
  modeling: 'Turning a situation into equations',
  strategy: 'Choosing a method and planning the solution',
  numeracy: 'Units, magnitudes and sanity checks',
  visual: 'Reading schematics, plots and diagrams',
};

export function Dashboard(): React.ReactElement {
  const model = useApp((s) => s.model);
  const content = useApp((s) => s.content);
  const profile = useApp((s) => s.profile);
  const startPlacement = useApp((s) => s.startPlacement);
  const startQuest = useApp((s) => s.startQuest);
  const startChallenge = useApp((s) => s.startChallenge);
  const goTo = useApp((s) => s.goTo);
  const resetAll = useApp((s) => s.resetAll);
  const lastPlacement = useApp((s) => s.lastPlacement);

  const view = useMemo(() => {
    if (!model || !content) return null;
    const { graph } = content;

    const tested = model.masteries.filter((m) => m.attempts > 0);
    const competencies = byCompetency(tested, graph.kcs).sort((a, b) => a.composite - b.composite);
    const domains = byDomain(tested, graph.kcs).sort((a, b) => a.composite - b.composite);
    const risks = upcomingDecay(model, graph, 240).slice(0, 8);
    const worst = [...tested].sort((a, b) => a.composite - b.composite).slice(0, 8);

    const quest = dailyQuest(graph, model.byKc);
    const courses = [...new Set([...graph.kcs.values()].map((k) => k.courseId))].sort();
    const challenges = courses.map((courseId) => ({
      courseId,
      ...challengeReadiness(courseId, graph, model.byKc),
    }));

    return { tested, competencies, domains, risks, worst, graph, quest, challenges };
  }, [model, content]);

  if (!view || !content) {
    return <div className="grid h-full place-items-center text-sm text-slate-400">Loading…</div>;
  }

  const courseCodes = content.courses.map((c) => c.code);
  const hasData = view.tested.length > 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">Engineering Trainer</h1>
        {profile.targetTerm && (
          <span className="text-sm text-slate-500">preparing for {profile.targetTerm}</span>
        )}
        <nav className="ml-auto flex gap-3 text-sm">
          <button className="text-slate-500 underline" onClick={() => goTo('skillTree')}>Skill tree</button>
          <button className="text-slate-500 underline" onClick={() => goTo('circuitLab')}>Circuit lab</button>
          <button className="text-slate-500 underline" onClick={() => goTo('credentials')}>Credentials</button>
        </nav>
      </header>

      <Progress />

      {!hasData && (
        <section className="card mt-8 p-6">
          <h2 className="text-base font-semibold text-slate-900">Start with a placement exam</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            An adaptive exam of at most 45 items. It spends questions where it has least information,
            then works the prerequisite graph to draw conclusions about concepts it never asked about —
            so it can cover a whole course without asking a whole course's worth of questions.
          </p>
          <div className="mt-4 flex gap-3">
            <button className="btn-primary" onClick={() => startPlacement(courseCodes)}>
              Begin placement
            </button>
            <button className="btn-secondary" onClick={() => goTo('credentials')}>
              Browse credentials
            </button>
            <button className="btn-secondary" onClick={() => goTo('circuitLab')}>
              Open the circuit lab
            </button>
          </div>
        </section>
      )}

      {hasData && (
        <>
          <section className="card mt-8 p-5">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-base font-semibold text-slate-900">Today's quest</h2>
              <span className="text-sm text-slate-500">{view.quest.rationale}</span>
              <button className="btn-primary ml-auto" onClick={startQuest}>
                Start
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-6 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Review</div>
                <ul className="mt-1 space-y-0.5">
                  {view.quest.reviewKcs.length === 0 && <li className="text-slate-400">nothing due</li>}
                  {view.quest.reviewKcs.map((id) => (
                    <li key={id} className="text-slate-700">{view.graph.kcs.get(id)?.title ?? id}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">New, and unlocked</div>
                <ul className="mt-1 space-y-0.5">
                  {view.quest.frontierKcs.length === 0 && <li className="text-slate-400">nothing ready</li>}
                  {view.quest.frontierKcs.map((id) => (
                    <li key={id} className="text-slate-700">{view.graph.kcs.get(id)?.title ?? id}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-semibold text-slate-900">Challenge exams</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Passing one marks the course tested out and awards its crest. A pass needs breadth as
              well as a score — high marks on a few topics is not evidence about a course.
            </p>
            <ul className="mt-3 space-y-1">
              {view.challenges.map((challenge) => {
                const earned = profile.crests.includes(challenge.courseId);
                return (
                  <li key={challenge.courseId} className="card flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                    <span className="font-mono text-xs text-slate-500">{challenge.courseId}</span>
                    {earned && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">crest earned</span>}
                    <span className="tabular-nums text-slate-500">{pct(challenge.averageMastery)} average</span>
                    {challenge.untested > 0 && (
                      <span className="text-xs text-slate-400">{challenge.untested} topic(s) untested</span>
                    )}
                    <button
                      className={`ml-auto rounded px-3 py-1 text-sm ${challenge.ready ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}
                      onClick={() => startChallenge(challenge.courseId)}
                    >
                      {challenge.ready ? 'Attempt' : 'Attempt anyway'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {view.risks.length > 0 && (
            <section className="mt-8">
              <h2 className="text-sm font-semibold text-slate-900">Decaying before {profile.targetTerm || 'next term'}</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Currently above proficiency, projected to fall below it within the horizon. These are
                cheap to fix now and expensive to fix during the semester.
              </p>
              <ul className="mt-3 space-y-1">
                {view.risks.map((risk) => (
                  <li key={risk.kc.id} className="card flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="font-mono text-xs text-slate-400">{risk.kc.courseId}</span>
                    <span className="text-slate-800">{risk.kc.title}</span>
                    <span className="ml-auto tabular-nums text-slate-500">
                      {pct(risk.currentComposite)} → {pct(risk.projectedComposite)}
                    </span>
                    <span className="w-28 text-right text-xs text-violet-700">
                      ~{Math.round(risk.daysUntilThreshold ?? 0)} days
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <Axis
              title="By competency"
              blurb="How you are being asked to think, independent of subject. A weakness here that spans every domain is a habit, not a topic."
              rows={view.competencies.map((c) => ({
                key: c.key,
                label: c.key,
                detail: COMPETENCY_COPY[c.key],
                composite: c.composite,
                band: c.band,
                tested: c.testedCount,
                total: c.kcCount,
              }))}
            />
            <Axis
              title="By domain"
              blurb="Subject matter. Compare against the competency panel: same evidence, different question."
              rows={view.domains.map((d) => ({
                key: d.key,
                label: d.key,
                detail: '',
                composite: d.composite,
                band: d.band,
                tested: d.testedCount,
                total: d.kcCount,
              }))}
            />
          </div>

          <section className="mt-8">
            <h2 className="text-sm font-semibold text-slate-900">Weakest concepts</h2>
            <ul className="mt-3 space-y-1">
              {view.worst.map((m) => {
                const kc = view.graph.kcs.get(m.kcId);
                if (!kc) return null;
                return (
                  <li key={m.kcId} className="card px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-slate-400">{kc.courseId}</span>
                      <span className="text-sm font-medium text-slate-900">{kc.title}</span>
                      <span className={`rounded px-1.5 py-0.5 text-xs ${DIAGNOSIS_COPY[m.diagnosis].chip}`}>
                        {DIAGNOSIS_COPY[m.diagnosis].label}
                      </span>
                      <span className="ml-auto text-xs text-slate-400">
                        {DIAGNOSIS_COPY[m.diagnosis].detail}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-100">
                      <div
                        className={`h-full ${BAND_STYLE[m.band].bar}`}
                        style={{ width: `${Math.max(2, m.composite * 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <footer className="mt-10 flex gap-3 border-t border-slate-200 pt-6">
            <button className="btn-primary" onClick={() => startPlacement(courseCodes)}>
              Run placement again
            </button>
            {lastPlacement && (
              <button className="btn-secondary" onClick={() => goTo('report')}>
                Last report
              </button>
            )}
            <button className="btn-secondary" onClick={() => goTo('credentials')}>
              Credentials
            </button>
            <button className="btn-secondary ml-auto" onClick={() => void resetAll()}>
              Reset everything
            </button>
          </footer>
        </>
      )}
    </div>
  );
}

interface AxisRow {
  key: string;
  label: string;
  detail: string;
  composite: number;
  band: keyof typeof BAND_STYLE;
  tested: number;
  total: number;
}

function Axis({ title, blurb, rows }: { title: string; blurb: string; rows: AxisRow[] }): React.ReactElement {
  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{blurb}</p>
      <ul className="mt-4 space-y-3">
        {rows.map((row) => (
          <li key={row.key}>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-slate-800">{row.label}</span>
              <span className={`ml-auto text-sm tabular-nums ${BAND_STYLE[row.band].text}`}>
                {pct(row.composite)}
              </span>
              {/* How much of the axis was actually measured. A high score over
                  two of twenty concepts is not a strength. */}
              <span className="w-16 text-right text-xs text-slate-400">
                {row.tested}/{row.total}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-100">
              <div className={`h-full ${BAND_STYLE[row.band].bar}`} style={{ width: `${Math.max(2, row.composite * 100)}%` }} />
            </div>
            {row.detail && <p className="mt-1 text-xs text-slate-400">{row.detail}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}


/**
 * Level, XP and streak.
 *
 * The streak is read through `streakAsOf` rather than straight off the profile,
 * so a streak that has already lapsed shows as lapsed instead of staying
 * reassuring until the next session discovers otherwise.
 */
function Progress(): React.ReactElement {
  const profile = useApp((s) => s.profile);
  const level = levelProgress(profile.totalXp);
  const streak = streakAsOf(profile.streak, new Date());

  return (
    <div className="card mt-4 flex flex-wrap items-center gap-6 p-4">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-slate-900">{level.level}</span>
        <span className="text-xs uppercase tracking-wide text-slate-400">level</span>
      </div>

      <div className="min-w-[140px] flex-1">
        <div className="h-1.5 overflow-hidden rounded bg-slate-100">
          <div className="h-full bg-amber-400" style={{ width: `${Math.round(level.fraction * 100)}%` }} />
        </div>
        <div className="mt-1 text-xs tabular-nums text-slate-500">
          {profile.totalXp} XP · {level.xpForNextLevel - level.xpIntoLevel} to level {level.level + 1}
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-slate-900">{streak.current}</span>
        <span className="text-xs uppercase tracking-wide text-slate-400">day streak</span>
        {streak.atRisk && streak.current > 0 && (
          <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-800">expires today</span>
        )}
      </div>

      {streak.freezesAvailable > 0 && (
        <span className="text-xs text-sky-700">
          {streak.freezesAvailable} freeze{streak.freezesAvailable === 1 ? '' : 's'} banked
        </span>
      )}

      {profile.crests.length > 0 && (
        <span className="text-xs text-amber-800">
          {profile.crests.length} course crest{profile.crests.length === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );
}
