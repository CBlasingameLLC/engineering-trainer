import { emptySchematic, type PlacedComponent, type Point, type Rotation, type Schematic } from './schematic.js';
import type { ElementKind } from './netlist.js';

/**
 * A catalog of the circuits a Circuits II course is actually about.
 *
 * Drawing a Sallen-Key section from scratch, on a grid, before you can ask a
 * question about it is not practice at filters. These are starting points: load
 * one, change the values, and simulate. Each is a complete circuit with a
 * ground and an output node named `out`, so the operating point and the AC
 * sweep both work the moment it lands on the canvas.
 *
 * They live in `@et/circuits` rather than in the app because they are circuit
 * data, not user interface, and because item figures should be able to start
 * from the same drawings the Lab offers.
 */

export interface CircuitTemplate {
  id: string;
  name: string;
  /** Which part of the course it belongs to, for grouping in the picker. */
  unit: string;
  /** One line on what the circuit is for and what to look at. */
  note: string;
  build: () => Schematic;
}

interface Draft {
  components: PlacedComponent[];
  wires: Schematic['wires'];
  grounds: Point[];
  labels: NonNullable<Schematic['labels']>;
}

const draft = (): Draft => ({ components: [], wires: [], grounds: [], labels: [] });

const part = (
  d: Draft, id: string, kind: ElementKind, at: Point, value: number, rotation: Rotation = 0,
  extra: Partial<PlacedComponent> = {},
): void => {
  d.components.push({ id, kind, at, value, rotation, ...extra });
};

const wire = (d: Draft, ...points: Point[]): void => {
  d.wires.push({ id: `w${d.wires.length + 1}`, points });
};

const finish = (title: string, d: Draft): Schematic => ({
  ...emptySchematic(title),
  components: d.components,
  wires: d.wires,
  grounds: d.grounds,
  labels: d.labels,
});

/** A source on the left with its negative terminal on the ground rail. */
const acSource = (d: Draft, magnitude = 1): void => {
  part(d, 'V1', 'vsource', { x: 4, y: 12 }, 0, 0, { acMagnitude: magnitude, acPhase: 0 });
  wire(d, { x: 4, y: 10 }, { x: 4, y: 6 });
  wire(d, { x: 4, y: 14 }, { x: 4, y: 20 });
  d.grounds.push({ x: 4, y: 20 });
};

/** A two-element divider: series part along the top, shunt part down to ground. */
function divider(
  title: string,
  series: { kind: ElementKind; id: string; value: number },
  shunt: { kind: ElementKind; id: string; value: number },
): Schematic {
  const d = draft();
  acSource(d);
  part(d, series.id, series.kind, { x: 12, y: 6 }, series.value, 90);
  part(d, shunt.id, shunt.kind, { x: 20, y: 10 }, shunt.value);
  wire(d, { x: 4, y: 6 }, { x: 10, y: 6 });
  wire(d, { x: 14, y: 6 }, { x: 20, y: 6 }, { x: 20, y: 8 });
  wire(d, { x: 20, y: 12 }, { x: 20, y: 20 }, { x: 4, y: 20 });
  d.labels.push({ at: { x: 18, y: 6 }, name: 'out' });
  return finish(title, d);
}

/** Three elements in a series loop, output taken across the last one. */
function seriesThree(
  title: string,
  a: { kind: ElementKind; id: string; value: number },
  b: { kind: ElementKind; id: string; value: number },
  c: { kind: ElementKind; id: string; value: number },
): Schematic {
  const d = draft();
  acSource(d);
  part(d, a.id, a.kind, { x: 12, y: 6 }, a.value, 90);
  part(d, b.id, b.kind, { x: 20, y: 6 }, b.value, 90);
  part(d, c.id, c.kind, { x: 28, y: 10 }, c.value);
  wire(d, { x: 4, y: 6 }, { x: 10, y: 6 });
  wire(d, { x: 14, y: 6 }, { x: 18, y: 6 });
  wire(d, { x: 22, y: 6 }, { x: 28, y: 6 }, { x: 28, y: 8 });
  wire(d, { x: 28, y: 12 }, { x: 28, y: 20 }, { x: 4, y: 20 });
  d.labels.push({ at: { x: 25, y: 6 }, name: 'out' });
  return finish(title, d);
}

/**
 * The inverting configuration, with whatever element is in the feedback path.
 *
 * Drawn carefully, because the first attempt swapped the two inputs — feedback
 * to the non-inverting pin is positive feedback, and an ideal op-amp wired that
 * way has no solution at all rather than a wrong one. The ground return for the
 * non-inverting input is routed above and around the op-amp rather than back
 * across the input side, because a wire crossing the summing junction's node
 * shorts it to ground and the drawing gives no hint that it has.
 */
