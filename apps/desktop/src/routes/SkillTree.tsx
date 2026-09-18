import { useMemo, useState } from 'react';
import { blockingPrerequisites, layoutGraph, skillStates, type KcId, type SkillState } from '@et/domain';
import { useApp } from '@/store';

/**
 * The skill tree.
 *
 * This is the real prerequisite DAG, laid out by depth — not a decorative map
 * drawn to resemble one. That is what makes it diagnostic: a node is locked
 * because something it genuinely depends on is not in place, and the edge that
 * locks it is on screen. Cross-course edges are drawn differently because they
 * are the interesting ones — the reason a circuits topic is blocked by a
 * calculus topic is exactly the connection a gradebook cannot show.
 */

const STATE_STYLE: Record<SkillState, { fill: string; stroke: string; text: string; label: string }> = {
  locked: { fill: '#f1f5f9', stroke: '#cbd5e1', text: '#94a3b8', label: 'Locked' },
  available: { fill: '#ffffff', stroke: '#64748b', text: '#334155', label: 'Ready to start' },
  learning: { fill: '#fef3c7', stroke: '#f59e0b', text: '#92400e', label: 'Learning' },
  proficient: { fill: '#dbeafe', stroke: '#3b82f6', text: '#1e40af', label: 'Proficient' },
  mastered: { fill: '#fef9c3', stroke: '#ca8a04', text: '#854d0e', label: 'Mastered' },
};

const NODE = { width: 132, height: 44 };

