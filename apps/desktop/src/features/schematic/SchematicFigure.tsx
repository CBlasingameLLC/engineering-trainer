import { useMemo } from 'react';
import { pinPositions, type Schematic } from '@et/circuits';
import type { Figure } from '@et/content-schema';
import { ComponentSymbol, GroundSymbol } from './symbols';

/**
 * A circuit drawn beside the question that asks about it.
 *
 * Read-only and self-sizing: the viewBox is fitted to the drawing, so a
 * two-element divider and a two-mesh network each fill the space they need
 * rather than sharing one fixed canvas. Nothing here is interactive — the
 * editor's machinery (history, selection, hit targets, the keyboard) has no
 * business loading on every item render.
 *
 * Values are drawn from the figure, which the generator built from the same
 * parameters as the answer. `pack verify` simulates the drawing, so a figure
 * that disagrees with its own question fails the gate rather than reaching a
 * learner who then cannot tell which of the two to believe.
 */

const GRID = 16;

export interface SchematicFigureProps {
  figure: Figure;
  className?: string;
}

interface Extent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function extentOf(figure: Figure): Extent {
  const points = [
    ...figure.components.flatMap((c) => pinPositions(c as never)),
    ...figure.components.map((c) => c.at),
    ...figure.wires.flatMap((w) => w.points),
    ...figure.grounds,
    ...figure.annotations.map((a) => a.at),
  ];
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

export function SchematicFigure({ figure, className }: SchematicFigureProps): React.ReactElement {
  // Margin in grid units: enough for a designator and value stacked beside the
  // rightmost part, and for a ground symbol hanging below the lowest point.
  const view = useMemo(() => {
    const e = extentOf(figure);
    const pad = 3;
    return {
      x: (e.minX - pad) * GRID,
      y: (e.minY - pad) * GRID,
      w: (e.maxX - e.minX + pad * 2 + 3) * GRID,
      h: (e.maxY - e.minY + pad * 2) * GRID,
    };
  }, [figure]);

  return (
    <figure className={`overflow-hidden rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 ${className ?? ''}`}>
      <svg
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        className="block h-auto w-full"
        style={{ maxHeight: '15rem' }}
        role="img"
        aria-label={figure.title || 'Circuit diagram'}
        data-testid="schematic-figure"
      >
        {figure.wires.map((wire) => (
          <polyline
            key={wire.id}
            points={wire.points.map((p) => `${p.x * GRID},${p.y * GRID}`).join(' ')}
            fill="none"
            className="stroke-slate-800 dark:stroke-slate-200"
            strokeWidth={2}
          />
        ))}

        {figure.grounds.map((g, i) => (
          <g key={`gnd-${i}`} transform={`translate(${g.x * GRID},${g.y * GRID})`} className="stroke-slate-800 dark:stroke-slate-200">
            <GroundSymbol grid={GRID} />
          </g>
        ))}

        {figure.components.map((component) => (
          <g
            key={component.id}
            transform={`translate(${component.at.x * GRID},${component.at.y * GRID}) rotate(${component.rotation})`}
            className="stroke-slate-800 dark:stroke-slate-200"
            data-component-id={component.id}
          >
            <ComponentSymbol kind={component.kind} grid={GRID} />
            {/* Counter-rotated so a sideways part still reads left to right.
                A two-terminal body is narrow, so its designator sits to the
                right of it; the op-amp triangle reaches that far and the text
                landed on its edge, so that one goes above the part instead. */}
            <text
              x={component.kind === 'opamp' ? -GRID * 1.6 : GRID * 1.2}
              y={component.kind === 'opamp' ? -GRID * 2.9 : -GRID * 0.35}
              fontSize={10} stroke="none"
              className="fill-slate-700 dark:fill-slate-300"
              transform={`rotate(${-component.rotation})`}
            >
              {component.id}
            </text>
            {component.kind !== 'opamp' && (
              <text
                x={GRID * 1.2} y={GRID * 0.75} fontSize={10} stroke="none"
                className="fill-slate-500 dark:fill-slate-400"
                transform={`rotate(${-component.rotation})`}
              >
                {siValue(component.kind, component.value)}
              </text>
            )}
          </g>
        ))}

        {/* Junction dots, so a T-crossing is not read as two wires passing. */}
        {junctions(figure).map((p, i) => (
          <circle key={`j${i}`} cx={p.x * GRID} cy={p.y * GRID} r={2.6} className="fill-slate-800 dark:fill-slate-200" />
        ))}

        {figure.annotations.map((note, i) => (
          <text
            key={`n${i}`}
            x={note.at.x * GRID} y={note.at.y * GRID}
            fontSize={11} textAnchor={note.anchor} stroke="none"
            className="fill-slate-600 dark:fill-slate-400"
          >
            {note.text}
          </text>
        ))}
      </svg>
      {figure.title && (
        <figcaption className="border-t border-slate-100 px-2 py-1 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {figure.title}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * Points where three or more connections meet.
 *
 * Two wires crossing without a dot mean they do not connect, which is the
 * oldest convention in schematic drawing and the one that silently changes what
 * a reader thinks the circuit is.
 */
function junctions(figure: Figure): { x: number; y: number }[] {
  const tally = new Map<string, { x: number; y: number; n: number }>();
  const bump = (p: { x: number; y: number }): void => {
    const key = `${p.x},${p.y}`;
    const entry = tally.get(key) ?? { ...p, n: 0 };
    entry.n += 1;
    tally.set(key, entry);
  };

  for (const component of figure.components) for (const pin of pinPositions(component as never)) bump(pin);
  for (const wire of figure.wires) {
    bump(wire.points[0]!);
    bump(wire.points[wire.points.length - 1]!);
    // An interior vertex of one polyline is a corner, not a junction — but a
    // point where another wire or pin lands mid-segment is.
    for (let i = 1; i < wire.points.length; i++) {
      const a = wire.points[i - 1]!;
      const b = wire.points[i]!;
      for (const other of figure.wires) {
        if (other.id === wire.id) continue;
        for (const p of [other.points[0]!, other.points[other.points.length - 1]!]) {
          if (onSegment(p, a, b)) bump(p);
        }
      }
      for (const component of figure.components) {
        for (const pin of pinPositions(component as never)) if (onSegment(pin, a, b)) bump(pin);
      }
    }
  }

  return [...tally.values()].filter((t) => t.n >= 3).map(({ x, y }) => ({ x, y }));
}

const onSegment = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): boolean =>
  (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) === 0 &&
  p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) &&
  p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);

/** Engineering notation with the unit the part carries. */
function siValue(kind: Schematic['components'][number]['kind'], value: number): string {
  const unit = { resistor: 'Ω', capacitor: 'F', inductor: 'H', vsource: 'V', isource: 'A' }[
    kind as 'resistor' | 'capacitor' | 'inductor' | 'vsource' | 'isource'
  ] ?? '';
  if (value === 0) return `0 ${unit}`;
  const prefixes: [number, string][] = [
    [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'],
  ];
  const magnitude = Math.abs(value);
  const [factor, prefix] = prefixes.find(([f]) => magnitude >= f) ?? prefixes[prefixes.length - 1]!;
  return `${Number((value / factor).toPrecision(3))} ${prefix}${unit}`;
}
