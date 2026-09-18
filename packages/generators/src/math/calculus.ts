import type { Generator } from '../types.js';
import { DEFAULT_TOLERANCE } from '../types.js';
import { adjustDifficulty, intBetween, pick, resampleUntil, seconds, trimNumber, type Rng } from '../rng.js';
import { separatedExpressionTraps, separatedTraps } from '../traps.js';

/**
 * MATH 2471 — the calculus that Circuits I actually loads on.
 *
 * Scoped by what the prerequisite edges point at rather than by a syllabus.
 * `ee2300.capacitor-iv` depends on differentiation because i = C dv/dt *is* a
 * derivative; `ee2300.first-order-step` depends on exponentials because solving
 * for an instant in a transient is solving e^{-t/tau} for t. Items here exist
 * to confirm or clear the inference the graph draws when a circuits item fails,
 * so they ask for the operation in its bare form: if the calculus is the
 * problem, it should be visible without a circuit wrapped around it.
 */

/** A domain that keeps sampled expressions finite and well away from zero. */
const X_DOMAIN: Record<string, [number, number]> = { x: [1, 4] };

export const polynomialDerivative: Generator = {
  id: 'math2471.derivative.polynomial',
  title: 'Differentiate a polynomial',
  kcRefs: [{ kc: 'math2471.derivative-basics', weight: 1 }],
  difficultyB: -1.2,
  generate(rng: Rng) {
    const a = intBetween(rng, 2, 6);
    const b = intBetween(rng, 2, 9);
    const c = intBetween(rng, 2, 9);
    // A non-zero constant term is what makes "the constant survived" visible.
    const d = intBetween(rng, 2, 12);

    const f = `${a}*x^3 - ${b}*x^2 + ${c}*x + ${d}`;
    const fPrime = `${3 * a}*x^2 - ${2 * b}*x + ${c}`;

    const answer = {
      kind: 'symbolic' as const,
      expression: fPrime,
      variables: ['x'],
      domain: X_DOMAIN,
      residual: { kind: 'derivative-of' as const, expression: f, variable: 'x' },
    };

    return {
      type: 'symbolic' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [a === 1 ? -1 : 0, c > 6 ? 0.5 : -0.5]),
      stem:
        `Differentiate with respect to $x$:\n\n` +
        `$$f(x) = ${a}x^3 - ${b}x^2 + ${c}x + ${d}$$`,
      answer,
      options: [],
      misconceptionTraps: separatedExpressionTraps(answer, [
        {
          misconception: 'calculus.power-rule-exponent-kept',
          expression: `${3 * a}*x^3 - ${2 * b}*x^2 + ${c}`,
          feedback:
            `You multiplied by each exponent but left the exponent alone. The power rule does both: ` +
            `$\\frac{d}{dx}x^n = nx^{n-1}$ — the exponent drops by one every time.`,
        },
        {
          misconception: 'calculus.constant-term-survives',
          expression: `${3 * a}*x^2 - ${2 * b}*x + ${c} + ${d}`,
          feedback:
            `The constant $${d}$ carried through. A constant does not change as $x$ changes, so its ` +
            `derivative is $0$ — that term disappears entirely.`,
        },
      ]),
      explanation: {
        steps: [
          `Differentiate term by term; the power rule is $\\frac{d}{dx}x^n = nx^{n-1}$.`,
          `$${a}x^3 \\rightarrow ${3 * a}x^2$, and $-${b}x^2 \\rightarrow -${2 * b}x$.`,
          `$${c}x \\rightarrow ${c}$, since $x^1 \\rightarrow 1 \\cdot x^0 = 1$.`,
          `The constant $${d}$ differentiates to $0$, so $f'(x) = ${3 * a}x^2 - ${2 * b}x + ${c}$.`,
        ],
        principle: 'Differentiation is term-by-term, and the power rule changes both the coefficient and the exponent.',
        hints: ['Handle one term at a time.', 'What is the rate of change of a constant?'],
      },
    };
  },
};

