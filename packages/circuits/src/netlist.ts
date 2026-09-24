/**
 * Circuit netlist: the analysis-facing model.
 *
 * A SPICE subset chosen to cover Circuits I and II exactly — linear passives,
 * independent and dependent sources, and the ideal op-amp. Nonlinear devices
 * are deliberately absent: they need Newton-Raphson and a device model library,
 * and nothing in the courses this app targets requires them. Adding them later
 * means adding an iteration loop around the same stamping code, not rewriting it.
 */

/** Node "0" is ground by SPICE convention, and is not an unknown. */
export type NodeName = string;
export const GROUND: NodeName = '0';

export type ElementKind =
  | 'resistor'
  | 'capacitor'
  | 'inductor'
  | 'vsource'
  | 'isource'
  | 'vcvs' // voltage-controlled voltage source  (SPICE E)
  | 'vccs' // voltage-controlled current source  (SPICE G)
  | 'ccvs' // current-controlled voltage source  (SPICE H)
  | 'cccs' // current-controlled current source  (SPICE F)
  | 'opamp'; // ideal op-amp (nullor)

export interface Element {
  /** Reference designator, e.g. "R1". Unique within a netlist. */
  id: string;
  kind: ElementKind;
  /**
   * Terminals, ordered by kind:
   * - two-terminal: [plus, minus]
   * - controlled sources: [out+, out-, control+, control-] (E, G)
   *   or [out+, out-] with `controlSource` naming the sensing vsource (H, F)
   * - opamp: [out, in+, in-]
   */
  nodes: NodeName[];
  /** Ohms / farads / henries / volts / amps, or the gain of a controlled source. */
  value: number;
  /** AC small-signal magnitude, for `.ac`. Sources only. */
  acMagnitude?: number;
  /** AC phase in degrees. */
  acPhase?: number;
  /** For H and F: the id of the voltage source whose current is sensed. */
  controlSource?: string;
  /** Initial condition for reactive elements at t=0 (volts for C, amps for L). */
  initial?: number;
}

export interface Netlist {
  title: string;
  elements: Element[];
}

export const TWO_TERMINAL: ReadonlySet<ElementKind> = new Set<ElementKind>([
  'resistor', 'capacitor', 'inductor', 'vsource', 'isource',
]);

/** Every distinct node in the netlist, ground first, then sorted. */
export function nodesOf(netlist: Netlist): NodeName[] {
  const seen = new Set<NodeName>([GROUND]);
  for (const e of netlist.elements) for (const n of e.nodes) seen.add(n);
  const rest = [...seen].filter((n) => n !== GROUND).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  return [GROUND, ...rest];
}

// ---------------------------------------------------------------------------
// SPICE value notation
// ---------------------------------------------------------------------------

/**
 * SPICE suffixes. The trap is that `M` means *milli*, not mega — `MEG` is mega
 * — and SPICE is case-insensitive, so `1M` and `1m` are both one milli. Getting
 * this wrong silently scales a component by 10^9, so it is tested directly.
 */
const SUFFIXES: [string, number][] = [
  ['meg', 1e6], ['mil', 25.4e-6],
  ['t', 1e12], ['g', 1e9], ['k', 1e3],
  ['m', 1e-3], ['u', 1e-6], ['n', 1e-9], ['p', 1e-12], ['f', 1e-15],
];

export function parseValue(raw: string): number {
  const text = raw.trim().toLowerCase().replace(/µ/g, 'u');
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z]*)$/.exec(text);
  if (!match) return Number.NaN;

  const mantissa = Number(match[1]);
  const suffix = match[2] ?? '';
  if (suffix === '') return mantissa;

  // Longest match first so "meg" is not read as "m" followed by junk.
  for (const [name, scale] of SUFFIXES) {
    if (suffix.startsWith(name)) return mantissa * scale;
  }
  // A trailing unit letter with no scale prefix ("10ohm", "5v") is harmless.
  return mantissa;
}

