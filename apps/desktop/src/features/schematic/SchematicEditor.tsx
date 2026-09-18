import { useCallback, useMemo, useRef, useState } from 'react';
import {
  GROUND, extractNets, formatValue, nextDesignator, pinPositions, toNetlist,
  type ElementKind, type PlacedComponent, type Point, type Rotation, type Schematic,
} from '@et/circuits';
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
 */

const GRID = 18;

export type Tool = 'select' | 'wire' | 'ground' | ElementKind;

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
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);

  const nets = useMemo(() => extractNets(value), [value]);
  const built = useMemo(() => toNetlist(value), [value]);

  const toGrid = useCallback((event: React.MouseEvent): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: snap(event.clientX - rect.left), y: snap(event.clientY - rect.top) };
  }, []);

  const place = (kind: ElementKind, at: Point): void => {
    const entry = PALETTE.find((p) => p.kind === kind);
    const component: PlacedComponent = {
      id: nextDesignator(value, kind),
      kind,
      at,
      rotation: 0,
      value: entry?.defaultValue ?? 1000,
    };
    onChange({ ...value, components: [...value.components, component] });
    setSelected(component.id);
    setTool('select');
  };

  const handleClick = (event: React.MouseEvent): void => {
    if (readOnly) return;
    const at = toGrid(event);

    if (tool === 'select') {
      setSelected(null);
      return;
    }
    if (tool === 'ground') {
      onChange({ ...value, grounds: [...value.grounds, at] });
      setTool('select');
      return;
    }
    if (tool === 'wire') {
      // Double-click (same point twice) ends the polyline.
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

  const commitWire = (): void => {
    if (draft.length >= 2) {
      onChange({
        ...value,
        wires: [...value.wires, { id: `w${value.wires.length + 1}-${Date.now()}`, points: draft }],
      });
    }
    setDraft([]);
    setTool('select');
  };

  const update = (id: string, patch: Partial<PlacedComponent>): void => {
    onChange({
      ...value,
      components: value.components.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  };

  const removeSelected = (): void => {
    if (!selected) return;
    onChange({ ...value, components: value.components.filter((c) => c.id !== selected) });
    setSelected(null);
  };

  const selectedComponent = value.components.find((c) => c.id === selected) ?? null;
  const width = columns * GRID;
  const height = rows * GRID;

  return (
    <div className="flex gap-4">
      {!readOnly && (
        <div className="w-44 shrink-0 space-y-1">
          <button
            className={`w-full rounded px-2 py-1 text-left text-xs ${tool === 'select' ? 'bg-slate-800 text-white dark:bg-slate-700' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
            onClick={() => { setTool('select'); setDraft([]); }}
          >
            Select
          </button>
          <button
            className={`w-full rounded px-2 py-1 text-left text-xs ${tool === 'wire' ? 'bg-slate-800 text-white dark:bg-slate-700' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
            onClick={() => { setTool('wire'); setSelected(null); }}
          >
            Wire {tool === 'wire' && <span className="text-slate-300 dark:text-slate-600">· click the last point to finish</span>}
          </button>
          <button
            className={`w-full rounded px-2 py-1 text-left text-xs ${tool === 'ground' ? 'bg-slate-800 text-white dark:bg-slate-700' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
            onClick={() => { setTool('ground'); setSelected(null); }}
          >
            Ground
          </button>

          <div className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Parts</div>
          {PALETTE.map((entry) => (
            <button
              key={entry.kind}
              className={`w-full rounded px-2 py-1 text-left text-xs ${tool === entry.kind ? 'bg-slate-800 text-white dark:bg-slate-700' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
              onClick={() => { setTool(entry.kind); setSelected(null); setDraft([]); }}
            >
              {entry.label}
            </button>
          ))}

          {selectedComponent && (
            <div className="mt-3 rounded border border-slate-200 p-2 dark:border-slate-700">
              <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">{selectedComponent.id}</div>
              {selectedComponent.kind !== 'opamp' && (
                <label className="mt-2 block text-[11px] text-slate-500 dark:text-slate-400">
                  Value
                  <input
                    className="mt-0.5 w-full rounded border border-slate-300 px-1 py-0.5 text-xs tabular-nums dark:border-slate-600"
                    defaultValue={formatValue(selectedComponent.value)}
                    onBlur={(e) => {
                      const parsed = Number(e.target.value) || parseSuffixed(e.target.value);
                      if (Number.isFinite(parsed) && parsed !== 0) update(selectedComponent.id, { value: parsed });
                    }}
                  />
                </label>
              )}
              <div className="mt-2 flex gap-1">
                <button
                  className="flex-1 rounded bg-slate-100 px-1 py-0.5 text-[11px] dark:bg-slate-800"
                  onClick={() =>
                    update(selectedComponent.id, {
                      rotation: (((selectedComponent.rotation + 90) % 360) as Rotation),
                    })
                  }
                >
                  Rotate
                </button>
                <button className="flex-1 rounded bg-red-50 px-1 py-0.5 text-[11px] text-red-700 dark:bg-red-950 dark:text-red-300" onClick={removeSelected}>
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className="rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
          onClick={handleClick}
          onMouseMove={(e) => tool === 'wire' && setCursor(toGrid(e))}
          data-testid="schematic-canvas"
        >
          <defs>
            <pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
              <circle cx={0} cy={0} r={0.8} fill="#cbd5e1" />
            </pattern>
          </defs>
          <rect width={width} height={height} fill="url(#grid)" />

          {value.wires.map((wire) => (
            <polyline
              key={wire.id}
              points={wire.points.map((p) => `${p.x * GRID},${p.y * GRID}`).join(' ')}
              fill="none"
              stroke="#0f172a"
              strokeWidth={2}
            />
          ))}

          {draft.length > 0 && (
            <polyline
              points={[...draft, ...(cursor ? [cursor] : [])]
                .map((p) => `${p.x * GRID},${p.y * GRID}`)
                .join(' ')}
              fill="none"
              stroke="#0ea5e9"
              strokeWidth={2}
              strokeDasharray="4 3"
            />
          )}

          {value.grounds.map((g, i) => (
            <g key={`gnd-${i}`} transform={`translate(${g.x * GRID},${g.y * GRID})`} stroke="#0f172a">
              <GroundSymbol grid={GRID} />
            </g>
          ))}

          {value.components.map((component) => {
            const isSelected = component.id === selected;
            return (
              <g
                key={component.id}
                transform={`translate(${component.at.x * GRID},${component.at.y * GRID}) rotate(${component.rotation})`}
                stroke={isSelected ? '#0284c7' : '#0f172a'}
                onClick={(e) => {
                  if (readOnly || tool !== 'select') return;
                  e.stopPropagation();
                  setSelected(component.id);
                }}
                className={readOnly ? '' : 'cursor-pointer'}
                data-component-id={component.id}
              >
                <ComponentSymbol kind={component.kind} grid={GRID} />
                <text
                  x={GRID * 1.3}
                  y={-GRID * 0.4}
                  className="select-none"
                  fontSize={10}
                  fill={isSelected ? '#0284c7' : '#475569'}
                  stroke="none"
                  transform={`rotate(${-component.rotation})`}
                >
                  {component.id}
                </text>
                {component.kind !== 'opamp' && (
                  <text
                    x={GRID * 1.3}
                    y={GRID * 0.7}
                    className="select-none"
                    fontSize={10}
                    fill="#94a3b8"
                    stroke="none"
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
                  cx={pin.x * GRID}
                  cy={pin.y * GRID}
                  r={3}
                  fill={connected ? (net === GROUND ? '#0f172a' : '#22c55e') : '#f97316'}
                />
              );
            }),
          )}
        </svg>

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
        </div>
      </div>
    </div>
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
