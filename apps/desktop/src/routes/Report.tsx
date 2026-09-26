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
  const challenge = useApp((s) => s.lastChallenge);
  const streak = useApp((s) => s.lastStreak);
  const sessionXp = useApp((s) => s.sessionXp);
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

  // A challenge exam produces a verdict rather than a placement, so it gets its
  // own report. Without this branch a learner who just sat a boss fight would be
  // told there are no results.
  if (challenge) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="flex items-baseline gap-3">
          <h1 className="font-mono text-[15px] font-semibold uppercase tracking-[0.1em] text-ink">
            {challenge.courseId} challenge exam
          </h1>
          <span
            className={`rounded px-2 py-0.5 text-sm font-semibold ${
              challenge.passed ? 'bg-warn/15 text-warn ' : 'bg-line text-ink'
            }`}
          >
            {challenge.passed ? 'Passed — crest earned' : 'Not passed'}
          </span>
          <button className="btn-ghost ml-auto" onClick={() => goTo('dashboard')}>
            Back to dashboard
          </button>
        </header>

        <dl className="mt-6 flex flex-wrap gap-8">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-faint">Score</dt>
            <dd className="text-xl tabular-nums text-ink">{pct(challenge.scoreFraction)}</dd>
            <dd className="text-xs text-ink-dim">{challenge.correctCount} of {challenge.itemsAnswered}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-faint">Coverage</dt>
            <dd className="text-xl tabular-nums text-ink">{pct(challenge.coverage)}</dd>
            <dd className="text-xs text-ink-dim">of the course's topics</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-faint">XP earned</dt>
            <dd className="text-xl tabular-nums text-warn">{sessionXp}</dd>
          </div>
          {streak && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-faint">Streak</dt>
              <dd className="text-xl tabular-nums text-ink">{streak.state.current}</dd>
              <dd className="text-xs text-ink-dim">
                {streak.outcome === 'frozen'
                  ? `${streak.freezesSpent} freeze spent covering a missed day`
                  : streak.outcome === 'broken'
                    ? 'reset after a gap'
                    : streak.freezesEarned > 0
                      ? 'freeze earned'
                      : 'day recorded'}
              </dd>
            </div>
          )}
        </dl>

        {!challenge.passed && challenge.reasons.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-semibold text-ink">What stood in the way</h2>
            <ul className="mt-2 space-y-1 text-sm text-ink-dim">
              {challenge.reasons.map((reason) => (
                <li key={reason}>• {reason}</li>
              ))}
            </ul>
          </section>
        )}

        {challenge.failedKcs.length > 0 && graph && (
          <section className="mt-6">
            <h2 className="text-sm font-semibold text-ink">Topics below the floor</h2>
            <ul className="mt-2 space-y-1">
              {challenge.failedKcs.map((id) => (
                <li key={id} className="card px-4 py-2 text-sm" data-kc-id={id}>
                  <span className="font-medium text-ink">{graph.kcs.get(id)?.title ?? id}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  if (!placement || !grouped) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-sm text-ink-dim">
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
        <h1 className="font-mono text-[15px] font-semibold uppercase tracking-[0.1em] text-ink" data-testid="placement-results">Placement results</h1>
        <p className="mt-2 text-sm text-ink-dim">
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
        <Tally label="Gaps" value={gaps.length} tone="bg-danger/10 text-danger " />
        <Tally label="Decayed" value={decayed.length} tone="bg-gold/10 text-gold" />
        <Tally label="Fragile" value={fragile.length} tone="bg-warn/10 text-warn " />
        <Tally label="Solid" value={solid.length} tone="bg-accent/10 text-accent " />
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
          <h2 className="text-sm font-semibold text-ink" data-testid="inferred-heading">Inferred, not tested</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-dim">
            These were never asked about. Their standing follows from the prerequisite graph — solving a
            problem implies competence in what it rests on, and failing one limits what can rest on it.
            These are bounds, not estimates: an implied floor says the evidence supports{' '}
            <em>at least</em> that much, not that your ability is that number. Treat them as leads to
            confirm.
          </p>
          <ul className="mt-4 space-y-1">
            {grouped.inferred.map(({ adj, kc, sourceKc }) => (
              <li key={adj.kcId} className="card flex items-center gap-3 px-4 py-2 text-sm">
                <span className="font-mono text-xs text-ink-faint">{kc.courseId}</span>
                <span className="text-ink">{kc.title}</span>
                {/* Upward inference establishes a floor, downward a ceiling.
                    Rendering a bare percentage would read as an ability
                    estimate, which is exactly what it is not. */}
                <span className="ml-auto tabular-nums text-ink-dim">
                  {adj.direction === 'from-dependent' ? 'at least ' : 'at most'}
                  {pct(adj.prior)}
                </span>
                <span className="w-64 truncate text-right text-xs text-ink-faint">
                  {adj.direction === 'from-dependent' ? 'implied by' : 'limited by'} {sourceKc?.title ?? adj.source}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-10 flex gap-3 border-t border-line pt-6">
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
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-dim">{blurb}</p>
      <ul className="mt-3 space-y-1">
        {(collapsed ? rows.slice(0, 5) : rows).map(({ kc, mastery }) => (
          // The KC id is exposed for the same reason the session player exposes
          // the item id: titles are display text that changes, ids are stable,
          // and a driver matching on prose silently rots as content is added.
          <li key={kc.id} data-kc-id={kc.id} className="card px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-ink-faint">{kc.courseId}</span>
              <span className="text-sm font-medium text-ink">{kc.title}</span>
              <span className={`rounded px-1.5 py-0.5 text-xs ${DIAGNOSIS_COPY[mastery.diagnosis].chip}`}>
                {DIAGNOSIS_COPY[mastery.diagnosis].label}
              </span>
              <span className="ml-auto text-xs text-ink-faint">{kc.unit}</span>
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-ink-dim">
              {/* Showing both factors, not just the product: it is the gap
                  between them that says whether to teach or to review. */}
              <span className="tabular-nums">learned {pct(mastery.pMastery)}</span>
              <span className="tabular-nums">retained {pct(mastery.retrievability)}</span>
              <span className="tabular-nums font-medium text-ink-dim">overall {pct(mastery.composite)}</span>
              <span className="ml-auto">{mastery.attempts} response{mastery.attempts === 1 ? '' : 's'}</span>
            </div>
          </li>
        ))}
        {collapsed && rows.length > 5 && (
          <li className="px-4 py-1 text-xs text-ink-faint">and {rows.length - 5} more</li>
        )}
      </ul>
    </section>
  );
}
