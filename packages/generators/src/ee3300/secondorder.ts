import type { Generator } from '../types.js';
import { DEFAULT_TOLERANCE } from '../types.js';
import {
  adjustDifficulty, capacitance, inductance, mantissaDifficulty, ohms, pick,
  resampleUntil, resistor, trimNumber, volts, type Rng,
} from '../rng.js';
import { separatedTraps } from '../traps.js';

/**
 * Nilsson chapter 8 — the natural and step responses of series and parallel
 * RLC circuits.
 *
 * The chapter is a single analysis method stated four times, and the lectures
 * present it that way: find alpha and omega-0, compare them to classify the
 * regime, take the roots the classification implies, then fit the coefficients
 * to the initial conditions. Every generator here targets one of those steps,
 * because the failure modes are genuinely different — reaching for the parallel
 * alpha in a series circuit is a parameter error that propagates silently,
 * while fitting only the initial value and not its derivative is a method error
 * that produces a curve through the right starting point and the wrong
 * everything else.
 */

export type Topology = 'parallel' | 'series';

export interface RlcParams {
  readonly r: number;
  readonly l: number;
  readonly c: number;
  readonly topology: Topology;
}

/** Neper frequency in rad/s. 1/(2RC) in parallel, R/(2L) in series. */
export const alphaOf = (p: RlcParams): number =>
  p.topology === 'parallel' ? 1 / (2 * p.r * p.c) : p.r / (2 * p.l);

/** Resonant radian frequency in rad/s. The same for both topologies. */
export const omega0Of = (p: RlcParams): number => 1 / Math.sqrt(p.l * p.c);

export type Regime = 'overdamped' | 'underdamped' | 'critically damped';

/** Classify by comparing alpha^2 against omega-0^2, with a relative guard band. */
export function regimeOf(p: RlcParams): Regime {
  const a = alphaOf(p);
  const w = omega0Of(p);
  if (Math.abs(a - w) / w < 1e-6) return 'critically damped';
  return a > w ? 'overdamped' : 'underdamped';
}

/** The resistance that makes a given L and C critically damped. */
export const criticalResistance = (l: number, c: number, topology: Topology): number =>
  topology === 'parallel' ? 0.5 * Math.sqrt(l / c) : 2 * Math.sqrt(l / c);

/** Real characteristic roots, valid only in the overdamped case. */
export function realRoots(p: RlcParams): readonly [number, number] {
  const a = alphaOf(p);
  const w = omega0Of(p);
  const disc = Math.sqrt(a * a - w * w);
  return [-a + disc, -a - disc];
}

/** Damped radian frequency, valid only in the underdamped case. */
export const dampedFrequency = (p: RlcParams): number => {
  const a = alphaOf(p);
  const w = omega0Of(p);
  return Math.sqrt(w * w - a * a);
};

const radps = (value: number, sigFigs = 4): string =>
  `${trimNumber(value, sigFigs)}\\,\\mathrm{rad/s}`;

const microfarads = (c: number): string => `${trimNumber(c * 1e6, 3)}\\,\\mathrm{{\\mu}F}`;
const millihenries = (l: number): string => `${trimNumber(l * 1000, 3)}\\,\\mathrm{{m}H}`;

/** Describe the circuit in the words the lectures use. */
const describe = (p: RlcParams): string =>
  `A ${p.topology} $RLC$ circuit has $R = ${ohms(p.r)}$, $L = ${millihenries(p.l)}$ and ` +
  `$C = ${microfarads(p.c)}$.`;

/**
 * Draw L and C, then place R relative to the critical resistance so the circuit
 * lands in a chosen regime.
 *
 * Choosing the regime first and solving for R is what makes this reliable:
 * drawing all three independently and rejecting puts most of the probability
 * mass on whichever regime the component ranges happen to favour, and for the
 * parallel topology with these ranges that is underdamped almost always.
 */
