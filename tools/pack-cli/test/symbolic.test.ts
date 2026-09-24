import { describe, expect, it } from 'vitest';
import type { SymbolicAnswer } from '@et/content-schema';
import { checkResidual } from '../src/symbolic.js';

/**
 * The residual check is the only independent evidence a symbolic item gets, so
 * these tests do what the verify tests do: assert that correct keys pass, then
 * deliberately break each one in the way a real generator would break it — a
 * dropped chain-rule factor, a missing particular solution, a sign slip — and
 * assert the check catches it. A gate that only ever sees correct input proves
 * nothing about whether it can reject.
 */

const symbolic = (partial: Partial<SymbolicAnswer> & Pick<SymbolicAnswer, 'expression' | 'variables'>): SymbolicAnswer => ({
  kind: 'symbolic',
  domain: { x: [1, 4], t: [0.1, 3], k: [0.5, 2], a: [1, 3] },
  ...partial,
});

describe('derivative-of residuals', () => {
  it('accepts a correct polynomial derivative', () => {
    const outcome = checkResidual(symbolic({
      expression: '9*x^2 - 4*x + 5',
      variables: ['x'],
      residual: { kind: 'derivative-of', expression: '3*x^3 - 2*x^2 + 5*x - 7', variable: 'x' },
    }));
    expect(outcome.ok).toBe(true);
    expect(outcome.compared).toBeGreaterThan(8);
  });

  it('accepts a correct product-rule derivative', () => {
    const outcome = checkResidual(symbolic({
      expression: '2*x*sin(x) + x^2*cos(x)',
      variables: ['x'],
      residual: { kind: 'derivative-of', expression: 'x^2*sin(x)', variable: 'x' },
    }));
    expect(outcome.ok).toBe(true);
  });

  it('rejects a power rule applied without decrementing the exponent', () => {
    const outcome = checkResidual(symbolic({
      expression: '3*x^3',
      variables: ['x'],
      residual: { kind: 'derivative-of', expression: 'x^3', variable: 'x' },
    }));
    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toContain('numeric derivative');
  });

  it('rejects a chain rule missing its inner derivative', () => {
    const outcome = checkResidual(symbolic({
      expression: 'cos(x)', // should be 3*cos(3*x)
      variables: ['x'],
      residual: { kind: 'derivative-of', expression: 'sin(3*x)', variable: 'x' },
    }));
    expect(outcome.ok).toBe(false);
  });

  it('holds other variables fixed while differentiating in one', () => {
    const outcome = checkResidual(symbolic({
      expression: 'k*a',
      variables: ['x', 'k', 'a'],
      residual: { kind: 'derivative-of', expression: 'k*a*x', variable: 'x' },
    }));
    expect(outcome.ok).toBe(true);
  });

  it('reports a residual whose variable the answer never declares', () => {
    const outcome = checkResidual(symbolic({
      expression: '2*x',
      variables: ['x'],
      residual: { kind: 'derivative-of', expression: 'y^2', variable: 'y' },
    }));
    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toContain('not among');
  });
});

describe('antiderivative-of residuals', () => {
  it('accepts a correct antiderivative', () => {
    const outcome = checkResidual(symbolic({
      expression: 'x^4/4',
      variables: ['x'],
      residual: { kind: 'antiderivative-of', expression: 'x^3', variable: 'x' },
    }));
    expect(outcome.ok).toBe(true);
  });

  it('accepts a correct antiderivative carrying an arbitrary constant', () => {
    // The constant shifts every sample equally, so differentiating it back
    // still reproduces the integrand exactly.
    const outcome = checkResidual(symbolic({
      expression: 'x^4/4 + 17',
      variables: ['x'],
      residual: { kind: 'antiderivative-of', expression: 'x^3', variable: 'x' },
    }));
    expect(outcome.ok).toBe(true);
  });

  it('rejects an integral that never incremented the exponent', () => {
    const outcome = checkResidual(symbolic({
      expression: 'x^3/3',
      variables: ['x'],
      residual: { kind: 'antiderivative-of', expression: 'x^3', variable: 'x' },
    }));
    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toContain('antiderivative');
  });

  it('rejects an exponential antiderivative missing its 1/k factor', () => {
    const outcome = checkResidual(symbolic({
      expression: 'exp(2*x)',
      variables: ['x'],
      residual: { kind: 'antiderivative-of', expression: 'exp(2*x)', variable: 'x' },
    }));
    expect(outcome.ok).toBe(false);
  });
});