export const productRuleDerivative: Generator = {
  id: 'math2471.derivative.product-chain',
  title: 'Product and chain rule together',
  kcRefs: [
    { kc: 'math2471.derivative-basics', weight: 0.8 },
    { kc: 'math2471.exponential-functions', weight: 0.2 },
  ],
  difficultyB: 0.3,
  generate(rng: Rng) {
    const n = intBetween(rng, 2, 4);
    // k = 1 would make the dropped-chain-factor trap identical to the answer,
    // and k = -1 would hide it behind a sign. Either way the item stops
    // diagnosing anything, so the draw excludes them.
    const k = resampleUntil(rng, (r) => intBetween(r, -4, 4), (v) => Math.abs(v) >= 2);
    const sign = k < 0 ? '-' : '';
    const absK = Math.abs(k);

    const f = `x^${n}*exp(${k}*x)`;
    const fPrime = `${n}*x^${n - 1}*exp(${k}*x) + ${k}*x^${n}*exp(${k}*x)`;

    const answer = {
      kind: 'symbolic' as const,
      expression: fPrime,
      variables: ['x'],
      domain: X_DOMAIN,
      residual: { kind: 'derivative-of' as const, expression: f, variable: 'x' },
    };

    return {
      type: 'symbolic' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [n > 3 ? 1 : 0, k < 0 ? 0.5 : -0.5]),
      stem:
        `Differentiate with respect to $x$:\n\n` +
        `$$f(x) = x^{${n}}e^{${sign}${absK}x}$$`,
      answer,
      options: [],
      misconceptionTraps: separatedExpressionTraps(answer, [
        {
          misconception: 'calculus.product-rule-as-product-of-derivatives',
          expression: `${n}*x^${n - 1} * ${k}*exp(${k}*x)`,
          feedback:
            `You differentiated each factor and multiplied the results. The derivative of a product is ` +
            `**not** the product of the derivatives: $(uv)' = u'v + uv'$ has two terms, added.`,
        },
        {
          misconception: 'calculus.chain-rule-inner-dropped',
          expression: `${n}*x^${n - 1}*exp(${k}*x) + x^${n}*exp(${k}*x)`,
          feedback:
            `The structure is right but the chain rule lost its inner derivative. ` +
            `$\\frac{d}{dx}e^{${sign}${absK}x} = ${sign}${absK}e^{${sign}${absK}x}$, not $e^{${sign}${absK}x}$.`,
        },
      ]),
      explanation: {
        steps: [
          `This is a product $u \\cdot v$ with $u = x^{${n}}$ and $v = e^{${sign}${absK}x}$.`,
          `$u' = ${n}x^{${n - 1}}$.`,
          `$v' = ${sign}${absK}e^{${sign}${absK}x}$ — the chain rule brings the inner derivative $${k}$ out front.`,
          `$(uv)' = u'v + uv' = ${n}x^{${n - 1}}e^{${sign}${absK}x} ${k < 0 ? '-' : '+'} ${absK}x^{${n}}e^{${sign}${absK}x}$.`,
        ],
        principle: 'A product of functions needs both terms of the product rule, and any composed factor also needs its inner derivative.',
        hints: [
          'Name the two factors before differentiating anything.',
          'What is the derivative of the exponent itself?',
        ],
      },
    };
  },
};

