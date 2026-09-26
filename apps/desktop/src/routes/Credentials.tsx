import { useMemo, useState } from 'react';
import { rankCredentials, shortlist, type CareerTrack, type RankedCredential } from '@et/domain';
import { useApp } from '@/store';

/**
 * Credential recommendations.
 *
 * Ranked against measured gaps rather than presented as a catalog, because a
 * list of twenty options is not a plan. Signal and learning value are shown
 * separately and labelled, since the honest answer for a semiconductor student
 * is frequently "this teaches real skills and will not help your application" —
 * which a single blended score would hide.
 */

const TRACKS: { id: CareerTrack; label: string }[] = [
  { id: 'semiconductor-vlsi', label: 'Semiconductor / VLSI' },
  { id: 'analog-mixed-signal', label: 'Analog & mixed signal' },
  { id: 'embedded-firmware', label: 'Embedded & firmware' },
  { id: 'ai-hardware', label: 'AI hardware' },
  { id: 'signal-processing', label: 'Signal processing' },
  { id: 'power-energy', label: 'Power & energy' },
  { id: 'rf-communications', label: 'RF & communications' },
  { id: 'general-engineering', label: 'General engineering' },
];

const COST_LABEL: Record<string, { text: string; chip: string }> = {
  free: { text: 'Free', chip: 'bg-accent/15 text-accent' },
  'free-for-students': { text: 'Free for students', chip: 'bg-info/15 text-info' },
  'discounted-for-students': { text: 'Student discount', chip: 'bg-warn/15 text-warn' },
  paid: { text: 'Paid', chip: 'bg-line text-ink' },
};

const KIND_LABEL: Record<string, string> = {
  'proctored-exam': 'Proctored exam',
  'assessed-certificate': 'Assessed certificate',
  'completion-certificate': 'Completion certificate',
  'course-only': 'No credential — project or skill',
};