describe('ode-solution residuals', () => {
  it('accepts the step response of a first-order system', () => {
    // y' + 2y = 6, y(0) = 0  ->  y = 3(1 - e^{-2t})
    const outcome = checkResidual(symbolic({
      expression: '3*(1 - exp(-2*t))',
      variables: ['t'],
      residual: {
        kind: 'ode-solution',
        variable: 't',
        second: '0',
        first: '1',
        zeroth: '2',
        forcing: '6',
        initial: [{ at: 0, order: 0, value: 0 }],
      },
    }));
    expect(outcome.ok).toBe(true);
  });

  it('rejects a solution that drops the particular part', () => {
    // The homogeneous solution alone satisfies neither the forcing nor y(0).
    const outcome = checkResidual(symbolic({
      expression: '-3*exp(-2*t)',
      variables: ['t'],
      residual: {
        kind: 'ode-solution',
        variable: 't',
        second: '0',
        first: '1',
        zeroth: '2',
        forcing: '6',
        initial: [{ at: 0, order: 0, value: 0 }],
      },
    }));
    expect(outcome.ok).toBe(false);
  });

  it('rejects a sign error in the decay exponent', () => {
    const outcome = checkResidual(symbolic({
      expression: '3*(1 - exp(2*t))',
      variables: ['t'],
      residual: {
        kind: 'ode-solution', variable: 't',
        second: '0', first: '1', zeroth: '2', forcing: '6', initial: [],
      },
    }));
    expect(outcome.ok).toBe(false);
  });

  it('accepts an overdamped second-order solution', () => {
    // y'' + 5y' + 6y = 0 has roots -2 and -3.
    const outcome = checkResidual(symbolic({
      expression: '4*exp(-2*t) - 4*exp(-3*t)',
      variables: ['t'],
      residual: {
        kind: 'ode-solution', variable: 't',
        second: '1', first: '5', zeroth: '6', forcing: '0', initial: [{ at: 0, order: 0, value: 0 }],
      },
    }));
    expect(outcome.ok).toBe(true);
  });

  it('rejects a second-order solution built on a wrong characteristic root', () => {
    // -2 and -4 are not the roots of s^2 + 5s + 6.
    const outcome = checkResidual(symbolic({
      expression: '4*exp(-2*t) - 4*exp(-4*t)',
      variables: ['t'],
      residual: {
        kind: 'ode-solution', variable: 't',
        second: '1', first: '5', zeroth: '6', forcing: '0', initial: [],
      },
    }));
    expect(outcome.ok).toBe(false);
  });

  it('catches a solution that solves the ODE but misses the initial condition', () => {
    // Satisfies y'' + 5y' + 6y = 0 everywhere, but y(0) = 1 rather than 0. The
    // residual sweep alone passes this; only the initial-condition check fails it.
    const outcome = checkResidual(symbolic({
      expression: 'exp(-2*t)',
      variables: ['t'],
      residual: {
        kind: 'ode-solution', variable: 't',
        second: '1', first: '5', zeroth: '6', forcing: '0',
        initial: [{ at: 0, order: 0, value: 0 }],
      },
    }));
    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toContain('initial condition');
  });
});

describe('degenerate input', () => {
  it('treats an answer with no residual as unchecked rather than passing', () => {
    const outcome = checkResidual(symbolic({ expression: 'x^2', variables: ['x'] }));
    expect(outcome.ok).toBe(true);
    expect(outcome.compared).toBe(0);
  });

  it('fails an answer expression that does not parse', () => {
    const outcome = checkResidual(symbolic({
      expression: '3*x +',
      variables: ['x'],
      residual: { kind: 'derivative-of', expression: 'x^2', variable: 'x' },
    }));
    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toContain('does not parse');
  });
});