export const polynomialAntiderivative: Generator = {
  id: 'math2471.integral.polynomial',
  title: 'Antiderivative of a polynomial',
  kcRefs: [{ kc: 'math2471.integration-basics', weight: 1 }],
  difficultyB: -0.7,
  generate(rng: Rng) {
    const n = intBetween(rng, 2, 4);
    const a = intBetween(rng, 2, 8);
    const b = intBetween(rng, 2, 9);

    const integrand = `${a}*x^${n} + ${b}`;
    const antiderivative = `${a}*x^${n + 1}/${n + 1} + ${b}*x`;

    const answer = {
      kind: 'symbolic' as const,
      expression: antiderivative,
      variables: ['x'],
      domain: X_DOMAIN,
      residual: { kind: 'antiderivative-of' as const, expression: integrand, variable: 'x' },
    };

    return {
      type: 'symbolic' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [n > 3 ? 1 : -0.5]),
      stem:
        `Find the general antiderivative:\n\n` +
        `$$\\int \\left(${a}x^{${n}} + ${b}\\right)\\,dx$$\n\n` +
        `A constant of integration is optional — write $+C$ if you like.`,
      answer,
      options: [],
      misconceptionTraps: separatedExpressionTraps(answer, [
        {
          misconception: 'calculus.antiderivative-exponent-not-incremented',
          expression: `${a}*x^${n}/${n} + ${b}*x`,
          feedback:
            `You divided by the exponent but did not raise it. Integration runs the power rule backwards: ` +
            `$\\int x^n dx = \\frac{x^{n+1}}{n+1}$ — the exponent goes **up** by one, and you divide by the new one.`,
        },
        {
          misconception: 'calculus.integral-of-constant-dropped',
          expression: `${a}*x^${n + 1}/${n + 1}`,
          feedback:
            `The constant term vanished. $\\int ${b}\\,dx = ${b}x$ — integrating a constant produces a linear term, ` +
            `it does not delete it. You may be running the derivative rule instead.`,
        },
        {
          misconception: 'calculus.integration-differentiates-instead',
          expression: `${a * n}*x^${n - 1}`,
          feedback: `That is $\\frac{d}{dx}$ of the integrand, not $\\int$ of it. The two operations run in opposite directions.`,
        },
      ]),
      explanation: {
        steps: [
          `Integrate term by term with $\\int x^n dx = \\frac{x^{n+1}}{n+1}$.`,
          `$\\int ${a}x^{${n}} dx = \\frac{${a}x^{${n + 1}}}{${n + 1}}$.`,
          `$\\int ${b}\\,dx = ${b}x$.`,
          `So the antiderivative is $\\frac{${a}x^{${n + 1}}}{${n + 1}} + ${b}x + C$.`,
        ],
        principle: 'Integration raises the exponent and divides by the new one — the exact reverse of the power rule.',
        hints: ['Differentiate your answer; you should get the integrand back.', 'What integrates to a constant?'],
      },
    };
  },
};

export const definiteIntegral: Generator = {
  id: 'math2471.integral.definite',
  title: 'Evaluate a definite integral',
  kcRefs: [{ kc: 'math2471.integration-basics', weight: 1 }],
  difficultyB: -0.2,
  generate(rng: Rng) {
    const a = intBetween(rng, 2, 6);
    const c = intBetween(rng, 1, 8);
    // A non-zero lower limit is the whole point: with lower limit 0 the
    // "forgot to subtract F(lower)" error is invisible, because F(0) = 0.
    const lower = intBetween(rng, 1, 3);
    const upper = lower + intBetween(rng, 1, 3);

    const F = (x: number): number => (a * x ** 3) / 3 + c * x;
    const value = F(upper) - F(lower);
    const upperOnly = F(upper);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [upper - lower > 2 ? 1 : -0.5, lower === 1 ? -0.5 : 0.5]),
      stem:
        `Evaluate:\n\n$$\\int_{${lower}}^{${upper}} \\left(${a}x^2 + ${c}\\right)\\,dx$$`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(value, DEFAULT_TOLERANCE, [
        {
          misconception: 'calculus.definite-integral-lower-limit-dropped',
          value: upperOnly,
          tolerance: { rel: 0.01 },
          feedback:
            `You evaluated the antiderivative at $x = ${upper}$ and stopped. A definite integral is a ` +
            `**difference**: $F(${upper}) - F(${lower})$. Leaving the lower limit out is the same error as ` +
            `reading a meter without zeroing it.`,
        },
        {
          misconception: 'calculus.antiderivative-exponent-not-incremented',
          value: (a * upper ** 2) / 2 + c * upper - ((a * lower ** 2) / 2 + c * lower),
          tolerance: { rel: 0.01 },
          feedback:
            `Your antiderivative divided by the old exponent instead of the new one. ` +
            `$\\int x^2 dx = \\frac{x^3}{3}$, not $\\frac{x^2}{2}$.`,
        },
      ]),
      explanation: {
        steps: [
          `Antidifferentiate: $F(x) = \\frac{${a}x^3}{3} + ${c}x$.`,
          `$F(${upper}) = \\frac{${a}(${upper})^3}{3} + ${c}(${upper}) = ${trimNumber(F(upper), 6)}$.`,
          `$F(${lower}) = \\frac{${a}(${lower})^3}{3} + ${c}(${lower}) = ${trimNumber(F(lower), 6)}$.`,
          `$\\int_{${lower}}^{${upper}} = F(${upper}) - F(${lower}) = ${trimNumber(value, 6)}$.`,
        ],
        principle: 'The fundamental theorem turns an integral into a difference of antiderivative values at the limits.',
        hints: ['Find the antiderivative first, then evaluate it twice.', 'Both limits matter.'],
      },
    };
  },
};

