import { useMemo, useRef, useState } from 'react';
import { blockingPrerequisites, layoutGraph, skillStates, type KcId, type SkillState } from '@et/domain';
import { usePanZoom } from '@/ui/pan-zoom';
import { useApp } from '@/store';

/**
 * The knowledge map.
 *
 * This is the real prerequisite DAG, laid out by depth — not a decorative map
 * drawn to resemble one. That is what makes it diagnostic: a node is locked
 * because something it genuinely depends on is not in place, and the edge that
 * locks it is on screen. Cross-course edges are drawn differently because they
 * are the interesting ones — the reason a circuits topic is blocked by a
 * calculus topic is exactly the connection a gradebook cannot show.
 *
 * The graph now owns the entire window. It used to sit in a bordered card in a
 * 1152-pixel column at 62% of the viewport height, which meant the one screen
 * whose whole value is *shape* was shown through a letterbox — and a card
 * border around a canvas that already pans is a frame drawn around a window.
 * So the camera is the screen: the SVG fills the frame, the engineering grid
 * behind it is the shell's own background showing through, and everything that
 * is not the graph floats over it in a corner.
 *
 * The camera is a viewBox, not a scroll container, for the same reason. A
 * scrolled graph couples how much of it you can see to the size of the window
 * and can never zoom out far enough to show its shape.
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

/**
 * Node geometry, in world units.
 *
 * Bigger than it was, because the canvas is now the window rather than a panel
 * in it: at the old 132x44 a fitted view of all 180-odd components rendered
 * titles the camera then had to be zoomed in to read, which is the worst of
 * both. The gaps scale with it so the layout keeps its proportions.
 */
const NODE = { width: 156, height: 52 };
const GAP = { column: 184, row: 122 };

/**
 * Where a layer wraps onto a second line.
 *
 * Across nine courses the shallowest layer holds thirty-three components,
 * which laid out in one run is a ribbon four times wider than it is tall. Fit
 * to a sixteen-by-nine window that spends all of the width and less than half
 * the height, and renders every label at a size that needs zooming in — at
 * which point the shape the map exists to show is off screen.
 *
 * Scaled with the square root of the graph rather than fixed, because the run
 * length that squares up 181 components makes a 32-component course into four
 * stubby rows. The constant is tuned so the fitted graph comes out a little
 * wider than tall, which is the proportion of the window it is drawn in.
 */
const maxPerRow = (nodes: number): number => Math.max(8, Math.round(Math.sqrt(nodes) * 1.7));

