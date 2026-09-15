import { useEffect } from 'react';
import { useApp } from '@/store';
import { Onboarding } from '@/routes/Onboarding';
import { Session } from '@/routes/Session';
import { Report } from '@/routes/Report';
import { Dashboard } from '@/routes/Dashboard';
import { Credentials } from '@/routes/Credentials';

export function App(): React.ReactElement {
  const route = useApp((s) => s.route);
  const content = useApp((s) => s.content);
  const boot = useApp((s) => s.boot);

  useEffect(() => {
    void boot();
  }, [boot]);

  // Content problems are fatal and must be loud: a malformed curriculum would
  // otherwise surface as inexplicably missing questions.
  if (content && content.issues.length > 0) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-lg font-semibold text-red-700">Content failed to load</h1>
        <ul className="mt-4 space-y-1 font-mono text-sm text-slate-700">
          {content.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-slate-500">
          Run <code className="rounded bg-slate-100 px-1">pnpm content validate</code> for detail.
        </p>
      </div>
    );
  }

  switch (route) {
    case 'loading':
      return <div className="grid h-full place-items-center text-sm text-slate-400">Loading…</div>;
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
  }
}
