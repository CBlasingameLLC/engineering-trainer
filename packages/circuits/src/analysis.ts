import { cAbs, cPhaseDeg, type Complex } from './linalg.js';
import { buildSystem, nodeEquations, solveAc, solveSystem, type Solution } from './mna.js';
import { GROUND, type Netlist, type NodeName } from './netlist.js';

/**
 * The four analyses a circuits course actually uses.
 *
 * Each returns the numbers *and*, where it makes sense, the equations behind
 * them. A simulator that only answers is a calculator; the point here is to be
 * checkable by hand.
 */

export interface OperatingPoint {
  voltages: Map<NodeName, number>;
  currents: Map<string, number>;
  /** Human-readable KCL equations, one per node. */
  equations: string[];
  /** What each element contributed to the matrix. */
  stamps: Solution['system']['stamps'];
}

export function operatingPoint(netlist: Netlist): OperatingPoint {
  const system = buildSystem(netlist, 'dc');
  const solution = solveSystem(system);
  return {
    voltages: solution.voltages,
    currents: solution.currents,
    equations: nodeEquations(system),
    stamps: system.stamps,
  };
}

// ---------------------------------------------------------------------------

export interface DcSweepPoint {
  value: number;
  voltages: Map<NodeName, number>;
  currents: Map<string, number>;
}

/** Sweep an independent source and re-solve the operating point at each step. */
export function dcSweep(
  netlist: Netlist,
  sourceId: string,
  start: number,
  stop: number,
  step: number,
): DcSweepPoint[] {
  if (step === 0) throw new Error('dcSweep: step must be non-zero');
  const points: DcSweepPoint[] = [];
  const direction = stop >= start ? 1 : -1;
  const magnitude = Math.abs(step);

  for (let i = 0; ; i++) {
    const value = start + direction * magnitude * i;
    if (direction > 0 ? value > stop + 1e-12 : value < stop - 1e-12) break;
    const overrides = new Map([[sourceId.toUpperCase(), value]]);
    const solution = solveSystem(buildSystem(netlist, 'dc', { sourceOverrides: overrides }));
    points.push({ value, voltages: solution.voltages, currents: solution.currents });
    if (points.length > 100_000) throw new Error('dcSweep: too many points');
  }
  return points;
}

// ---------------------------------------------------------------------------

export interface AcPoint {
  frequencyHz: number;
  voltages: Map<NodeName, Complex>;
  currents: Map<string, Complex>;
}

export type AcSpacing = 'dec' | 'oct' | 'lin';

/**
 * Small-signal frequency sweep.
 *
 * Decade spacing is the default because that is what a Bode plot wants: equal
 * visual spacing per decade, and the rolloff reads as a straight line.
 */
export function acSweep(
  netlist: Netlist,
  spacing: AcSpacing,
  pointsPerInterval: number,
  startHz: number,
  stopHz: number,
): AcPoint[] {
  if (startHz <= 0 || stopHz <= 0) throw new Error('acSweep: frequencies must be positive');
  const frequencies: number[] = [];

  if (spacing === 'lin') {
    const n = Math.max(2, Math.round(pointsPerInterval));
    for (let i = 0; i < n; i++) frequencies.push(startHz + ((stopHz - startHz) * i) / (n - 1));
  } else {
    const base = spacing === 'dec' ? 10 : 2;
    const intervals = Math.log(stopHz / startHz) / Math.log(base);
    const total = Math.max(1, Math.round(intervals * pointsPerInterval));
    for (let i = 0; i <= total; i++) frequencies.push(startHz * base ** ((intervals * i) / total));
  }

  return frequencies.map((frequencyHz) => {
    const { voltages, currents } = solveAc(netlist, 2 * Math.PI * frequencyHz);
    return { frequencyHz, voltages, currents };
  });
}

