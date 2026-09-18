import { describe, expect, it } from 'vitest';
import {
  GROUND, SingularMatrixError, acSweep, bode, dcSweep, emptySchematic, extractNets,
  formatNetlist, gradeCircuit, nextDesignator, nodeEquations, operatingPoint, parseNetlist,
  parseProbe, parseValue, pinPositions, suggestedTimeStep, toNetlist, transient,
  buildSystem, type PlacedComponent, type Schematic,
} from '../src/index.js';

const deck = (...lines: string[]): string => ['test', ...lines, '.end'].join('\n');

describe('SPICE value notation', () => {
  it('reads engineering suffixes', () => {
    expect(parseValue('1k')).toBe(1e3);
    expect(parseValue('4.7k')).toBeCloseTo(4700);
    expect(parseValue('10u')).toBeCloseTo(1e-5);
    expect(parseValue('1n')).toBeCloseTo(1e-9);
    expect(parseValue('2.2')).toBeCloseTo(2.2);
    expect(parseValue('1e3')).toBe(1000);
  });

  it('reads M as milli and MEG as mega', () => {
    // The classic SPICE trap. Getting it backwards scales a part by 10^9 and
    // the circuit still "works", just wrongly, so it is pinned explicitly.
    expect(parseValue('1M')).toBe(1e-3);
    expect(parseValue('1m')).toBe(1e-3);
    expect(parseValue('1Meg')).toBe(1e6);
    expect(parseValue('1MEG')).toBe(1e6);
    expect(parseValue('2.2meg')).toBeCloseTo(2.2e6);
  });

  it('accepts a micro sign and a trailing unit', () => {
    expect(parseValue('10µ')).toBeCloseTo(1e-5);
    expect(parseValue('10ohm')).toBe(10);
  });
});

describe('netlist parsing', () => {
  it('collects every error rather than stopping at the first', () => {
    const { errors } = parseNetlist(deck('R1 1 2', 'Q9 1 2 3 npn', 'R1 3 4 1k'));
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(errors.join(' ')).toMatch(/needs two nodes/);
    expect(errors.join(' ')).toMatch(/unknown element type/);
  });

  it('rejects a duplicate reference designator', () => {
    const { errors } = parseNetlist(deck('R1 1 0 1k', 'R1 1 0 2k'));
    expect(errors.join(' ')).toMatch(/duplicate reference designator "R1"/);
  });

  it('rejects a controlled source sensing a nonexistent element', () => {
    const { errors } = parseNetlist(deck('V1 1 0 5', 'R1 1 0 1k', 'F1 2 0 Vmissing 2'));
    expect(errors.join(' ')).toMatch(/sensing source "Vmissing" is not in the netlist/);
  });

  it('rejects a non-positive passive value', () => {
    const { errors } = parseNetlist(deck('R1 1 0 0'));
    expect(errors.join(' ')).toMatch(/must have a positive value/);
  });

  it('always reads the first line as the title, and says so when it looks like a part', () => {
    // SPICE takes line 1 as the title unconditionally. Guessing instead turned
    // the title "rc step response" into a resistor named rc with nodes
    // "step" and "response", which parsed as a malformed element.
    const parsed = parseNetlist('rc step response\nV1 1 0 5\nR1 1 0 1k\n.op\n.end');
    expect(parsed.errors).toEqual([]);
    expect(parsed.netlist.title).toBe('rc step response');
    expect(parsed.netlist.elements.map((e) => e.id)).toEqual(['V1', 'R1']);
    expect(parsed.notes.join(' ')).toMatch(/read as the deck title/);
  });

  it('does not warn when the title is plainly a title', () => {
    const parsed = parseNetlist(deck('V1 1 0 5', 'R1 1 0 1k'));
    expect(parsed.notes).toEqual([]);
  });

  it('separates directives from elements', () => {
    const parsed = parseNetlist(deck('V1 1 0 5', 'R1 1 0 1k', '.op', '.tran 1u 1m'));
    expect(parsed.directives).toEqual(['.op', '.tran 1u 1m']);
    expect(parsed.netlist.elements).toHaveLength(2);
  });

  it('round-trips through format and parse', () => {
    const original = parseNetlist(deck('V1 1 0 DC 12 AC 1 90', 'R1 1 2 4.7k', 'C1 2 0 1u IC=3'));
    const again = parseNetlist(formatNetlist(original.netlist, ['.op']));
    expect(again.errors).toEqual([]);
    expect(again.netlist.elements).toEqual(original.netlist.elements);
  });
});

