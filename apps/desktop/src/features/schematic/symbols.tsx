import type { ElementKind } from '@et/circuits';

/**
 * Component symbols.
 *
 * Drawn in grid units about the body centre, with terminals at the positions
 * `PIN_LAYOUT` in @et/circuits declares — the drawing and the net extraction
 * must agree about where a pin is, or a schematic that looks connected will
 * simulate as though it is not.
 *
 * Two-terminal parts are drawn vertically (pins at y = ±2) because that is the
 * orientation the layout module assumes before rotation.
 */

export interface SymbolProps {
  kind: ElementKind;
  /** Pixels per grid unit. */
  grid: number;
}

const stroke = {
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
};

export function ComponentSymbol({ kind, grid }: SymbolProps): React.ReactElement {
  const u = grid;

  switch (kind) {
    case 'resistor':
      return (
        <g {...stroke}>
          <path d={`M 0 ${-2 * u} L 0 ${-1.1 * u}`} />
          <path
            d={`M 0 ${-1.1 * u} l ${0.45 * u} ${0.28 * u} l ${-0.9 * u} ${0.44 * u}
                l ${0.9 * u} ${0.44 * u} l ${-0.9 * u} ${0.44 * u}
                l ${0.9 * u} ${0.44 * u} l ${-0.45 * u} ${0.28 * u}`}
          />
          <path d={`M 0 ${1.1 * u} L 0 ${2 * u}`} />
        </g>
      );

    case 'capacitor':
      return (
        <g {...stroke}>
          <path d={`M 0 ${-2 * u} L 0 ${-0.3 * u}`} />
          <path d={`M ${-0.8 * u} ${-0.3 * u} L ${0.8 * u} ${-0.3 * u}`} />
          <path d={`M ${-0.8 * u} ${0.3 * u} L ${0.8 * u} ${0.3 * u}`} />
          <path d={`M 0 ${0.3 * u} L 0 ${2 * u}`} />
        </g>
      );

    case 'inductor':
      return (
        <g {...stroke}>
          <path d={`M 0 ${-2 * u} L 0 ${-1.2 * u}`} />
          {[0, 1, 2, 3].map((i) => (
            <path
              key={i}
              d={`M 0 ${(-1.2 + i * 0.6) * u} a ${0.3 * u} ${0.3 * u} 0 1 1 0 ${0.6 * u}`}
            />
          ))}
          <path d={`M 0 ${1.2 * u} L 0 ${2 * u}`} />
        </g>
      );

    case 'vsource':
      return (
        <g {...stroke}>
          <path d={`M 0 ${-2 * u} L 0 ${-u}`} />
          <circle cx={0} cy={0} r={u} />
          <path d={`M ${-0.35 * u} ${-0.4 * u} L ${0.35 * u} ${-0.4 * u}`} />
          <path d={`M 0 ${-0.75 * u} L 0 ${-0.05 * u}`} />
          <path d={`M ${-0.35 * u} ${0.5 * u} L ${0.35 * u} ${0.5 * u}`} />
          <path d={`M 0 ${u} L 0 ${2 * u}`} />
        </g>
      );

    case 'isource':
      return (
        <g {...stroke}>
          <path d={`M 0 ${-2 * u} L 0 ${-u}`} />
          <circle cx={0} cy={0} r={u} />
          <path d={`M 0 ${0.55 * u} L 0 ${-0.55 * u}`} />
          <path d={`M ${-0.3 * u} ${-0.2 * u} L 0 ${-0.6 * u} L ${0.3 * u} ${-0.2 * u}`} />
          <path d={`M 0 ${u} L 0 ${2 * u}`} />
        </g>
      );

    case 'opamp':
      return (
        <g {...stroke}>
          <path d={`M ${-1.6 * u} ${-2.4 * u} L ${-1.6 * u} ${2.4 * u} L ${1.9 * u} 0 Z`} />
          <path d={`M ${-3 * u} ${-2 * u} L ${-1.6 * u} ${-2 * u}`} />
          <path d={`M ${-3 * u} ${2 * u} L ${-1.6 * u} ${2 * u}`} />
          <path d={`M ${1.9 * u} 0 L ${3 * u} 0`} />
          {/* The input marks sit inside the body, not beside the pins. The
              triangle's sloping edges close in fast: at the pin height the
              top edge passes straight through where a `+` drawn level with
              the pin would be, so the glyph rendered half outside the part. */}
          <path d={`M ${-1.35 * u} ${-1.5 * u} L ${-0.75 * u} ${-1.5 * u}`} />
          <path d={`M ${-1.05 * u} ${-1.8 * u} L ${-1.05 * u} ${-1.2 * u}`} />
          <path d={`M ${-1.35 * u} ${1.5 * u} L ${-0.75 * u} ${1.5 * u}`} />
        </g>
      );

    // Controlled sources share the diamond that distinguishes them from
    // independent sources, with the sensing pair entering on the left.
    case 'vcvs':
    case 'vccs':
    case 'ccvs':
    case 'cccs': {
      const sensing = kind === 'vcvs' || kind === 'vccs';
      return (
        <g {...stroke}>
          <path d={`M ${2 * u} ${-2 * u} L ${2 * u} ${-0.9 * u}`} />
          <path d={`M ${2 * u} ${-0.9 * u} l ${0.8 * u} ${0.9 * u} l ${-0.8 * u} ${0.9 * u} l ${-0.8 * u} ${-0.9 * u} Z`} />
          <path d={`M ${2 * u} ${0.9 * u} L ${2 * u} ${2 * u}`} />
          {sensing && (
            <>
              <path d={`M ${-2 * u} ${-2 * u} L ${-0.6 * u} ${-2 * u}`} />
              <path d={`M ${-2 * u} ${2 * u} L ${-0.6 * u} ${2 * u}`} />
              <path d={`M ${-0.6 * u} ${-2 * u} L ${-0.6 * u} ${2 * u}`} strokeDasharray="3 3" />
            </>
          )}
        </g>
      );
    }
  }
}

/** The ground symbol, drawn at its anchor point. */
export function GroundSymbol({ grid }: { grid: number }): React.ReactElement {
  const u = grid;
  return (
    <g {...stroke}>
      <path d={`M 0 0 L 0 ${0.7 * u}`} />
      <path d={`M ${-0.8 * u} ${0.7 * u} L ${0.8 * u} ${0.7 * u}`} />
      <path d={`M ${-0.5 * u} ${1.05 * u} L ${0.5 * u} ${1.05 * u}`} />
      <path d={`M ${-0.2 * u} ${1.4 * u} L ${0.2 * u} ${1.4 * u}`} />
    </g>
  );
}

/** Palette label and default value for each placeable kind. */
export const PALETTE: { kind: ElementKind; label: string; defaultValue: number; unit: string }[] = [
  { kind: 'resistor', label: 'Resistor', defaultValue: 1000, unit: 'Ω' },
  { kind: 'capacitor', label: 'Capacitor', defaultValue: 1e-6, unit: 'F' },
  { kind: 'inductor', label: 'Inductor', defaultValue: 1e-3, unit: 'H' },
  { kind: 'vsource', label: 'Voltage source', defaultValue: 5, unit: 'V' },
  { kind: 'isource', label: 'Current source', defaultValue: 1e-3, unit: 'A' },
  { kind: 'opamp', label: 'Ideal op-amp', defaultValue: 0, unit: '' },
  { kind: 'vcvs', label: 'VCVS (E)', defaultValue: 10, unit: 'V/V' },
  { kind: 'vccs', label: 'VCCS (G)', defaultValue: 1e-3, unit: 'S' },
];