function drawForRegime(rng: Rng, topology: Topology, want: 'overdamped' | 'underdamped'): RlcParams {
  return resampleUntil(rng, (r2) => {
    const l = inductance(r2);
    const c = capacitance(r2);
    const rCrit = criticalResistance(l, c, topology);
    // Parallel damps harder as R falls; series damps harder as R rises.
    const wantsSmallR = (topology === 'parallel') === (want === 'overdamped');
    const factor = wantsSmallR ? pick(r2, [0.25, 0.3, 0.4, 0.5]) : pick(r2, [2, 2.5, 3, 4]);
    const r = Number((rCrit * factor).toPrecision(2));
    return { r, l, c, topology };
  }, (p) => p.r >= 10 && p.r <= 200000 && regimeOf(p) === want && alphaOf(p) > 0);
}

/** Alpha and omega-0: the two numbers every later step is built on. */
export const rlcDampingParameters: Generator = {
  id: 'ee3300.secondorder.damping-parameters',
  title: 'Neper and resonant radian frequencies',
  kcRefs: [{ kc: 'ee3300.rlc-damping-parameters', weight: 1 }],
  difficultyB: -0.2,
  generate(rng: Rng) {
    const topology = pick(rng, ['parallel', 'series'] as const);
    const l = inductance(rng);
    const c = capacitance(rng);
    const r = resistor(rng, { minDecade: 1, maxDecade: 4 });
    const p: RlcParams = { r, l, c, topology };

    const asked = pick(rng, ['alpha', 'omega0'] as const);
    const alpha = alphaOf(p);
    const omega0 = omega0Of(p);
    const answer = asked === 'alpha' ? alpha : omega0;

    // The other topology's formula — the error the lecture warns about twice.
    const swapped = topology === 'parallel' ? r / (2 * l) : 1 / (2 * r * c);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        asked === 'alpha' ? 0.6 : -0.6,
        mantissaDifficulty(answer),
      ]),
      stem:
        `${describe(p)}\n\n` +
        (asked === 'alpha'
          ? 'What is the neper frequency $\\alpha$, in rad/s?'
          : 'What is the resonant radian frequency $\\omega_0$, in rad/s?'),
      answer: { kind: 'numeric' as const, value: answer, unit: 'rad/s', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(answer, DEFAULT_TOLERANCE, [
        ...(asked === 'alpha'
          ? [{
              misconception: 'rlc.alpha-wrong-topology',
              value: swapped,
              tolerance: { rel: 0.02 },
              feedback:
                `That is the **${topology === 'parallel' ? 'series' : 'parallel'}** formula. This circuit is ${topology}, ` +
                `so $\\alpha = ${topology === 'parallel' ? '\\dfrac{1}{2RC}' : '\\dfrac{R}{2L}'}$. ` +
                `The two differ by more than a constant — they move in opposite directions with $R$.`,
            }, {
              misconception: 'rlc.alpha-missing-factor-two',
              value: alpha * 2,
              tolerance: { rel: 0.02 },
              feedback:
                `The factor of two is not decoration: it comes from completing the square on ` +
                `$s^2 + 2\\alpha s + \\omega_0^2$, which is why the roots are $-\\alpha \\pm \\sqrt{\\alpha^2 - \\omega_0^2}$.`,
            }]
          : [{
              misconception: 'rlc.omega0-not-rooted',
              value: 1 / (l * c),
              tolerance: { rel: 0.02 },
              feedback:
                `$\\omega_0 = \\dfrac{1}{\\sqrt{LC}}$, not $\\dfrac{1}{LC}$. Check the units: $LC$ has units of ` +
                `seconds squared, so only its square root can invert to rad/s.`,
            }, {
              misconception: 'rlc.omega0-uses-resistance',
              value: 1 / Math.sqrt(r * c),
              tolerance: { rel: 0.02 },
              feedback:
                `$\\omega_0$ does not involve $R$ at all. It is the frequency at which the inductor and capacitor ` +
                `exchange energy; the resistor only decides how fast that exchange dies away.`,
            }]),
      ]),
      explanation: {
        steps: [
          asked === 'alpha'
            ? `For a ${topology} $RLC$ circuit, $\\alpha = ${topology === 'parallel' ? '\\dfrac{1}{2RC}' : '\\dfrac{R}{2L}'}$.`
            : `For either topology, $\\omega_0 = \\dfrac{1}{\\sqrt{LC}}$.`,
          asked === 'alpha'
            ? (topology === 'parallel'
                ? `$\\alpha = \\dfrac{1}{2(${trimNumber(r, 3)})(${trimNumber(c, 3)})} = ${radps(alpha)}$.`
                : `$\\alpha = \\dfrac{${trimNumber(r, 3)}}{2(${trimNumber(l, 3)})} = ${radps(alpha)}$.`)
            : `$\\omega_0 = \\dfrac{1}{\\sqrt{(${trimNumber(l, 3)})(${trimNumber(c, 3)})}} = ${radps(omega0)}$.`,
          `The answer is $${radps(answer)}$.`,
        ],
        principle:
          'Alpha carries the resistance and sets how fast the response decays; omega-0 carries only L and C and sets how fast it would oscillate without loss.',
        hints: [
          'Which element is shared by every branch — is this series or parallel?',
          'Check the units before trusting the number.',
        ],
      },
    };
  },
};

