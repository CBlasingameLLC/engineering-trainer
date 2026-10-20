import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GROUND, extractNets, formatValue, nearestConnection, nextDesignator, pinPositions,
  reaches, toNetlist,
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
 *
 * Three things made it unusable after that, and they compounded:
 *
 *   - **The armed tool was invisible.** Active and inactive buttons shared a
 *     background and the active one set `text-white`, which on the light theme
 *     is white on a near-white surface. Arming the wire tool blanked its label
 *     and changed nothing else.
 *   - **Every tool disarmed itself after one use.** Placing a resistor silently
 *     reverted to Select, so the second click of a two-resistor divider landed
 *     on the marquee and did nothing visible. Combined with the first defect
 *     there was no way to tell that had happened.
 *   - **Terminating a wire needed a gesture nobody guesses** — clicking the
 *     exact same grid cell twice — and the one hint saying so was rendered in
 *     the invisible label.
 *
 * So: the armed tool is a filled accent chip, tools stay armed until changed
 * (which is what every real capture tool does), and a wire ends on a
 * double-click, a right-click, Enter, or a click on a pin.
 */

const GRID = 18;

/**
 * How far from a pin or wire vertex a wire end or ground may be dropped and
 * still attach, in grid cells.
 *
 * One and a half: far enough that aiming at the terminal under a part body
 * works without zooming in, close enough that the next pin over — two cells
 * away on every two-terminal part — can never win.
 */
const SNAP = 1.5;

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