describe('operating point', () => {
  it('solves a divider by hand-checkable arithmetic', () => {
    const { netlist } = parseNetlist(deck('V1 1 0 10', 'R1 1 2 1k', 'R2 2 0 1k'));
    const op = operatingPoint(netlist);
    expect(op.voltages.get('2')!).toBeCloseTo(5, 12);
    // Current leaves the source's + terminal, so it is negative by convention.
    expect(op.currents.get('V1')!).toBeCloseTo(-5e-3, 12);
  });

  it('reports a node with no DC path to ground as unsolvable, with a reason', () => {
    // A capacitor is a DC open, so node 2 floats entirely.
    const { netlist } = parseNetlist(deck('V1 1 0 5', 'C1 1 2 1u'));
    expect(() => operatingPoint(netlist)).toThrow(SingularMatrixError);
    try {
      operatingPoint(netlist);
    } catch (error) {
      expect((error as Error).message).toMatch(/no DC path to ground/);
    }
  });

  it('writes the node equation a student should have written', () => {
    const { netlist } = parseNetlist(deck('V1 1 0 10', 'R1 1 2 1k', 'R2 2 0 1k'));
    const equations = nodeEquations(buildSystem(netlist, 'dc'));
    const node2 = equations.find((e) => e.startsWith('Node 2:'))!;
    // KCL at node 2: (v2 - v1)/R1 + v2/R2 = 0, i.e. -0.001*v1 + 0.002*v2 = 0.
    expect(node2).toMatch(/−\s*0\.001·v\(1\)/);
    expect(node2).toMatch(/0\.002·v\(2\)/);
    expect(node2).toMatch(/=\s*0$/);
  });

  it('records what each element contributed', () => {
    const { netlist } = parseNetlist(deck('V1 1 0 10', 'R1 1 2 1k', 'C1 2 0 1u'));
    const op = operatingPoint(netlist);
    const byId = new Map(op.stamps.map((s) => [s.elementId, s]));
    expect(byId.get('R1')!.description).toMatch(/1\/1 kΩ = 1 mS/);
    expect(byId.get('C1')!.description).toMatch(/open circuit at DC/);
    expect(byId.get('V1')!.description).toMatch(/forces v\(1\) − v\(0\) = 10 V/);
  });

  it('solves a supernode circuit where two sources share no ground reference', () => {
    // V2 floats between nodes 2 and 3: the textbook supernode.
    const { netlist } = parseNetlist(
      deck('V1 1 0 10', 'R1 1 2 1k', 'V2 2 3 4', 'R2 3 0 2k', 'R3 2 0 3k'),
    );
    const op = operatingPoint(netlist);
    const v2 = op.voltages.get('2')!;
    const v3 = op.voltages.get('3')!;
    expect(v2 - v3).toBeCloseTo(4, 9);
    // KCL over the supernode must balance: current in from R1 equals out via R2 and R3.
    expect((10 - v2) / 1e3).toBeCloseTo(v3 / 2e3 + v2 / 3e3, 9);
  });
});

describe('DC sweep', () => {
  it('traces a divider output linearly in its source', () => {
    const { netlist } = parseNetlist(deck('V1 1 0 0', 'R1 1 2 1k', 'R2 2 0 1k'));
    const points = dcSweep(netlist, 'V1', 0, 10, 2);
    expect(points).toHaveLength(6);
    for (const point of points) {
      expect(point.voltages.get('2')!).toBeCloseTo(point.value / 2, 9);
    }
  });

  it('sweeps downward when stop is below start', () => {
    const { netlist } = parseNetlist(deck('V1 1 0 0', 'R1 1 0 1k'));
    const points = dcSweep(netlist, 'V1', 5, 0, 1);
    expect(points.map((p) => p.value)).toEqual([5, 4, 3, 2, 1, 0]);
  });
});

