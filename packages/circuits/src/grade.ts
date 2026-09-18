import { cAbs, cPhaseDeg, type Complex } from './linalg.js';
import { operatingPoint, transient } from './analysis.js';
import { solveAc } from './mna.js';
import { GROUND, type Netlist } from './netlist.js';

/**
 * Grading a circuit the learner designed.
 *
 * Design questions have many correct answers — "build a network with
 * R_th = 4.7 kΩ and V_th = 5 V" does not have one schematic — so grading
 * compares *measured behaviour*, never the netlist itself. That is the only way
 * to autograde open-ended design, and it is also the honest way: the circuit is
 * right if it does the thing.
 */

export interface Measurement {
  /** "v(out)", "v(a,b)", "i(R1)", "db(v(out))", "phase(v(out))". */
  probe: string;
  analysis: 'op' | 'dc' | 'ac' | 'tran';
  expected: number;
  unit: string;
  tolerance: { rel?: number | undefined; abs?: number | undefined };
  /** Required for `ac`. */
  frequencyHz?: number | undefined;
  /** Required for `tran`. */
  atTime?: number | undefined;
}

export interface MeasurementResult {
  probe: string;
  expected: number;
  actual: number | null;
  within: boolean;
  message?: string;
}

export interface GradeResult {
  correct: boolean;
  results: MeasurementResult[];
  /** Why the whole circuit could not be evaluated, if it could not. */
  error?: string;
}

interface ProbeRequest {
  wrapper: 'none' | 'mag' | 'db' | 'phase';
  kind: 'voltage' | 'current';
  args: string[];
}

/** Parse a probe expression. Returns null when it is not valid syntax. */
export function parseProbe(probe: string): ProbeRequest | null {
  const text = probe.trim().toLowerCase();
  const wrapped = /^(mag|db|phase)\s*\(\s*(.*)\s*\)$/.exec(text);
  const wrapper = (wrapped ? wrapped[1] : 'none') as ProbeRequest['wrapper'];
  const inner = wrapped ? wrapped[2]! : text;

  const match = /^([vi])\s*\(\s*([^)]+?)\s*\)$/.exec(inner);
  if (!match) return null;

  const args = match[2]!.split(',').map((a) => a.trim()).filter((a) => a !== '');
  if (args.length === 0) return null;
  return { wrapper, kind: match[1] === 'v' ? 'voltage' : 'current', args };
}

const tolerate = (actual: number, expected: number, tolerance: Measurement['tolerance']): boolean => {
  const slack = Math.max(tolerance.abs ?? 0, (tolerance.rel ?? 0) * Math.abs(expected));
  return Math.abs(actual - expected) <= Math.max(slack, 1e-12);
};

const applyWrapper = (value: Complex, wrapper: ProbeRequest['wrapper']): number => {
  switch (wrapper) {
    case 'db': return 20 * Math.log10(Math.max(cAbs(value), 1e-18));
    case 'phase': return cPhaseDeg(value);
    default: return cAbs(value);
  }
};

/**
 * Evaluate every measurement against the submitted netlist.
 *
 * A circuit that cannot be solved at all — a floating node, a source loop — is
 * reported as an error rather than as a wrong answer, because those are
 * different mistakes and deserve different feedback.
 */
export function gradeCircuit(netlist: Netlist, measurements: readonly Measurement[]): GradeResult {
  if (measurements.length === 0) {
    return { correct: false, results: [], error: 'This item defines no measurements to check.' };
  }

  const results: MeasurementResult[] = [];

  // Solve each analysis at most once, however many probes read from it.
  let op: ReturnType<typeof operatingPoint> | null = null;
  const acCache = new Map<number, ReturnType<typeof solveAc>>();
  const tranCache = new Map<string, ReturnType<typeof transient>>();

  try {
    for (const measurement of measurements) {
      const request = parseProbe(measurement.probe);
      if (!request) {
        results.push({
          probe: measurement.probe,
          expected: measurement.expected,
          actual: null,
          within: false,
          message: `Could not read the probe "${measurement.probe}".`,
        });
        continue;
      }

      let actual: number | null = null;
      let message: string | undefined;

      if (measurement.analysis === 'op' || measurement.analysis === 'dc') {
        op ??= operatingPoint(netlist);
        if (request.kind === 'voltage') {
          const a = op.voltages.get(request.args[0]!);
          const b = request.args[1] !== undefined ? op.voltages.get(request.args[1]!) : 0;
          if (a === undefined || b === undefined) message = `No node named "${request.args.join(', ')}".`;
          else actual = a - b;
        } else {
          const current = op.currents.get(request.args[0]!.toUpperCase());
          if (current === undefined) {
            message = `No branch current available for "${request.args[0]}". Probe a voltage source, or measure a voltage instead.`;
          } else {
            actual = current;
          }
        }
      } else if (measurement.analysis === 'ac') {
        const frequency = measurement.frequencyHz;
        if (frequency === undefined) {
          message = 'This AC measurement does not say at what frequency.';
        } else {
          let solution = acCache.get(frequency);
          if (!solution) {
            solution = solveAc(netlist, 2 * Math.PI * frequency);
            acCache.set(frequency, solution);
          }
          if (request.kind === 'voltage') {
            const a = solution.voltages.get(request.args[0]!);
            const b = request.args[1] !== undefined ? solution.voltages.get(request.args[1]!) : { re: 0, im: 0 };
            if (a === undefined || b === undefined) message = `No node named "${request.args.join(', ')}".`;
            else actual = applyWrapper({ re: a.re - b.re, im: a.im - b.im }, request.wrapper);
          } else {
            const current = solution.currents.get(request.args[0]!.toUpperCase());
            if (current === undefined) message = `No branch current available for "${request.args[0]}".`;
            else actual = applyWrapper(current, request.wrapper);
          }
        }
      } else {
        const at = measurement.atTime;
        if (at === undefined) {
          message = 'This transient measurement does not say at what time.';
        } else {
          const step = at / 200;
          const cacheKey = `${at}`;
          let points = tranCache.get(cacheKey);
          if (!points) {
            points = transient(netlist, at, step);
            tranCache.set(cacheKey, points);
          }
          const last = points[points.length - 1]!;
          if (request.kind === 'voltage') {
            const a = last.voltages.get(request.args[0]!);
            const b = request.args[1] !== undefined ? last.voltages.get(request.args[1]!) : 0;
            if (a === undefined || b === undefined) message = `No node named "${request.args.join(', ')}".`;
            else actual = a - b;
          } else {
            const current = last.currents.get(request.args[0]!.toUpperCase());
            if (current === undefined) message = `No branch current available for "${request.args[0]}".`;
            else actual = current;
          }
        }
      }

      results.push({
        probe: measurement.probe,
        expected: measurement.expected,
        actual,
        within: actual !== null && tolerate(actual, measurement.expected, measurement.tolerance),
        ...(message ? { message } : {}),
      });
    }
  } catch (error) {
    return { correct: false, results, error: (error as Error).message };
  }

  return { correct: results.every((r) => r.within), results };
}

/** Does the netlist have a ground reference at all? Checked before solving. */
export const hasGround = (netlist: Netlist): boolean =>
  netlist.elements.some((e) => e.nodes.includes(GROUND));