const TOOL_LABEL: Partial<Record<Tool, string>> = {
  resistor: 'RESISTOR', capacitor: 'CAPACITOR', inductor: 'INDUCTOR',
  vsource: 'VOLTAGE SOURCE', isource: 'CURRENT SOURCE', opamp: 'OP-AMP',
  vcvs: 'VCVS', vccs: 'VCCS', ccvs: 'CCVS', cccs: 'CCCS',
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

  /**
   * Grow the canvas to whatever width it has been given.
   *
   * The SVG used to be a fixed `columns * GRID` pixels inside a container that
   * stretched, which left a wide strip of bordered background that looks
   * exactly like canvas and swallows every click. `columns` is a minimum now,
   * not a size. Height stays a prop: nothing above this component states how
   * tall the editor should be, and guessing would fight the page's own layout.
   */
  const frame = useRef<HTMLDivElement | null>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setFrameWidth(entry?.contentRect.width ?? 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const width = Math.max(columns, Math.floor(frameWidth / GRID)) * GRID;
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

  /**
   * Arm a tool.
   *
   * One definition, because there were four — the Select button, the Wire
   * button, the Ground button and the part buttons each did their own subset of
   * {set the tool, drop the draft, clear the selection}, and the two in the
   * middle forgot the draft. With tools that disarm after one use that was
   * nearly invisible; with tools that stay armed it means a half-drawn wire
   * survives a trip to the palette and the *next* wire silently continues from
   * it — which, if the abandoned point was on a terminal, welds two pins
   * together and shorts a part nobody touched. The keyboard path always got
   * this right, which is how two behaviours for one action stayed hidden.
   */
  const arm = useCallback((next: Tool): void => {
    setTool(next);
    setDraft([]);
    if (next !== 'select') setSelection(new Set());
  }, []);

  /**
   * Where a wire end or a ground actually lands.
   *
   * A terminal is one grid cell wide, so hitting it by eye is close to a coin
   * flip — and missing produces a drawing that looks finished and refuses to
   * simulate, which is the single most reported way this editor "did not work".
   * Snapping inside `SNAP` cells makes near-enough mean what the person meant.
   *
   * Parts are deliberately not snapped: a body centre is not a connection
   * point, and dragging one onto a pin would weld it there.
   */
  const snapped = useCallback(
    (at: Point, exclude?: (point: Point) => boolean): Point =>
      nearestConnection(valueRef.current, at, SNAP, exclude) ?? at,
    [],
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
    // The tool stays armed. Every capture tool works this way because a circuit
    // has more than one resistor in it, and disarming after one placement meant
    // the second click did nothing at all — silently, because the armed tool was
    // not legible either. Esc or S goes back to Select.
  };

  const commitWire = useCallback(() => {
    if (draft.length >= 2) {
      commit({
        ...value,
        wires: [...value.wires, { id: `w${value.wires.length + 1}-${Date.now()}`, points: draft }],
      });
    }
    setDraft([]);
    // Still armed, so the next wire starts on the next click. A circuit needs
    // four or five of these and re-arming between each one was most of why
    // drawing one by hand was unbearable.
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
        // Two stages, because the tools stay armed now: the first Escape
        // abandons the wire being drawn and leaves you still drawing wires,
        // the second puts the pointer back to Select. Collapsing them would
        // mean a mis-clicked corner costs you the tool as well.
        if (draft.length > 0) {
          setDraft([]);
          return;
        }
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
        arm(next);
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
  }, [arm, commitWire, deleteSelection, draft.length, readOnly, redo, rotateSelection, undo]);

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
      // Snap to anything but this wire's own points, or a vertex would stick to
      // the neighbour it is being dragged away from.
      const at = snapped(toGrid(e), (point) =>
        before.wires.find((w) => w.id === wire)?.points.includes(point) ?? false,
      );
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
    const raw = toGrid(event);

    if (tool === 'select') return; // handled by pointerdown
    if (tool === 'ground') {
      commit({ ...value, grounds: [...value.grounds, snapped(raw)] });
      return;
    }
    if (tool === 'wire') {
      const at = snapped(raw);
      const last = draft[draft.length - 1];
      // Clicking the last point again still finishes, because that is what the
      // first version taught anyone who found it.
      if (last && last.x === at.x && last.y === at.y) {
        commitWire();
        return;
      }
      const next = last ? [...draft, ...elbow(last, at, valueRef.current)] : [at];
      // A click that lands on a component pin ends the wire there. Pin to pin
      // is what nearly every wire in a teaching circuit is, and requiring a
      // separate gesture afterwards is the step people got stuck on. Only once
      // the wire has a start: the first click is allowed to be a pin.
      if (draft.length > 0 && onAPin(valueRef.current, at)) {
        setDraft([]);
        commit({
          ...value,
          wires: [...value.wires, { id: `w${value.wires.length + 1}-${Date.now()}`, points: next }],
        });
        return;
      }
      setDraft(next);
      return;
    }
    place(tool, raw);
  };

  /** Double-click and right-click both finish a wire, as they do everywhere else. */
  const onCanvasDoubleClick = (event: React.MouseEvent): void => {
    if (readOnly || tool !== 'wire') return;
    event.preventDefault();
    commitWire();
  };

  const onCanvasContextMenu = (event: React.MouseEvent): void => {
    if (readOnly) return;
    if (tool === 'wire' && draft.length >= 2) {
      event.preventDefault();
      commitWire();
      return;
    }
    if (tool !== 'select') {
      event.preventDefault();
      arm('select');
    }
  };

  // The rubber band shows the elbow the next click will actually commit, so
  // the route is never a surprise.
  const draftLast = draft[draft.length - 1];
  const draftPreview =
    cursor && draftLast ? [...draft, ...elbow(draftLast, cursor, value)] : [...draft, ...(cursor ? [cursor] : [])];

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
          <ToolButton tool="select" active={tool === 'select'} hint="S" onClick={() => arm('select')}>
            Select
          </ToolButton>
          <ToolButton tool="wire" active={tool === 'wire'} hint="W" onClick={() => arm('wire')}>
            Wire
          </ToolButton>
          <ToolButton tool="ground" active={tool === 'ground'} hint="G" onClick={() => arm('ground')}>
            Ground
          </ToolButton>

          <div className="pt-2 text-2xs font-semibold uppercase tracking-wide text-ink-faint">Parts</div>
          {PALETTE.map((entry) => (
            <ToolButton
              key={entry.kind}
              tool={entry.kind}
              active={tool === entry.kind}
              hint={Object.entries(HOTKEY_TOOL).find(([, t]) => t === entry.kind)?.[0]?.toUpperCase()}
              onClick={() => arm(entry.kind)}
            >
              {entry.label}
            </ToolButton>
          ))}

          {selection.size > 1 && (
            <div className="mt-3 rounded border border-line p-2 text-xs">
              <div className="text-ink">{selection.size} selected</div>
              <div className="mt-2 flex gap-1">
                <SmallButton onClick={rotateSelection}>Rotate</SmallButton>
                <SmallButton tone="danger" onClick={deleteSelection}>Delete</SmallButton>
              </div>
            </div>
          )}

          {only && (
            <div className="mt-3 rounded border border-line p-2">
              <div className="font-mono text-xs font-semibold text-ink">{only.id}</div>
              {only.kind !== 'opamp' && (
                <label className="mt-2 block text-2xs text-ink-dim">
                  Value
                  <input
                    key={only.id}
                    className="mt-0.5 w-full rounded border border-line-strong px-1 py-0.5 text-xs tabular-nums "
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
            <div className="mt-3 rounded border border-line p-2 text-xs">
              <div className="text-ink">Wire · {selectedWire.points.length} vertices</div>
              <p className="mt-1 text-2xs text-ink-dim">Drag a handle to reroute.</p>
              <div className="mt-2 flex gap-1">
                <SmallButton tone="danger" onClick={deleteSelection}>Delete</SmallButton>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div ref={frame} className="relative overflow-hidden rounded border border-line bg-surface">
          {!readOnly && tool !== 'select' && (
            // The instructions belong on the canvas, where the work is. They
            // used to be a suffix on the tool button's label — which was the
            // one element rendered invisible by the colour bug, so the guidance
            // disappeared at exactly the moment it was needed.
            <div
              className="pointer-events-none absolute left-2 top-2 z-10 max-w-[44ch] border border-accent-dim
                         bg-surface/90 px-2 py-1 font-mono text-3xs leading-relaxed text-ink-dim backdrop-blur"
              data-testid="tool-hint"
            >
              {tool === 'wire'
                ? draft.length === 0
                  ? 'WIRE · click a pin or a point to start'
                  : 'WIRE · click to add a corner · double-click, right-click, Enter or a pin to finish · Esc to cancel'
                : tool === 'ground'
                  ? 'GROUND · click a pin or a wire — it snaps to the nearest one'
                  : `${TOOL_LABEL[tool] ?? tool} · click to place · stays armed · Esc for Select`}
            </div>
          )}
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
            onDoubleClick={onCanvasDoubleClick}
            onContextMenu={onCanvasContextMenu}
            // Preview the snapped position, not the raw one — otherwise the
            // rubber band points one cell away from where the click will land.
            onMouseMove={(e) => tool === 'wire' && setCursor(snapped(toGrid(e)))}
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
                points={draftPreview.map((p) => `${p.x * GRID},${p.y * GRID}`).join(' ')}
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
                {/* Same green/orange as the pin dots, for the same reason: a
                    ground one cell off the terminal it was aimed at points
                    straight at it and conducts nothing, and until this dot
                    existed the only sign was a solver error three panels
                    away. */}
                <circle
                  cx={0} cy={0} r={3}
                  fill={reaches(value, g) > 0 ? '#22c55e' : '#f97316'}
                  stroke="none" pointerEvents="none"
                />
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
                    x={component.kind === 'opamp' ? -GRID * 1.6 : GRID * 1.3}
                    y={component.kind === 'opamp' ? -GRID * 2.9 : -GRID * 0.4}
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
                const connected = net !== undefined && reaches(value, pin) > 1;
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

        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-dim">
          <span>{value.components.length} part(s)</span>
          <span>{Math.max(0, nets.byNet.size - 1)} net(s)</span>
          {built.issues.length > 0 && (
            <span className="text-warn">
              {built.issues.length} issue(s): {built.issues[0]!.message}
            </span>
          )}
          {built.issues.length === 0 && value.components.length > 0 && (
            <span className="text-accent">connected</span>
          )}
          <span className="ml-auto tabular-nums">{Math.round(camera.scale * 100)}%</span>
        </div>

        {!readOnly && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-ink-faint">
            {HOTKEY_HINTS.map(([key, label]) => (
              <span key={key}>
                <kbd className="rounded border border-line-strong px-1 font-mono">{key}</kbd> {label}
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
      // The armed tool is a filled accent chip. It used to be `text-white` over
      // the same `bg-surface-2` as every other button, which on the light theme
      // painted the one label you needed to read white on near-white and left
      // the background unchanged — so arming a tool looked like nothing
      // happening, and the editor looked broken because you could not tell what
      // the next click would do. Third appearance of a raw colour where a role
      // belongs; see CLAUDE.md.
      className={`flex w-full items-center border px-2 py-1 text-left text-xs transition-colors ${
        active
          ? 'border-accent bg-accent font-medium text-accent-fg'
          : 'border-line bg-surface-2 text-ink hover:border-accent hover:text-accent'
      }`}
      onClick={onClick}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && (
        <kbd className={`ml-1 shrink-0 font-mono text-3xs ${active ? 'text-accent-fg/70' : 'text-ink-faint'}`}>
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
      className={`flex-1 rounded px-1 py-0.5 text-2xs ${
        tone === 'danger'
          ? 'bg-danger/10 text-danger '
          : 'bg-surface-2'
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
      className="pointer-events-auto h-7 w-7 rounded border border-line-strong bg-surface/90 text-sm leading-none text-ink-dim shadow-sm hover:bg-surface"
    >
      {children}
    </button>
  );
}

/** Does the orthogonal segment a–b pass over `p`, other than at its own ends? */
function passesOver(a: Point, b: Point, p: Point): boolean {
  if ((p.x === a.x && p.y === a.y) || (p.x === b.x && p.y === b.y)) return false;
  if (a.x === b.x) return p.x === a.x && p.y > Math.min(a.y, b.y) && p.y < Math.max(a.y, b.y);
  if (a.y === b.y) return p.y === a.y && p.x > Math.min(a.x, b.x) && p.x < Math.max(a.x, b.x);
  return false;
}

/**
 * The corner between two points, if the leg needs one.
 *
 * Schematic wires run horizontally and vertically; a diagonal is how a drawing
 * tool behaves, not how a capture tool does. Beyond looking wrong it costs
 * connectivity: the T-junction rule attaches a pin that lands *on* a segment,
 * and a diagonal passes between grid points instead of through them, so
 * nothing can tap it.
 *
 * Which way the elbow turns is chosen to miss other parts' terminals. A wire
 * laid over a pin connects to it — that is the T-junction rule doing its job —
 * so an auto-routed corner that happens to cross one shorts out a component the
 * person never touched. Routing V+ to the top of R1 did exactly that: the
 * horizontal-first leg ran through R1's *bottom* pin and shorted it, and the
 * only evidence was a sentence in the status line. Horizontal first otherwise,
 * because the preview has to be able to promise what the click will commit.
 */
function elbow(from: Point, to: Point, schematic: Schematic): Point[] {
  if (from.x === to.x || from.y === to.y) return [to];

  const pins = schematic.components.flatMap(pinPositions);
  // A corner that lands *on* a pin shorts it just as surely as a leg that runs
  // over one, and it is the likelier accident: the horizontal-first corner of a
  // pin-to-pin leg is the other terminal of the destination part about as often
  // as not. The destination itself is exempt, since landing there is the point.
  const clean = (corner: Point): boolean =>
    !pins.some(
      (pin) =>
        passesOver(from, corner, pin) ||
        passesOver(corner, to, pin) ||
        (pin.x === corner.x && pin.y === corner.y && !(corner.x === to.x && corner.y === to.y)),
    );

  const horizontalFirst = { x: to.x, y: from.y };
  const verticalFirst = { x: from.x, y: to.y };
  if (clean(horizontalFirst)) return [horizontalFirst, to];
  if (clean(verticalFirst)) return [verticalFirst, to];
  return [horizontalFirst, to];
}

/** Is this point one of some component's terminals? */
function onAPin(schematic: Schematic, point: Point): boolean {
  return schematic.components.some((component) =>
    pinPositions(component).some((pin) => pin.x === point.x && pin.y === point.y),
  );
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
