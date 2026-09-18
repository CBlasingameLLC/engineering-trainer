import { luSolve, luSolveComplex, cx, cAdd, cSub, cDiv, cMul, type Complex } from './linalg.js';
import { GROUND, nodesOf, type Element, type Netlist, type NodeName } from './netlist.js';

/**
 * Modified Nodal Analysis, written to be read.
 *
 * ngspice will happily return the answer. It will not tell a student which
 * equation they should have written at node 2, and that is the part worth
 * teaching — so this solver keeps the stamped matrix, the source vector and a
 * per-element record of what each component contributed, and can render the
 * node equations back out in the form a textbook would.
 *
 * Unknown ordering is [node voltages (ground excluded)] then [branch currents].
 * A branch current becomes an unknown whenever an element constrains voltage
 * rather than relating it to current: voltage sources, DC inductors (shorts),
 * op-amp outputs, and the two controlled sources that impose a voltage.
 */

export interface StampEntry {
  row: string;
  col: string;
  value: number;
}

/** What one element contributed, in the language of the element. */
export interface StampTrace {
  elementId: string;
  /** e.g. "conductance 1/2.2k = 455 uS between nodes 1 and 2" */
  description: string;
  entries: StampEntry[];
}

export interface MnaSystem {
  /** Unknown labels in solve order: "v(1)", "v(out)", "i(V1)". */
  unknowns: string[];
  /** Non-ground node names, in unknown order. */
  nodes: NodeName[];
  /** Element ids owning a branch-current unknown, in unknown order. */
  currentOwners: string[];
  matrix: number[][];
  rhs: number[];
  stamps: StampTrace[];
}

/** Does this element add a branch-current unknown under DC/transient analysis? */
function needsCurrentUnknown(element: Element, mode: 'dc' | 'tran'): boolean {
  switch (element.kind) {
    case 'vsource':
    case 'vcvs':
    case 'ccvs':
    case 'opamp':
      return true;
    case 'inductor':
      // A DC inductor is a short, which is a zero-volt source. Under transient
      // it becomes a Norton companion and needs no unknown.
      return mode === 'dc';
    default:
      return false;
  }
}

interface Index {
  /** Unknown index for a node, or -1 for ground. */
  node(name: NodeName): number;
  current(elementId: string): number;
}

function buildIndex(netlist: Netlist, mode: 'dc' | 'tran'): {
  index: Index;
  nodes: NodeName[];
  currentOwners: string[];
  unknowns: string[];
} {
  const nodes = nodesOf(netlist).filter((n) => n !== GROUND);
  const nodeIndex = new Map(nodes.map((n, i) => [n, i]));

  const currentOwners = netlist.elements.filter((e) => needsCurrentUnknown(e, mode)).map((e) => e.id);
  const currentIndex = new Map(currentOwners.map((id, i) => [id.toUpperCase(), nodes.length + i]));

  return {
    nodes,
    currentOwners,
    unknowns: [...nodes.map((n) => `v(${n})`), ...currentOwners.map((id) => `i(${id})`)],
    index: {
      node: (name) => (name === GROUND ? -1 : nodeIndex.get(name) ?? -1),
      current: (id) => currentIndex.get(id.toUpperCase()) ?? -1,
    },
  };
}

/** Accumulate into a matrix, skipping ground rows and columns. */
function add(matrix: number[][], row: number, col: number, value: number): void {
  if (row < 0 || col < 0) return;
  matrix[row]![col]! += value;
}

const engineering = (value: number, unit: string): string => {
  const abs = Math.abs(value);
  const table: [number, string][] = [
    [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'u'], [1e-9, 'n'], [1e-12, 'p'],
  ];
  for (const [scale, prefix] of table) {
    if (abs >= scale) return `${Number((value / scale).toPrecision(4))} ${prefix}${unit}`;
  }
  return `${Number(value.toPrecision(4))} ${unit}`;
};

export interface BuildOptions {
  /** Transient step size in seconds. Required for mode 'tran'. */
  timeStep?: number;
  /** Node voltages from the previous transient step, for capacitor companions. */
  previousVoltages?: ReadonlyMap<NodeName, number>;
  /** Inductor currents from the previous transient step. */
  previousCurrents?: ReadonlyMap<string, number>;
  /** Override a source's value, used by DC sweep. */
  sourceOverrides?: ReadonlyMap<string, number>;
}

