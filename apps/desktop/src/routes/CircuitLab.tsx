import { useMemo, useState } from 'react';
import {
  acSweep, bode, emptySchematic, formatNetlist, formatValue, operatingPoint, parseNetlist,
  suggestedTimeStep, toNetlist, transient,
  type Schematic,
} from '@et/circuits';
import { SchematicEditor } from '@/features/schematic/SchematicEditor';
import { useApp } from '@/store';

/**
 * Circuit lab.
 *
 * Two things sit side by side on purpose: the numbers, and the equations that
 * produced them. A simulator that only prints node voltages is a calculator,
 * and a student who gets a different answer by hand learns nothing from being
 * told they are wrong. The node equations panel is the whole reason this uses
 * its own solver rather than shelling out to ngspice.
 */

type Mode = 'op' | 'ac' | 'tran';

export function CircuitLab(): React.ReactElement {
  const goTo = useApp((s) => s.goTo);
  const circuits = useApp((s) => s.circuits);
  const saveCircuit = useApp((s) => s.saveCircuit);
  const removeCircuit = useApp((s) => s.removeCircuit);

  const [schematic, setSchematic] = useState<Schematic>(() => emptySchematic('untitled'));
  const [mode, setMode] = useState<Mode>('op');
  const [showNetlist, setShowNetlist] = useState(false);
  const [netlistDraft, setNetlistDraft] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [acRange, setAcRange] = useState({ start: 10, stop: 1e6 });
  const [tranStop, setTranStop] = useState(5e-3);

  const built = useMemo(() => toNetlist(schematic), [schematic]);

  const result = useMemo(() => {
    if (built.netlist.elements.length === 0) return null;
    if (built.issues.some((i) => /unconnected|No ground/.test(i.message))) return null;
    try {
      if (mode === 'op') return { kind: 'op' as const, data: operatingPoint(built.netlist) };
      if (mode === 'ac') {
        const points = acSweep(built.netlist, 'dec', 12, acRange.start, acRange.stop);
        return { kind: 'ac' as const, data: points };
      }
      const step = suggestedTimeStep(built.netlist, tranStop);
      return { kind: 'tran' as const, data: transient(built.netlist, tranStop, step) };
    } catch (error) {
      return { kind: 'error' as const, message: (error as Error).message };
    }
  }, [built, mode, acRange, tranStop]);

  const nodeNames = useMemo(
    () => [...new Set(built.netlist.elements.flatMap((e) => e.nodes))].filter((n) => n !== '0').sort(),
    [built],
  );
  const [probe, setProbe] = useState<string | null>(null);
  const activeProbe = probe && nodeNames.includes(probe) ? probe : nodeNames[0] ?? null;

  const importNetlist = (): void => {
    const parsed = parseNetlist(netlistDraft);
    if (parsed.errors.length > 0) {
      setImportError(parsed.errors.join('; '));
      return;
    }
    // A netlist carries no geometry, so the schematic cannot be reconstructed
    // from it. Rather than invent a layout that would be wrong, the lab keeps
    // the text as the source and says so.
    setImportError(
      parsed.notes.length > 0
        ? `Imported. ${parsed.notes[0]}`
        : 'Imported as a netlist. Drawing is not reconstructed from text — edit the deck here, or draw it on the canvas.',
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Circuit lab</h1>
        <button className="ml-auto text-sm text-slate-500 underline dark:text-slate-400" onClick={() => goTo('dashboard')}>
          Back to dashboard
        </button>
      </header>
      <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
        Draw a circuit, then read the node equations it produces alongside the answer. The solver is
        cross-checked against ngspice in the test suite, so the numbers are trustworthy — but the
        equations are the point.
      </p>

      <div className="card mt-6 p-4">
        <SchematicEditor value={schematic} onChange={setSchematic} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {(['op', 'ac', 'tran'] as const).map((m) => (
          <button
            key={m}
            className={`rounded px-3 py-1 text-sm ${mode === m ? 'bg-slate-800 text-white dark:bg-slate-700' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
            onClick={() => setMode(m)}
          >
            {m === 'op' ? 'Operating point' : m === 'ac' ? 'AC sweep' : 'Transient'}
          </button>
        ))}

        {mode === 'ac' && (
          <span className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="number" className="w-24 rounded border border-slate-300 px-1 py-0.5 tabular-nums dark:border-slate-600"
              value={acRange.start} onChange={(e) => setAcRange({ ...acRange, start: Number(e.target.value) || 1 })}
            />
            to
            <input
              type="number" className="w-28 rounded border border-slate-300 px-1 py-0.5 tabular-nums dark:border-slate-600"
              value={acRange.stop} onChange={(e) => setAcRange({ ...acRange, stop: Number(e.target.value) || 1e6 })}
            />
            Hz
          </span>
        )}
        {mode === 'tran' && (
          <span className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            stop
            <input
              type="number" step="0.001" className="w-28 rounded border border-slate-300 px-1 py-0.5 tabular-nums dark:border-slate-600"
              value={tranStop} onChange={(e) => setTranStop(Number(e.target.value) || 1e-3)}
            />
            s
          </span>
        )}

        <button
          className="ml-auto rounded bg-slate-100 px-3 py-1 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300"
          onClick={() => { setShowNetlist(!showNetlist); setNetlistDraft(formatNetlist(built.netlist, [`.${mode}`])); }}
        >
          {showNetlist ? 'Hide netlist' : 'Netlist'}
        </button>
        <button
          className="rounded bg-slate-800 px-3 py-1 text-sm text-white dark:bg-slate-700"
          onClick={() => void saveCircuit(schematic, formatNetlist(built.netlist))}
        >
          Save
        </button>
      </div>

      {showNetlist && (
        <div className="card mt-3 p-3">
          <textarea
            className="h-40 w-full rounded border border-slate-200 p-2 font-mono text-xs dark:border-slate-700"
            value={netlistDraft}
            onChange={(e) => setNetlistDraft(e.target.value)}
            spellCheck={false}
          />
          <div className="mt-2 flex items-center gap-3">
            <button className="rounded bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800" onClick={importNetlist}>
              Check deck
            </button>
            {importError && <span className="text-xs text-slate-600 dark:text-slate-400">{importError}</span>}
          </div>
        </div>
      )}

      {built.issues.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-orange-800 dark:text-orange-200">
          {built.issues.map((issue, i) => (
            <li key={i}>• {issue.message}</li>
          ))}
        </ul>
      )}

      {result?.kind === 'error' && (
        <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{result.message}</p>
      )}

      {result?.kind === 'op' && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <section className="card p-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Operating point</h2>
            <table className="mt-2 w-full text-sm">
              <tbody>
                {[...result.data.voltages].filter(([n]) => n !== '0').map(([node, v]) => (
                  <tr key={node} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="py-1 font-mono text-xs text-slate-500 dark:text-slate-400">v({node})</td>
                    <td className="py-1 text-right tabular-nums">{formatValue(v)}V</td>
                  </tr>
                ))}
                {[...result.data.currents].map(([id, i]) => (
                  <tr key={id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="py-1 font-mono text-xs text-slate-500 dark:text-slate-400">i({id})</td>
                    <td className="py-1 text-right tabular-nums">{formatValue(i)}A</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card p-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">The equations you should have written</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              One KCL equation per node, assembled from the parts you placed.
            </p>
            <ul className="mt-2 space-y-1 font-mono text-xs text-slate-700 dark:text-slate-300" data-testid="node-equations">
              {result.data.equations.map((equation) => (
                <li key={equation}>{equation}</li>
              ))}
            </ul>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">What each part contributed</h3>
            <ul className="mt-1 space-y-0.5 text-xs text-slate-600 dark:text-slate-400" data-testid="element-stamps">
              {result.data.stamps.map((stamp) => (
                <li key={stamp.elementId}>
                  <span className="font-mono text-slate-900 dark:text-slate-100">{stamp.elementId}</span> — {stamp.description}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {result?.kind === 'ac' && activeProbe && (
        <section className="card mt-6 p-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Bode plot</h2>
            <select
              className="rounded border border-slate-300 px-2 py-0.5 text-xs dark:border-slate-600"
              value={activeProbe}
              onChange={(e) => setProbe(e.target.value)}
            >
              {nodeNames.map((n) => <option key={n} value={n}>v({n})</option>)}
            </select>
          </div>
          <BodePlot curve={bode(result.data, activeProbe)} />
        </section>
      )}

      {result?.kind === 'tran' && activeProbe && (
        <section className="card mt-6 p-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Transient response</h2>
            <select
              className="rounded border border-slate-300 px-2 py-0.5 text-xs dark:border-slate-600"
              value={activeProbe}
              onChange={(e) => setProbe(e.target.value)}
            >
              {nodeNames.map((n) => <option key={n} value={n}>v({n})</option>)}
            </select>
          </div>
          <WavePlot
            points={result.data.map((p) => ({ x: p.time, y: p.voltages.get(activeProbe) ?? 0 }))}
            xLabel="time (s)"
            yLabel="volts"
          />
        </section>
      )}

      {circuits.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Saved circuits</h2>
          <ul className="mt-2 space-y-1">
            {circuits.map((record) => (
              <li key={record.id} className="card flex items-center gap-3 px-3 py-2 text-sm">
                <button
                  className="text-slate-900 underline dark:text-slate-100"
                  onClick={() => setSchematic(record.schematic as Schematic)}
                >
                  {record.name}
                </button>
                <span className="text-xs text-slate-400 dark:text-slate-500">{record.updatedAt.slice(0, 16).replace('T', ' ')}</span>
                <button
                  className="ml-auto text-xs text-red-700 dark:text-red-300"
                  onClick={() => void removeCircuit(record.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const PLOT = { width: 640, height: 220, pad: 44 };

function BodePlot({ curve }: { curve: { frequencyHz: number; magnitudeDb: number; phaseDeg: number }[] }): React.ReactElement {
  if (curve.length < 2) return <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Not enough points.</p>;

  const xs = curve.map((p) => Math.log10(p.frequencyHz));
  const ys = curve.map((p) => p.magnitudeDb);
  const path = scalePath(xs, ys);

  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${PLOT.width} ${PLOT.height}`} className="w-full">
        <Axes xLabel="frequency (decades)" yLabel="dB" />
        <path d={path} fill="none" stroke="#0284c7" strokeWidth={2} />
      </svg>
      <figcaption className="text-xs text-slate-500 dark:text-slate-400">
        {Math.min(...curve.map((c) => c.frequencyHz)).toPrecision(3)} Hz to{' '}
        {Math.max(...curve.map((c) => c.frequencyHz)).toPrecision(3)} Hz ·{' '}
        {Math.min(...ys).toFixed(1)} to {Math.max(...ys).toFixed(1)} dB
      </figcaption>
    </figure>
  );
}

function WavePlot({ points, xLabel, yLabel }: { points: { x: number; y: number }[]; xLabel: string; yLabel: string }): React.ReactElement {
  if (points.length < 2) return <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Not enough points.</p>;
  const path = scalePath(points.map((p) => p.x), points.map((p) => p.y));
  const ys = points.map((p) => p.y);

  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${PLOT.width} ${PLOT.height}`} className="w-full">
        <Axes xLabel={xLabel} yLabel={yLabel} />
        <path d={path} fill="none" stroke="#0284c7" strokeWidth={2} />
      </svg>
      <figcaption className="text-xs text-slate-500 dark:text-slate-400">
        0 to {points[points.length - 1]!.x.toPrecision(3)} s · {Math.min(...ys).toPrecision(3)} to{' '}
        {Math.max(...ys).toPrecision(3)} V
      </figcaption>
    </figure>
  );
}

function Axes({ xLabel, yLabel }: { xLabel: string; yLabel: string }): React.ReactElement {
  return (
    <g>
      <line x1={PLOT.pad} y1={PLOT.height - PLOT.pad} x2={PLOT.width - 8} y2={PLOT.height - PLOT.pad} stroke="#cbd5e1" />
      <line x1={PLOT.pad} y1={8} x2={PLOT.pad} y2={PLOT.height - PLOT.pad} stroke="#cbd5e1" />
      <text x={PLOT.width / 2} y={PLOT.height - 8} fontSize={10} fill="#94a3b8" textAnchor="middle">{xLabel}</text>
      <text x={12} y={PLOT.height / 2} fontSize={10} fill="#94a3b8" textAnchor="middle" transform={`rotate(-90 12 ${PLOT.height / 2})`}>{yLabel}</text>
    </g>
  );
}

/** Map data to the plot box. A flat trace is centred rather than dividing by zero. */
function scalePath(xs: number[], ys: number[]): string {
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;
  const innerW = PLOT.width - PLOT.pad - 8;
  const innerH = PLOT.height - PLOT.pad - 8;

  return xs
    .map((x, i) => {
      const px = PLOT.pad + ((x - xMin) / xSpan) * innerW;
      const py = PLOT.height - PLOT.pad - ((ys[i]! - yMin) / ySpan) * innerH;
      return `${i === 0 ? 'M' : 'L'} ${px.toFixed(2)} ${py.toFixed(2)}`;
    })
    .join(' ');
}