export function SkillTree(): React.ReactElement {
  const content = useApp((s) => s.content);
  const model = useApp((s) => s.model);
  const goTo = useApp((s) => s.goTo);
  const [focused, setFocused] = useState<KcId | null>(null);
  const [courseFilter, setCourseFilter] = useState<string>('all');

  const courses = useMemo(
    () => (content ? [...new Set([...content.graph.kcs.values()].map((k) => k.courseId))].sort() : []),
    [content],
  );

  const graph = useMemo(() => {
    if (!content) return null;
    return courseFilter === 'all' ? content.graph : content.graph.subgraphForCourses([courseFilter]);
  }, [content, courseFilter]);

  const layout = useMemo(() => (graph ? layoutGraph(graph, { columnGap: 156, rowGap: 104 }) : null), [graph]);
  const states = useMemo(
    () => (graph ? skillStates(graph, model?.byKc ?? new Map()) : new Map<KcId, SkillState>()),
    [graph, model],
  );

  if (!content || !graph || !layout) {
    return <div className="grid h-full place-items-center text-sm text-slate-400 dark:text-slate-500">Loading…</div>;
  }

  const nodeById = new Map(layout.nodes.map((n) => [n.kcId, n]));
  const focusedKc = focused ? content.graph.kcs.get(focused) : null;
  const focusedMastery = focused ? model?.byKc.get(focused) : null;
  const blockers = focused ? blockingPrerequisites(graph, model?.byKc ?? new Map(), focused) : [];

  const tally = [...states.values()].reduce<Record<string, number>>((acc, state) => {
    acc[state] = (acc[state] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Skill tree</h1>
        <select
          className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600"
          value={courseFilter}
          onChange={(e) => { setCourseFilter(e.target.value); setFocused(null); }}
        >
          <option value="all">All courses</option>
          {courses.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="ml-auto text-sm text-slate-500 underline dark:text-slate-400" onClick={() => goTo('dashboard')}>
          Back to dashboard
        </button>
      </header>

      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        {(Object.keys(STATE_STYLE) as SkillState[]).map((state) => (
          <span key={state} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-sm border"
              style={{ background: STATE_STYLE[state].fill, borderColor: STATE_STYLE[state].stroke }}
            />
            <span className="text-slate-600 dark:text-slate-400">{STATE_STYLE[state].label}</span>
            <span className="tabular-nums text-slate-400 dark:text-slate-500">{tally[state] ?? 0}</span>
          </span>
        ))}
      </div>

      <div className="card mt-4 overflow-x-auto p-2">
        <svg
          width={Math.max(layout.width, 640)}
          height={layout.height + NODE.height}
          className="min-w-full"
          data-testid="skill-tree"
        >
          {layout.edges.map((edge, i) => {
            const from = nodeById.get(edge.from);
            const to = nodeById.get(edge.to);
            if (!from || !to) return null;
            const dim = focused !== null && edge.from !== focused && edge.to !== focused;
            return (
              <line
                key={i}
                x1={from.x} y1={from.y + NODE.height / 2}
                x2={to.x} y2={to.y - NODE.height / 2}
                stroke={edge.crossCourse ? '#a855f7' : '#cbd5e1'}
                strokeWidth={edge.crossCourse ? 2 : 1.5}
                strokeDasharray={edge.crossCourse ? '5 3' : undefined}
                opacity={dim ? 0.25 : 1}
              />
            );
          })}

          {layout.nodes.map((node) => {
            const kc = content.graph.kcs.get(node.kcId);
            const state = states.get(node.kcId) ?? 'locked';
            const style = STATE_STYLE[state];
            const mastery = model?.byKc.get(node.kcId);
            const isFocused = node.kcId === focused;

            return (
              <g
                key={node.kcId}
                transform={`translate(${node.x - NODE.width / 2},${node.y - NODE.height / 2})`}
                onClick={() => setFocused(isFocused ? null : node.kcId)}
                className="cursor-pointer"
                data-kc-id={node.kcId}
                data-skill-state={state}
              >
                <rect
                  width={NODE.width} height={NODE.height} rx={6}
                  fill={style.fill}
                  stroke={isFocused ? '#0f172a' : style.stroke}
                  strokeWidth={isFocused ? 2.5 : 1.5}
                />
                {/* Mastery fill along the bottom edge: the bar is the number. */}
                {mastery && mastery.composite > 0 && (
                  <rect
                    x={2} y={NODE.height - 6}
                    width={Math.max(2, (NODE.width - 4) * Math.min(1, mastery.composite))}
                    height={4} rx={2} fill={style.stroke} opacity={0.7}
                  />
                )}
                <text x={NODE.width / 2} y={17} textAnchor="middle" fontSize={9.5} fill={style.text}>
                  {truncate(kc?.title ?? node.kcId, 22)}
                </text>
                <text x={NODE.width / 2} y={30} textAnchor="middle" fontSize={8.5} fill={style.text} opacity={0.75}>
                  {kc?.courseId ?? ''}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {focusedKc && (
        <section className="card mt-4 p-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{focusedKc.title}</h2>
            <span className="text-xs text-slate-400 dark:text-slate-500">{focusedKc.courseId} · {focusedKc.unit}</span>
            <span
              className="rounded px-1.5 py-0.5 text-xs"
              style={{
                background: STATE_STYLE[states.get(focusedKc.id) ?? 'locked'].fill,
                color: STATE_STYLE[states.get(focusedKc.id) ?? 'locked'].text,
              }}
            >
              {STATE_STYLE[states.get(focusedKc.id) ?? 'locked'].label}
            </span>
          </div>

          {focusedKc.description && <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{focusedKc.description}</p>}

          {focusedMastery && focusedMastery.attempts > 0 ? (
            <dl className="mt-3 flex flex-wrap gap-6 text-sm">
              <Stat label="Mastery" value={`${Math.round(focusedMastery.composite * 100)}%`} />
              <Stat label="Ever learned" value={`${Math.round(focusedMastery.pMastery * 100)}%`} />
              <Stat label="Recall today" value={`${Math.round(focusedMastery.retrievability * 100)}%`} />
              <Stat label="Attempts" value={String(focusedMastery.attempts)} />
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No evidence yet — this topic has not been tested.</p>
          )}

          {blockers.length > 0 && (
            <div className="mt-3 rounded border-l-2 border-orange-300 pl-3">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Locked because {blockers.length === 1 ? 'this prerequisite is' : 'these prerequisites are'} not in place:
              </p>
              <ul className="mt-1 space-y-0.5 text-sm">
                {blockers.map((id) => (
                  <li key={id}>
                    <button className="text-slate-900 underline dark:text-slate-100" onClick={() => setFocused(id)}>
                      {content.graph.kcs.get(id)?.title ?? id}
                    </button>
                    <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                      {content.graph.kcs.get(id)?.courseId}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        Dashed purple edges cross a course boundary — those are the dependencies a per-course
        gradebook cannot represent.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="tabular-nums text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  );
}

const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;