/** Classification, and its inverse: the R that puts a circuit on the boundary. */
export const rlcDampingClassification: Generator = {
  id: 'ee3300.secondorder.damping-classification',
  title: 'Classifying the damping regime',
  kcRefs: [{ kc: 'ee3300.rlc-damping-classification', weight: 1 }],
  difficultyB: 0.0,
  generate(rng: Rng, seed: number) {
    const topology = pick(rng, ['parallel', 'series'] as const);
    const mode = pick(rng, ['classify', 'critical-r'] as const);

    if (mode === 'critical-r') {
      const l = inductance(rng);
      const c = capacitance(rng);
      const answer = criticalResistance(l, c, topology);
      const other = criticalResistance(l, c, topology === 'parallel' ? 'series' : 'parallel');

      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [0.4, mantissaDifficulty(answer)]),
        stem:
          `A ${topology} $RLC$ circuit has $L = ${millihenries(l)}$ and $C = ${microfarads(c)}$.\n\n` +
          'What value of $R$ makes the circuit critically damped?',
        answer: { kind: 'numeric' as const, value: answer, unit: 'ohm', tolerance: DEFAULT_TOLERANCE },
        options: [],
        misconceptionTraps: separatedTraps(answer, DEFAULT_TOLERANCE, [
          {
            misconception: 'rlc.critical-r-wrong-topology',
            value: other,
            tolerance: { rel: 0.02 },
            feedback:
              `That is the ${topology === 'parallel' ? 'series' : 'parallel'} result. Setting $\\alpha = \\omega_0$ gives ` +
              `$R = \\tfrac{1}{2}\\sqrt{L/C}$ in parallel and $R = 2\\sqrt{L/C}$ in series — a factor of four apart, ` +
              `and in opposite directions.`,
          },
          {
            misconception: 'rlc.critical-r-ratio-inverted',
            value: topology === 'parallel' ? 0.5 * Math.sqrt(c / l) : 2 * Math.sqrt(c / l),
            tolerance: { rel: 0.02 },
            feedback:
              `The ratio is upside down. $\\sqrt{L/C}$ has units of ohms; $\\sqrt{C/L}$ has units of siemens.`,
          },
        ]),
        explanation: {
          steps: [
            'Critical damping is exactly $\\alpha = \\omega_0$.',
            topology === 'parallel'
              ? `$\\dfrac{1}{2RC} = \\dfrac{1}{\\sqrt{LC}} \\Rightarrow R = \\dfrac{1}{2}\\sqrt{\\dfrac{L}{C}}$.`
              : `$\\dfrac{R}{2L} = \\dfrac{1}{\\sqrt{LC}} \\Rightarrow R = 2\\sqrt{\\dfrac{L}{C}}$.`,
            `$\\sqrt{L/C} = ${trimNumber(Math.sqrt(l / c), 4)}$, so $R = ${ohms(answer)}$.`,
          ],
          principle:
            'Critical damping is a single point, not a range: it is the one resistance at which the two characteristic roots coincide.',
          hints: ['Set alpha equal to omega-0 and solve for R.', 'Square-root of L over C already has units of ohms.'],
        },
      };
    }

    // Classification. Build each regime exactly rather than drawing and hoping.
    const want = pick(rng, ['overdamped', 'underdamped', 'critically damped'] as const);
    let p: RlcParams;
    if (want === 'critically damped') {
      const l = inductance(rng);
      const r = resistor(rng, { minDecade: 1, maxDecade: 3 });
      // Solve the critical condition for C so the equality is exact.
      const c = topology === 'parallel' ? l / (4 * r * r) : (4 * l) / (r * r);
      p = { r, l, c, topology };
    } else {
      p = drawForRegime(rng, topology, want);
    }

    const alpha = alphaOf(p);
    const omega0 = omega0Of(p);
    const labels = ['overdamped', 'underdamped', 'critically damped'] as const;
    const correctIndex = labels.indexOf(want);
    const ids = ['a', 'b', 'c'] as const;
    // Rotate which letter is correct so the position carries no information.
    const rotation = seed % 3;
    const order = labels.map((_, i) => labels[(i + rotation) % 3]!);

    return {
      type: 'multiple-choice' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        want === 'critically damped' ? 0.5 : -0.2,
        Math.abs(alpha - omega0) / omega0 < 0.3 ? 0.6 : -0.3,
      ]),
      stem: `${describe(p)}\n\nHow is the natural response damped?`,
      answer: { kind: 'choice' as const, correctId: ids[order.indexOf(labels[correctIndex]!)]! },
      options: order.map((label, i) => ({
        id: ids[i]!,
        text: label.charAt(0).toUpperCase() + label.slice(1),
        ...(label === want
          ? { rationale: `$\\alpha = ${radps(alpha)}$ and $\\omega_0 = ${radps(omega0)}$.` }
          : {
              misconception:
                label === 'critically damped'
                  ? 'rlc.critical-assumed-from-proximity'
                  : 'rlc.regime-comparison-inverted',
              rationale:
                label === 'critically damped'
                  ? 'Critical damping needs exact equality, not closeness.'
                  : 'Compare alpha against omega-0 again, and mind which way the inequality runs.',
            }),
      })),
      misconceptionTraps: [],
      explanation: {
        steps: [
          topology === 'parallel'
            ? `$\\alpha = \\dfrac{1}{2RC} = ${radps(alpha)}$.`
            : `$\\alpha = \\dfrac{R}{2L} = ${radps(alpha)}$.`,
          `$\\omega_0 = \\dfrac{1}{\\sqrt{LC}} = ${radps(omega0)}$.`,
          want === 'critically damped'
            ? `$\\alpha = \\omega_0$ exactly, so the response is **critically damped**: the roots are real and repeated.`
            : want === 'overdamped'
              ? `$\\alpha > \\omega_0$, so the response is **overdamped**: two distinct real roots and no oscillation.`
              : `$\\alpha < \\omega_0$, so the response is **underdamped**: complex conjugate roots and a decaying oscillation.`,
        ],
        principle:
          'The regime is decided by one comparison, and the comparison is between alpha and omega-0 — not between either of them and anything else in the circuit.',
        hints: [
          'Compute both frequencies before deciding anything.',
          'Overdamped means the damping wins: alpha larger.',
        ],
      },
    };
  },
};

