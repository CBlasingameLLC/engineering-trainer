import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GROUND, extractNets, formatValue, nextDesignator, pinPositions, toNetlist,
  type ElementKind, type PlacedComponent, type Point, type Rotation, type Schematic,
} from '@et/circuits';
import { usePanZoom } from '@/ui/pan-zoom';
import { ComponentSymbol, GroundSymbol, PALETTE } from './symbols';

/**
 * Schematic editor.
 *
 * Geometry is the only state. Connectivity is derived on every render by
 * `extractNets`, never stored — which means the drawing and the circuit can
 * never disagree, and there is no connection graph to keep in sync. It costs a
 * union-find pass per render, on a few dozen points.
 *
 * Used both standalone in the Circuit Lab and inline in the session player for
 * `circuit-build` items, so it is a controlled component: the parent owns the
 * schematic and decides what saving means.
 *
 * The interaction model is the one a schematic capture tool has, because that
 * is what people bring to it: parts drag, the selection is a set, wire vertices
 * are handles, the wheel zooms, and every tool has a one-key shortcut. The
 * previous version could place a part and then never move it, and a wire once
 * drawn could not be selected at all — so the only way to fix a mistake was to
 * start over.
 */

const GRID = 18;

export type Tool = 'select' | 'wire' | 'ground' | ElementKind;

/**
 * Selection ids are namespaced because the three things you can select live in
 * three different arrays, and grounds have no identity of their own — they are
 * bare points, addressed by index. Every mutation that reorders an array clears
 * the selection rather than letting an index point at a different ground.
 */
type SelectionId = string;
const componentId = (id: string): SelectionId => `c:${id}`;
const wireId = (id: string): SelectionId => `w:${id}`;
const groundId = (index: number): SelectionId => `g:${index}`;

const HOTKEY_TOOL: Record<string, Tool> = {
  s: 'select', w: 'wire', g: 'ground',
  r: 'resistor', c: 'capacitor', l: 'inductor',
  v: 'vsource', i: 'isource', o: 'opamp',
};

const HOTKEY_HINTS: [string, string][] = [
  ['S', 'select'], ['W', 'wire'], ['G', 'ground'],
  ['R', 'resistor'], ['C', 'capacitor'], ['L', 'inductor'],
  ['V', 'V source'], ['I', 'I source'], ['O', 'op-amp'],
  ['Space', 'rotate'], ['Del', 'delete'], ['Ctrl+Z', 'undo'], ['Esc', 'cancel'],
];

export interface SchematicEditorProps {
  value: Schematic;
  onChange: (next: Schematic) => void;
  /** Extra height for the canvas, in grid units. */
  rows?: number;
  columns?: number;
  readOnly?: boolean;
}

const snap = (n: number): number => Math.round(n / GRID);

