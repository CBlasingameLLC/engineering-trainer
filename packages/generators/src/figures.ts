import { gradeCircuit, inputResistance, toNetlist, type GradeResult, type Schematic } from '@et/circuits';
import type { Figure } from '@et/content-schema';

/**
 * Circuit figures, drawn from the same parameters that produce the answer.
 *
 * A stem that describes a topology in prose — "a source drives mesh 1 through
 * R1, R3 is the shared branch" — asks the learner to build the picture before
 * they can start on the circuit. That is a reading exercise wearing a circuits
 * costume, and it is not how the textbook, the homework or the exam presents
 * the same question.
 *
 * Every figure here is built from the generator's own drawn values, so the
 * numbers on the drawing are the numbers in the answer by construction. What is
 * *not* free is the geometry: a generator can wire a figure differently from
 * the circuit the prose describes and nothing would notice. So each complete
 * figure declares what simulating it must produce, and `pack verify` extracts
 * the netlist from the drawing and checks it.
 *
 * Coordinates are grid units. A two-terminal part at rotation 0 is vertical
 * with pins at (x, y∓2); at rotation 90 it is horizontal with pin 0 on the
 * right. For a voltage source pin 0 is the positive terminal.
 */

type Component = Figure['components'][number];
type Kind = Component['kind'];
type Rotation = Component['rotation'];
export interface Pt { x: number; y: number }

export class FigureBuilder {
  private readonly components: Component[] = [];
  private readonly wires: Figure['wires'] = [];
  private readonly grounds: Pt[] = [];
  private readonly labels: NonNullable<Figure['labels']> = [];
  private readonly annotations: Figure['annotations'] = [];
  private readonly expects: Figure['expects'] = [];

  constructor(private readonly title: string) {}

  part(id: string, kind: Kind, at: Pt, value: number, rotation: Rotation = 0): this {
    this.components.push({ id, kind, at, value, rotation });
    return this;
  }

  r = (id: string, at: Pt, ohms: number, rotation: Rotation = 0): this =>
    this.part(id, 'resistor', at, ohms, rotation);

  c = (id: string, at: Pt, farads: number, rotation: Rotation = 0): this =>
    this.part(id, 'capacitor', at, farads, rotation);

  l = (id: string, at: Pt, henries: number, rotation: Rotation = 0): this =>
    this.part(id, 'inductor', at, henries, rotation);

  v = (id: string, at: Pt, volts: number, rotation: Rotation = 0): this =>
    this.part(id, 'vsource', at, volts, rotation);

  /** An AC source. The DC value stays 0, so an operating point still solves. */
  vac(id: string, at: Pt, magnitude: number, phaseDeg = 0, rotation: Rotation = 0): this {
    this.components.push({ id, kind: 'vsource', at, value: 0, rotation, acMagnitude: magnitude, acPhase: phaseDeg });
    return this;
  }

  i = (id: string, at: Pt, amps: number, rotation: Rotation = 0): this =>
    this.part(id, 'isource', at, amps, rotation);

  opamp = (id: string, at: Pt, rotation: Rotation = 0): this =>
    this.part(id, 'opamp', at, 0, rotation);

  /** An orthogonal polyline. Points lying on it join it — the T-junction rule. */
  wire(...points: Pt[]): this {
    this.wires.push({ id: `w${this.wires.length + 1}`, points });
    return this;
  }

  ground(at: Pt): this {
    this.grounds.push(at);
    return this;
  }

  /** Name the net this point belongs to, so it can be drawn and probed. */
  label(at: Pt, name: string): this {
    this.labels.push({ at, name });
    return this;
  }

  /** Free text on the canvas: a terminal mark, a mesh direction, a polarity. */
  note(at: Pt, text: string, anchor: 'start' | 'middle' | 'end' = 'middle'): this {
    this.annotations.push({ at, text, anchor });
    return this;
  }

