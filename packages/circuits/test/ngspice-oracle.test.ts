import { describe, expect, it, beforeAll } from 'vitest';
import { Simulation } from 'eecircuit-engine';
import { formatNetlist, parseNetlist } from '../src/netlist.js';
import { operatingPoint } from '../src/analysis.js';
import { solveAc } from '../src/mna.js';
import { cAbs, cPhaseDeg } from '../src/linalg.js';

/**
 * Cross-validation against real ngspice.
 *
 * The MNA solver in this package is written from scratch and grades student
 * work, so "I derived the stamps correctly" is not something to take on faith.
 * ngspice 45 runs here as a WebAssembly build and acts as an oracle: the same
 * deck goes to both, and the node voltages must agree.
 *
 * ngspice is a *test* dependency only. It is deliberately not in the shipped
 * app: grading has to be deterministic and instant, the WASM payload is 40 MB,
 * and a solver that can emit its own node equations is worth more in a teaching
 * tool than one that can only emit answers.
 */

let spice: Simulation;
let available = true;

beforeAll(async () => {
  try {
    spice = new Simulation();
    await spice.start();
  } catch {
    available = false;
  }
}, 60_000);

interface SpiceResult {
  voltages: Map<string, number>;
  currents: Map<string, number>;
}

async function runSpice(deck: string): Promise<SpiceResult> {
  spice.setNetList(deck);
  const result = await spice.runSim();
  const voltages = new Map<string, number>();
  const currents = new Map<string, number>();

  for (const variable of result.data) {
    const name = variable.name.toLowerCase();
    const value = 'values' in variable ? Number(variable.values[0]) : Number.NaN;
    const node = /^v\((.+)\)$/.exec(name);
    const branch = /^i\((.+)\)$/.exec(name);
    if (node) voltages.set(node[1]!, value);
    else if (branch) currents.set(branch[1]!.toUpperCase(), value);
  }
  return { voltages, currents };
}

/** Decks exercising each stamp, written the way a student would. */
const DECKS: { name: string; deck: string }[] = [
  {
    name: 'resistive divider',
    deck: ['divider', 'V1 1 0 10', 'R1 1 2 1k', 'R2 2 0 3.3k', '.op', '.end'].join('\n'),
  },
  {
    name: 'series-parallel ladder',
    deck: ['ladder', 'V1 1 0 12', 'R1 1 2 470', 'R2 2 0 2.2k', 'R3 2 3 1k', 'R4 3 0 1.5k', '.op', '.end'].join('\n'),
  },
  {
    name: 'two independent sources',
    deck: ['twosource', 'V1 1 0 15', 'V2 3 0 5', 'R1 1 2 1k', 'R2 2 0 2.2k', 'R3 2 3 4.7k', '.op', '.end'].join('\n'),
  },
  {
    name: 'current source injection',
    deck: ['isrc', 'I1 0 1 5m', 'R1 1 0 2.2k', 'R2 1 2 1k', 'R3 2 0 3.3k', '.op', '.end'].join('\n'),
  },
  {
    name: 'voltage-controlled voltage source',
    deck: ['vcvs', 'V1 1 0 2', 'R1 1 2 1k', 'R2 2 0 1k', 'E1 3 0 2 0 5', 'R3 3 0 10k', '.op', '.end'].join('\n'),
  },
  {
    name: 'voltage-controlled current source',
    deck: ['vccs', 'V1 1 0 3', 'R1 1 0 1k', 'G1 2 0 1 0 2m', 'R2 2 0 4.7k', '.op', '.end'].join('\n'),
  },
  {
    name: 'current-controlled sources',
    deck: ['cc', 'V1 1 0 6', 'R1 1 2 1k', 'Vs 2 0 0', 'F1 3 0 Vs 4', 'R2 3 0 100', '.op', '.end'].join('\n'),
  },
  {
    name: 'inductor is a DC short, capacitor a DC open',
    deck: ['reactive', 'V1 1 0 9', 'R1 1 2 1k', 'L1 2 3 10m', 'R2 3 0 2.2k', 'C1 2 0 1u', '.op', '.end'].join('\n'),
  },
];