export function SchematicEditor({
  value,
  onChange,
  rows = 26,
  columns = 34,
  readOnly = false,
}: SchematicEditorProps): React.ReactElement {
  const [tool, setTool] = useState<Tool>('select');
  const [selection, setSelection] = useState<ReadonlySet<SelectionId>>(new Set());
  const [draft, setDraft] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [marquee, setMarquee] = useState<{ from: Point; to: Point } | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const width = columns * GRID;
  const height = rows * GRID;

  // Padding 0 and a viewBox equal to the element's intrinsic size, so the
  // default view is 1:1 with grid coordinates. Anything else would make
  // "click at grid (4, 8)" mean something different from what it says.
  const camera = usePanZoom({
    content: useMemo(() => ({ minX: 0, minY: 0, maxX: width, maxY: height }), [width, height]),
    padding: 0,
    minScale: 0.3,
    maxScale: 5,
  });

  const nets = useMemo(() => extractNets(value), [value]);
  const built = useMemo(() => toNetlist(value), [value]);

  // --- history -------------------------------------------------------------
  // A drag emits a change on every pointermove, so pushing history inside
  // `onChange` would make undo step back one pixel at a time. Instead the
  // gesture pushes once when it starts and then edits silently.
  const past = useRef<Schematic[]>([]);
  const future = useRef<Schematic[]>([]);
  const valueRef = useRef(value);
  valueRef.current = value;

  /** Record the current drawing as an undo point. */
  const checkpoint = useCallback(() => {
    past.current = [...past.current.slice(-49), valueRef.current];
    future.current = [];
  }, []);

  /** A discrete edit: one undo point, then the change. */
  const commit = useCallback(
    (next: Schematic) => {
      checkpoint();
      onChange(next);
    },
    [checkpoint, onChange],
  );

  const undo = useCallback(() => {
    const previous = past.current.at(-1);
    if (!previous) return;
    past.current = past.current.slice(0, -1);
    future.current = [...future.current, valueRef.current];
    setSelection(new Set());
    onChange(previous);
  }, [onChange]);

  const redo = useCallback(() => {
    const next = future.current.at(-1);
    if (!next) return;
    future.current = future.current.slice(0, -1);
    past.current = [...past.current, valueRef.current];
    setSelection(new Set());
    onChange(next);
  }, [onChange]);

  // --- coordinates ---------------------------------------------------------
  const toGrid = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const world = camera.toWorld(event);
      return { x: snap(world.x), y: snap(world.y) };
    },
    [camera],
  );

  // --- mutation ------------------------------------------------------------
  const place = (kind: ElementKind, at: Point): void => {
    const entry = PALETTE.find((p) => p.kind === kind);
    const component: PlacedComponent = {
      id: nextDesignator(value, kind),
      kind,
      at,
      rotation: 0,
      value: entry?.defaultValue ?? 1000,
    };
    commit({ ...value, components: [...value.components, component] });
    setSelection(new Set([componentId(component.id)]));
    setTool('select');
  };

  const commitWire = useCallback(() => {
    if (draft.length >= 2) {
      commit({
        ...value,
        wires: [...value.wires, { id: `w${value.wires.length + 1}-${Date.now()}`, points: draft }],
      });
    }
    setDraft([]);
    setTool('select');
  }, [commit, draft, value]);

  const update = (id: string, patch: Partial<PlacedComponent>): void => {
    commit({
      ...value,
      components: value.components.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  };

  const deleteSelection = useCallback(() => {
    if (selection.size === 0) return;
    commit({
      ...value,
      components: value.components.filter((c) => !selection.has(componentId(c.id))),
      wires: value.wires.filter((w) => !selection.has(wireId(w.id))),
      grounds: value.grounds.filter((_, i) => !selection.has(groundId(i))),
    });
    setSelection(new Set());
  }, [commit, selection, value]);

  const rotateSelection = useCallback(() => {
    const ids = [...selection].filter((s) => s.startsWith('c:')).map((s) => s.slice(2));
    if (ids.length === 0) return;
    commit({
      ...value,
      components: value.components.map((c) =>
        ids.includes(c.id) ? { ...c, rotation: (((c.rotation + 90) % 360) as Rotation) } : c,
      ),
    });
  }, [commit, selection, value]);

  // --- keyboard ------------------------------------------------------------
  useEffect(() => {
    if (readOnly) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      // Never steal a key from a field someone is typing into — the value box
      // in this very panel accepts "4.7k", and `c` would otherwise drop a
      // capacitor on the canvas mid-word.
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;

      const key = event.key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === 'Escape') {
        setDraft([]);
        setSelection(new Set());
        setTool('select');
        return;
      }
      if (event.key === 'Enter' && draft.length >= 2) {
        event.preventDefault();
        commitWire();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelection();
        return;
      }
      if (event.key === ' ') {
        // Space is the page-scroll key, and this canvas must not scroll.
        event.preventDefault();
        setSpaceHeld(true);
        rotateSelection();
        return;
      }
      const next = HOTKEY_TOOL[key];
      if (next) {
        event.preventDefault();
        setTool(next);
        setDraft([]);
        if (next !== 'select') setSelection(new Set());
      }
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key === ' ') setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [commitWire, deleteSelection, draft.length, readOnly, redo, rotateSelection, undo]);

  // --- dragging ------------------------------------------------------------
  /**
   * Move everything selected, in one history entry.
   *
   * Offsets are recomputed from the gesture's own start each move rather than
   * accumulated, so a drag that crosses grid cells lands exactly where the
   * cursor is instead of drifting by the rounding error of every step.
   */
  const beginMove = (event: React.PointerEvent, ids: ReadonlySet<SelectionId>): void => {
    const origin = toGrid(event);
    const before = valueRef.current;
    let moved = false;

    const move = (e: PointerEvent): void => {
      const now = toGrid(e);
      const dx = now.x - origin.x;
      const dy = now.y - origin.y;
      if (dx === 0 && dy === 0 && !moved) return;
      if (!moved) {
        moved = true;
        checkpoint();
      }
      onChange({
        ...before,
        components: before.components.map((c) =>
          ids.has(componentId(c.id)) ? { ...c, at: { x: c.at.x + dx, y: c.at.y + dy } } : c,
        ),
        wires: before.wires.map((w) =>
          ids.has(wireId(w.id))
            ? { ...w, points: w.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
            : w,
        ),
        grounds: before.grounds.map((g, i) =>
          ids.has(groundId(i)) ? { x: g.x + dx, y: g.y + dy } : g,
        ),
      });
    };
    const done = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', done);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', done);
  };

  /** Drag one vertex of one wire, which is how a route gets fixed. */
  const beginVertexDrag = (event: React.PointerEvent, wire: string, index: number): void => {
    event.stopPropagation();
    const before = valueRef.current;
    let moved = false;

    const move = (e: PointerEvent): void => {
      const at = toGrid(e);
      if (!moved) {
        moved = true;
        checkpoint();
      }
      onChange({
        ...before,
        wires: before.wires.map((w) =>
          w.id === wire ? { ...w, points: w.points.map((p, i) => (i === index ? at : p)) } : w,
        ),
      });
    };
    const done = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', done);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', done);
  };

  /** Rubber-band select: everything whose anchor falls inside the box. */
  const beginMarquee = (event: React.PointerEvent, additive: boolean): void => {
    const from = toGrid(event);
    const base = additive ? new Set(selection) : new Set<SelectionId>();
    setMarquee({ from, to: from });

    const move = (e: PointerEvent): void => setMarquee({ from, to: toGrid(e) });
    const done = (e: PointerEvent): void => {
      const to = toGrid(e);
      const minX = Math.min(from.x, to.x);
      const maxX = Math.max(from.x, to.x);
      const minY = Math.min(from.y, to.y);
      const maxY = Math.max(from.y, to.y);
      const inside = (p: Point): boolean => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;

      const picked = new Set(base);
      for (const c of valueRef.current.components) if (inside(c.at)) picked.add(componentId(c.id));
      for (const w of valueRef.current.wires) if (w.points.every(inside)) picked.add(wireId(w.id));
      valueRef.current.grounds.forEach((g, i) => { if (inside(g)) picked.add(groundId(i)); });

      setSelection(picked);
      setMarquee(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', done);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', done);
  };

  /** Pointer-down on a selectable thing, shared by parts, wires and grounds. */
  const selectAndMaybeMove = (event: React.PointerEvent, id: SelectionId): void => {
    if (readOnly || tool !== 'select' || event.button !== 0) return;
    event.stopPropagation();

    // Dragging one of several selected things moves the whole set; dragging
    // something unselected selects just it first. Shift always toggles and
    // never starts a move, so building a selection cannot nudge the drawing.
    if (event.shiftKey) {
      const next = new Set(selection);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelection(next);
      return;
    }
    const ids = selection.has(id) ? selection : new Set([id]);
    if (!selection.has(id)) setSelection(ids);
    beginMove(event, ids);
  };

  const onCanvasPointerDown = (event: React.PointerEvent): void => {
    if (event.button === 1 || spaceHeld) {
      event.preventDefault();
      camera.beginPan(event);
      return;
    }
    if (readOnly || event.button !== 0) return;
    if (tool === 'select') beginMarquee(event, event.shiftKey);
  };

  const onCanvasClick = (event: React.MouseEvent): void => {
    if (readOnly || spaceHeld) return;
    const at = toGrid(event);

    if (tool === 'select') return; // handled by pointerdown
    if (tool === 'ground') {
      commit({ ...value, grounds: [...value.grounds, at] });
      setTool('select');
      return;
    }
    if (tool === 'wire') {
      const last = draft[draft.length - 1];
      if (last && last.x === at.x && last.y === at.y) {
        commitWire();
        return;
      }
      setDraft([...draft, at]);
      return;
    }
    place(tool, at);
  };

  const selectedComponents = value.components.filter((c) => selection.has(componentId(c.id)));
  const only = selectedComponents.length === 1 ? selectedComponents[0]! : null;
  const selectedWire =
    [...selection].filter((s) => s.startsWith('w:')).length === 1
      ? value.wires.find((w) => selection.has(wireId(w.id))) ?? null
      : null;

  return (
    <div className="flex gap-4">
      {!readOnly && (
        <div className="w-44 shrink-0 space-y-1">
          <ToolButton tool="select" active={tool === 'select'} hint="S" onClick={() => { setTool('select'); setDraft([]); }}>
            Select
          </ToolButton>
          <ToolButton tool="wire" active={tool === 'wire'} hint="W" onClick={() => { setTool('wire'); setSelection(new Set()); }}>
            Wire{tool === 'wire' && <span className="ml-1 text-slate-300 dark:text-slate-600">· Enter to finish</span>}
          </ToolButton>
          <ToolButton tool="ground" active={tool === 'ground'} hint="G" onClick={() => { setTool('ground'); setSelection(new Set()); }}>
            Ground
          </ToolButton>

          <div className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Parts</div>
          {PALETTE.map((entry) => (
            <ToolButton
              key={entry.kind}
              tool={entry.kind}
              active={tool === entry.kind}
              hint={Object.entries(HOTKEY_TOOL).find(([, t]) => t === entry.kind)?.[0]?.toUpperCase()}
              onClick={() => { setTool(entry.kind); setSelection(new Set()); setDraft([]); }}
            >
              {entry.label}
            </ToolButton>
          ))}

          {selection.size > 1 && (
            <div className="mt-3 rounded border border-slate-200 p-2 text-xs dark:border-slate-700">
              <div className="text-slate-900 dark:text-slate-100">{selection.size} selected</div>
              <div className="mt-2 flex gap-1">
                <SmallButton onClick={rotateSelection}>Rotate</SmallButton>
                <SmallButton tone="danger" onClick={deleteSelection}>Delete</SmallButton>
              </div>
            </div>
          )}

          {only && (
            <div className="mt-3 rounded border border-slate-200 p-2 dark:border-slate-700">
              <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">{only.id}</div>
              {only.kind !== 'opamp' && (
                <label className="mt-2 block text-[11px] text-slate-500 dark:text-slate-400">
                  Value
                  <input
                    key={only.id}
                    className="mt-0.5 w-full rounded border border-slate-300 px-1 py-0.5 text-xs tabular-nums dark:border-slate-600"
                    defaultValue={formatValue(only.value)}
                    onBlur={(e) => {
                      const parsed = Number(e.target.value) || parseSuffixed(e.target.value);
                      if (Number.isFinite(parsed) && parsed !== 0) update(only.id, { value: parsed });
                    }}
                  />
                </label>
              )}
              <div className="mt-2 flex gap-1">
                <SmallButton onClick={rotateSelection}>Rotate</SmallButton>
                <SmallButton tone="danger" onClick={deleteSelection}>Delete</SmallButton>
              </div>
            </div>
          )}

          {selectedWire && (
            <div className="mt-3 rounded border border-slate-200 p-2 text-xs dark:border-slate-700">
              <div className="text-slate-900 dark:text-slate-100">Wire · {selectedWire.points.length} vertices</div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Drag a handle to reroute.</p>
              <div className="mt-2 flex gap-1">
                <SmallButton tone="danger" onClick={deleteSelection}>Delete</SmallButton>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="relative overflow-hidden rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          {!readOnly && (
            <div className="pointer-events-none absolute right-2 top-2 z-10 flex flex-col gap-1">
              <SmallSquare title="Zoom in" onClick={() => camera.zoomBy(1.3)}>+</SmallSquare>
              <SmallSquare title="Zoom out" onClick={() => camera.zoomBy(1 / 1.3)}>−</SmallSquare>
              <SmallSquare title="Fit to view" onClick={camera.fit}>⤢</SmallSquare>
            </div>
          )}
          <svg
            ref={camera.ref}
            width={width}
            height={height}
            viewBox={camera.viewBox}
            className={`block touch-none select-none ${
              camera.isPanning || spaceHeld ? 'cursor-grabbing' : tool === 'select' ? 'cursor-default' : 'cursor-crosshair'
            }`}
            onPointerDown={onCanvasPointerDown}
            onClick={onCanvasClick}
            onMouseMove={(e) => tool === 'wire' && setCursor(toGrid(e))}
            data-testid="schematic-canvas"
          >
            <defs>
              <pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
                <circle cx={0} cy={0} r={0.8} fill="#cbd5e1" />
              </pattern>
            </defs>
            {/* The grid follows the camera, so panning does not run off it. */}
            <rect x={camera.view.x} y={camera.view.y} width={camera.view.w} height={camera.view.h} fill="url(#grid)" />

            {value.wires.map((wire) => {
              const isSelected = selection.has(wireId(wire.id));
              const points = wire.points.map((p) => `${p.x * GRID},${p.y * GRID}`).join(' ');
              return (
                <g key={wire.id} data-wire-id={wire.id}>
                  {/* A 2px line is a 2px hit target. The invisible fat stroke
                      underneath is what makes a wire clickable at all — without
                      it a drawn wire could never be selected or deleted. */}
                  <polyline
                    points={points}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={10}
                    className={readOnly || tool !== 'select' ? '' : 'cursor-pointer'}
                    onPointerDown={(e) => selectAndMaybeMove(e, wireId(wire.id))}
                  />
                  <polyline
                    points={points}
                    fill="none"
                    stroke={isSelected ? '#0284c7' : '#0f172a'}
                    strokeWidth={isSelected ? 3 : 2}
                    pointerEvents="none"
                  />
                </g>
              );
            })}

            {selectedWire?.points.map((p, i) => (
              <rect
                key={`vertex-${i}`}
                x={p.x * GRID - 4}
                y={p.y * GRID - 4}
                width={8}
                height={8}
                fill="#ffffff"
                stroke="#0284c7"
                strokeWidth={1.5}
                className="cursor-move"
                onPointerDown={(e) => beginVertexDrag(e, selectedWire.id, i)}
              />
            ))}

            {draft.length > 0 && (
              <polyline
                points={[...draft, ...(cursor ? [cursor] : [])].map((p) => `${p.x * GRID},${p.y * GRID}`).join(' ')}
                fill="none"
                stroke="#0ea5e9"
                strokeWidth={2}
                strokeDasharray="4 3"
                pointerEvents="none"
              />
            )}

            {value.grounds.map((g, i) => (
              <g
                key={`gnd-${i}`}
                transform={`translate(${g.x * GRID},${g.y * GRID})`}
                stroke={selection.has(groundId(i)) ? '#0284c7' : '#0f172a'}
                className={readOnly || tool !== 'select' ? '' : 'cursor-pointer'}
                onPointerDown={(e) => selectAndMaybeMove(e, groundId(i))}
                data-ground-index={i}
              >
                <circle cx={0} cy={GRID * 0.5} r={GRID * 0.7} fill="transparent" stroke="none" />
                <GroundSymbol grid={GRID} />
              </g>
            ))}

            {value.components.map((component) => {
              const isSelected = selection.has(componentId(component.id));
              return (
                <g
                  key={component.id}
                  transform={`translate(${component.at.x * GRID},${component.at.y * GRID}) rotate(${component.rotation})`}
                  stroke={isSelected ? '#0284c7' : '#0f172a'}
                  onPointerDown={(e) => selectAndMaybeMove(e, componentId(component.id))}
                  className={readOnly ? '' : tool === 'select' ? 'cursor-move' : 'cursor-crosshair'}
                  data-component-id={component.id}
                  data-selected={isSelected ? 'true' : undefined}
                >
                  {/* Body hit box: the symbol is strokes with no fill, so
                      without this only the 2px lines themselves are grabbable. */}
                  <rect
                    x={-GRID * 1.1} y={-GRID * 2.2} width={GRID * 2.2} height={GRID * 4.4}
                    fill="transparent" stroke="none"
                  />
                  <ComponentSymbol kind={component.kind} grid={GRID} />
                  <text
                    x={GRID * 1.3} y={-GRID * 0.4}
                    className="select-none" fontSize={10}
                    fill={isSelected ? '#0284c7' : '#475569'} stroke="none"
                    transform={`rotate(${-component.rotation})`}
                  >
                    {component.id}
                  </text>
                  {component.kind !== 'opamp' && (
                    <text
                      x={GRID * 1.3} y={GRID * 0.7}
                      className="select-none" fontSize={10}
                      fill="#94a3b8" stroke="none"
                      transform={`rotate(${-component.rotation})`}
                    >
                      {formatValue(component.value)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Pin dots, coloured by whether the pin resolved to a net. An
                unconnected terminal is the single most common reason a drawing
                that looks finished will not simulate. */}
            {value.components.flatMap((component) =>
              pinPositions(component).map((pin, i) => {
                const net = nets.byPoint.get(`${pin.x},${pin.y}`);
                const connected = net !== undefined && countAt(value, pin) > 1;
                return (
                  <circle
                    key={`${component.id}-${i}`}
                    cx={pin.x * GRID} cy={pin.y * GRID} r={3}
                    fill={connected ? (net === GROUND ? '#0f172a' : '#22c55e') : '#f97316'}
                    pointerEvents="none"
                  />
                );
              }),
            )}

            {marquee && (
              <rect
                x={Math.min(marquee.from.x, marquee.to.x) * GRID}
                y={Math.min(marquee.from.y, marquee.to.y) * GRID}
                width={Math.abs(marquee.to.x - marquee.from.x) * GRID}
                height={Math.abs(marquee.to.y - marquee.from.y) * GRID}
                fill="#0ea5e9" fillOpacity={0.08}
                stroke="#0ea5e9" strokeWidth={1} strokeDasharray="4 3"
                pointerEvents="none"
              />
            )}
          </svg>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>{value.components.length} part(s)</span>
          <span>{Math.max(0, nets.byNet.size - 1)} net(s)</span>
          {built.issues.length > 0 && (
            <span className="text-orange-700">
              {built.issues.length} issue(s): {built.issues[0]!.message}
            </span>
          )}
          {built.issues.length === 0 && value.components.length > 0 && (
            <span className="text-emerald-700 dark:text-emerald-300">connected</span>
          )}
          <span className="ml-auto tabular-nums">{Math.round(camera.scale * 100)}%</span>
        </div>

        {!readOnly && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400 dark:text-slate-500">
            {HOTKEY_HINTS.map(([key, label]) => (
              <span key={key}>
                <kbd className="rounded border border-slate-300 px-1 font-mono dark:border-slate-600">{key}</kbd> {label}
              </span>
            ))}
            <span>wheel zoom · middle-drag pan · shift-click multi-select</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolButton({
  tool, active, hint, onClick, children,
}: {
  tool: Tool;
  active: boolean;
  hint?: string;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      // `data-tool`, because the label now carries a hotkey hint and anything
      // matching on rendered text breaks the moment the label gains a badge.
      data-tool={tool}
      data-active={active ? 'true' : undefined}
      className={`flex w-full items-center rounded px-2 py-1 text-left text-xs ${
        active ? 'bg-slate-800 text-white dark:bg-slate-700' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
      }`}
      onClick={onClick}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && (
        <kbd className={`ml-1 shrink-0 font-mono text-[10px] ${active ? 'text-slate-300' : 'text-slate-400 dark:text-slate-500'}`}>
          {hint}
        </kbd>
      )}
    </button>
  );
}

function SmallButton({
  onClick, tone, children,
}: { onClick: () => void; tone?: 'danger'; children: React.ReactNode }): React.ReactElement {
  return (
    <button
      className={`flex-1 rounded px-1 py-0.5 text-[11px] ${
        tone === 'danger'
          ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
          : 'bg-slate-100 dark:bg-slate-800 dark:text-slate-300'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SmallSquare({
  title, onClick, children,
}: { title: string; onClick: () => void; children: React.ReactNode }): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="pointer-events-auto h-7 w-7 rounded border border-slate-300 bg-white/90 text-sm leading-none text-slate-600 shadow-sm hover:bg-white dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {children}
    </button>
  );
}

/** How many pins, wire vertices and grounds sit exactly on a point. */
function countAt(schematic: Schematic, point: Point): number {
  let count = 0;
  for (const component of schematic.components) {
    for (const pin of pinPositions(component)) {
      if (pin.x === point.x && pin.y === point.y) count++;
    }
  }
  for (const wire of schematic.wires) {
    for (let i = 1; i < wire.points.length; i++) {
      const a = wire.points[i - 1]!;
      const b = wire.points[i]!;
      const onSegment =
        (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) === 0 &&
        point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x) &&
        point.y >= Math.min(a.y, b.y) && point.y <= Math.max(a.y, b.y);
      if (onSegment) return count + 1;
    }
  }
  for (const ground of schematic.grounds) {
    if (ground.x === point.x && ground.y === point.y) count++;
  }
  return count;
}

/** Accept "4.7k" as well as "4700" in the value box. */
function parseSuffixed(text: string): number {
  const match = /^\s*([+-]?[\d.]+)\s*([a-zA-Zµ]*)\s*$/.exec(text);
  if (!match) return Number.NaN;
  const scales: Record<string, number> = {
    t: 1e12, g: 1e9, meg: 1e6, k: 1e3, '': 1, m: 1e-3, u: 1e-6, µ: 1e-6, n: 1e-9, p: 1e-12,
  };
  const suffix = (match[2] ?? '').toLowerCase();
  for (const [name, scale] of Object.entries(scales).sort((a, b) => b[0].length - a[0].length)) {
    if (name !== '' && suffix.startsWith(name)) return Number(match[1]) * scale;
  }
  return Number(match[1]);
}