function opAmpInverting(
  title: string,
  feedback: { kind: ElementKind; id: string; value: number },
  dcFeedback?: { id: string; value: number },
): Schematic {
  const d = draft();
  part(d, 'V1', 'vsource', { x: 4, y: 14 }, 0, 0, { acMagnitude: 1, acPhase: 0 });
  part(d, 'Rin', 'resistor', { x: 12, y: 10 }, 10000, 90);
  part(d, feedback.id, feedback.kind, { x: 22, y: 20 }, feedback.value, 90);
  part(d, 'U1', 'opamp', { x: 22, y: 8 }, 0);

  wire(d, { x: 4, y: 12 }, { x: 4, y: 10 }, { x: 10, y: 10 });
  wire(d, { x: 14, y: 10 }, { x: 19, y: 10 });                      // into the inverting pin
  wire(d, { x: 19, y: 10 }, { x: 19, y: 20 }, { x: 20, y: 20 });    // and on to the feedback element
  wire(d, { x: 24, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 8 }, { x: 25, y: 8 });
  wire(d, { x: 19, y: 6 }, { x: 19, y: 4 }, { x: 38, y: 4 }, { x: 38, y: 30 }, { x: 4, y: 30 });
  wire(d, { x: 4, y: 16 }, { x: 4, y: 30 });

  // A capacitor in the feedback path is an open circuit at DC, so an ideal
  // integrator has no DC feedback and no operating point at all — the solver
  // reports it as singular, which is correct and unhelpful. Real integrators
  // put a large resistor across the capacitor for exactly this reason, and
  // drawing one is more honest than drawing a circuit that cannot be solved.
  if (dcFeedback) {
    part(d, dcFeedback.id, 'resistor', { x: 22, y: 25 }, dcFeedback.value, 90);
    wire(d, { x: 19, y: 20 }, { x: 19, y: 25 }, { x: 20, y: 25 });
    wire(d, { x: 24, y: 25 }, { x: 30, y: 25 }, { x: 30, y: 20 });
  }
  d.grounds.push({ x: 4, y: 30 });
  d.labels.push({ at: { x: 30, y: 14 }, name: 'out' });
  return finish(title, d);
}