/** The characteristic roots, and the damped frequency when they are complex. */
export const rlcCharacteristicRoots: Generator = {
  id: 'ee3300.secondorder.characteristic-roots',
  title: 'Characteristic roots and the damped frequency',
  kcRefs: [{ kc: 'ee3300.rlc-characteristic-roots', weight: 1 }],
  difficultyB: 0.2,
  generate(rng: Rng) {
    const topology = pick(rng, ['parallel', 'series'] as const);
    const want = pick(rng, ['overdamped', 'underdamped'] as const);
    const p = drawForRegime(rng, topology, want);
    const alpha = alphaOf(p);
    const omega0 = omega0Of(p);

    if (want === 'underdamped') {
      const wd = dampedFrequency(p);
      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [0.3, mantissaDifficulty(wd)]),
        stem: `${describe(p)}\n\nThe response is underdamped. What is the damped radian frequency $\\omega_d$, in rad/s?`,
        answer: { kind: 'numeric' as const, value: wd, unit: 'rad/s', tolerance: DEFAULT_TOLERANCE },
        options: [],
        misconceptionTraps: separatedTraps(wd, DEFAULT_TOLERANCE, [
          {
            misconception: 'rlc.damped-frequency-sign-flipped',
            value: omega0 - alpha,
            tolerance: { rel: 0.02 },
            feedback:
              `$\\omega_d$ is not $\\omega_0 - \\alpha$. It is $\\sqrt{\\omega_0^2 - \\alpha^2}$ — the two frequencies ` +
              `combine as the legs of a right triangle, not by subtraction.`,
          },
          {
            misconception: 'rlc.damped-frequency-uses-omega0',
            value: omega0,
            tolerance: { rel: 0.02 },
            feedback:
              `That is the undamped frequency. Damping always slows the oscillation, so $\\omega_d < \\omega_0$ ` +
              `whenever $\\alpha > 0$.`,
          },
        ]),
        explanation: {
          steps: [
            `$\\alpha = ${radps(alpha)}$ and $\\omega_0 = ${radps(omega0)}$, and $\\alpha < \\omega_0$ confirms underdamped.`,
            `$\\omega_d = \\sqrt{\\omega_0^2 - \\alpha^2} = \\sqrt{${trimNumber(omega0 * omega0, 4)} - ${trimNumber(alpha * alpha, 4)}}$.`,
            `$\\omega_d = ${radps(wd)}$, below $\\omega_0$ as damping requires.`,
          ],
          principle:
            'The roots are -alpha +/- j*omega-d. Alpha is how fast the envelope decays; omega-d is how fast it oscillates inside that envelope.',
          hints: ['Square both frequencies before subtracting.', 'Should the damped frequency be above or below omega-0?'],
        },
      };
    }

    const [s1, s2] = realRoots(p);
    const asked = pick(rng, ['s1', 's2'] as const);
    const answer = asked === 's1' ? s1 : s2;
    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [-0.2, mantissaDifficulty(Math.abs(answer))]),
      stem:
        `${describe(p)}\n\nThe response is overdamped, with characteristic roots $s_1 > s_2$ ` +
        `(so $s_1$ is the one closer to the origin).\n\n` +
        `What is $${asked === 's1' ? 's_1' : 's_2'}$, in rad/s? Give the signed value.`,
      answer: { kind: 'numeric' as const, value: answer, unit: 'rad/s', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(answer, DEFAULT_TOLERANCE, [
        {
          misconception: 'rlc.root-sign-dropped',
          value: -answer,
          tolerance: { rel: 0.02 },
          feedback:
            `Both roots of a passive $RLC$ circuit are negative — that is what makes the response decay. ` +
            `A positive root would describe a circuit whose energy grows without a source.`,
        },
        {
          misconception: 'rlc.root-discriminant-uses-omega0',
          value: -alpha + (asked === 's1' ? 1 : -1) * omega0,
          tolerance: { rel: 0.02 },
          feedback:
            `The square root is over $\\alpha^2 - \\omega_0^2$, not over $\\omega_0^2$ alone. ` +
            `Losing the $\\alpha^2$ term makes $s_1$ positive whenever $\\omega_0 > \\alpha$.`,
        },
      ]),
      explanation: {
        steps: [
          `$\\alpha = ${radps(alpha)}$, $\\omega_0 = ${radps(omega0)}$.`,
          `$s_{1,2} = -\\alpha \\pm \\sqrt{\\alpha^2 - \\omega_0^2} = ${trimNumber(-alpha, 4)} \\pm ${trimNumber(Math.sqrt(alpha * alpha - omega0 * omega0), 4)}$.`,
          `So $s_1 = ${radps(s1)}$ and $s_2 = ${radps(s2)}$.`,
          `The answer is $${radps(answer)}$.`,
        ],
        principle:
          'Overdamped roots are real, distinct and both negative; the response is the sum of two decaying exponentials with no oscillation at all.',
        hints: ['Take alpha squared minus omega-0 squared under the root.', 'Both roots must come out negative.'],
      },
    };
  },
};

