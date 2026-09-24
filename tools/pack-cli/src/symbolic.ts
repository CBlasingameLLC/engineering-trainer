/**
 * Independent re-derivation of symbolic answer keys.
 *
 * The rest of `pack verify` leans on three checks, and for a symbolic item two
 * of them do nothing: self-consistency grades the stored expression against
 * itself, and explanation-agreement only reads numeric keys. Regeneration is
 * left, and it proves a generator is deterministic rather than correct — a
 * generator that confidently returns the wrong derivative regenerates that
 * wrong derivative byte for byte, forever.
 *
 * What makes symbolic answers recoverable is that calculus is invertible by a
 * *different* method than the one that produced the answer. A stated derivative
 * can be compared against a finite-difference derivative of the function it came
 * from. A stated antiderivative can be differentiated back to the integrand. A
 * claimed ODE solution can be substituted into the equation. None of those
 * reuse the generator's algebra, so agreement is evidence rather than a tautology.
 *
 * Differentiation here is numeric on purpose. A symbolic differentiator would
 * be a second implementation of the same rules the generator already applied,
 * and two implementations of one idea share their author's misunderstandings.
 * Finite differences know nothing about the power rule and cannot inherit a
 * mistake in it.
 */

import * as math from 'mathjs';
import type { SymbolicAnswer, SymbolicResidual } from '@et/content-schema';

export interface ResidualOutcome {
  ok: boolean;
  /** Human-readable reason, present when `ok` is false. */
  detail?: string;
  /** How many sample points were successfully compared. */
  compared: number;
}

/**
 * Fourth-order central differences.
 *
 * A first-order forward difference carries O(h) truncation error, which at a
 * usable step size is large enough to overlap the size of a real mistake — the
 * check would then have to be so loose it stopped catching anything. The
 * five-point stencils below are O(h^4), so with h near 1e-3 the truncation
 * error lands around 1e-12 and roundoff around 1e-13, leaving several orders of
 * magnitude between "numerically noisy" and "wrong".
 */
function firstDerivative(f: (x: number) => number, x: number, h: number): number {
  return (8 * (f(x + h) - f(x - h)) - (f(x + 2 * h) - f(x - 2 * h))) / (12 * h);
}

function secondDerivative(f: (x: number) => number, x: number, h: number): number {
  return (
    (-f(x + 2 * h) + 16 * f(x + h) - 30 * f(x) + 16 * f(x - h) - f(x - 2 * h)) /
    (12 * h * h)
  );
}

/** Step size scaled to the point, so the stencil stays well-conditioned far from the origin. */
const stepFor = (x: number): number => Math.max(1e-4, 1e-4 * Math.abs(x));

function compile(expression: string): math.EvalFunction | null {
  try {
    return math.parse(expression).compile();
  } catch {
    return null;
  }
}

