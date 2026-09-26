import { useEffect } from 'react';
import { useApp } from '@/store';
import { Onboarding } from '@/routes/Onboarding';
import { Session } from '@/routes/Session';
import { Report } from '@/routes/Report';
import { Dashboard } from '@/routes/Dashboard';
import { Credentials } from '@/routes/Credentials';
import { SkillTree } from '@/routes/SkillTree';
import { CircuitLab } from '@/routes/CircuitLab';
import { Misconceptions } from '@/routes/Misconceptions';
import { Term } from '@/routes/Term';
import { Diagnostics } from '@/routes/Diagnostics';
import { ExamReport } from '@/routes/ExamReport';
import { DisplayControls } from '@/ui/DisplayControls';
import { Countdown } from '@/ui/shell';
import {
  IconAlert, IconBadge, IconCalendar, IconCircuit, IconGauge, IconTarget, IconTree,
} from '@/ui/icons';
import { upcomingExams } from '@et/domain';

type Route = ReturnType<typeof useApp.getState>['route'];

const NAV: { route: Route; label: string; Icon: (p: { className?: string }) => React.ReactElement }[] = [
  { route: 'dashboard', label: 'Briefing', Icon: IconGauge },
  { route: 'diagnostics', label: 'Diagnostics', Icon: IconTarget },
  { route: 'term', label: 'Term', Icon: IconCalendar },
  { route: 'skillTree', label: 'Map', Icon: IconTree },
  { route: 'circuitLab', label: 'Lab', Icon: IconCircuit },
  { route: 'misconceptions', label: 'Errors', Icon: IconAlert },
  { route: 'credentials', label: 'Credentials', Icon: IconBadge },
];

/**
 * The navigation rail.
 *
 * Forty-four pixels, always present, icon-only with the name on hover. A wider
 * sidebar would spend a tenth of the window on words the learner reads once,
 * and this app's screens are worth more than that — the whole reason for the
 * redesign was that the data had nowhere to go.
 */
function Rail(): React.ReactElement {
  const route = useApp((s) => s.route);
  const goTo = useApp((s) => s.goTo);
  const paper = useApp((s) => s.paper);

  // Only a sealed exam locks the rail. Walking out of a placement or a practice
  // run mid-way is legitimate — the attempts are already recorded, the log is
  // append-only, and the model rebuilds from whatever is there. An exam is the
  // one case where leaving would abandon a measurement that only means anything
  // whole, and it has its own way out: hand the paper in.
  const sealed = route === 'session' && paper?.kind === 'exam';

  return (
    <nav
      className="flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-line bg-surface py-2"
      data-testid="nav-rail"
      aria-label="Sections"
    >
      <div
        className="mb-2 flex h-7 w-7 items-center justify-center border border-accent-dim font-mono text-[11px] font-bold text-accent"
        title="Engineering Trainer"
      >
        ET
      </div>
      {NAV.map(({ route: target, label, Icon }) => {
        const active = route === target;
        return (
          <button
            key={target}
            type="button"
            title={label}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            data-testid={`nav-${target}`}
            disabled={sealed}
            onClick={() => goTo(target)}
            className={`group relative flex h-9 w-9 items-center justify-center transition-colors
              disabled:cursor-not-allowed disabled:opacity-25
              ${active ? 'text-accent' : 'text-ink-faint hover:text-ink-dim'}`}
          >
            {active ? <span className="absolute left-0 top-1.5 h-6 w-px bg-accent" /> : null}
            <Icon />
          </button>
        );
      })}
    </nav>
  );
}

/**
 * The status strip.
 *
 * One line, always the same five facts, at the bottom of every screen. Its job
 * is that the next exam date is never more than a glance away regardless of
 * what is being looked at — which on a Saturday with three papers inside five
 * days is the single most load-bearing number in the application.
 */
