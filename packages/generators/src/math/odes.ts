import type { Generator } from '../types.js';
import { adjustDifficulty, intBetween, pick, resampleUntil, trimNumber, type Rng } from '../rng.js';
import { separatedExpressionTraps, separatedTraps } from '../traps.js';

/**
 * MATH 3323 — differential equations, asked as the circuits underneath them.
 *
 * The degree plan runs this concurrently with Circuits I, which is exactly the
 * arrangement that hides a gap: a student can pass both by treating RC
 * transients and first-order ODEs as unrelated procedures, and the overlap only
 * surfaces in Circuits II when neither procedure is fresh. Modelling the edge
 * means these items have to be recognisably the same mathematics as
 * `ee2300.first-order-step` and `ee2300.second-order-rlc` with the units taken
 * off — otherwise mastery here says nothing about mastery there.
 */
const T_DOMAIN: Record<string, [number, number]> = { t: [0.05, 1.5] };
export const firstOrderStepSolution: Generator = {
  id: 'math3323.first-order.step-solution',
  title: 'Solve a forced first-order ODE',
  kcRefs: [
    { kc: 'math3323.first-order-ode', weight: 0.8 },
    { kc: 'math2471.exponential-functions', weight: 0.2 },
  ],
  difficultyB: 0.5,
  generate(rng: Rng) {
    const a = intBetween(rng, 2, 6);
    const b = a * intBetween(rng, 1, 5); // keeps the steady state an integer
    const steady = b / a;
    // A non-zero initial value is what forces the full solution rather than the
    // memorised (1 - e^{-at}) shape, and it is the step most often skipped.
    const y0 = resampleUntil(rng, (r) => intBetween(r, 0, 8), (v) => v !== steady);
    const solution = `${steady} + (${y0} - ${steady})*exp(-${a}*t)`;
    const answer = {
      kind: 'symbolic' as const,
      expression: solution,
      variables: ['t'],
      domain: T_DOMAIN,
      residual: {
        kind: 'ode-solution' as const,
        variable: 't',
        second: '0',
        first: '1',
        zeroth: String(a),
        forcing: String(b),
        initial: [{ at: 0, order: 0, value: y0 }],
      },
    };
    return {
      type: 'symbolic' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [y0 === 0 ? -1 : 0.6, steady > 3 ? 0.4 : -0.4]),
      stem:
        `Solve the initial value problem for $y(t)$:\n\n` +
        `$$\\frac{dy}{dt} + ${a}y = ${b}, \\qquad y(0) = ${y0}$$`,
      answer,
      options: [],
      misconceptionTraps: separatedExpressionTraps(answer, [
        {
          misconception: 'ode.particular-solution-omitted',
          expression: `${y0}*exp(-${a}*t)`,
          feedback:
            `That is the homogeneous solution only — it decays to zero, but this equation is **driven** and ` +
            `settles at $y_\\infty = ${b}/${a} = ${steady}$. The complete solution is particular plus homogeneous.`,
        },
        {
          misconception: 'ode.initial-condition-ignored',
          expression: `${steady}*(1 - exp(-${a}*t))`,
          feedback:
            `You used the standard rise from zero, but $y(0) = ${y0}$, not $0$. The general shape is ` +
            `$y_\\infty + (y_0 - y_\\infty)e^{-at}$ — the exponential decays the **difference**, not the whole value.`,
        },
        {
          misconception: 'ode.decay-sign-inverted',
          expression: `${steady} + (${y0} - ${steady})*exp(${a}*t)`,
          feedback:
            `The exponent's sign is inverted, so your solution grows without bound. A positive coefficient on $y$ ` +
            `makes the root negative: $s = -${a}$.`,
        },
      ]),
      explanation: {
        steps: [
          `The steady state is where $dy/dt = 0$: $${a}y_\\infty = ${b}$, so $y_\\infty = ${steady}$.`,
          `The homogeneous equation $y' + ${a}y = 0$ has root $s = -${a}$, giving $Ke^{-${a}t}$.`,
          `The complete solution is $y(t) = ${steady} + Ke^{-${a}t}$.`,
          `Apply $y(0) = ${y0}$: $${y0} = ${steady} + K$, so $K = ${y0 - steady}$ and $y(t) = ${steady} + (${y0 - steady})e^{-${a}t}$.`,
        ],
        principle: 'Every driven first-order system is its steady state plus a decaying correction sized by the initial condition.',
        hints: [
          'Where does the solution end up if you wait long enough?',
          'Find the general solution first; the initial condition only fixes the constant.',
        ],
      },
    };
  },
};
export const characteristicRoots: Generator = {
  id: 'math3323.second-order.characteristic-roots',
  title: 'Characteristic roots of a second-order ODE',
  kcRefs: [{ kc: 'math3323.second-order-ode', weight: 1 }],
  difficultyB: 0.6,
  generate(rng: Rng) {
    // Build backwards from the roots so the coefficients stay integers and the
    // answer is exact. Distinct roots keep the two traps separable.
    const r1 = -intBetween(rng, 1, 5);
    const r2 = resampleUntil(rng, (r) => -intBetween(r, 1, 9), (v) => v !== r1);
    const b = -(r1 + r2);
    const c = r1 * r2;
    const moreNegative = Math.min(r1, r2);
    const lessNegative = Math.max(r1, r2);
    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        Math.abs(r1 - r2) < 2 ? 1 : -0.5,
        Math.abs(moreNegative) > 6 ? 0.5 : -0.5,
      ]),
      stem:
        `Find the more negative characteristic root of:\n\n` +
        `$$y'' + ${b}y' + ${c}y = 0$$`,
      answer: { kind: 'numeric' as const, value: moreNegative, unit: '', tolerance: { abs: 0.02 } },
      options: [],
      misconceptionTraps: separatedTraps(moreNegative, { abs: 0.02 }, [
        {
          misconception: 'ode.characteristic-root-sign',
          value: -moreNegative,
          tolerance: { abs: 0.02 },
          feedback:
            `Right magnitude, wrong sign. The characteristic equation is $s^2 + ${b}s + ${c} = 0$, and the ` +
            `quadratic formula puts $-${b}$ in the numerator — a stable system has roots in the left half-plane.`,
        },
        {
          misconception: 'ode.root-ordering-confused',
          value: lessNegative,
          tolerance: { abs: 0.02 },
          feedback:
            `That is the other root. $${lessNegative}$ is closer to zero than $${moreNegative}$, so it decays ` +
            `more slowly and is the one that dominates late in the response — but the question asked for the more negative.`,
        },
      ]),
      explanation: {
        steps: [
          `Substitute $y = e^{st}$ to get the characteristic equation $s^2 + ${b}s + ${c} = 0$.`,
          `Discriminant: $${b}^2 - 4(${c}) = ${b * b - 4 * c}$, which is positive, so the roots are real and distinct.`,
          `$s = \\frac{-${b} \\pm \\sqrt{${b * b - 4 * c}}}{2} = \\frac{-${b} \\pm ${trimNumber(Math.sqrt(b * b - 4 * c), 5)}}{2}$.`,
          `The roots are $${lessNegative}$ and $${moreNegative}$; the more negative one is $${moreNegative}$.`,
        ],
        principle: 'The characteristic roots are the whole answer: they set both the decay rates and the damping regime.',
        hints: ['Try a solution of the form $e^{st}$.', 'Check the sign of the discriminant before anything else.'],
      },
    };
  },
};
export const overdampedSolution: Generator = {
  id: 'math3323.second-order.overdamped-solution',
  title: 'Solve an overdamped second-order IVP',
  kcRefs: [{ kc: 'math3323.second-order-ode', weight: 1 }],
  difficultyB: 1.1,
  generate(rng: Rng) {
    const r1 = -intBetween(rng, 1, 3);
    const r2 = resampleUntil(rng, (r) => -intBetween(r, 4, 8), (v) => v !== r1);
    const b = -(r1 + r2);
    const c = r1 * r2;
    const v0 = intBetween(rng, 1, 6) * (r1 - r2); // keeps the amplitude an integer
    const amplitude = v0 / (r1 - r2);
    const solution = `${amplitude}*(exp(${r1}*t) - exp(${r2}*t))`;
    const answer = {
      kind: 'symbolic' as const,
      expression: solution,
      variables: ['t'],
      domain: T_DOMAIN,
      residual: {
        kind: 'ode-solution' as const,
        variable: 't',
        second: '1',
        first: String(b),
        zeroth: String(c),
        forcing: '0',
        initial: [
          { at: 0, order: 0, value: 0 },
          { at: 0, order: 1, value: v0 },
        ],
      },
    };
    return {
      type: 'symbolic' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [Math.abs(r2 - r1) > 5 ? -0.5 : 0.8]),
      stem:
        `Solve the initial value problem for $y(t)$:\n\n` +
        `$$y'' + ${b}y' + ${c}y = 0, \\qquad y(0) = 0, \\quad y'(0) = ${v0}$$`,
      answer,
      options: [],
      misconceptionTraps: separatedExpressionTraps(answer, [
        {
          misconception: 'ode.characteristic-root-sign',
          expression: `${amplitude}*(exp(${-r1}*t) - exp(${-r2}*t))`,
          feedback:
            `Both exponents have the wrong sign, so your solution grows instead of decaying. The roots of ` +
            `$s^2 + ${b}s + ${c}$ are $${r1}$ and $${r2}$ — both negative.`,
        },
        {
          misconception: 'ode.initial-condition-ignored',
          expression: `exp(${r1}*t) - exp(${r2}*t)`,
          feedback:
            `The form is right but the amplitude was never fitted. $y'(0) = ${v0}$ forces ` +
            `$A(${r1} - ${r2}) = ${v0}$, so $A = ${amplitude}$ rather than $1$.`,
        },
      ]),
      explanation: {
        steps: [
          `Characteristic equation $s^2 + ${b}s + ${c} = 0$ has distinct real roots $${r1}$ and $${r2}$ — overdamped.`,
          `General solution: $y(t) = Ae^{${r1}t} + Be^{${r2}t}$.`,
          `$y(0) = 0$ gives $A + B = 0$, so $B = -A$.`,
          `$y'(0) = ${v0}$ gives $A(${r1}) + B(${r2}) = A(${r1} - ${r2}) = ${v0}$, so $A = ${amplitude}$ and $y(t) = ${amplitude}\\left(e^{${r1}t} - e^{${r2}t}\\right)$.`,
        ],
        principle: 'Two initial conditions fix the two constants that the two characteristic roots leave free.',
        hints: [
          'Distinct real roots mean a sum of two plain exponentials.',
          'Apply y(0) first — it relates the constants before you differentiate.',
        ],
      },
    };
  },
};
export const dampingRegime: Generator = {
  id: 'math3323.second-order.damping-regime',
  title: 'Classify the damping regime',
  kcRefs: [{ kc: 'math3323.second-order-ode', weight: 1 }],
  difficultyB: 0.0,
  generate(rng: Rng) {
    const regime = pick(rng, ['over', 'critical', 'under'] as const);
    const omega = intBetween(rng, 2, 7);
    const c = omega * omega;
    const b =
      regime === 'critical' ? 2 * omega
      : regime === 'over' ? 2 * omega + intBetween(rng, 1, 5)
      : Math.max(1, 2 * omega - intBetween(rng, 1, 2 * omega - 1));
    const discriminant = b * b - 4 * c;
    const correctId = regime === 'over' ? 'a' : regime === 'critical' ? 'b' : 'c';
    return {
      type: 'multiple-choice' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [Math.abs(discriminant) <= 4 ? 1 : -0.6]),
      stem:
        `Classify the damping of:\n\n$$y'' + ${b}y' + ${c}y = 0$$`,
      answer: { kind: 'choice' as const, correctId },
      options: [
        {
          id: 'a',
          text: 'Overdamped — two distinct real roots',
          ...(correctId === 'a' ? {} : { misconception: 'ode.discriminant-misread' }),
          rationale:
            correctId === 'a'
              ? `$b^2 - 4c = ${discriminant} > 0$, so the roots are real and distinct.`
              : `Overdamped needs $b^2 - 4c > 0$; here it is $${discriminant}$.`,
        },
        {
          id: 'b',
          text: 'Critically damped — a repeated real root',
          ...(correctId === 'b' ? {} : { misconception: 'ode.discriminant-misread' }),
          rationale:
            correctId === 'b'
              ? `$b^2 - 4c = 0$ exactly, so both roots equal $-${b / 2}$.`
              : `Critical damping is the knife edge $b^2 = 4c$; here $b^2 - 4c = ${discriminant}$.`,
        },
        {
          id: 'c',
          text: 'Underdamped — a complex conjugate pair, so the response oscillates',
          ...(correctId === 'c' ? {} : { misconception: 'ode.discriminant-misread' }),
          rationale:
            correctId === 'c'
              ? `$b^2 - 4c = ${discriminant} < 0$, so the roots are complex and the response rings.`
              : `Oscillation requires $b^2 - 4c < 0$; here it is $${discriminant}$.`,
        },
        {
          id: 'd',
          text: 'Undamped — purely imaginary roots, so it oscillates forever',
          misconception: 'ode.damping-term-ignored',
          rationale:
            `An undamped system has no first-derivative term at all. The $${b}y'$ term removes energy, ` +
            `so the response cannot persist.`,
        },
      ],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `The regime is decided entirely by the discriminant of $s^2 + ${b}s + ${c} = 0$.`,
          `$b^2 - 4c = ${b}^2 - 4(${c}) = ${discriminant}$.`,
          discriminant > 0
            ? `Positive, so two distinct real roots: **overdamped**, no oscillation.`
            : discriminant === 0
              ? `Exactly zero, so a repeated root at $-${b / 2}$: **critically damped**, the fastest non-oscillating return.`
              : `Negative, so a complex conjugate pair: **underdamped**, and the response oscillates as it decays.`,
        ],
        principle: 'One number — the discriminant — decides whether a second-order system rings, and it is the same number that decides it for an RLC circuit.',
        hints: ['Write the characteristic equation.', 'You do not need the roots themselves, only the sign under the radical.'],
      },
    };
  },
};
export const ODE_GENERATORS: readonly Generator[] = [
  firstOrderStepSolution,
  characteristicRoots,
  overdampedSolution,
  dampingRegime,
];
