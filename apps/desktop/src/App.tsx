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
import { DisplayControls } from '@/ui/DisplayControls';

function Shell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <>
      <DisplayControls />
      {children}
    </>
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
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-lg font-semibold text-red-700 dark:text-red-300">The app could not start</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Startup failed before any data was loaded. Nothing has been lost; the error is below.
        </p>
        <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded bg-slate-100 p-3 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200">
          {bootError}
        </pre>
      </div>
    );
  }

  // Content problems are fatal and must be loud: a malformed curriculum would
  // otherwise surface as inexplicably missing questions.
  if (content && content.issues.length > 0) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-lg font-semibold text-red-700 dark:text-red-300">Content failed to load</h1>
        <ul className="mt-4 space-y-1 font-mono text-sm text-slate-700 dark:text-slate-300">
          {content.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          Run <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">pnpm content validate</code> for detail.
        </p>
      </div>
    );
  }

  const view = ((): React.ReactElement => {
    switch (route) {
      case 'loading':
        return <div className="grid h-full place-items-center text-sm text-slate-400 dark:text-slate-500">Loading…</div>;
      case 'onboarding':
        return <Onboarding />;
      case 'session':
        return <Session />;
      case 'report':
        return <Report />;
      case 'dashboard':
        return <Dashboard />;
      case 'credentials':
        return <Credentials />;
      case 'skillTree':
        return <SkillTree />;
      case 'circuitLab':
        return <CircuitLab />;
      case 'misconceptions':
        return <Misconceptions />;
      case 'term':
        return <Term />;
    }
  })();

  return <Shell>{view}</Shell>;
}