/**
 * Stamp the netlist into an MNA system.
 *
 * `mode: 'dc'` treats capacitors as open and inductors as short — the operating
 * point. `mode: 'tran'` replaces both with backward-Euler companion models,
 * which is what makes a first-order step response come out as an exponential
 * rather than as an instantaneous jump.
 */
export function buildSystem(
  netlist: Netlist,
  mode: 'dc' | 'tran' = 'dc',
  options: BuildOptions = {},
): MnaSystem {
  const { index, nodes, currentOwners, unknowns } = buildIndex(netlist, mode);
  const size = unknowns.length;
  const matrix: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const rhs = new Array<number>(size).fill(0);
  const stamps: StampTrace[] = [];

  const h = options.timeStep ?? 0;
  const prevV = options.previousVoltages ?? new Map<NodeName, number>();
  const prevI = options.previousCurrents ?? new Map<string, number>();
  const voltageAcross = (e: Element): number =>
    (prevV.get(e.nodes[0]!) ?? 0) - (prevV.get(e.nodes[1]!) ?? 0);

  const record = (elementId: string, description: string, entries: StampEntry[]): void => {
    stamps.push({ elementId, description, entries: entries.filter((e) => e.value !== 0) });
  };

  const conductance = (e: Element, g: number, label: string): void => {
    const [a, b] = [index.node(e.nodes[0]!), index.node(e.nodes[1]!)];
    add(matrix, a, a, g);
    add(matrix, b, b, g);
    add(matrix, a, b, -g);
    add(matrix, b, a, -g);
    record(e.id, label, [
      { row: `v(${e.nodes[0]})`, col: `v(${e.nodes[0]})`, value: a < 0 ? 0 : g },
      { row: `v(${e.nodes[1]})`, col: `v(${e.nodes[1]})`, value: b < 0 ? 0 : g },
      { row: `v(${e.nodes[0]})`, col: `v(${e.nodes[1]})`, value: a < 0 || b < 0 ? 0 : -g },
      { row: `v(${e.nodes[1]})`, col: `v(${e.nodes[0]})`, value: a < 0 || b < 0 ? 0 : -g },
    ]);
  };

  /** A current source injecting `amps` from node[0] through the element to node[1]. */
  const injection = (e: Element, amps: number, label: string): void => {
    const [a, b] = [index.node(e.nodes[0]!), index.node(e.nodes[1]!)];
    if (a >= 0) rhs[a]! -= amps;
    if (b >= 0) rhs[b]! += amps;
    record(e.id, label, [
      { row: `v(${e.nodes[0]})`, col: 'rhs', value: a < 0 ? 0 : -amps },
      { row: `v(${e.nodes[1]})`, col: 'rhs', value: b < 0 ? 0 : amps },
    ]);
  };

  for (const element of netlist.elements) {
    const value = options.sourceOverrides?.get(element.id.toUpperCase()) ?? element.value;
    const [n0, n1] = [element.nodes[0]!, element.nodes[1]!];
    const a = index.node(n0);
    const b = index.node(n1);

    switch (element.kind) {
      case 'resistor':
        conductance(element, 1 / value, `1/${engineering(value, 'Ω')} = ${engineering(1 / value, 'S')} between ${n0} and ${n1}`);
        break;

      case 'capacitor':
        if (mode === 'dc') {
          record(element.id, `open circuit at DC (${engineering(value, 'F')} carries no steady current)`, []);
        } else {
          // Backward Euler: i = (C/h)(v - v_prev). Norton equivalent is a
          // conductance C/h alongside a source carrying (C/h)·v_prev.
          const g = value / h;
          conductance(element, g, `C/h = ${engineering(value, 'F')}/${engineering(h, 's')} = ${engineering(g, 'S')} companion conductance`);
          const history = g * voltageAcross(element);
          if (history !== 0) injection(element, -history, `history current ${engineering(history, 'A')} from the previous step`);
        }
        break;

      case 'inductor':
        if (mode === 'dc') {
          // Short circuit: a zero-volt source, so the branch current stays an
          // explicit unknown rather than being lost.
          const k = index.current(element.id);
          add(matrix, a, k, 1);
          add(matrix, b, k, -1);
          add(matrix, k, a, 1);
          add(matrix, k, b, -1);
          record(element.id, `short circuit at DC (${engineering(value, 'H')} holds no steady voltage)`, [
            { row: `i(${element.id})`, col: `v(${n0})`, value: a < 0 ? 0 : 1 },
            { row: `i(${element.id})`, col: `v(${n1})`, value: b < 0 ? 0 : -1 },
          ]);
        } else {
          // Backward Euler: i = i_prev + (h/L)·v.
          const g = h / value;
          conductance(element, g, `h/L = ${engineering(h, 's')}/${engineering(value, 'H')} = ${engineering(g, 'S')} companion conductance`);
          const history = prevI.get(element.id.toUpperCase()) ?? element.initial ?? 0;
          if (history !== 0) injection(element, history, `history current ${engineering(history, 'A')} from the previous step`);
        }
        break;

      case 'vsource': {
        const k = index.current(element.id);
        add(matrix, a, k, 1);
        add(matrix, b, k, -1);
        add(matrix, k, a, 1);
        add(matrix, k, b, -1);
        rhs[k]! += value;
        record(element.id, `forces v(${n0}) − v(${n1}) = ${engineering(value, 'V')}`, [
          { row: `i(${element.id})`, col: `v(${n0})`, value: a < 0 ? 0 : 1 },
          { row: `i(${element.id})`, col: `v(${n1})`, value: b < 0 ? 0 : -1 },
          { row: `i(${element.id})`, col: 'rhs', value },
        ]);
        break;
      }

      case 'isource':
        injection(element, value, `drives ${engineering(value, 'A')} from ${n0} to ${n1}`);
        break;

      case 'vccs': {
        // Current gm·(v(c+) − v(c−)) flows from out+ through the source to out−.
        const cp = index.node(element.nodes[2]!);
        const cm = index.node(element.nodes[3]!);
        add(matrix, a, cp, value);
        add(matrix, a, cm, -value);
        add(matrix, b, cp, -value);
        add(matrix, b, cm, value);
        record(element.id, `transconductance ${engineering(value, 'S')} sensing v(${element.nodes[2]}) − v(${element.nodes[3]})`, [
          { row: `v(${n0})`, col: `v(${element.nodes[2]})`, value: a < 0 || cp < 0 ? 0 : value },
          { row: `v(${n1})`, col: `v(${element.nodes[2]})`, value: b < 0 || cp < 0 ? 0 : -value },
        ]);
        break;
      }

      case 'vcvs': {
        const k = index.current(element.id);
        const cp = index.node(element.nodes[2]!);
        const cm = index.node(element.nodes[3]!);
        add(matrix, a, k, 1);
        add(matrix, b, k, -1);
        add(matrix, k, a, 1);
        add(matrix, k, b, -1);
        add(matrix, k, cp, -value);
        add(matrix, k, cm, value);
        record(element.id, `forces v(${n0}) − v(${n1}) = ${value} · (v(${element.nodes[2]}) − v(${element.nodes[3]}))`, [
          { row: `i(${element.id})`, col: `v(${element.nodes[2]})`, value: cp < 0 ? 0 : -value },
        ]);
        break;
      }

      case 'cccs': {
        const sense = index.current(element.controlSource ?? '');
        add(matrix, a, sense, value);
        add(matrix, b, sense, -value);
        record(element.id, `current gain ${value} on i(${element.controlSource})`, [
          { row: `v(${n0})`, col: `i(${element.controlSource})`, value: a < 0 ? 0 : value },
        ]);
        break;
      }

      case 'ccvs': {
        const k = index.current(element.id);
        const sense = index.current(element.controlSource ?? '');
        add(matrix, a, k, 1);
        add(matrix, b, k, -1);
        add(matrix, k, a, 1);
        add(matrix, k, b, -1);
        add(matrix, k, sense, -value);
        record(element.id, `forces v(${n0}) − v(${n1}) = ${engineering(value, 'Ω')} · i(${element.controlSource})`, [
          { row: `i(${element.id})`, col: `i(${element.controlSource})`, value: -value },
        ]);
        break;
      }

      case 'opamp': {
        // Ideal op-amp as a nullor: the input pair is forced to equal potential
        // and the output supplies whatever current that demands. This is the
        // virtual short, stated as an equation rather than as a slogan.
        const k = index.current(element.id);
        const out = index.node(element.nodes[0]!);
        const inp = index.node(element.nodes[1]!);
        const inn = index.node(element.nodes[2]!);
        add(matrix, out, k, -1);
        add(matrix, k, inp, 1);
        add(matrix, k, inn, -1);
        record(element.id, `virtual short: v(${element.nodes[1]}) = v(${element.nodes[2]}), output supplies the current`, [
          { row: `i(${element.id})`, col: `v(${element.nodes[1]})`, value: inp < 0 ? 0 : 1 },
          { row: `i(${element.id})`, col: `v(${element.nodes[2]})`, value: inn < 0 ? 0 : -1 },
        ]);
        break;
      }
    }
  }

  return { unknowns, nodes, currentOwners, matrix, rhs, stamps };
}