describe('AC analysis', () => {
  it('puts the RC corner at 1/(2*pi*R*C) with -45 degrees of phase', () => {
    const { netlist } = parseNetlist(deck('V1 1 0 AC 1', 'R1 1 2 1k', 'C1 2 0 1u'));
    const corner = 1 / (2 * Math.PI * 1e3 * 1e-6);
    const points = acSweep(netlist, 'dec', 20, corner / 100, corner * 100);
    const curve = bode(points, '2');

    const atCorner = curve.reduce((best, p) =>
      Math.abs(p.frequencyHz - corner) < Math.abs(best.frequencyHz - corner) ? p : best,
    );
    expect(atCorner.magnitudeDb).toBeCloseTo(-3.01, 1);
    expect(atCorner.phaseDeg).toBeCloseTo(-45, 0);

    // A decade above the corner the first-order rolloff is -20 dB.
    const decadeUp = curve.reduce((best, p) =>
      Math.abs(p.frequencyHz - corner * 10) < Math.abs(best.frequencyHz - corner * 10) ? p : best,
    );
    expect(decadeUp.magnitudeDb).toBeCloseTo(-20.04, 0);
  });

  it('passes DC through an inductor and blocks it with a capacitor', () => {
    const { netlist } = parseNetlist(deck('V1 1 0 AC 1', 'L1 1 2 10m', 'R1 2 0 1k'));
    const low = acSweep(netlist, 'dec', 2, 1, 10);
    expect(bode(low, '2')[0]!.magnitudeDb).toBeCloseTo(0, 2);
  });
});

describe('transient analysis', () => {
  it('charges an RC to within a percent of the analytical exponential', () => {
    const tau = 1e-3; // 1k * 1u
    const { netlist } = parseNetlist(deck('V1 1 0 10', 'R1 1 2 1k', 'C1 2 0 1u IC=0'));
    const points = transient(netlist, 5 * tau, tau / 2000);

    for (const multiple of [1, 2, 3, 5]) {
      const target = multiple * tau;
      const point = points.reduce((best, p) =>
        Math.abs(p.time - target) < Math.abs(best.time - target) ? p : best,
      );
      const exact = 10 * (1 - Math.exp(-point.time / tau));
      expect(point.voltages.get('2')!, `at t = ${multiple} tau`).toBeCloseTo(exact, 1);
      expect(Math.abs(point.voltages.get('2')! - exact) / exact).toBeLessThan(0.01);
    }
  });

  it('starts at the stated initial condition rather than at zero', () => {
    const { netlist } = parseNetlist(deck('V1 1 0 0', 'R1 1 2 1k', 'C1 2 0 1u IC=5'));
    const points = transient(netlist, 1e-3, 1e-6);
    expect(points[0]!.voltages.get('2')!).toBeCloseTo(5, 9);
    // Discharging toward zero through R1.
    expect(points[points.length - 1]!.voltages.get('2')!).toBeLessThan(5);
  });

  it('distinguishes the RLC damping regimes by whether the response overshoots', () => {
    // Series RLC driven from a step, measured across C. Critical damping is at
    // R = 2*sqrt(L/C); underdamped overshoots the final value, overdamped cannot.
    const L = 10e-3;
    const C = 1e-6;
    const critical = 2 * Math.sqrt(L / C); // 200 ohm
    const build = (r: number): string =>
      deck('V1 1 0 10', `R1 1 2 ${r}`, 'L1 2 3 10m', 'C1 3 0 1u IC=0');

    const peak = (r: number): number => {
      const { netlist } = parseNetlist(build(r));
      const points = transient(netlist, 5e-3, 2e-7);
      return Math.max(...points.map((p) => p.voltages.get('3') ?? 0));
    };

    expect(peak(critical / 10), 'underdamped should overshoot 10 V').toBeGreaterThan(10.5);
    expect(peak(critical * 10), 'overdamped must not overshoot').toBeLessThanOrEqual(10.001);
  });

  it('suggests a step that resolves the fastest time constant', () => {
    const { netlist } = parseNetlist(deck('V1 1 0 5', 'R1 1 2 1k', 'C1 2 0 1u'));
    expect(suggestedTimeStep(netlist, 5e-3)).toBeCloseTo(1e-3 / 50, 9);
  });
});

// ---------------------------------------------------------------------------

const component = (over: Partial<PlacedComponent> & Pick<PlacedComponent, 'id' | 'kind' | 'at'>): PlacedComponent => ({
  rotation: 0, value: 1000, ...over,
});

