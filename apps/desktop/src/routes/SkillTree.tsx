import { useMemo, useRef, useState } from 'react';
import { blockingPrerequisites, layoutGraph, skillStates, type KcId, type SkillState } from '@et/domain';
import { usePanZoom } from '@/ui/pan-zoom';
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
 *
 * The camera is a viewBox, not a scroll container. A scrolled graph couples how
 * much of it you can see to the size of the window and can never zoom out far
 * enough to show its shape — which for a prerequisite DAG is the view that
 * answers the only question worth asking of it.
 */

/**
 * Node styling, as theme tokens rather than literal colours.
 *
 * The tree used to paint white cards with pastel fills, which was the one
 * screen that never changed when the theme did — a light-mode diagram sitting
 * on a near-black page. Tokens go through `var()`, so the same five states
 * read correctly in both themes and match every band colour used elsewhere in
 * the app: a node is coloured by what it *means*, and it means the same thing
 * here as it does on the dashboard.
 *
 * SVG presentation attributes do not resolve `var()`, so these are applied as
 * CSS properties through `style` rather than as `fill=`/`stroke=`.
 */
const STATE_STYLE: Record<SkillState, { fill: string; stroke: string; text: string; label: string }> = {
  locked: { fill: 'var(--surface)', stroke: 'var(--line)', text: 'var(--text-faint)', label: 'Locked' },
  available: { fill: 'var(--surface-2)', stroke: 'var(--line-strong)', text: 'var(--text-dim)', label: 'Ready to start' },
  learning: { fill: 'var(--surface-2)', stroke: 'var(--band-developing)', text: 'var(--band-developing)', label: 'Learning' },
  proficient: { fill: 'var(--surface-2)', stroke: 'var(--band-proficient)', text: 'var(--band-proficient)', label: 'Proficient' },
  mastered: { fill: 'var(--surface-2)', stroke: 'var(--band-mastered)', text: 'var(--band-mastered)', label: 'Mastered' },
};

const NODE = { width: 132, height: 44 };