export interface Solution {
  /** Node voltages by node name. Ground is present and always 0. */
  voltages: Map<NodeName, number>;
  /** Branch currents for elements that own a current unknown. */
  currents: Map<string, number>;
  system: MnaSystem;
}

export function solveSystem(system: MnaSystem): Solution {
  const x = luSolve(system.matrix, system.rhs);
  const voltages = new Map<NodeName, number>([[GROUND, 0]]);
  system.nodes.forEach((name, i) => voltages.set(name, x[i]!));
  const currents = new Map<string, number>();
  system.currentOwners.forEach((id, i) => currents.set(id.toUpperCase(), x[system.nodes.length + i]!));
  return { voltages, currents, system };
}

/**
 * Render the KCL equation assembled at each node.
 *
 * This is the output ngspice structurally cannot produce, and the reason this
 * solver exists alongside it: a learner who got the wrong answer needs to see
 * which equation they should have written, not a corrected number.
 */
export function nodeEquations(system: MnaSystem): string[] {
  const term = (coefficient: number, symbol: string): string => {
    const sign = coefficient < 0 ? '−' : '+';
    const magnitude = Number(Math.abs(coefficient).toPrecision(4));
    return `${sign} ${magnitude}·${symbol}`;
  };

  return system.nodes.map((node, row) => {
    const parts: string[] = [];
    for (const [col, label] of system.unknowns.entries()) {
      const coefficient = system.matrix[row]![col]!;
      if (Math.abs(coefficient) > 1e-15) parts.push(term(coefficient, label));
    }
    const lhs = parts.join(' ').replace(/^\+\s*/, '').replace(/^−\s*/, '−');
    return `Node ${node}:  ${lhs || '0'} = ${Number(system.rhs[row]!.toPrecision(4))}`;
  });
}