/** Render a value with an engineering suffix, for round-tripping a netlist. */
export function formatValue(value: number): string {
  if (value === 0) return '0';
  const abs = Math.abs(value);
  const units: [number, string][] = [
    [1e12, 'T'], [1e9, 'G'], [1e6, 'Meg'], [1e3, 'k'],
    [1, ''], [1e-3, 'm'], [1e-6, 'u'], [1e-9, 'n'], [1e-12, 'p'],
  ];
  for (const [scale, suffix] of units) {
    if (abs >= scale) {
      const scaled = value / scale;
      return `${Number(scaled.toPrecision(6))}${suffix}`;
    }
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export interface ParsedNetlist {
  netlist: Netlist;
  /** Analysis directives found in the deck, e.g. ".op", ".tran 1u 1m". */
  directives: string[];
  errors: string[];
  /** Non-fatal observations worth showing the author, e.g. a title that looks like a part. */
  notes: string[];
}

const KIND_BY_LETTER: Record<string, ElementKind> = {
  r: 'resistor', c: 'capacitor', l: 'inductor', v: 'vsource', i: 'isource',
  e: 'vcvs', g: 'vccs', h: 'ccvs', f: 'cccs',
};

/**
 * Parse a SPICE deck.
 *
 * Collects every error rather than throwing on the first, because a learner
 * importing a netlist wants the whole list of what is wrong with it, not a
 * guided tour one line at a time.
 */
export function parseNetlist(text: string): ParsedNetlist {
  const lines = text.split(/\r?\n/);
  const elements: Element[] = [];
  const directives: string[] = [];
  const errors: string[] = [];
  const notes: string[] = [];
  const seen = new Set<string>();

  // SPICE always treats the first non-blank line as the title — unconditionally,
  // even when it looks like a component. Trying to be clever here and guess
  // whether line 1 is a title or a part is how "rc step response" became a
  // resistor named `rc` with nodes `step` and `response`.
  let title = 'circuit';
  let titleTaken = false;

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.split(/[*;]/)[0]!.trim();
    if (line === '') continue;
    const at = `line ${index + 1}`;

    if (line.startsWith('.')) {
      const lower = line.toLowerCase();
      if (lower.startsWith('.end')) continue;
      directives.push(line);
      continue;
    }

    if (!titleTaken) {
      title = line;
      titleTaken = true;
      // Pasting a netlist fragment without a title silently loses its first
      // component, so say so rather than letting the circuit come out wrong.
      if (/^[rclvieghfx]\w*\s+\S+\s+\S+/i.test(line)) {
        notes.push(
          `${at}: read as the deck title, since SPICE always takes the first line as the title. ` +
            'If this was meant to be a component, add a title line above it.',
        );
      }
      continue;
    }

    const parts = line.split(/\s+/);
    const id = parts[0]!;
    const letter = id[0]!.toLowerCase();

    if (seen.has(id.toUpperCase())) {
      errors.push(`${at}: duplicate reference designator "${id}"`);
      continue;
    }
    seen.add(id.toUpperCase());

    // Ideal op-amp: "XU1 out in+ in- opamp"
    if (letter === 'x') {
      if (parts.length < 5 || parts[4]!.toLowerCase() !== 'opamp') {
        errors.push(`${at}: only "X<name> out in+ in- opamp" subcircuits are supported`);
        continue;
      }
      elements.push({ id, kind: 'opamp', nodes: [parts[1]!, parts[2]!, parts[3]!], value: 0 });
      continue;
    }

    const kind = KIND_BY_LETTER[letter];
    if (!kind) {
      errors.push(`${at}: unknown element type "${id[0]}"`);
      continue;
    }

    if (kind === 'ccvs' || kind === 'cccs') {
      // "H1 out+ out- Vsense 100"
      if (parts.length < 5) {
        errors.push(`${at}: ${id} needs "out+ out- <sensing source> <gain>"`);
        continue;
      }
      const gain = parseValue(parts[4]!);
      if (Number.isNaN(gain)) {
        errors.push(`${at}: could not read gain "${parts[4]}"`);
        continue;
      }
      elements.push({ id, kind, nodes: [parts[1]!, parts[2]!], value: gain, controlSource: parts[3]! });
      continue;
    }

    if (kind === 'vcvs' || kind === 'vccs') {
      // "E1 out+ out- in+ in- 10"
      if (parts.length < 6) {
        errors.push(`${at}: ${id} needs "out+ out- in+ in- <gain>"`);
        continue;
      }
      const gain = parseValue(parts[5]!);
      if (Number.isNaN(gain)) {
        errors.push(`${at}: could not read gain "${parts[5]}"`);
        continue;
      }
      elements.push({ id, kind, nodes: [parts[1]!, parts[2]!, parts[3]!, parts[4]!], value: gain });
      continue;
    }

    if (parts.length < 4) {
      errors.push(`${at}: ${id} needs two nodes and a value`);
      continue;
    }

    const element: Element = { id, kind, nodes: [parts[1]!, parts[2]!], value: 0 };

    // Sources accept "DC 5", "AC 1 90", "5", or a combination of them.
    const rest = parts.slice(3);
    let dcSeen = false;
    for (let i = 0; i < rest.length; i++) {
      const token = rest[i]!.toLowerCase();
      if (token === 'dc') {
        element.value = parseValue(rest[++i] ?? '');
        dcSeen = true;
      } else if (token === 'ac') {
        element.acMagnitude = parseValue(rest[++i] ?? '1');
        const phase = rest[i + 1];
        if (phase !== undefined && !Number.isNaN(parseValue(phase)) && !/^[a-z]/i.test(phase)) {
          element.acPhase = parseValue(phase);
          i++;
        }
      } else if (token.startsWith('ic=')) {
        element.initial = parseValue(token.slice(3));
      } else if (!dcSeen) {
        element.value = parseValue(token);
        dcSeen = true;
      }
    }

    if (Number.isNaN(element.value)) {
      errors.push(`${at}: could not read a value for ${id}`);
      continue;
    }
    if (TWO_TERMINAL.has(kind) && kind !== 'vsource' && kind !== 'isource' && element.value <= 0) {
      errors.push(`${at}: ${id} must have a positive value, got ${element.value}`);
      continue;
    }
    elements.push(element);
  }

  // A controlled source pointing at a sensing source that is not in the deck
  // would stamp against an unknown that does not exist.
  const ids = new Set(elements.map((e) => e.id.toUpperCase()));
  for (const e of elements) {
    if (e.controlSource && !ids.has(e.controlSource.toUpperCase())) {
      errors.push(`${e.id}: sensing source "${e.controlSource}" is not in the netlist`);
    }
  }

  return { netlist: { title, elements }, directives, errors, notes };
}

/** Serialize back to a SPICE deck. Round-trips through `parseNetlist`. */
export function formatNetlist(netlist: Netlist, directives: readonly string[] = []): string {
  const lines: string[] = [netlist.title];

  for (const e of netlist.elements) {
    if (e.kind === 'opamp') {
      lines.push(`${e.id} ${e.nodes.join(' ')} opamp`);
      continue;
    }
    if (e.kind === 'ccvs' || e.kind === 'cccs') {
      lines.push(`${e.id} ${e.nodes[0]} ${e.nodes[1]} ${e.controlSource} ${formatValue(e.value)}`);
      continue;
    }
    if (e.kind === 'vcvs' || e.kind === 'vccs') {
      lines.push(`${e.id} ${e.nodes.join(' ')} ${formatValue(e.value)}`);
      continue;
    }

    let line = `${e.id} ${e.nodes[0]} ${e.nodes[1]} ${formatValue(e.value)}`;
    if (e.acMagnitude !== undefined) {
      line += ` AC ${formatValue(e.acMagnitude)}`;
      if (e.acPhase !== undefined) line += ` ${e.acPhase}`;
    }
    if (e.initial !== undefined) line += ` IC=${formatValue(e.initial)}`;
    lines.push(line);
  }

  lines.push(...directives, '.end');
  return lines.join('\n');
}