export function Credentials(): React.ReactElement {
  const content = useApp((s) => s.content);
  const model = useApp((s) => s.model);
  const goTo = useApp((s) => s.goTo);

  const [track, setTrack] = useState<CareerTrack>('semiconductor-vlsi');
  const [freeOnly, setFreeOnly] = useState(true);
  const [budgetHours, setBudgetHours] = useState(40);

  const ranked = useMemo(() => {
    if (!content) return [];
    return rankCredentials(content.credentials as never, {
      track,
      mastery: model?.byKc ?? new Map(),
      freeOnly,
      budgetHours,
    });
  }, [content, model, track, freeOnly, budgetHours]);

  const top = useMemo(() => shortlist(ranked), [ranked]);

  if (!content) return <div className="grid h-full place-items-center text-sm text-ink-faint">Loading…</div>;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex items-baseline gap-4">
        <h1 className="font-mono text-[15px] font-semibold uppercase tracking-[0.1em] text-ink">Credentials worth your time</h1>
        <button className="btn-ghost ml-auto" onClick={() => goTo('dashboard')}>
          Back to dashboard
        </button>
      </header>
      <p className="mt-2 max-w-3xl text-sm text-ink-dim">
        Ranked against the gaps this app has actually measured, and against the hours you have rather
        than the hours a syllabus claims. Two things are scored separately and shown separately: what a
        credential <em>teaches</em> and what it <em>signals</em>. They diverge often, and averaging them
        would bury both the two-hour checkbox and the genuinely hard thing under the same middling number.
      </p>

      <div className="card mt-6 flex flex-wrap items-center gap-5 p-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="label">Track</span>
          <select
            value={track}
            onChange={(e) => setTrack(e.target.value as CareerTrack)}
            className="rounded border border-line-strong px-2 py-1 text-sm "
          >
            {TRACKS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={freeOnly}
            onChange={(e) => setFreeOnly(e.target.checked)}
            className="h-4 w-4 rounded border-line-strong"
          />
          Free or student-free only
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span className="label">Hours available</span>
          <input
            type="number"
            min={1}
            max={400}
            value={budgetHours}
            onChange={(e) => setBudgetHours(Math.max(1, Number(e.target.value) || 1))}
            className="w-20 rounded border border-line-strong px-2 py-1 text-sm tabular-nums "
          />
        </label>
      </div>

      {top.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-ink">Start with these</h2>
          <p className="mt-1 text-sm text-ink-dim">
            Ready to begin, inside your hour budget, and highest value per hour spent.
          </p>
          <ol className="mt-3 space-y-2">
            {top.map((r, i) => (
              <li key={r.credential.id}>
                <Card ranked={r} rank={i + 1} highlight />
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-sm font-semibold text-ink">Everything else, ranked</h2>
        <p className="mt-1 text-sm text-ink-dim">
          Including the ones that come out poorly. A catalog that quietly omits its own bad fits is not
          telling you anything.
        </p>
        <ul className="mt-3 space-y-2">
          {ranked
            .filter((r) => !top.some((t) => t.credential.id === r.credential.id))
            .map((r) => (
              <li key={r.credential.id}>
                <Card ranked={r} />
              </li>
            ))}
        </ul>
      </section>

      {ranked.length === 0 && (
        <p className="mt-8 text-sm text-ink-dim">
          Nothing matches those filters. Try allowing paid credentials or raising the hour budget.
        </p>
      )}
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-xs text-ink-faint">{label}</span>
      <div className="h-1.5 w-20 overflow-hidden rounded bg-surface-2">
        <div className="h-full bg-line" style={{ width: `${Math.max(3, value * 100)}%` }} />
      </div>
    </div>
  );
}

function Card({
  ranked,
  rank,
  highlight = false,
}: {
  ranked: RankedCredential;
  rank?: number;
  highlight?: boolean;
}): React.ReactElement {
  const c = ranked.credential as RankedCredential['credential'] & {
    url: string;
    kind: string;
    why: string;
    caveat: string;
    checkedOn: string;
    cost: { tier: string; usd?: number; note?: string };
  };
  const cost = COST_LABEL[c.cost.tier] ?? COST_LABEL['paid']!;

  return (
    <article className={`card p-4 ${highlight ? 'border-line-strong' : ''}`}>
      <div className="flex flex-wrap items-baseline gap-2">
        {rank !== undefined && <span className="font-mono text-xs text-ink-faint">{rank}</span>}
        <a href={c.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-ink underline decoration-slate-300">
          {c.name}
        </a>
        <span className="text-xs text-ink-faint">{c.provider}</span>
        <span className={`rounded px-1.5 py-0.5 text-xs ${cost.chip}`}>{cost.text}</span>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-ink-dim">{KIND_LABEL[c.kind] ?? c.kind}</span>
        {ranked.readiness !== 'ready' && (
          <span className="rounded bg-warn/15 px-1.5 py-0.5 text-xs text-warn">
            {ranked.readiness === 'premature' ? 'Prerequisites missing' : 'A stretch right now'}
          </span>
        )}
        {ranked.overBudget && (
          <span className="rounded bg-danger/15 px-1.5 py-0.5 text-xs text-danger">Over your hour budget</span>
        )}
        <span className="ml-auto text-xs tabular-nums text-ink-dim">{c.effortHours} h</span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-ink-dim">{c.why}</p>
      {/* The caveat is never collapsed or de-emphasised: it is the part a
          marketing page would omit, and therefore the part worth reading. */}
      <p className="mt-2 border-l-2 border-warn/50 pl-3 text-sm leading-relaxed text-ink-dim">{c.caveat}</p>
      {c.cost.note && <p className="mt-2 text-xs text-ink-dim">{c.cost.note}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-line pt-3">
        <Bar label="signals" value={c.signalStrength} />
        <Bar label="teaches" value={c.learningValue} />
        <span className="text-xs italic text-ink-dim">{ranked.rationale}</span>
        <span className="ml-auto text-xs text-ink-faint">checked {c.checkedOn}</span>
      </div>
    </article>
  );
}