export const exponentialSolveTime: Generator = {
  id: 'math2471.exponential.solve-time',
  title: 'Solve an exponential decay for time',
  kcRefs: [{ kc: 'math2471.exponential-functions', weight: 1 }],
  difficultyB: -0.1,
  generate(rng: Rng) {
    const initial = pick(rng, [5, 9, 10, 12, 15, 20, 24]);
    const tau = pick(rng, [1e-3, 2.2e-3, 4.7e-3, 10e-3, 22e-3, 47e-3]);
    // A target strictly below the initial value keeps the logarithm positive,
    // so a negative answer means a genuine sign error rather than a bad draw.
    const fraction = pick(rng, [0.1, 0.2, 0.25, 0.37, 0.5, 0.75]);
    const target = Number((initial * fraction).toPrecision(3));

    const t = tau * Math.log(initial / target);
    const signFlipped = tau * Math.log(target / initial);
    const tauForgotten = Math.log(initial / target);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        Math.abs(fraction - 0.37) < 0.02 ? -1 : 0.5, // decaying to 1/e is the memorised case
        fraction < 0.2 ? 0.5 : -0.5,
      ]),
      stem:
        `A quantity decays as $v(t) = ${trimNumber(initial)}e^{-t/\\tau}$ with $\\tau = ${seconds(tau)}$.\n\n` +
        `At what time $t$ does it reach ${trimNumber(target)}?`,
      answer: { kind: 'numeric' as const, value: t, unit: 's', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(t, DEFAULT_TOLERANCE, [
        {
          misconception: 'calculus.logarithm-ratio-inverted',
          value: signFlipped,
          tolerance: { rel: 0.01 },
          feedback:
            `Your ratio is upside down, which is why the time came out negative. Isolating the exponential gives ` +
            `$e^{-t/\\tau} = v/v_0$, so $-t/\\tau = \\ln(v/v_0)$ and the minus sign flips the ratio to $\\ln(v_0/v)$.`,
        },
        {
          misconception: 'calculus.time-constant-not-applied',
          value: tauForgotten,
          tolerance: { rel: 0.01 },
          feedback:
            `You found $\\ln(v_0/v)$ but stopped there. That result is in units of $\\tau$, not seconds — ` +
            `multiply by $\\tau = ${seconds(tau)}$ to get a time.`,
        },
      ]),
      explanation: {
        steps: [
          `Divide both sides by the initial value: $e^{-t/\\tau} = \\frac{${trimNumber(target)}}{${trimNumber(initial)}} = ${trimNumber(target / initial, 4)}$.`,
          `Take the natural log: $-t/\\tau = \\ln(${trimNumber(target / initial, 4)}) = ${trimNumber(Math.log(target / initial), 4)}$.`,
          `Multiply through by $-\\tau$: $t = \\tau\\ln\\!\\left(\\frac{${trimNumber(initial)}}{${trimNumber(target)}}\\right)$.`,
          `$t = (${seconds(tau)})(${trimNumber(Math.log(initial / target), 4)}) = ${seconds(t)}$.`,
        ],
        principle: 'Solving an exponential for time is always the same three moves: isolate, take the log, multiply by the time constant.',
        hints: [
          'Get the exponential term alone on one side first.',
          'A decaying quantity reaches a lower value at a positive time — check the sign of your log.',
        ],
      },
    };
  },
};