// ---------------------------------------------------------------------------
// AC analysis — the same stamps over complex admittances.
// ---------------------------------------------------------------------------

export interface AcSystem {
  unknowns: string[];
  nodes: NodeName[];
  currentOwners: string[];
  matrix: Complex[][];
  rhs: Complex[];
}

/** Elements owning a current unknown in AC: voltage-forcing elements only. */
const acNeedsCurrent = (e: Element): boolean =>
  e.kind === 'vsource' || e.kind === 'vcvs' || e.kind === 'ccvs' || e.kind === 'opamp';

export function buildAcSystem(netlist: Netlist, omega: number): AcSystem {
  const nodes = nodesOf(netlist).filter((n) => n !== GROUND);
  const nodeIndex = new Map(nodes.map((n, i) => [n, i]));
  const currentOwners = netlist.elements.filter(acNeedsCurrent).map((e) => e.id);
  const currentIndex = new Map(currentOwners.map((id, i) => [id.toUpperCase(), nodes.length + i]));

  const idx = (name: NodeName): number => (name === GROUND ? -1 : nodeIndex.get(name) ?? -1);
  const cur = (id: string): number => currentIndex.get(id.toUpperCase()) ?? -1;

  const size = nodes.length + currentOwners.length;
  const matrix: Complex[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => cx(0)),
  );
  const rhs: Complex[] = Array.from({ length: size }, () => cx(0));

  const addC = (row: number, col: number, v: Complex): void => {
    if (row < 0 || col < 0) return;
    matrix[row]![col] = cAdd(matrix[row]![col]!, v);
  };

  const admittance = (e: Element, y: Complex): void => {
    const a = idx(e.nodes[0]!);
    const b = idx(e.nodes[1]!);
    addC(a, a, y);
    addC(b, b, y);
    addC(a, b, cMul(cx(-1), y));
    addC(b, a, cMul(cx(-1), y));
  };

  for (const e of netlist.elements) {
    const a = idx(e.nodes[0]!);
    const b = idx(e.nodes[1]!);

    switch (e.kind) {
      case 'resistor':
        admittance(e, cx(1 / e.value));
        break;
      case 'capacitor':
        // Y = jωC
        admittance(e, cx(0, omega * e.value));
        break;
      case 'inductor':
        // Y = 1/(jωL); at DC this is infinite, so ω=0 is handled as a short.
        admittance(e, omega === 0 ? cx(1e12) : cDiv(cx(1), cx(0, omega * e.value)));
        break;
      case 'vsource': {
        const k = cur(e.id);
        addC(a, k, cx(1));
        addC(b, k, cx(-1));
        addC(k, a, cx(1));
        addC(k, b, cx(-1));
        const magnitude = e.acMagnitude ?? 0;
        const phase = ((e.acPhase ?? 0) * Math.PI) / 180;
        rhs[k] = cAdd(rhs[k]!, cx(magnitude * Math.cos(phase), magnitude * Math.sin(phase)));
        break;
      }
      case 'isource': {
        const magnitude = e.acMagnitude ?? 0;
        const phase = ((e.acPhase ?? 0) * Math.PI) / 180;
        const value = cx(magnitude * Math.cos(phase), magnitude * Math.sin(phase));
        if (a >= 0) rhs[a] = cSub(rhs[a]!, value);
        if (b >= 0) rhs[b] = cAdd(rhs[b]!, value);
        break;
      }
      case 'vccs': {
        const cp = idx(e.nodes[2]!);
        const cm = idx(e.nodes[3]!);
        addC(a, cp, cx(e.value));
        addC(a, cm, cx(-e.value));
        addC(b, cp, cx(-e.value));
        addC(b, cm, cx(e.value));
        break;
      }
      case 'vcvs': {
        const k = cur(e.id);
        addC(a, k, cx(1));
        addC(b, k, cx(-1));
        addC(k, a, cx(1));
        addC(k, b, cx(-1));
        addC(k, idx(e.nodes[2]!), cx(-e.value));
        addC(k, idx(e.nodes[3]!), cx(e.value));
        break;
      }
      case 'cccs': {
        const sense = cur(e.controlSource ?? '');
        addC(a, sense, cx(e.value));
        addC(b, sense, cx(-e.value));
        break;
      }
      case 'ccvs': {
        const k = cur(e.id);
        addC(a, k, cx(1));
        addC(b, k, cx(-1));
        addC(k, a, cx(1));
        addC(k, b, cx(-1));
        addC(k, cur(e.controlSource ?? ''), cx(-e.value));
        break;
      }
      case 'opamp': {
        const k = cur(e.id);
        addC(idx(e.nodes[0]!), k, cx(-1));
        addC(k, idx(e.nodes[1]!), cx(1));
        addC(k, idx(e.nodes[2]!), cx(-1));
        break;
      }
    }
  }

  return {
    unknowns: [...nodes.map((n) => `v(${n})`), ...currentOwners.map((id) => `i(${id})`)],
    nodes,
    currentOwners,
    matrix,
    rhs,
  };
}

export interface AcSolution {
  voltages: Map<NodeName, Complex>;
  currents: Map<string, Complex>;
}

export function solveAc(netlist: Netlist, omega: number): AcSolution {
  const system = buildAcSystem(netlist, omega);
  const x = luSolveComplex(system.matrix, system.rhs);
  const voltages = new Map<NodeName, Complex>([[GROUND, cx(0)]]);
  system.nodes.forEach((name, i) => voltages.set(name, x[i]!));
  const currents = new Map<string, Complex>();
  system.currentOwners.forEach((id, i) => currents.set(id.toUpperCase(), x[system.nodes.length + i]!));
  return { voltages, currents };
}