export function SkillTree(): React.ReactElement {
  const content = useApp((s) => s.content);
  const model = useApp((s) => s.model);

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

  // Hooks run before the early return, so the bounds have to tolerate a null
  // layout; an empty graph gets a unit box rather than a NaN viewBox.
  const bounds = useMemo(
    () => ({
      minX: -NODE.width / 2,
      minY: -NODE.height / 2,
      maxX: (layout?.width ?? 1) + NODE.width / 2,
      maxY: (layout?.height ?? 1) + NODE.height / 2,
    }),
    [layout?.width, layout?.height],
  );
  const camera = usePanZoom({ content: bounds, padding: 32, minScale: 0.35, maxScale: 4 });

  // A click that ends a drag is not a click on whatever is under the cursor.
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);

  if (!content || !graph || !layout) {
    return <div className="grid h-full place-items-center text-sm text-ink-faint">Loading…</div>;
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
      <header className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-[15px] font-semibold uppercase tracking-[0.1em] text-ink">
          Knowledge map
        </h1>
        <select
          className="border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-dim focus:border-accent focus:outline-none"
          value={courseFilter}
          onChange={(e) => { setCourseFilter(e.target.value); setFocused(null); }}
        >
          <option value="all">All courses</option>
          {courses.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="h-px flex-1 bg-line" />
        {(Object.keys(STATE_STYLE) as SkillState[]).map((state) => (
          <span key={state} className="flex items-center gap-1.5 whitespace-nowrap">
            <span
              className="inline-block h-2.5 w-2.5 border"
              style={{ background: STATE_STYLE[state].fill, borderColor: STATE_STYLE[state].stroke }}
            />
            <span className="label">{STATE_STYLE[state].label}</span>
            <span className="tabular font-mono text-[11px] text-ink-dim">{tally[state] ?? 0}</span>
          </span>
        ))}
      </header>

      <div className="card relative mt-4 overflow-hidden p-0">
        <div className="pointer-events-none absolute right-3 top-3 z-10 flex flex-col gap-1">
          <ZoomButton label="+" title="Zoom in" onClick={() => camera.zoomBy(1.3)} />
          <ZoomButton label="−" title="Zoom out" onClick={() => camera.zoomBy(1 / 1.3)} />
          <ZoomButton label="⤢" title="Fit to view" onClick={camera.fit} />
        </div>
        <span className="pointer-events-none absolute bottom-2 left-3 z-10 text-[11px] text-ink-faint">
          Scroll to zoom · drag to pan · {Math.round(camera.scale * 100)}%
        </span>
        <svg
          ref={camera.ref}
          viewBox={camera.viewBox}
          className={`h-[62vh] w-full touch-none select-none ${camera.isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            dragOrigin.current = { x: e.clientX, y: e.clientY };
            camera.beginPan(e);
          }}
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
                onClick={(e) => {
                  const start = dragOrigin.current;
                  const moved = start
                    ? Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4
                    : false;
                  if (!moved) setFocused(isFocused ? null : node.kcId);
                }}
                className="cursor-pointer"
                data-kc-id={node.kcId}
                data-skill-state={state}
              >
                <rect
                  width={NODE.width} height={NODE.height} rx={1}
                  style={{
                    fill: style.fill,
                    stroke: isFocused ? 'var(--accent)' : style.stroke,
                  }}
                  strokeWidth={isFocused ? 2 : 1}
                />
                {/* Mastery fill along the bottom edge: the bar is the number. */}
                {mastery && mastery.composite > 0 && (
                  <rect
                    x={2} y={NODE.height - 6}
                    width={Math.max(2, (NODE.width - 4) * Math.min(1, mastery.composite))}
                    height={4} rx={0} style={{ fill: style.stroke }} opacity={0.8}
                  />
                )}
                <text x={NODE.width / 2} y={17} textAnchor="middle" fontSize={9.5} style={{ fill: style.text }}>
                  {truncate(kc?.title ?? node.kcId, 22)}
                </text>
                <text x={NODE.width / 2} y={30} textAnchor="middle" fontSize={8.5} style={{ fill: style.text }} opacity={0.7}>
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
            <h2 className="text-base font-semibold text-ink">{focusedKc.title}</h2>
            <span className="text-xs text-ink-faint">{focusedKc.courseId} · {focusedKc.unit}</span>
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

          {focusedKc.description && <p className="mt-2 text-sm text-ink-dim">{focusedKc.description}</p>}

          {focusedMastery && focusedMastery.attempts > 0 ? (
            <dl className="mt-3 flex flex-wrap gap-6 text-sm">
              <Stat label="Mastery" value={`${Math.round(focusedMastery.composite * 100)}%`} />
              <Stat label="Ever learned" value={`${Math.round(focusedMastery.pMastery * 100)}%`} />
              <Stat label="Recall today" value={`${Math.round(focusedMastery.retrievability * 100)}%`} />
              <Stat label="Attempts" value={String(focusedMastery.attempts)} />
            </dl>
          ) : (
            <p className="mt-3 text-sm text-ink-dim">No evidence yet — this topic has not been tested.</p>
          )}

          {blockers.length > 0 && (
            <div className="mt-3 rounded border-l-2 border-warn/40 pl-3">
              <p className="text-sm text-ink-dim">
                Locked because {blockers.length === 1 ? 'this prerequisite is' : 'these prerequisites are'} not in place:
              </p>
              <ul className="mt-1 space-y-0.5 text-sm">
                {blockers.map((id) => (
                  <li key={id}>
                    <button className="text-ink underline" onClick={() => setFocused(id)}>
                      {content.graph.kcs.get(id)?.title ?? id}
                    </button>
                    <span className="ml-2 text-xs text-ink-faint">
                      {content.graph.kcs.get(id)?.courseId}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <p className="mt-4 text-xs text-ink-dim">
        Dashed purple edges cross a course boundary — those are the dependencies a per-course
        gradebook cannot represent.
      </p>
    </div>
  );
}

function ZoomButton({
  label, title, onClick,
}: { label: string; title: string; onClick: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="pointer-events-auto h-7 w-7 rounded border border-line-strong bg-surface/90 text-sm leading-none text-ink-dim shadow-sm hover:bg-surface"
    >
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="tabular-nums text-ink">{value}</dd>
    </div>
  );
}

const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;