export const exponentialDecayConstant: Generator = {
  id: 'math2471.exponential.decay-constant',
  title: 'Extract a time constant from two samples',
  kcRefs: [{ kc: 'math2471.exponential-functions', weight: 1 }],
  difficultyB: 0.4,
  generate(rng: Rng) {
    const tau = pick(rng, [2e-3, 5e-3, 10e-3, 20e-3, 50e-3]);
    const v0 = pick(rng, [5, 10, 12, 15, 20]);
    const t1 = Number((tau * pick(rng, [0.25, 0.5, 1])).toPrecision(3));
    const t2 = Number((t1 + tau * pick(rng, [1, 1.5, 2])).toPrecision(3));

    const v1 = v0 * Math.exp(-t1 / tau);
    const v2 = v0 * Math.exp(-t2 / tau);
    const recovered = (t2 - t1) / Math.log(v1 / v2);

    // Using the elapsed time without the log at all — dimensionally plausible,
    // numerically wrong, and a common shortcut.
    const noLog = t2 - t1;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [t1 === 0 ? -1 : 0.5]),
      stem:
        `A decaying signal $v(t) = V_0e^{-t/\\tau}$ is measured twice:\n\n` +
        `$v(${seconds(t1)}) = ${trimNumber(v1, 4)}$ V and $v(${seconds(t2)}) = ${trimNumber(v2, 4)}$ V.\n\n` +
        `Find the time constant $\\tau$. (You do not need $V_0$.)`,
      answer: { kind: 'numeric' as const, value: recovered, unit: 's', tolerance: { rel: 0.03 } },
      options: [],
      misconceptionTraps: separatedTraps(recovered, { rel: 0.03 }, [
        {
          misconception: 'calculus.time-constant-not-applied',
          value: noLog,
          tolerance: { rel: 0.02 },
          feedback:
            `You took the elapsed time as the time constant. $\\tau$ is only the elapsed time when the signal ` +
            `falls by a factor of $e$; in general the ratio of the two readings has to go through a logarithm.`,
        },
        {
          misconception: 'calculus.logarithm-ratio-inverted',
          value: (t2 - t1) / Math.log(v2 / v1),
          tolerance: { rel: 0.02 },
          feedback:
            `The ratio is inverted, so $\\tau$ came out negative. The earlier reading is the larger one; ` +
            `put it on top to get a positive logarithm.`,
        },
      ]),
      explanation: {
        steps: [
          `Take the ratio so $V_0$ cancels: $\\frac{v(t_1)}{v(t_2)} = e^{(t_2-t_1)/\\tau}$.`,
          `$\\frac{${trimNumber(v1, 4)}}{${trimNumber(v2, 4)}} = ${trimNumber(v1 / v2, 4)}$.`,
          `Take logs: $\\frac{t_2-t_1}{\\tau} = \\ln(${trimNumber(v1 / v2, 4)}) = ${trimNumber(Math.log(v1 / v2), 4)}$.`,
          `$\\tau = \\frac{${seconds(t2 - t1)}}{${trimNumber(Math.log(v1 / v2), 4)}} = ${seconds(recovered)}$.`,
        ],
        principle: 'Taking a ratio of two samples cancels the unknown amplitude, leaving the time constant recoverable from the decay alone.',
        hints: ['Divide the two measurements and see what cancels.', 'The amplitude is not needed.'],
      },
    };
  },
};

export const CALCULUS_GENERATORS: readonly Generator[] = [
  polynomialDerivative,
  productRuleDerivative,
  polynomialAntiderivative,
  definiteIntegral,
  exponentialSolveTime,
  exponentialDecayConstant,
];
