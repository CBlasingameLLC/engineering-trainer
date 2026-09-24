/**
 * Dense linear algebra for circuit solving.
 *
 * LU decomposition with partial pivoting, in real and complex variants. MNA
 * matrices are small (a teaching circuit rarely exceeds a dozen unknowns) and
 * dense, so there is nothing to gain from sparse machinery and a great deal to
 * lose in readability — this solver is meant to be read by someone learning
 * what their circuit analysis is actually doing.
 *
 * The real and complex versions are deliberately written out separately rather
 * than unified behind a field abstraction. The algorithm is the point; an
 * interface indirection that makes `a * b` into `field.mul(a, b)` obscures it
 * for no benefit at this size.
 */

export class SingularMatrixError extends Error {
  constructor(readonly row: number) {
    super(
      `Circuit has no unique solution (singular at row ${row}). ` +
        'Common causes: a node with no DC path to ground, a voltage source loop, or a floating subcircuit.',
    );
    this.name = 'SingularMatrixError';
  }
}

/** Solve `A x = b` for real A. `A` and `b` are not mutated. */
export function luSolve(A: readonly (readonly number[])[], b: readonly number[]): number[] {
  const n = b.length;
  if (n === 0) return [];
  const m = A.map((row) => [...row]);
  const x = [...b];

  for (let col = 0; col < n; col++) {
    // Partial pivoting: the largest magnitude available becomes the pivot.
    // Without it a legitimate circuit with a zero on the diagonal — which
    // happens routinely in MNA, since voltage-source rows have no self term —
    // would be reported as unsolvable.
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row]![col]!) > Math.abs(m[pivot]![col]!)) pivot = row;
    }
    if (Math.abs(m[pivot]![col]!) < 1e-14) throw new SingularMatrixError(col);

    if (pivot !== col) {
      [m[col], m[pivot]] = [m[pivot]!, m[col]!];
      [x[col], x[pivot]] = [x[pivot]!, x[col]!];
    }

    const d = m[col]![col]!;
    for (let row = col + 1; row < n; row++) {
      const factor = m[row]![col]! / d;
      if (factor === 0) continue;
      for (let k = col; k < n; k++) m[row]![k]! -= factor * m[col]![k]!;
      x[row]! -= factor * x[col]!;
    }
  }

  for (let row = n - 1; row >= 0; row--) {
    let sum = x[row]!;
    for (let k = row + 1; k < n; k++) sum -= m[row]![k]! * x[k]!;
    x[row] = sum / m[row]![row]!;
  }
  return x;
}

// ---------------------------------------------------------------------------
// Complex arithmetic, for AC analysis.
// ---------------------------------------------------------------------------

export interface Complex {
  re: number;
  im: number;
}

export const cx = (re: number, im = 0): Complex => ({ re, im });
export const cAdd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
export const cSub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
export const cMul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});

export function cDiv(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}

export const cAbs = (a: Complex): number => Math.hypot(a.re, a.im);
/** Phase in degrees, which is how every Bode plot and phasor diagram labels it. */
export const cPhaseDeg = (a: Complex): number => (Math.atan2(a.im, a.re) * 180) / Math.PI;

/** Solve `A x = b` for complex A. Same algorithm as `luSolve`, complex scalars. */
export function luSolveComplex(
  A: readonly (readonly Complex[])[],
  b: readonly Complex[],
): Complex[] {
  const n = b.length;
  if (n === 0) return [];
  const m = A.map((row) => row.map((v) => ({ ...v })));
  const x = b.map((v) => ({ ...v }));

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (cAbs(m[row]![col]!) > cAbs(m[pivot]![col]!)) pivot = row;
    }
    if (cAbs(m[pivot]![col]!) < 1e-14) throw new SingularMatrixError(col);

    if (pivot !== col) {
      [m[col], m[pivot]] = [m[pivot]!, m[col]!];
      [x[col], x[pivot]] = [x[pivot]!, x[col]!];
    }

    const d = m[col]![col]!;
    for (let row = col + 1; row < n; row++) {
      const factor = cDiv(m[row]![col]!, d);
      if (factor.re === 0 && factor.im === 0) continue;
      for (let k = col; k < n; k++) m[row]![k] = cSub(m[row]![k]!, cMul(factor, m[col]![k]!));
      x[row] = cSub(x[row]!, cMul(factor, x[col]!));
    }
  }

  for (let row = n - 1; row >= 0; row--) {
    let sum = x[row]!;
    for (let k = row + 1; k < n; k++) sum = cSub(sum, cMul(m[row]![k]!, x[k]!));
    x[row] = cDiv(sum, m[row]![row]!);
  }
  return x;
}