export const CIRCUIT_TEMPLATES: readonly CircuitTemplate[] = [
  {
    id: 'rc-lowpass',
    name: 'RC low-pass',
    unit: 'Frequency response',
    note: 'Output across the capacitor. Corner at 1/(2πRC) ≈ 1.6 kHz; watch the phase go to −45° there.',
    build: () => divider('RC low-pass', { kind: 'resistor', id: 'R1', value: 1000 }, { kind: 'capacitor', id: 'C1', value: 100e-9 }),
  },
  {
    id: 'rc-highpass',
    name: 'RC high-pass',
    unit: 'Frequency response',
    note: 'The same two parts, swapped. Output across the resistor, so DC is blocked entirely.',
    build: () => divider('RC high-pass', { kind: 'capacitor', id: 'C1', value: 100e-9 }, { kind: 'resistor', id: 'R1', value: 1000 }),
  },
  {
    id: 'rl-lowpass',
    name: 'RL low-pass',
    unit: 'Frequency response',
    note: 'Output across the resistor. Same response shape as the RC, with the corner at R/(2πL).',
    build: () => divider('RL low-pass', { kind: 'inductor', id: 'L1', value: 10e-3 }, { kind: 'resistor', id: 'R1', value: 1000 }),
  },
  {
    id: 'rl-highpass',
    name: 'RL high-pass',
    unit: 'Frequency response',
    note: 'Output across the inductor, whose impedance rises with frequency.',
    build: () => divider('RL high-pass', { kind: 'resistor', id: 'R1', value: 1000 }, { kind: 'inductor', id: 'L1', value: 10e-3 }),
  },
  {
    id: 'series-rlc',
    name: 'Series RLC',
    unit: 'Resonance',
    note: 'Output across C makes it a low-pass with a peak. At resonance the reactances cancel and the current is set by R alone.',
    build: () =>
      seriesThree(
        'Series RLC resonator',
        { kind: 'resistor', id: 'R1', value: 100 },
        { kind: 'inductor', id: 'L1', value: 10e-3 },
        { kind: 'capacitor', id: 'C1', value: 100e-9 },
      ),
  },
  {
    id: 'series-rlc-bandpass',
    name: 'Series RLC band-pass',
    unit: 'Resonance',
    note: 'The same loop with the output across R, which peaks at resonance instead of dipping.',
    build: () =>
      seriesThree(
        'Series RLC band-pass',
        { kind: 'inductor', id: 'L1', value: 10e-3 },
        { kind: 'capacitor', id: 'C1', value: 100e-9 },
        { kind: 'resistor', id: 'R1', value: 100 },
      ),
  },
  {
    id: 'parallel-rlc',
    name: 'Parallel RLC tank',
    unit: 'Resonance',
    note: 'Impedance peaks at resonance rather than dipping. Drive it through a series resistor to see the tank voltage rise.',
    build: () => {
      const d = draft();
      acSource(d);
      part(d, 'Rs', 'resistor', { x: 12, y: 6 }, 10000, 90);
      part(d, 'R1', 'resistor', { x: 20, y: 10 }, 10000);
      part(d, 'L1', 'inductor', { x: 27, y: 10 }, 10e-3);
      part(d, 'C1', 'capacitor', { x: 34, y: 10 }, 100e-9);
      wire(d, { x: 4, y: 6 }, { x: 10, y: 6 });
      wire(d, { x: 14, y: 6 }, { x: 34, y: 6 }, { x: 34, y: 8 });
      wire(d, { x: 20, y: 8 }, { x: 20, y: 6 });
      wire(d, { x: 27, y: 8 }, { x: 27, y: 6 });
      wire(d, { x: 20, y: 12 }, { x: 20, y: 20 }, { x: 4, y: 20 });
      wire(d, { x: 27, y: 12 }, { x: 27, y: 20 });
      wire(d, { x: 34, y: 12 }, { x: 34, y: 20 }, { x: 20, y: 20 });
      d.labels.push({ at: { x: 17, y: 6 }, name: 'out' });
      return finish('Parallel RLC tank', d);
    },
  },
  {
    id: 'rlc-notch',
    name: 'Series-LC notch',
    unit: 'Resonance',
    note: 'An LC pair to ground shunts the resonant frequency away, leaving a notch in the response.',
    build: () => {
      const d = draft();
      acSource(d);
      part(d, 'R1', 'resistor', { x: 12, y: 6 }, 1000, 90);
      part(d, 'L1', 'inductor', { x: 20, y: 10 }, 10e-3);
      part(d, 'C1', 'capacitor', { x: 20, y: 16 }, 100e-9);
      wire(d, { x: 4, y: 6 }, { x: 10, y: 6 });
      wire(d, { x: 14, y: 6 }, { x: 20, y: 6 }, { x: 20, y: 8 });
      wire(d, { x: 20, y: 12 }, { x: 20, y: 14 });
      wire(d, { x: 20, y: 18 }, { x: 20, y: 20 }, { x: 4, y: 20 });
      d.labels.push({ at: { x: 17, y: 6 }, name: 'out' });
      return finish('Series-LC notch', d);
    },
  },
  {
    id: 'inverting-amp',
    name: 'Inverting amplifier',
    unit: 'Op-amp circuits',
    note: 'Gain −Rf/Rin, set entirely by the two resistors. The summing junction sits at virtual ground.',
    build: () => opAmpInverting('Inverting amplifier', { kind: 'resistor', id: 'Rf', value: 100000 }),
  },
  {
    id: 'integrator',
    name: 'Op-amp integrator',
    unit: 'Op-amp circuits',
    note: 'The feedback resistor replaced by a capacitor: −20 dB/decade and a constant −90° of phase. Rdc sets the DC gain, without which there is no operating point.',
    build: () =>
      opAmpInverting('Op-amp integrator', { kind: 'capacitor', id: 'Cf', value: 10e-9 }, { id: 'Rdc', value: 1e6 }),
  },
  {
    id: 'sallen-key-lp',
    name: 'Sallen-Key low-pass',
    unit: 'Op-amp circuits',
    note: 'A second-order active section: −40 dB/decade past the corner, with Q set by the capacitor ratio.',
    build: () => {
      const d = draft();
      part(d, 'V1', 'vsource', { x: 4, y: 12 }, 0, 0, { acMagnitude: 1, acPhase: 0 });
      wire(d, { x: 4, y: 10 }, { x: 4, y: 6 }, { x: 10, y: 6 });
      wire(d, { x: 4, y: 14 }, { x: 4, y: 20 });
      d.grounds.push({ x: 4, y: 20 });

      part(d, 'R1', 'resistor', { x: 12, y: 6 }, 10000, 90);
      part(d, 'R2', 'resistor', { x: 22, y: 6 }, 10000, 90);
      part(d, 'C1', 'capacitor', { x: 17, y: 12 }, 10e-9);
      part(d, 'C2', 'capacitor', { x: 26, y: 0 }, 10e-9, 90);
      part(d, 'U1', 'opamp', { x: 32, y: 8 }, 0);

      wire(d, { x: 14, y: 6 }, { x: 20, y: 6 });        // R1 -> node A -> R2
      wire(d, { x: 17, y: 10 }, { x: 17, y: 6 });       // C1 top onto node A
      wire(d, { x: 17, y: 14 }, { x: 17, y: 20 }, { x: 4, y: 20 });
      wire(d, { x: 24, y: 6 }, { x: 29, y: 6 });        // node B -> non-inverting input
      wire(d, { x: 24, y: 0 }, { x: 24, y: 6 });        // C2 onto node B, at R2's own pin
      // C2 back to the output: the positive feedback path that makes this
      // second order rather than two cascaded RC sections.
      wire(d, { x: 28, y: 0 }, { x: 38, y: 0 }, { x: 38, y: 8 }, { x: 35, y: 8 });
      // Unity-gain follower: output straight back to the inverting input.
      wire(d, { x: 38, y: 8 }, { x: 38, y: 14 }, { x: 29, y: 14 }, { x: 29, y: 10 });
      d.labels.push({ at: { x: 38, y: 4 }, name: 'out' });
      return finish('Sallen-Key low-pass', d);
    },
  },
  {
    id: 'wheatstone',
    name: 'Wheatstone bridge',
    unit: 'Networks',
    note: 'Two dividers compared. Balanced when R1/R2 = R3/R4, where the bridge voltage is zero.',
    build: () => {
      const d = draft();
      part(d, 'V1', 'vsource', { x: 4, y: 12 }, 5);
      part(d, 'R1', 'resistor', { x: 16, y: 8 }, 1000);
      part(d, 'R2', 'resistor', { x: 16, y: 16 }, 2200);
      part(d, 'R3', 'resistor', { x: 28, y: 8 }, 2200);
      part(d, 'R4', 'resistor', { x: 28, y: 16 }, 4700);
      wire(d, { x: 4, y: 10 }, { x: 4, y: 4 }, { x: 28, y: 4 }, { x: 28, y: 6 });
      wire(d, { x: 16, y: 6 }, { x: 16, y: 4 });
      wire(d, { x: 16, y: 10 }, { x: 16, y: 14 });
      wire(d, { x: 28, y: 10 }, { x: 28, y: 14 });
      wire(d, { x: 4, y: 14 }, { x: 4, y: 22 }, { x: 28, y: 22 }, { x: 28, y: 18 });
      wire(d, { x: 16, y: 18 }, { x: 16, y: 22 });
      d.grounds.push({ x: 4, y: 22 });
      d.labels.push({ at: { x: 16, y: 12 }, name: 'a' });
      d.labels.push({ at: { x: 28, y: 12 }, name: 'b' });
      return finish('Wheatstone bridge', d);
    },
  },
  {
    id: 'ladder',
    name: 'Three-stage RC ladder',
    unit: 'Networks',
    note: 'Loading between stages is the point: the corner is nowhere near three times a single section.',
    build: () => {
      const d = draft();
      acSource(d);
      for (let i = 0; i < 3; i++) {
        const x = 12 + i * 10;
        part(d, `R${i + 1}`, 'resistor', { x, y: 6 }, 1000, 90);
        part(d, `C${i + 1}`, 'capacitor', { x: x + 6, y: 12 }, 100e-9);
        wire(d, { x: x - 2, y: 6 }, { x: x - 2, y: 6 });
        wire(d, { x: x + 2, y: 6 }, { x: x + 6, y: 6 }, { x: x + 6, y: 10 });
        wire(d, { x: x + 6, y: 14 }, { x: x + 6, y: 20 }, { x: 4, y: 20 });
      }
      wire(d, { x: 4, y: 6 }, { x: 10, y: 6 });
      wire(d, { x: 18, y: 6 }, { x: 20, y: 6 });
      wire(d, { x: 28, y: 6 }, { x: 30, y: 6 });
      d.labels.push({ at: { x: 34, y: 6 }, name: 'out' });
      return finish('Three-stage RC ladder', d);
    },
  },
  {
    id: 'thevenin-source',
    name: 'Source with series impedance',
    unit: 'Networks',
    note: 'A Thevenin source driving a load. Sweep the load to see maximum power transfer, and add reactance for the conjugate match.',
    build: () => {
      const d = draft();
      acSource(d);
      part(d, 'Rth', 'resistor', { x: 12, y: 6 }, 50, 90);
      part(d, 'Lth', 'inductor', { x: 20, y: 6 }, 1e-3, 90);
      part(d, 'RL', 'resistor', { x: 28, y: 12 }, 50);
      wire(d, { x: 4, y: 6 }, { x: 10, y: 6 });
      wire(d, { x: 14, y: 6 }, { x: 18, y: 6 });
      wire(d, { x: 22, y: 6 }, { x: 28, y: 6 }, { x: 28, y: 10 });
      wire(d, { x: 28, y: 14 }, { x: 28, y: 20 }, { x: 4, y: 20 });
      d.labels.push({ at: { x: 25, y: 6 }, name: 'out' });
      return finish('Source with series impedance', d);
    },
  },
];

export const templateById = (id: string): CircuitTemplate | undefined =>
  CIRCUIT_TEMPLATES.find((t) => t.id === id);
