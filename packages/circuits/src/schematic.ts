import type { Element, ElementKind, Netlist, NodeName } from './netlist.js';
import { GROUND } from './netlist.js';

/**
 * Schematic model and net extraction.
 *
 * A schematic is geometry; a netlist is topology. Everything hard about the
 * editor lives in the step between them — deciding that two things which merely
 * *look* connected actually are. That decision is made once, here, by union-find
 * over connection points, so the editor never has to maintain a connection graph
 * alongside the drawing and let the two disagree.
 */

export interface Point {
  x: number;
  y: number;
}

export type Rotation = 0 | 90 | 180 | 270;

export interface PlacedComponent {
  id: string;
  kind: ElementKind;
  /** Body centre, in grid units. */
  at: Point;
  rotation: Rotation;
  value: number;
  acMagnitude?: number;
  acPhase?: number;
  controlSource?: string;
  initial?: number;
}

export interface Wire {
  id: string;
  /** Polyline vertices in grid units. Two points make one segment. */
  points: Point[];
}

export interface Schematic {
  title: string;
  components: PlacedComponent[];
  wires: Wire[];
  /** Ground symbol anchor points. Any net touching one of these is node 0. */
  grounds: Point[];
}

export const emptySchematic = (title = 'untitled'): Schematic => ({
  title,
  components: [],
  wires: [],
  grounds: [],
});

/**
 * Pin offsets from the body centre, unrotated, in grid units.
 *
 * Order matters and matches `Element.nodes`: the netlist writer relies on pin 0
 * being the element's first terminal, so changing the order here silently
 * reverses components.
 */
const PIN_LAYOUT: Record<ElementKind, Point[]> = {
  resistor: [{ x: 0, y: -2 }, { x: 0, y: 2 }],
  capacitor: [{ x: 0, y: -2 }, { x: 0, y: 2 }],
  inductor: [{ x: 0, y: -2 }, { x: 0, y: 2 }],
  vsource: [{ x: 0, y: -2 }, { x: 0, y: 2 }],
  isource: [{ x: 0, y: -2 }, { x: 0, y: 2 }],
  // Controlled sources: output pair on the right, sensing pair on the left.
  vcvs: [{ x: 2, y: -2 }, { x: 2, y: 2 }, { x: -2, y: -2 }, { x: -2, y: 2 }],
  vccs: [{ x: 2, y: -2 }, { x: 2, y: 2 }, { x: -2, y: -2 }, { x: -2, y: 2 }],
  ccvs: [{ x: 2, y: -2 }, { x: 2, y: 2 }],
  cccs: [{ x: 2, y: -2 }, { x: 2, y: 2 }],
  // Op-amp: output, then non-inverting, then inverting.
  opamp: [{ x: 3, y: 0 }, { x: -3, y: -2 }, { x: -3, y: 2 }],
};

export const pinCount = (kind: ElementKind): number => PIN_LAYOUT[kind].length;

function rotate(point: Point, rotation: Rotation): Point {
  switch (rotation) {
    case 0: return point;
    case 90: return { x: -point.y, y: point.x };
    case 180: return { x: -point.x, y: -point.y };
    case 270: return { x: point.y, y: -point.x };
  }
}

/** Absolute grid positions of a component's pins, in terminal order. */
export function pinPositions(component: PlacedComponent): Point[] {
  return PIN_LAYOUT[component.kind].map((offset) => {
    const r = rotate(offset, component.rotation);
    return { x: component.at.x + r.x, y: component.at.y + r.y };
  });
}

const key = (p: Point): string => `${p.x},${p.y}`;

class UnionFind {
  private parent = new Map<string, string>();