/**
 * Fitting the coefficients to the initial conditions.
 *
 * This is where the chapter is actually hard, and the reason is that the second
 * condition is a derivative that has to be read off an element law rather than
 * off the response form.
 */
export const rlcNaturalResponse: Generator = {
  id: 'ee3300.secondorder.natural-coefficients',
  title: 'Natural response coefficients from initial conditions',
  kcRefs: [{ kc: 'ee3300.rlc-natural-response', weight: 1 }],
  difficultyB: 0.6,
  generate(rng: Rng) {
    const topology = pick(rng, ['parallel', 'series'] as const);
    const p = drawForRegime(rng, topology, 'overdamped');
    const [s1, s2] = realRoots(p);

    // Parallel: solve for v(t) with v(0) = V0 across the capacitor and I0 in
    // the inductor. Series: solve for i(t) with i(0) = I0 and V0 on the cap.
    const v0 = pick(rng, [2, 4, 5, 8, 10, 12, 15, 20, 24]);
    const i0Ma = pick(rng, [-40, -25, -20, -10, 10, 20, 25, 40]);
    const i0 = i0Ma / 1000;

    const x0 = topology === 'parallel' ? v0 : i0;
    const dx0 = topology === 'parallel'
      ? -(v0 / p.r + i0) / p.c
      : -(p.r * i0 + v0) / p.l;

    // x(t) = A1 e^{s1 t} + A2 e^{s2 t};  A1 + A2 = x0;  s1 A1 + s2 A2 = dx0.
    const a1 = (dx0 - s2 * x0) / (s1 - s2);
    const a2 = x0 - a1;
    const asked = pick(rng, ['a1', 'a2'] as const);
    const answer = asked === 'a1' ? a1 : a2;

    const symbol = topology === 'parallel' ? 'v' : 'i';
    const unit = topology === 'parallel' ? 'V' : 'A';

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        Math.abs(a1) > Math.abs(a2) * 4 || Math.abs(a2) > Math.abs(a1) * 4 ? 0.4 : -0.3,
        mantissaDifficulty(Math.abs(answer)),
      ]),
      stem:
        `${describe(p)} At $t = 0$ the capacitor holds $${volts(v0)}$ and the inductor carries ` +
        `$${trimNumber(i0Ma, 3)}\\,\\mathrm{{m}A}$.\n\n` +
        `The response is overdamped, so $${symbol}(t) = A_1e^{s_1t} + A_2e^{s_2t}$ for $t \\geq 0$ ` +
        `with $s_1 > s_2$.\n\n` +
        `What is $${asked === 'a1' ? 'A_1' : 'A_2'}$, in ${unit.toLowerCase() === 'v' ? 'volts' : 'amperes'}?`,
      answer: { kind: 'numeric' as const, value: answer, unit, tolerance: { rel: 0.03 } },
      options: [],
      misconceptionTraps: separatedTraps(answer, { rel: 0.03 }, [
        {
          misconception: 'rlc.coefficients-split-evenly',
          value: x0 / 2,
          tolerance: { rel: 0.03 },
          feedback:
            `Splitting the initial value in half uses only the first condition. Two unknowns need two equations: ` +
            `the second is $\\dfrac{d${symbol}}{dt}(0^+) = s_1A_1 + s_2A_2$.`,
        },
        {
          misconception: 'rlc.initial-derivative-ignored',
          value: x0,
          tolerance: { rel: 0.03 },
          feedback:
            `That is the whole initial value assigned to one term. It satisfies $A_1 + A_2 = ${trimNumber(x0, 4)}$ ` +
            `only if the other coefficient is zero, which the derivative condition does not allow here.`,
        },
        {
          misconception: 'rlc.roots-swapped-in-fit',
          value: (dx0 - s1 * x0) / (s2 - s1),
          tolerance: { rel: 0.03 },
          feedback:
            `The roots are the wrong way round. $A_1$ belongs to $s_1$, the root **closer to the origin** ` +
            `($s_1 = ${radps(s1)}$), which is the term that survives longest.`,
        },
      ]),
      explanation: {
        steps: [
          `$\\alpha = ${radps(alphaOf(p))}$, $\\omega_0 = ${radps(omega0Of(p))}$, so $s_1 = ${radps(s1)}$ and $s_2 = ${radps(s2)}$.`,
          topology === 'parallel'
            ? `$v(0^+) = ${volts(v0)}$ is the capacitor voltage, which cannot jump.`
            : `$i(0^+) = ${trimNumber(i0Ma, 3)}\\,\\mathrm{{m}A}$ is the inductor current, which cannot jump.`,
          topology === 'parallel'
            ? `KCL at $t = 0^+$ gives $C\\dfrac{dv}{dt} = -\\left(\\dfrac{V_0}{R} + I_0\\right)$, so ` +
              `$\\dfrac{dv}{dt}(0^+) = ${trimNumber(dx0, 4)}\\,\\mathrm{V/s}$.`
            : `KVL at $t = 0^+$ gives $L\\dfrac{di}{dt} = -(RI_0 + V_0)$, so ` +
              `$\\dfrac{di}{dt}(0^+) = ${trimNumber(dx0, 4)}\\,\\mathrm{A/s}$.`,
          `Solving $A_1 + A_2 = ${trimNumber(x0, 4)}$ with $s_1A_1 + s_2A_2 = ${trimNumber(dx0, 4)}$ ` +
            `gives $A_1 = ${trimNumber(a1, 4)}$ and $A_2 = ${trimNumber(a2, 4)}$.`,
        ],
        principle:
          'Two unknown coefficients need two independent conditions, and the second one is always a derivative obtained from an element law at t = 0+, never from the assumed response form.',
        hints: [
          'Which variable cannot change instantaneously in this topology?',
          'Write KCL (parallel) or KVL (series) at t = 0+ to get the derivative.',
        ],
      },
    };
  },
};