/** Magnitude in dB and phase in degrees for one node across a sweep. */
export function bode(points: readonly AcPoint[], node: NodeName): {
  frequencyHz: number;
  magnitudeDb: number;
  phaseDeg: number;
}[] {
  return points.map((p) => {
    const v = p.voltages.get(node) ?? { re: 0, im: 0 };
    const magnitude = cAbs(v);
    return {
      frequencyHz: p.frequencyHz,
      magnitudeDb: 20 * Math.log10(Math.max(magnitude, 1e-18)),
      phaseDeg: cPhaseDeg(v),
    };
  });
}

// ---------------------------------------------------------------------------

export interface TransientPoint {
  time: number;
  voltages: Map<NodeName, number>;
  currents: Map<string, number>;
}

/**
 * Transient analysis by backward Euler.
 *
 * Chosen over trapezoidal deliberately: backward Euler is unconditionally
 * stable and never rings, so a student stepping an RLC circuit sees the damping
 * their hand analysis predicts rather than numerical oscillation they then have
 * to be told to ignore. It costs accuracy at large steps, which the step-size
 * guidance below is there to keep out of the way.
 */
export function transient(
  netlist: Netlist,
  stopTime: number,
  timeStep: number,
  options: { initialVoltages?: ReadonlyMap<NodeName, number> } = {},
): TransientPoint[] {
  if (timeStep <= 0) throw new Error('transient: timeStep must be positive');
  if (stopTime <= 0) throw new Error('transient: stopTime must be positive');
  const steps = Math.floor(stopTime / timeStep);
  if (steps > 1_000_000) throw new Error('transient: too many steps; increase timeStep');

  // t = 0 is the DC operating point with capacitors held at their initial
  // voltages and inductors at their initial currents, which is what "the
  // circuit just before the switch closes" means.
  let voltages = new Map<NodeName, number>(options.initialVoltages ?? [[GROUND, 0]]);
  const initialCurrents = new Map<string, number>();
  for (const e of netlist.elements) {
    if (e.kind === 'inductor' && e.initial !== undefined) initialCurrents.set(e.id.toUpperCase(), e.initial);
    if (e.kind === 'capacitor' && e.initial !== undefined) {
      voltages.set(e.nodes[0]!, (voltages.get(e.nodes[1]!) ?? 0) + e.initial);
    }
  }
  let currents = initialCurrents;

  const points: TransientPoint[] = [{ time: 0, voltages: new Map(voltages), currents: new Map(currents) }];

  for (let step = 1; step <= steps; step++) {
    const system = buildSystem(netlist, 'tran', {
      timeStep,
      previousVoltages: voltages,
      previousCurrents: currents,
    });
    const solution = solveSystem(system);

    // Recover inductor currents from the companion model so the next step has
    // its history: i = i_prev + (h/L)·v.
    const nextCurrents = new Map(solution.currents);
    for (const e of netlist.elements) {
      if (e.kind !== 'inductor') continue;
      const across =
        (solution.voltages.get(e.nodes[0]!) ?? 0) - (solution.voltages.get(e.nodes[1]!) ?? 0);
      const previous = currents.get(e.id.toUpperCase()) ?? 0;
      nextCurrents.set(e.id.toUpperCase(), previous + (timeStep / e.value) * across);
    }

    voltages = solution.voltages;
    currents = nextCurrents;
    points.push({ time: step * timeStep, voltages: new Map(voltages), currents: new Map(currents) });
  }

  return points;
}

/**
 * A step size that resolves the fastest time constant in the circuit.
 *
 * Students routinely pick a step by eye and then report that the simulator is
 * wrong. One fiftieth of the smallest RC or L/R product is comfortably inside
 * backward Euler's accurate range.
 */
export function suggestedTimeStep(netlist: Netlist, stopTime: number): number {
  const resistances = netlist.elements.filter((e) => e.kind === 'resistor').map((e) => e.value);
  const typicalR = resistances.length > 0 ? Math.min(...resistances) : 1e3;

  const constants: number[] = [];
  for (const e of netlist.elements) {
    if (e.kind === 'capacitor') constants.push(typicalR * e.value);
    if (e.kind === 'inductor') constants.push(e.value / typicalR);
  }
  if (constants.length === 0) return stopTime / 100;
  return Math.min(Math.min(...constants) / 50, stopTime / 50);
}
