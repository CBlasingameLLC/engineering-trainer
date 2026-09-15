import { useMemo } from 'react';
import { useApp } from '@/store';
import { DIAGNOSIS_COPY, pct } from '@/ui/bands';

/**
 * Gap report.
 *
 * Ordered by what to do about it rather than by score. Two knowledge components
 * sitting at the same composite mastery can need opposite responses, so the
 * report groups by diagnosis and puts inferred results in their own section -
 * a conclusion drawn through the prerequisite graph is weaker evidence than a
 * question actually answered, and presenting the two identically would overstate
 * what the exam established.
 */

export function Report(): React.ReactElement {
  const placement = useApp((s) => s.lastPlacement);
  const model = useApp((s) => s.model);
  const graph = useApp((s) => s.content?.graph);
  const goTo = useApp((s) => s.goTo);

  const grouped = useMemo(() => {
    if (!placement || !model || !graph) return null;

    const measuredIds = new Set(placement.measured.map((m) => m.kcId));
    const measured = placement.measured
      .map((m) => ({ result: m, mastery: model.byKc.get(m.kcId)!, kc: graph.kcs.get(m.kcId)! }))
      .filter((r) => r.mastery && r.kc)
      .sort((a, b) => a.mastery.composite - b.mastery.composite);

    const inferred = [...placement.inferred.values()]
      .filter((adj) => !measuredIds.has(adj.kcId) && graph.has(adj.kcId))
      .map((adj) => ({ adj, kc: graph.kcs.get(adj.kcId)!, sourceKc: graph.kcs.get(adj.source) }))
      .sort((a, b) => a.adj.prior - b.adj.prior);

    return { measured, inferred };
  }, [placement, model, graph]);

  if (!placement || !grouped) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-sm text-slate-500">
        No placement results yet.{' '}
        <button className="underline" onClick={() => goTo('dashboard')}>
          Back to dashboard
        </button>
      </div>
    );
  }

  const gaps = grouped.measured.filter((r) => r.mastery.diagnosis === 'gap');
  const decayed = grouped.measured.filter((r) => r.mastery.diagnosis === 'decayed');
  const fragile = grouped.measured.filter((r) => r.mastery.diagnosis === 'fragile');
  const solid = grouped.measured.filter((r) => r.mastery.diagnosis === 'solid');

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Placement results</h1>
        <p className="mt-2 text-sm text-slate-600">
          {placement.itemsAdministered} items measured {grouped.measured.length} concepts directly, and
          implied {grouped.inferred.length} more through the prerequisite graph.{' '}
          {placement.stopReason === 'targets-met'
            ? 'The exam ended early because every concept reached its confidence target.'
            : placement.stopReason === 'bank-exhausted'
              ? 'The exam ended because the item bank ran out of useful questions.'
              : 'The exam ran its full item budget.'}
        </p>
      </header>

      <div className="mt-8 grid grid-cols-4 gap-3">
        <Tally label="Gaps" value={gaps.length} tone="bg-red-50 text-red-900" />
        <Tally label="Decayed" value={decayed.length} tone="bg-violet-50 text-violet-900" />
        <Tally label="Fragile" value={fragile.length} tone="bg-amber-50 text-amber-900" />
        <Tally label="Solid" value={solid.length} tone="bg-emerald-50 text-emerald-900" />
      </div>

      {gaps.length > 0 && (
        <Group
          title="Start here"
          blurb="Little evidence these were ever learned. These need teaching, not revision."
          rows={gaps}
        />
      )}
      {decayed.length > 0 && (
        <Group
          title="Refresh these"
          blurb="You knew these. They have faded. A short review should restore them far faster than relearning."
          rows={decayed}
        />
      )}
      {fragile.length > 0 && (
        <Group title="Shore up" blurb="Held inconsistently — right sometimes, not reliably." rows={fragile} />
      )}
      {solid.length > 0 && (
        <Group title="Holding" blurb="Learned and still available." rows={solid} collapsed />
      )}

      {grouped.inferred.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold text-slate-900">Inferred, not tested</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            These were never asked about. Their standing follows from the prerequisite graph — solving a
            problem implies competence in what it rests on, and failing one limits what can rest on it.
            These are bounds, not estimates: an implied floor says the evidence supports{' '}
            <em>at least</em> that much, not that your ability is that number. Treat them as leads to
            confirm.
          </p>
          <ul className="mt-4 space-y-1">
            {grouped.inferred.map(({ adj, kc, sourceKc }) => (
              <li key={adj.kcId} className="card flex items-center gap-3 px-4 py-2 text-sm">
                <span className="font-mono text-xs text-slate-400">{kc.courseId}</span>
                <span className="text-slate-800">{kc.title}</span>
                {/* Upward inference establishes a floor, downward a ceiling.
                    Rendering a bare percentage would read as an ability
                    estimate, which is exactly what it is not. */}
                <span className="ml-auto tabular-nums text-slate-500">
                  {adj.direction === 'from-dependent' ? 'at least ' : 'at most '}
                  {pct(adj.prior)}
                </span>
                <span className="w-64 truncate text-right text-xs text-slate-400">
                  {adj.direction === 'from-dependent' ? 'implied by' : 'limited by'} {sourceKc?.title ?? adj.source}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-10 flex gap-3 border-t border-slate-200 pt-6">
        <button className="btn-primary" onClick={() => goTo('dashboard')}>
          Go to dashboard
        </button>
      </footer>
    </div>
  );
}

function Tally({ label, value, tone }: { label: string; value: number; tone: string }): React.ReactElement {
  return (
    <div className={`rounded-lg px-4 py-3 ${tone}`}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</div>
    </div>
  );
}

interface Row {
  kc: { id: string; title: string; unit: string; courseId: string };
  mastery: { composite: number; pMastery: number; retrievability: number; diagnosis: keyof typeof DIAGNOSIS_COPY; attempts: number };
}

function Group({
  title,
  blurb,
  rows,
  collapsed = false,
}: {
  title: string;
  blurb: string;
  rows: Row[];
  collapsed?: boolean;
}): React.ReactElement {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">{blurb}</p>
      <ul className="mt-3 space-y-1">
        {(collapsed ? rows.slice(0, 5) : rows).map(({ kc, mastery }) => (
          <li key={kc.id} className="card px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-slate-400">{kc.courseId}</span>
              <span className="text-sm font-medium text-slate-900">{kc.title}</span>
              <span className={`rounded px-1.5 py-0.5 text-xs ${DIAGNOSIS_COPY[mastery.diagnosis].chip}`}>
                {DIAGNOSIS_COPY[mastery.diagnosis].label}
              </span>
              <span className="ml-auto text-xs text-slate-400">{kc.unit}</span>
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
              {/* Showing both factors, not just the product: it is the gap
                  between them that says whether to teach or to review. */}
              <span className="tabular-nums">learned {pct(mastery.pMastery)}</span>
              <span className="tabular-nums">retained {pct(mastery.retrievability)}</span>
              <span className="tabular-nums font-medium text-slate-700">overall {pct(mastery.composite)}</span>
              <span className="ml-auto">{mastery.attempts} response{mastery.attempts === 1 ? '' : 's'}</span>
            </div>
          </li>
        ))}
        {collapsed && rows.length > 5 && (
          <li className="px-4 py-1 text-xs text-slate-400">and {rows.length - 5} more</li>
        )}
      </ul>
    </section>
  );
}