/** Step response: the same transient, displaced by a final value. */
export const rlcStepResponse: Generator = {
  id: 'ee3300.secondorder.step-response',
  title: 'Step response of a second-order circuit',
  kcRefs: [{ kc: 'ee3300.rlc-step-response', weight: 1 }],
  difficultyB: 0.8,
  generate(rng: Rng) {
    const topology = pick(rng, ['parallel', 'series'] as const);
    const p = drawForRegime(rng, topology, 'overdamped');
    const [s1, s2] = realRoots(p);

    // Parallel is driven by a current source and solved for the inductor
    // current; series is driven by a voltage source and solved for the
    // capacitor voltage. In both the final value is the whole source.
    const sourceMa = pick(rng, [10, 20, 25, 40, 50, 80, 100]);
    const sourceV = pick(rng, [5, 9, 12, 15, 18, 24]);
    const finalValue = topology === 'parallel' ? sourceMa / 1000 : sourceV;

    // Start from rest, which is the form the lectures summarise.
    const x0 = 0;
    const dx0 = 0;
    // x(t) = Xf + A1' e^{s1 t} + A2' e^{s2 t}
    const a1 = (dx0 - s2 * (x0 - finalValue)) / (s1 - s2);
    const a2 = (x0 - finalValue) - a1;

    const asked = pick(rng, ['final', 'a1'] as const);
    const answer = asked === 'final' ? finalValue : a1;
    const symbol = topology === 'parallel' ? 'i_L' : 'v_C';
    const unit = topology === 'parallel' ? 'A' : 'V';

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        asked === 'a1' ? 0.5 : -0.7,
        mantissaDifficulty(Math.abs(answer)),
      ]),
      stem:
        `${describe(p)} ` +
        (topology === 'parallel'
          ? `A $${trimNumber(sourceMa, 3)}\\,\\mathrm{{m}A}$ current source is applied at $t = 0$.`
          : `A $${volts(sourceV)}$ source is applied at $t = 0$.`) +
        ` There is no initial stored energy.\n\n` +
        `The response is overdamped, so $${symbol}(t) = X_f + A_1'e^{s_1t} + A_2'e^{s_2t}$ with $s_1 > s_2$.\n\n` +
        (asked === 'final'
          ? `What is the final value $X_f$, in ${unit === 'A' ? 'amperes' : 'volts'}?`
          : `What is $A_1'$, in ${unit === 'A' ? 'amperes' : 'volts'}?`),
      answer: { kind: 'numeric' as const, value: answer, unit, tolerance: { rel: 0.03 } },
      options: [],
      misconceptionTraps: separatedTraps(answer, { rel: 0.03 }, [
        ...(asked === 'final'
          ? [{
              misconception: 'rlc.final-value-divided-by-r',
              value: topology === 'parallel' ? sourceMa / 1000 / p.r : sourceV / p.r,
              tolerance: { rel: 0.03 },
              feedback:
                topology === 'parallel'
                  ? `As $t \\to \\infty$ the inductor is a short, so **all** the source current ends up in it and none in $R$.`
                  : `As $t \\to \\infty$ the capacitor is open, so no current flows and there is no drop across $R$: ` +
                    `the capacitor sits at the full source voltage.`,
            }]
          : [{
              misconception: 'rlc.step-final-value-not-subtracted',
              value: (dx0 - s2 * x0) / (s1 - s2),
              tolerance: { rel: 0.03 },
              feedback:
                `The primed coefficients fit the **transient part only**. Subtract $X_f = ${trimNumber(finalValue, 4)}$ ` +
                `from the initial value before solving, or the fit describes a circuit that starts at the wrong place.`,
            }, {
              misconception: 'rlc.roots-swapped-in-fit',
              value: (dx0 - s1 * (x0 - finalValue)) / (s2 - s1),
              tolerance: { rel: 0.03 },
              feedback:
                `The roots are swapped. $A_1'$ pairs with $s_1 = ${radps(s1)}$.`,
            }]),
      ]),
      explanation: {
        steps: [
          `$s_1 = ${radps(s1)}$ and $s_2 = ${radps(s2)}$ from $\\alpha = ${radps(alphaOf(p))}$ and $\\omega_0 = ${radps(omega0Of(p))}$.`,
          topology === 'parallel'
            ? `As $t \\to \\infty$ the inductor becomes a short circuit, so $X_f = ${trimNumber(finalValue * 1000, 3)}\\,\\mathrm{{m}A}$ — the entire source current.`
            : `As $t \\to \\infty$ the capacitor becomes an open circuit, so no current flows and $X_f = ${volts(finalValue)}$ — the entire source voltage.`,
          asked === 'final'
            ? `The answer is $X_f = ${trimNumber(answer, 4)}$.`
            : `With no initial energy, $X_f + A_1' + A_2' = 0$ and $s_1A_1' + s_2A_2' = 0$, ` +
              `giving $A_1' = ${trimNumber(a1, 4)}$ and $A_2' = ${trimNumber(a2, 4)}$.`,
        ],
        principle:
          'A step response is the natural response plus a constant. The constant is found from the circuit at t = infinity, and the coefficients are fitted to what is left after removing it.',
        hints: [
          'At t = infinity an inductor is a short and a capacitor is an open.',
          'Fit the coefficients to x(t) - Xf, not to x(t).',
        ],
      },
    };
  },
};

/** Nilsson chapter 8, in the order the analysis method is applied. */
export const EE3300_SECONDORDER_GENERATORS: readonly Generator[] = [
  rlcDampingParameters,
  rlcDampingClassification,
  rlcCharacteristicRoots,
  rlcNaturalResponse,
  rlcStepResponse,
];