function StatusStrip(): React.ReactElement | null {
  const content = useApp((s) => s.content);
  const profile = useApp((s) => s.profile);
  const blueprints = useApp((s) => s.examBlueprints)();
  if (!content) return null;

  const next = upcomingExams(blueprints)[0];
  const personal = content.personalItemCount;

  return (
    <footer
      className="flex shrink-0 items-center gap-4 overflow-x-auto border-t border-line bg-surface px-3 py-1"
      data-testid="status-strip"
    >
      {next ? (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="label">Next</span>
          <span className="font-mono text-[11px] text-ink">
            {next.course} {next.title}
          </span>
          <Countdown days={next.daysAway} />
        </span>
      ) : (
        <span className="label whitespace-nowrap">No exams scheduled</span>
      )}
      <span className="h-3 w-px bg-line" />
      <span className="whitespace-nowrap font-mono text-[11px] text-ink-dim">
        <span className="label mr-1.5">Streak</span>
        <span className="tabular text-ink">{profile.streak.current}d</span>
      </span>
      <span className="whitespace-nowrap font-mono text-[11px] text-ink-dim">
        <span className="label mr-1.5">XP</span>
        <span className="tabular text-ink">{profile.totalXp.toLocaleString()}</span>
      </span>
      <span className="whitespace-nowrap font-mono text-[11px] text-ink-dim">
        <span className="label mr-1.5">Bank</span>
        <span className="tabular text-ink">{content.items.length.toLocaleString()}</span>
      </span>
      {personal > 0 ? (
        <span
          className="ml-auto whitespace-nowrap border border-warn/50 px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.08em] text-warn"
          data-testid="personal-content-badge"
          title={`This build includes ${personal} personal-only items derived from owned material. Do not redistribute it.`}
        >
          {personal} personal · do not redistribute
        </span>
      ) : null}
    </footer>
  );
}

function Fatal({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="panel max-w-2xl p-5">
        <div className="rule mb-3">
          <span className="label text-danger">{title}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export function App(): React.ReactElement {
  const route = useApp((s) => s.route);
  const content = useApp((s) => s.content);
  const boot = useApp((s) => s.boot);
  const bootError = useApp((s) => s.bootError);

  useEffect(() => {
    void boot();
  }, [boot]);

  // Startup failures must be loud. A rejected boot used to leave the app on
  // "Loading..." indefinitely, which is indistinguishable from a slow start and
  // gives no way to tell a storage fault from a content fault.
  if (bootError) {
    return (
      <Fatal title="The app could not start">
        <p className="text-sm text-ink-dim">
          Startup failed before any data was loaded. Nothing has been lost; the error is below.
        </p>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap border border-line bg-surface-2 p-3 font-mono text-[11px] text-ink">
          {bootError}
        </pre>
      </Fatal>
    );
  }

  // Content problems are fatal and must be loud: a malformed curriculum would
  // otherwise surface as inexplicably missing questions.
  if (content && content.issues.length > 0) {
    return (
      <Fatal title="Content failed to load">
        <ul className="space-y-1 font-mono text-[11px] text-ink">
          {content.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
        <p className="mt-3 font-mono text-[11px] text-ink-faint">
          Run <code className="text-accent">pnpm content validate</code> for detail.
        </p>
      </Fatal>
    );
  }

  const view = ((): React.ReactElement => {
    switch (route) {
      case 'loading':
        return (
          <div className="grid h-full place-items-center">
            <span className="label animate-pulse">Replaying attempt log…</span>
          </div>
        );
      case 'onboarding': return <Onboarding />;
      case 'session': return <Session />;
      case 'report': return <Report />;
      case 'dashboard': return <Dashboard />;
      case 'credentials': return <Credentials />;
      case 'skillTree': return <SkillTree />;
      case 'circuitLab': return <CircuitLab />;
      case 'misconceptions': return <Misconceptions />;
      case 'term': return <Term />;
      case 'diagnostics': return <Diagnostics />;
      case 'examReport': return <ExamReport />;
    }
  })();

  // Onboarding has no navigation to offer: there is nothing to navigate to
  // until the profile exists.
  if (route === 'onboarding' || route === 'loading') {
    return (
      <div className="gridfield h-full">
        <DisplayControls />
        {view}
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col">
        <DisplayControls />
        <main className="gridfield min-h-0 flex-1 overflow-auto">{view}</main>
        <StatusStrip />
      </div>
    </div>
  );
}