function evaluateAt(fn: math.EvalFunction, scope: Record<string, number>): number | null {
  let value: unknown;
  try {
    value = fn.evaluate(scope);
  } catch {
    return null;
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Relative agreement with a scale-aware floor.
 *
 * `scale` is the largest term that went into the comparison, not the residual
 * itself. In an ODE check the individual terms can be order 1e3 while their sum
 * is order 1e-9; judging that sum against its own magnitude would demand a
 * precision finite differences cannot deliver, and judging it against a fixed
 * absolute floor would pass a genuinely broken solution of large enough scale.
 */
const agrees = (a: number, b: number, scale: number, tol: number): boolean =>
  Math.abs(a - b) <= tol * Math.max(scale, 1);

const TOLERANCE = 1e-5;
const SAMPLES = 16;

/**
 * Deterministic sampling.
 *
 * Verification must give the same verdict on every run, or a flaky gate teaches
 * authors to re-run it until it passes. A fixed low-discrepancy sequence spreads
 * the points across the domain without any of the clustering a small random
 * draw produces.
 */
const goldenPoints = (n: number): number[] => {
  const phi = 0.6180339887498949;
  return Array.from({ length: n }, (_, i) => ((0.5 + (i + 1) * phi) % 1));
};

function sampleScope(
  answer: SymbolicAnswer,
  t: number,
  exclude: string,
): Record<string, number> {
  const scope: Record<string, number> = {};
  for (const v of answer.variables) {
    if (v === exclude) continue;
    const [lo, hi] = answer.domain?.[v] ?? [1, 10];
    scope[v] = lo + t * (hi - lo);
  }
  return scope;
}

/**
 * Check a symbolic answer against the relationship it declares.
 *
 * Returns `ok` with `compared: 0` when the expressions never evaluated to a
 * finite number anywhere sampled. That is reported as a failure rather than a
 * pass, because a key nothing can evaluate is not a key that was verified.
 */
export function checkResidual(answer: SymbolicAnswer): ResidualOutcome {
  const residual = answer.residual;
  if (!residual) return { ok: true, compared: 0 };

  const variable = residual.variable;
  if (!answer.variables.includes(variable)) {
    return {
      ok: false,
      compared: 0,
      detail: `residual differentiates with respect to "${variable}", which is not among the answer's variables (${answer.variables.join(', ')})`,
    };
  }

  const solution = compile(answer.expression);
  if (!solution) return { ok: false, compared: 0, detail: `answer expression "${answer.expression}" does not parse` };

  const [lo, hi] = answer.domain?.[variable] ?? [1, 10];
  const points = goldenPoints(SAMPLES);

  switch (residual.kind) {
    case 'derivative-of':
      return checkDerivativeOf(answer, residual, solution, lo, hi, points);
    case 'antiderivative-of':
      return checkAntiderivativeOf(answer, residual, solution, lo, hi, points);
    case 'ode-solution':
      return checkOdeSolution(answer, residual, solution, lo, hi, points);
  }
}

function checkDerivativeOf(
  answer: SymbolicAnswer,
  residual: Extract<SymbolicResidual, { kind: 'derivative-of' }>,
  solution: math.EvalFunction,
  lo: number,
  hi: number,
  points: readonly number[],
): ResidualOutcome {
  const source = compile(residual.expression);
  if (!source) return { ok: false, compared: 0, detail: `source expression "${residual.expression}" does not parse` };

  let compared = 0;
  for (const t of points) {
    const x = lo + t * (hi - lo);
    const scope = sampleScope(answer, t, residual.variable);
    const f = (at: number): number => evaluateAt(source, { ...scope, [residual.variable]: at }) ?? NaN;

    const numeric = firstDerivative(f, x, stepFor(x));
    const stated = evaluateAt(solution, { ...scope, [residual.variable]: x });
    if (stated === null || !Number.isFinite(numeric)) continue;

    if (!agrees(stated, numeric, Math.abs(numeric), TOLERANCE)) {
      return {
        ok: false,
        compared,
        detail:
          `answer claims d/d${residual.variable}[${residual.expression}] = ${answer.expression}, ` +
          `but at ${residual.variable}=${x.toPrecision(4)} the stated answer gives ${stated.toPrecision(6)} ` +
          `while the numeric derivative gives ${numeric.toPrecision(6)}`,
      };
    }
    compared++;
  }
  return finish(compared, answer);
}

function checkAntiderivativeOf(
  answer: SymbolicAnswer,
  residual: Extract<SymbolicResidual, { kind: 'antiderivative-of' }>,
  solution: math.EvalFunction,
  lo: number,
  hi: number,
  points: readonly number[],
): ResidualOutcome {
  const integrand = compile(residual.expression);
  if (!integrand) return { ok: false, compared: 0, detail: `integrand "${residual.expression}" does not parse` };

  let compared = 0;
  for (const t of points) {
    const x = lo + t * (hi - lo);
    const scope = sampleScope(answer, t, residual.variable);
    const F = (at: number): number => evaluateAt(solution, { ...scope, [residual.variable]: at }) ?? NaN;

    const numeric = firstDerivative(F, x, stepFor(x));
    const stated = evaluateAt(integrand, { ...scope, [residual.variable]: x });
    if (stated === null || !Number.isFinite(numeric)) continue;

    if (!agrees(numeric, stated, Math.abs(stated), TOLERANCE)) {
      return {
        ok: false,
        compared,
        detail:
          `answer claims ${answer.expression} is an antiderivative of ${residual.expression}, ` +
          `but at ${residual.variable}=${x.toPrecision(4)} differentiating it back gives ${numeric.toPrecision(6)} ` +
          `instead of ${stated.toPrecision(6)}`,
      };
    }
    compared++;
  }
  return finish(compared, answer);
}

function checkOdeSolution(
  answer: SymbolicAnswer,
  residual: Extract<SymbolicResidual, { kind: 'ode-solution' }>,
  solution: math.EvalFunction,
  lo: number,
  hi: number,
  points: readonly number[],
): ResidualOutcome {
  const coefficients = {
    second: compile(residual.second),
    first: compile(residual.first),
    zeroth: compile(residual.zeroth),
    forcing: compile(residual.forcing),
  };
  for (const [name, fn] of Object.entries(coefficients)) {
    if (!fn) return { ok: false, compared: 0, detail: `ODE coefficient "${name}" does not parse` };
  }

  let compared = 0;
  for (const t of points) {
    const x = lo + t * (hi - lo);
    const scope = sampleScope(answer, t, residual.variable);
    const y = (at: number): number => evaluateAt(solution, { ...scope, [residual.variable]: at }) ?? NaN;
    const at = { ...scope, [residual.variable]: x };

    const h = stepFor(x);
    const y0 = y(x);
    const y1 = firstDerivative(y, x, h);
    const y2 = secondDerivative(y, x, h);
    if (![y0, y1, y2].every(Number.isFinite)) continue;

    const a2 = evaluateAt(coefficients.second!, at);
    const a1 = evaluateAt(coefficients.first!, at);
    const a0 = evaluateAt(coefficients.zeroth!, at);
    const rhs = evaluateAt(coefficients.forcing!, at);
    if (a2 === null || a1 === null || a0 === null || rhs === null) continue;

    const terms = [a2 * y2, a1 * y1, a0 * y0, rhs];
    const lhs = a2 * y2 + a1 * y1 + a0 * y0;
    const scale = Math.max(...terms.map(Math.abs));

    if (!agrees(lhs, rhs, scale, TOLERANCE)) {
      return {
        ok: false,
        compared,
        detail:
          `answer ${answer.expression} does not satisfy the stated ODE: at ${residual.variable}=${x.toPrecision(4)} ` +
          `the left side evaluates to ${lhs.toPrecision(6)} against a forcing term of ${rhs.toPrecision(6)}`,
      };
    }
    compared++;
  }

  const initial = checkInitialConditions(answer, residual, solution);
  if (initial) return { ...initial, compared };

  return finish(compared, answer);
}

/**
 * Initial conditions are checked separately because they are what distinguishes
 * *a* solution from *the* solution. An answer that satisfies the differential
 * equation but not the stated initial value is the homogeneous solution with
 * the particular part missing — a specific, common, and otherwise invisible
 * error, since the residual check alone would pass it.
 */
function checkInitialConditions(
  answer: SymbolicAnswer,
  residual: Extract<SymbolicResidual, { kind: 'ode-solution' }>,
  solution: math.EvalFunction,
): ResidualOutcome | null {
  if (residual.initial.length === 0) return null;

  const scope = sampleScope(answer, 0.5, residual.variable);
  for (const condition of residual.initial) {
    const y = (at: number): number =>
      evaluateAt(solution, { ...scope, [residual.variable]: at }) ?? NaN;

    const h = stepFor(condition.at);
    const actual =
      condition.order === 0 ? y(condition.at)
      : condition.order === 1 ? firstDerivative(y, condition.at, h)
      : secondDerivative(y, condition.at, h);

    if (!Number.isFinite(actual)) {
      return { ok: false, compared: 0, detail: `answer is undefined at ${residual.variable}=${condition.at}, where an initial condition is stated` };
    }
    if (!agrees(actual, condition.value, Math.abs(condition.value), 1e-4)) {
      const label = condition.order === 0 ? 'y' : condition.order === 1 ? "y'" : "y''";
      return {
        ok: false,
        compared: 0,
        detail: `initial condition ${label}(${condition.at}) = ${condition.value} is not met; the answer gives ${actual.toPrecision(6)}`,
      };
    }
  }
  return null;
}

function finish(compared: number, answer: SymbolicAnswer): ResidualOutcome {
  return compared === 0
    ? { ok: false, compared, detail: `could not evaluate "${answer.expression}" anywhere in its sampling domain` }
    : { ok: true, compared };
}