describe('MNA solver agrees with ngspice', () => {
  for (const { name, deck } of DECKS) {
    it(name, async () => {
      if (!available) return; // ngspice unavailable; the hand-checked tests still run
      const reference = await runSpice(deck);
      const { netlist } = parseNetlist(deck);
      const mine = operatingPoint(netlist);

      expect(reference.voltages.size).toBeGreaterThan(0);
      for (const [node, expected] of reference.voltages) {
        const actual = mine.voltages.get(node);
        expect(actual, `node ${node} missing from MNA solution`).toBeDefined();
        expect(actual!, `node ${node}`).toBeCloseTo(expected, 6);
      }
      for (const [element, expected] of reference.currents) {
        const actual = mine.currents.get(element);
        if (actual === undefined) continue; // ngspice reports some we do not model as unknowns
        expect(actual, `current through ${element}`).toBeCloseTo(expected, 9);
      }
    }, 30_000);
  }

  it('agrees on an RC low-pass across a frequency sweep', async () => {
    if (!available) return;
    const deck = ['rc', 'V1 1 0 AC 1', 'R1 1 2 1k', 'C1 2 0 159.155n', '.ac dec 4 10 100k', '.end'].join('\n');
    const { netlist } = parseNetlist(deck);

    spice.setNetList(deck);
    const result = await spice.runSim();

    // In AC mode ngspice reports every variable as complex - the frequency axis
    // included, as {real, img} with a zero imaginary part. Reading it as a plain
    // number yields NaN and a test that compares nothing.
    expect(result.dataType).toBe('complex');
    const axis = (name: string): { real: number; img: number }[] => {
      const variable = result.data.find((d) => d.name.toLowerCase() === name);
      expect(variable, `ngspice returned no ${name}`).toBeDefined();
      return (variable as { values: { real: number; img: number }[] }).values;
    };

    const frequencies = axis('frequency');
    const node2 = axis('v(2)');
    expect(frequencies.length).toBeGreaterThan(8);

    for (const i of [0, Math.floor(frequencies.length / 3), Math.floor((2 * frequencies.length) / 3), frequencies.length - 1]) {
      const frequency = frequencies[i]!.real;
      expect(Number.isFinite(frequency), 'frequency axis did not parse').toBe(true);
      const expected = node2[i]!;
      const mine = solveAc(netlist, 2 * Math.PI * frequency).voltages.get('2')!;

      const expectedMagnitude = Math.hypot(expected.real, expected.img);
      expect(cAbs(mine), `|v(2)| at ${frequency.toPrecision(4)} Hz`).toBeCloseTo(expectedMagnitude, 6);

      const expectedPhase = (Math.atan2(expected.img, expected.real) * 180) / Math.PI;
      expect(cPhaseDeg(mine), `phase at ${frequency.toPrecision(4)} Hz`).toBeCloseTo(expectedPhase, 4);
    }

    // The -3 dB point of a 1k / 159.155n low-pass is 1 kHz by construction.
    const corner = solveAc(netlist, 2 * Math.PI * 1000).voltages.get('2')!;
    expect(20 * Math.log10(cAbs(corner))).toBeCloseTo(-3.01, 1);
    expect(cPhaseDeg(corner)).toBeCloseTo(-45, 1);
  }, 30_000);

  it('agrees on an inverting op-amp built from a VCVS with large gain', async () => {
    if (!available) return;
    // ngspice has no ideal op-amp primitive, so the reference uses a VCVS with
    // a gain of 1e7 — which is what "ideal" means numerically. Our nullor stamp
    // should land on the same answer without needing a large number.
    const deck = ['inv', 'V1 1 0 1', 'R1 1 2 1k', 'Rf 2 3 10k', 'E1 3 0 0 2 1e7', '.op', '.end'].join('\n');
    const reference = await runSpice(deck);

    const ideal = parseNetlist(
      ['inv', 'V1 1 0 1', 'R1 1 2 1k', 'Rf 2 3 10k', 'XU1 3 0 2 opamp', '.op', '.end'].join('\n'),
    );
    expect(ideal.errors).toEqual([]);
    const mine = operatingPoint(ideal.netlist);

    expect(mine.voltages.get('3')!).toBeCloseTo(reference.voltages.get('3')!, 4);
    expect(mine.voltages.get('3')!).toBeCloseTo(-10, 9);
    // The virtual ground is an exact consequence of the nullor, not an approximation.
    expect(mine.voltages.get('2')!).toBeCloseTo(0, 12);
  }, 30_000);

  it('round-trips a netlist through format and parse without changing the answer', async () => {
    const original = parseNetlist(DECKS[1]!.deck);
    const reformatted = parseNetlist(formatNetlist(original.netlist, ['.op']));
    expect(reformatted.errors).toEqual([]);
    const a = operatingPoint(original.netlist);
    const b = operatingPoint(reformatted.netlist);
    for (const [node, value] of a.voltages) {
      expect(b.voltages.get(node)!, `node ${node} after round trip`).toBeCloseTo(value, 9);
    }
  });
});