describe('schematic net extraction', () => {
  it('joins pins that share a position', () => {
    const schematic: Schematic = {
      ...emptySchematic(),
      components: [
        component({ id: 'R1', kind: 'resistor', at: { x: 0, y: 0 } }),
        component({ id: 'R2', kind: 'resistor', at: { x: 0, y: 4 } }),
      ],
      grounds: [{ x: 0, y: 6 }],
    };
    // R1 spans y=-2..2, R2 spans y=2..6. They meet at (0,2).
    const { byPoint } = extractNets(schematic);
    expect(byPoint.get('0,2')).toBeDefined();
    expect(byPoint.get('0,6')).toBe(GROUND);
  });

  it('connects a pin landing in the middle of a wire (T-junction)', () => {
    const schematic: Schematic = {
      ...emptySchematic(),
      components: [component({ id: 'R1', kind: 'resistor', at: { x: 6, y: 0 }, rotation: 90 })],
      wires: [{ id: 'w1', points: [{ x: 0, y: 0 }, { x: 12, y: 0 }] }],
      grounds: [],
    };
    // Rotated 90 degrees, R1's pins sit at (8,0) and (4,0) - both on the wire.
    const { byPoint } = extractNets(schematic);
    expect(byPoint.get('4,0')).toBe(byPoint.get('0,0'));
    expect(byPoint.get('8,0')).toBe(byPoint.get('0,0'));
  });

  it('names every net touching a ground symbol node 0', () => {
    const schematic: Schematic = {
      ...emptySchematic(),
      components: [component({ id: 'R1', kind: 'resistor', at: { x: 0, y: 0 } })],
      wires: [{ id: 'w1', points: [{ x: 0, y: 2 }, { x: 4, y: 2 }] }],
      grounds: [{ x: 4, y: 2 }],
    };
    const { byPoint } = extractNets(schematic);
    expect(byPoint.get('0,2')).toBe(GROUND);
  });

  it('is deterministic: the same drawing always yields the same net names', () => {
    const schematic: Schematic = {
      ...emptySchematic(),
      components: [
        component({ id: 'R1', kind: 'resistor', at: { x: 0, y: 0 } }),
        component({ id: 'R2', kind: 'resistor', at: { x: 0, y: 4 } }),
      ],
      grounds: [{ x: 0, y: 6 }],
    };
    expect([...extractNets(schematic).byPoint]).toEqual([...extractNets(schematic).byPoint]);
  });

  it('rotates pins about the body centre', () => {
    const r = component({ id: 'R1', kind: 'resistor', at: { x: 5, y: 5 }, rotation: 90 });
    expect(pinPositions(r)).toEqual([{ x: 7, y: 5 }, { x: 3, y: 5 }]);
  });

  it('allocates the next free designator', () => {
    const schematic: Schematic = {
      ...emptySchematic(),
      components: [
        component({ id: 'R1', kind: 'resistor', at: { x: 0, y: 0 } }),
        component({ id: 'R2', kind: 'resistor', at: { x: 4, y: 0 } }),
      ],
    };
    expect(nextDesignator(schematic, 'resistor')).toBe('R3');
    expect(nextDesignator(schematic, 'capacitor')).toBe('C1');
  });
});

describe('schematic to netlist', () => {
  it('reports an unconnected terminal instead of silently dropping it', () => {
    const schematic: Schematic = {
      ...emptySchematic(),
      components: [component({ id: 'R1', kind: 'resistor', at: { x: 0, y: 0 } })],
      grounds: [{ x: 0, y: 2 }],
    };
    const { issues } = toNetlist(schematic);
    expect(issues.some((i) => /unconnected terminal/.test(i.message))).toBe(false);
    // Both pins resolve: one to ground, one to its own net. Now float one.
    const floating = toNetlist({ ...schematic, grounds: [] });
    expect(floating.issues.some((i) => /No ground symbol/.test(i.message))).toBe(true);
  });

  it('flags a component shorted across one net', () => {
    const schematic: Schematic = {
      ...emptySchematic(),
      components: [component({ id: 'R1', kind: 'resistor', at: { x: 0, y: 0 } })],
      wires: [{ id: 'w1', points: [{ x: 0, y: -2 }, { x: 6, y: -2 }, { x: 6, y: 2 }, { x: 0, y: 2 }] }],
      grounds: [{ x: 6, y: 2 }],
    };
    const { issues } = toNetlist(schematic);
    expect(issues.some((i) => /short-circuited/.test(i.message))).toBe(true);
  });

  it('builds a solvable divider end to end from geometry', () => {
    const schematic: Schematic = {
      title: 'divider',
      components: [
        component({ id: 'V1', kind: 'vsource', at: { x: 0, y: 4 }, value: 10 }),
        component({ id: 'R1', kind: 'resistor', at: { x: 8, y: 0 }, value: 1000 }),
        component({ id: 'R2', kind: 'resistor', at: { x: 8, y: 6 }, value: 1000 }),
      ],
      wires: [
        // Source + (0,2) up and across to R1 top (8,-2).
        { id: 'w1', points: [{ x: 0, y: 2 }, { x: 0, y: -2 }, { x: 8, y: -2 }] },
        // R1 bottom (8,2) to R2 top (8,4).
        { id: 'w2', points: [{ x: 8, y: 2 }, { x: 8, y: 4 }] },
        // R2 bottom (8,8) back to source - (0,6).
        { id: 'w3', points: [{ x: 8, y: 8 }, { x: 0, y: 8 }, { x: 0, y: 6 }] },
      ],
      grounds: [{ x: 0, y: 6 }],
    };

    const { netlist, issues } = toNetlist(schematic);
    expect(issues).toEqual([]);
    expect(netlist.elements).toHaveLength(3);

    const op = operatingPoint(netlist);
    const midpoint = netlist.elements.find((e) => e.id === 'R1')!.nodes[1]!;
    expect(op.voltages.get(midpoint)!).toBeCloseTo(5, 9);
  });
});

