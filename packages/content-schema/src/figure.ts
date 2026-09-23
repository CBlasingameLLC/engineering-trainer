import { z } from 'zod';

/**
 * A drawn circuit attached to an item, and what it must measure.
 *
 * A word problem that describes a topology in prose asks the learner to build
 * the picture before they can start, which tests reading rather than circuits.
 * Textbooks and exams draw it. So does this, for the items where the topology
 * is the hard part — a two-element divider stays prose, because a drawing of it
 * adds nothing.
 *
 * The shape mirrors `Schematic` in `@et/circuits` structurally rather than
 * importing it: this package is the contract every content producer emits and
 * must not depend on a domain package to state it. `figureMatchesSchematic` in
 * the generators tests pins the correspondence, so the two cannot drift
 * silently.
 *
 * The figure is generated from the same parameters as the answer, which makes
 * agreement true by construction — but only if the geometry is right, and
 * geometry is exactly the part a generator can get wrong without anyone
 * noticing. `expects` is how the figure is held to account: `pack verify`
 * extracts the netlist from the drawing and simulates it, so a diagram wired
 * differently from the circuit the prose describes fails the gate rather than
 * teaching the wrong thing.
 */

const point = z.object({ x: z.number().int(), y: z.number().int() });

export const ELEMENT_KINDS = [
  'resistor', 'capacitor', 'inductor', 'vsource', 'isource',
  'vcvs', 'vccs', 'ccvs', 'cccs', 'opamp',
] as const;

/** One thing a simulator can measure about a circuit, and what it should read. */
export const measurementSchema = z.object({
  /** Measurement expression, e.g. "v(out)", "i(v1)", "db(v(out))". */
  probe: z.string().min(1),
  analysis: z.enum(['op', 'dc', 'ac', 'tran']),
  expected: z.number().finite(),
  unit: z.string(),
  tolerance: z.object({ rel: z.number().positive().optional(), abs: z.number().positive().optional() }),
  /** Required for `ac`: a gain specification means nothing without a frequency. */
  frequencyHz: z.number().positive().optional(),
  /** Required for `tran`: likewise, a transient value needs an instant. */
  atTime: z.number().positive().optional(),
});

export const placedComponentSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(ELEMENT_KINDS),
  /** Body centre, in grid units. */
  at: point,
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  value: z.number(),
  acMagnitude: z.number().optional(),
  acPhase: z.number().optional(),
  controlSource: z.string().optional(),
  initial: z.number().optional(),
});

export const wireSchema = z.object({
  id: z.string().min(1),
  /** Polyline vertices in grid units. Two points make one segment. */
  points: z.array(point).min(2),
});

export const figureSchema = z.object({
  title: z.string().default(''),
  components: z.array(placedComponentSchema).min(1),
  wires: z.array(wireSchema).default([]),
  /** Ground symbol anchor points. Any net touching one is node 0. */
  grounds: z.array(point).default([]),
  /**
   * Names for nets, drawn on the figure and used to probe it.
   *
   * Without these a net is numbered by traversal order, so nothing outside the
   * drawing can say "the voltage at the node the question calls A" — and a
   * figure nothing can address is a figure nothing can check.
   */
  labels: z.array(z.object({ at: point, name: z.string().min(1) })).default([]),
  /** Labels drawn on the canvas: node names, terminal marks, mesh arrows. */
  annotations: z
    .array(z.object({ at: point, text: z.string().min(1), anchor: z.enum(['start', 'middle', 'end']).default('middle') }))
    .default([]),
  /**
   * What simulating the drawing must produce.
   *
   * Empty is allowed and means "this figure is not a complete circuit" — a
   * Thevenin network shown at its terminals has no ground and no source to
   * solve against. Where it is complete, stating even one measurement turns the
   * drawing from decoration into something the gate can check.
   */
  expects: z.array(measurementSchema).default([]),
});

export type Figure = z.infer<typeof figureSchema>;
export type Measurement = z.infer<typeof measurementSchema>;