  /** What simulating this drawing must produce. Voltages, because a node
   *  voltage has no sign convention to get wrong between drawing and solver. */
  expectVoltage(node: string, value: number, rel = 0.005): this {
    this.expects.push({
      probe: `v(${node})`, analysis: 'op', expected: value, unit: 'V', tolerance: { rel, abs: 1e-6 },
    });
    return this;
  }

  expectCurrent(element: string, value: number, rel = 0.005): this {
    this.expects.push({
      probe: `i(${element})`, analysis: 'op', expected: value, unit: 'A', tolerance: { rel, abs: 1e-9 },
    });
    return this;
  }

  /** Magnitude of a node voltage at one frequency. */
  expectAcMagnitude(node: string, frequencyHz: number, value: number, rel = 0.005): this {
    this.expects.push({
      probe: `mag(v(${node}))`, analysis: 'ac', frequencyHz,
      expected: value, unit: 'V', tolerance: { rel, abs: 1e-9 },
    });
    return this;
  }

  /** Phase of a node voltage at one frequency, in degrees. */
  expectAcPhase(node: string, frequencyHz: number, degrees: number, abs = 0.5): this {
    this.expects.push({
      probe: `phase(v(${node}))`, analysis: 'ac', frequencyHz,
      expected: degrees, unit: 'deg', tolerance: { abs },
    });
    return this;
  }

  /**
   * Resistance looking into a node with the sources suppressed.
   *
   * A resistor network drawn at its terminals contains no source, so there is
   * nothing to solve and nothing to check — and topology is exactly what such a
   * figure claims. `r(node)` is graded by `gradeFigure`, which drives a probe
   * current the way the Thevenin procedure does.
   */
  expectResistance(node: string, value: number, rel = 0.005): this {
    this.expects.push({
      probe: `r(${node})`, analysis: 'op', expected: value, unit: 'ohm', tolerance: { rel, abs: 1e-9 },
    });
    return this;
  }

  build(): Figure {
    return {
      title: this.title,
      components: this.components,
      wires: this.wires,
      grounds: this.grounds,
      labels: this.labels,
      annotations: this.annotations,
      expects: this.expects,
    };
  }
}

export const figure = (title: string): FigureBuilder => new FigureBuilder(title);

/**
 * Simulate a figure and check what it claims to measure.
 *
 * `r(node)` is handled here rather than in `gradeCircuit` because it is not a
 * probe a simulator has — it is a second solve of a modified circuit. Keeping
 * it out of the grader means the learner-facing path stays exactly what SPICE
 * would do, and this stays what a figure is allowed to assert about itself.
 *
 * Both the generator tests and `pack verify` call this, so the bank and the
 * generator are held to one standard rather than two.
 */
export function gradeFigure(fig: Figure): GradeResult {
  const built = toNetlist(fig as Schematic);
  if (built.issues.length > 0) {
    return {
      correct: false,
      results: [],
      error: built.issues.map((i) => `${i.componentId ?? 'figure'}: ${i.message}`).join('; '),
    };
  }

  const resistances = fig.expects.filter((m) => /^r\s*\(/i.test(m.probe));
  const rest = fig.expects.filter((m) => !/^r\s*\(/i.test(m.probe));
  const graded = rest.length > 0 ? gradeCircuit(built.netlist, rest) : { correct: true, results: [] };

  const resistanceResults = resistances.map((m) => {
    const node = /^r\s*\(\s*([^)]+?)\s*\)$/i.exec(m.probe)?.[1] ?? '';
    const actual = inputResistance(built.netlist, node);
    const slack = Math.max(m.tolerance.abs ?? 0, (m.tolerance.rel ?? 0) * Math.abs(m.expected));
    return {
      probe: m.probe,
      expected: m.expected,
      actual: Number.isFinite(actual) ? actual : null,
      within: Number.isFinite(actual) && Math.abs(actual - m.expected) <= Math.max(slack, 1e-12),
    };
  });

  return {
    correct: (graded.correct ?? false) && resistanceResults.every((r) => r.within),
    results: [...graded.results, ...resistanceResults],
    ...(graded.error ? { error: graded.error } : {}),
  };
}