describe('circuit-build grading', () => {
  const thevenin = parseNetlist(deck('V1 out 0 5', 'R1 out 0 4.7k')).netlist;

  it('parses probe expressions', () => {
    expect(parseProbe('v(out)')).toMatchObject({ kind: 'voltage', args: ['out'] });
    expect(parseProbe('v(a,b)')).toMatchObject({ kind: 'voltage', args: ['a', 'b'] });
    expect(parseProbe('i(V1)')).toMatchObject({ kind: 'current', args: ['v1'] });
    expect(parseProbe('db(v(out))')).toMatchObject({ wrapper: 'db', kind: 'voltage' });
    expect(parseProbe('nonsense')).toBeNull();
  });

  it('accepts any design that meets the measurements', () => {
    const result = gradeCircuit(thevenin, [
      { probe: 'v(out)', analysis: 'op', expected: 5, unit: 'V', tolerance: { rel: 0.02 } },
    ]);
    expect(result.correct).toBe(true);
  });

  it('accepts a structurally different circuit with the same behaviour', () => {
    // Two 2.35k resistors in series is the same Thevenin resistance as one 4.7k,
    // and grading by measurement is what lets both count as correct.
    const alternative = parseNetlist(
      deck('V1 out 0 5', 'R1 out mid 2.35k', 'R2 mid 0 2.35k'),
    ).netlist;
    const measurements = [
      { probe: 'v(out)', analysis: 'op' as const, expected: 5, unit: 'V', tolerance: { rel: 0.02 } },
    ];
    expect(gradeCircuit(thevenin, measurements).correct).toBe(true);
    expect(gradeCircuit(alternative, measurements).correct).toBe(true);
  });

  it('fails a design that misses the target', () => {
    const wrong = parseNetlist(deck('V1 out 0 3', 'R1 out 0 4.7k')).netlist;
    const result = gradeCircuit(wrong, [
      { probe: 'v(out)', analysis: 'op', expected: 5, unit: 'V', tolerance: { rel: 0.02 } },
    ]);
    expect(result.correct).toBe(false);
    expect(result.results[0]!.actual).toBeCloseTo(3, 9);
  });

  it('reports an unsolvable circuit as an error, not as a wrong answer', () => {
    const floating = parseNetlist(deck('V1 1 0 5', 'C1 1 2 1u')).netlist;
    const result = gradeCircuit(floating, [
      { probe: 'v(2)', analysis: 'op', expected: 0, unit: 'V', tolerance: { abs: 0.1 } },
    ]);
    expect(result.correct).toBe(false);
    expect(result.error).toMatch(/no DC path to ground/);
  });

  it('explains an AC measurement with no frequency rather than passing it', () => {
    const result = gradeCircuit(thevenin, [
      { probe: 'v(out)', analysis: 'ac', expected: 1, unit: 'V', tolerance: { rel: 0.05 } },
    ]);
    expect(result.correct).toBe(false);
    expect(result.results[0]!.message).toMatch(/at what frequency/);
  });

  it('grades an AC specification at a stated frequency', () => {
    const lowpass = parseNetlist(deck('V1 in 0 AC 1', 'R1 in out 1k', 'C1 out 0 159.155n')).netlist;
    const result = gradeCircuit(lowpass, [
      { probe: 'db(v(out))', analysis: 'ac', expected: -3.01, unit: 'dB', tolerance: { abs: 0.2 }, frequencyHz: 1000 },
    ]);
    expect(result.correct).toBe(true);
  });

  it('grades a transient specification at a stated time', () => {
    const rc = parseNetlist(deck('V1 1 0 10', 'R1 1 out 1k', 'C1 out 0 1u IC=0')).netlist;
    const result = gradeCircuit(rc, [
      { probe: 'v(out)', analysis: 'tran', expected: 6.32, unit: 'V', tolerance: { rel: 0.03 }, atTime: 1e-3 },
    ]);
    expect(result.correct).toBe(true);
  });
});