export function SkillTree(): React.ReactElement {
  const content = useApp((s) => s.content);
  const model = useApp((s) => s.model);
  const startKcs = useApp((s) => s.startKcs);

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

  const layout = useMemo(
    () => (graph ? layoutGraph(graph, { columnGap: GAP.column, rowGap: GAP.row, maxPerRow: maxPerRow(graph.kcs.size) }) : null),
    [graph],
  );
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
  const camera = usePanZoom({ content: bounds, padding: 76, minScale: 0.3, maxScale: 5 });

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
    <div className="relative h-full w-full overflow-hidden" data-testid="skill-tree-screen">
      <svg
        ref={camera.ref}
        viewBox={camera.viewBox}
        className={`absolute inset-0 h-full w-full touch-none select-none ${
          camera.isPanning ? 'cursor-grabbing' : 'cursor-grab'
        }`}
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
              style={{ stroke: edge.crossCourse ? 'var(--edge-cross)' : 'var(--edge)' }}
              strokeWidth={edge.crossCourse ? 2 : 1.5}
              strokeDasharray={edge.crossCourse ? '6 4' : undefined}
              opacity={dim ? 0.2 : 1}
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
                strokeWidth={isFocused ? 2.5 : 1}
              />
              {/* Mastery fill along the bottom edge: the bar is the number. */}
              {mastery && mastery.composite > 0 && (
                <rect
                  x={2} y={NODE.height - 7}
                  width={Math.max(2, (NODE.width - 4) * Math.min(1, mastery.composite))}
                  height={5} rx={0} style={{ fill: style.stroke }} opacity={0.8}
                />
              )}
              <text x={NODE.width / 2} y={19} textAnchor="middle" fontSize={11} style={{ fill: style.text }}>
                {truncate(kc?.title ?? node.kcId, 24)}
              </text>
              <text x={NODE.width / 2} y={34} textAnchor="middle" fontSize={9.5} style={{ fill: style.text }} opacity={0.7}>
                {kc?.courseId ?? ''}
              </text>
            </g>
          );
        })}
      </svg>

      {/* ---- Overlays. Everything that is not the graph floats in a corner. ---- */}

      <div className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%-2rem)] flex-col gap-2">
        <div className="panel pointer-events-auto flex flex-wrap items-center gap-3 bg-surface/90 px-3 py-2 backdrop-blur">
          <h1 className="title">Knowledge map</h1>
          <select
            className="border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-ink-dim focus:border-accent focus:outline-none"
            value={courseFilter}
            onChange={(e) => { setCourseFilter(e.target.value); setFocused(null); }}
            aria-label="Course filter"
            data-testid="tree-course-filter"
          >
            <option value="all">All courses</option>
            {courses.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="tabular font-mono text-2xs text-ink-faint">
            {layout.nodes.length} components · {layout.edges.length} edges
          </span>
        </div>
      </div>

      <div className="panel absolute bottom-3 left-3 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-x-4 gap-y-1.5 bg-surface/90 px-3 py-2 backdrop-blur">
        {(Object.keys(STATE_STYLE) as SkillState[]).map((state) => (
          <span key={state} className="flex items-center gap-1.5 whitespace-nowrap">
            <span
              className="inline-block h-2.5 w-2.5 border"
              style={{ background: STATE_STYLE[state].fill, borderColor: STATE_STYLE[state].stroke }}
            />
            <span className="label">{STATE_STYLE[state].label}</span>
            <span className="tabular font-mono text-2xs text-ink-dim">{tally[state] ?? 0}</span>
          </span>
        ))}
        <span className="h-3 w-px bg-line" />
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <svg width="18" height="6" aria-hidden>
            <line x1="0" y1="3" x2="18" y2="3" style={{ stroke: 'var(--edge-cross)' }} strokeWidth={2} strokeDasharray="6 4" />
          </svg>
          <span className="label">Crosses a course</span>
        </span>
      </div>

      <div className="absolute bottom-3 right-3 flex items-center gap-1">
        <span className="tabular mr-1 font-mono text-2xs text-ink-faint">
          {Math.round(camera.scale * 100)}%
        </span>
        <ZoomButton label="−" title="Zoom out" onClick={() => camera.zoomBy(1 / 1.3)} />
        <ZoomButton label="+" title="Zoom in" onClick={() => camera.zoomBy(1.3)} />
        <ZoomButton label="⤢" title="Fit to view" onClick={camera.fit} />
      </div>

      {focusedKc && (
        <aside
          className="panel absolute right-3 top-3 flex max-h-[calc(100%-5rem)] w-[23rem] max-w-[calc(100%-2rem)] flex-col overflow-hidden bg-surface/95 backdrop-blur"
          data-testid="kc-detail"
        >
          <header className="flex items-start gap-2 border-b border-line px-3 py-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold leading-snug text-ink">{focusedKc.title}</h2>
              <div className="label mt-1 truncate">
                {focusedKc.courseId} · {focusedKc.unit}
              </div>
            </div>
            <button
              type="button"
              className="btn-ghost shrink-0 px-1"
              title="Close"
              aria-label="Close"
              onClick={() => setFocused(null)}
            >
              ✕
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
            <span
              className="inline-block border px-1.5 py-0.5 font-mono text-3xs uppercase tracking-[0.08em]"
              style={{
                borderColor: STATE_STYLE[states.get(focusedKc.id) ?? 'locked'].stroke,
                color: STATE_STYLE[states.get(focusedKc.id) ?? 'locked'].text,
              }}
            >
              {STATE_STYLE[states.get(focusedKc.id) ?? 'locked'].label}
            </span>

            {focusedKc.description && (
              <p className="mt-2.5 text-xs leading-relaxed text-ink-dim">{focusedKc.description}</p>
            )}

            {focusedMastery && focusedMastery.attempts > 0 ? (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                <Stat label="Mastery" value={`${Math.round(focusedMastery.composite * 100)}%`} />
                <Stat label="Ever learned" value={`${Math.round(focusedMastery.pMastery * 100)}%`} />
                <Stat label="Recall today" value={`${Math.round(focusedMastery.retrievability * 100)}%`} />
                <Stat label="Attempts" value={String(focusedMastery.attempts)} />
              </dl>
            ) : (
              <p className="mt-3 text-xs text-ink-dim">No evidence yet — this topic has not been tested.</p>
            )}

            {blockers.length > 0 && (
              <div className="mt-3 border-l-2 border-warn/40 pl-3">
                <p className="text-xs text-ink-dim">
                  Locked because {blockers.length === 1 ? 'this prerequisite is' : 'these prerequisites are'} not
                  in place:
                </p>
                <ul className="mt-1 space-y-0.5" data-testid="blockers">
                  {blockers.map((id) => (
                    <li key={id} className="truncate text-xs">
                      <button className="text-ink underline hover:text-accent" onClick={() => setFocused(id)}>
                        {content.graph.kcs.get(id)?.title ?? id}
                      </button>
                      <span className="ml-1.5 text-ink-faint">{content.graph.kcs.get(id)?.courseId}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <footer className="border-t border-line px-3 py-2">
            <button
              type="button"
              className="btn-secondary w-full"
              data-testid="study-focused-kc"
              onClick={() => startKcs([focusedKc.id])}
            >
              Study this
            </button>
          </footer>
        </aside>
      )}
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
      className="h-7 w-7 border border-line-strong bg-surface/90 text-sm leading-none text-ink-dim
                 backdrop-blur transition-colors hover:border-accent hover:text-accent"
    >
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="min-w-0">
      <dt className="label truncate">{label}</dt>
      <dd className="tabular font-mono text-sm text-ink">{value}</dd>
    </div>
  );
}

const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;