  find(a: string): string {
    const seen: string[] = [];
    let current = a;
    while (this.parent.has(current) && this.parent.get(current) !== current) {
      seen.push(current);
      current = this.parent.get(current)!;
    }
    if (!this.parent.has(current)) this.parent.set(current, current);
    for (const node of seen) this.parent.set(node, current);
    return current;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/** Is `p` on the segment a–b (inclusive of endpoints)? Orthogonal segments only. */
function onSegment(p: Point, a: Point, b: Point): boolean {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (Math.abs(cross) > 1e-9) return false;
  const withinX = p.x >= Math.min(a.x, b.x) - 1e-9 && p.x <= Math.max(a.x, b.x) + 1e-9;
  const withinY = p.y >= Math.min(a.y, b.y) - 1e-9 && p.y <= Math.max(a.y, b.y) + 1e-9;
  return withinX && withinY;
}

export interface NetMap {
  /** Net name for each connection point, keyed "x,y". */
  byPoint: Map<string, NodeName>;
  /** All points belonging to each net. */
  byNet: Map<NodeName, Point[]>;
}

/**
 * Resolve geometry into electrical nets.
 *
 * Three things join points: a wire segment joins its own endpoints, a point
 * lying anywhere along a segment joins that segment (which is what makes a
 * T-junction work without requiring an explicit junction dot), and coincident
 * points are the same node.
 */
export function extractNets(schematic: Schematic): NetMap {
  const uf = new UnionFind();
  const points: Point[] = [];

  for (const component of schematic.components) points.push(...pinPositions(component));
  for (const wire of schematic.wires) points.push(...wire.points);
  points.push(...schematic.grounds);

  for (const point of points) uf.find(key(point));

  // A wire's own vertices are connected along its length.
  for (const wire of schematic.wires) {
    for (let i = 1; i < wire.points.length; i++) {
      uf.union(key(wire.points[i - 1]!), key(wire.points[i]!));
    }
  }

  // Anything sitting on a segment joins it. This is the T-junction rule, and
  // the reason a pin dropped onto the middle of an existing wire connects.
  for (const wire of schematic.wires) {
    for (let i = 1; i < wire.points.length; i++) {
      const a = wire.points[i - 1]!;
      const b = wire.points[i]!;
      for (const point of points) {
        if (onSegment(point, a, b)) uf.union(key(point), key(a));
      }
    }
  }

  // Group by root, then name. Ground is named first so it always wins node 0.
  const groups = new Map<string, Point[]>();
  for (const point of points) {
    const root = uf.find(key(point));
    const list = groups.get(root);
    if (list) list.push(point);
    else groups.set(root, [point]);
  }

  const groundRoots = new Set(schematic.grounds.map((g) => uf.find(key(g))));
  const byPoint = new Map<string, NodeName>();
  const byNet = new Map<NodeName, Point[]>();

  let counter = 1;
  // Deterministic naming: sort roots so the same drawing always yields the same
  // netlist, which is what lets a saved circuit be diffed and a test be stable.
  const roots = [...groups.keys()].sort((a, b) => {
    const ga = groundRoots.has(a) ? 0 : 1;
    const gb = groundRoots.has(b) ? 0 : 1;
    return ga - gb || a.localeCompare(b);
  });

  for (const root of roots) {
    const name = groundRoots.has(root) ? GROUND : String(counter++);
    const members = groups.get(root)!;
    byNet.set(name, members);
    for (const point of members) byPoint.set(key(point), name);
  }

  return { byPoint, byNet };
}

export interface SchematicIssue {
  componentId?: string;
  message: string;
}

export interface BuiltNetlist {
  netlist: Netlist;
  nets: NetMap;
  issues: SchematicIssue[];
}

/**
 * Convert a drawing into a netlist.
 *
 * Issues are collected rather than thrown: a half-finished schematic is the
 * normal state of one being drawn, and the editor wants to show what is still
 * unconnected rather than refuse to render.
 */
export function toNetlist(schematic: Schematic): BuiltNetlist {
  const nets = extractNets(schematic);
  const issues: SchematicIssue[] = [];
  const elements: Element[] = [];

  if (schematic.grounds.length === 0) {
    issues.push({ message: 'No ground symbol. Every circuit needs a reference node.' });
  }

  for (const component of schematic.components) {
    const positions = pinPositions(component);
    const nodes = positions.map((p) => nets.byPoint.get(key(p)) ?? '?');

    const floating = nodes.filter((n) => n === '?').length;
    if (floating > 0) {
      issues.push({ componentId: component.id, message: `${component.id} has an unconnected terminal` });
      continue;
    }

    // A component whose terminals land on the same net is shorted out; it would
    // stamp a conductance between a node and itself and vanish from the result.
    if (nodes.length >= 2 && nodes[0] === nodes[1] && component.kind !== 'opamp') {
      issues.push({ componentId: component.id, message: `${component.id} is short-circuited (both terminals on the same net)` });
    }

    const element: Element = {
      id: component.id,
      kind: component.kind,
      nodes,
      value: component.value,
    };
    if (component.acMagnitude !== undefined) element.acMagnitude = component.acMagnitude;
    if (component.acPhase !== undefined) element.acPhase = component.acPhase;
    if (component.controlSource !== undefined) element.controlSource = component.controlSource;
    if (component.initial !== undefined) element.initial = component.initial;
    elements.push(element);
  }

  return { netlist: { title: schematic.title, elements }, nets, issues };
}

/** Next free reference designator for a kind, e.g. R1, R2, R3. */
export function nextDesignator(schematic: Schematic, kind: ElementKind): string {
  const prefix: Record<ElementKind, string> = {
    resistor: 'R', capacitor: 'C', inductor: 'L', vsource: 'V', isource: 'I',
    vcvs: 'E', vccs: 'G', ccvs: 'H', cccs: 'F', opamp: 'XU',
  };
  const letter = prefix[kind];
  const used = new Set(schematic.components.map((c) => c.id.toUpperCase()));
  for (let n = 1; ; n++) {
    const candidate = `${letter}${n}`;
    if (!used.has(candidate.toUpperCase())) return candidate;
  }
}
