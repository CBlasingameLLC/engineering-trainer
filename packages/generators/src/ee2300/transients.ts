import type { Generator } from '../types.js';
import { DEFAULT_TOLERANCE } from '../types.js';
import {
  adjustDifficulty, capacitance, inductance, mantissaDifficulty, ohms, pick, resistor, seconds,
  supplyVoltage, trimNumber, volts, type Rng,
} from '../rng.js';
import { separatedTraps } from '../traps.js';

/**
 * First-order step response.
 *
 * Asks for the value at a specific instant rather than for tau, because the
 * general solution x(t) = x_inf + (x_0 - x_inf)e^{-t/tau} is where students
 * actually break: they memorise the decay form and cannot assemble the version
 * that rises toward a non-zero final value.
 */
export const rcStepResponse: Generator = {
  id: 'ee2300.first-order-step.capacitor',
  title: 'RC step response',
  kcRefs: [
    { kc: 'ee2300.first-order-step', weight: 0.7 },
    { kc: 'ee2300.capacitor-iv', weight: 0.3 },
  ],
  difficultyB: 0.8,
  generate(rng: Rng) {
    const r = resistor(rng, { minDecade: 3, maxDecade: 4 });
    const c = capacitance(rng);
    const vFinal = supplyVoltage(rng);
    const v0 = pick(rng, [0, 0, 1, 2]); // usually uncharged, sometimes not
    const tau = r * c;
    const tMultiple = pick(rng, [0.5, 1, 1.5, 2, 3]);
    const t = tMultiple * tau;

    const vt = vFinal + (v0 - vFinal) * Math.exp(-t / tau);
    // Treating it as a pure decay from the final value ignores the initial condition.
    const decayOnly = vFinal * Math.exp(-t / tau);
    // Using the complement without the initial term.
    const noInitial = vFinal * (1 - Math.exp(-t / tau));
    // t = 1*tau is easiest because e^-1 is memorised; a non-zero starting
    // voltage is the step that most students omit entirely.
    const difficultyB = adjustDifficulty(this.difficultyB, [
      tMultiple === 1 ? -1 : tMultiple === 0.5 || tMultiple === 1.5 ? 1 : 0,
      v0 === 0 ? -1 : 1,
    ]);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB,
      stem:
        `A capacitor $C = ${trimNumber(c * 1e9)}\\,\\text{nF}$ charges through $R = ${ohms(r)}$ toward ` +
        `${volts(vFinal)}. Its initial voltage is ${volts(v0)}. ` +
        `Find the capacitor voltage at $t = ${trimNumber(tMultiple)}\\tau$.`,
      answer: { kind: 'numeric' as const, value: vt, unit: 'V', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(vt, DEFAULT_TOLERANCE, [
        {
          misconception: 'transient.decay-form-misapplied',
          value: decayOnly,
          tolerance: { rel: 0.015 },
          feedback:
            `You used the pure decay form $V_f e^{-t/\\tau}$, which describes a capacitor discharging **to zero**. ` +
            `This one is charging **toward** ${volts(vFinal)}, so the exponential must decay the *difference*.`,
        },
        ...(v0 !== 0
          ? [
              {
                misconception: 'transient.initial-condition-ignored',
                value: noInitial,
                tolerance: { rel: 0.015 },
                feedback:
                  `You assumed the capacitor started at 0 V. It starts at ${volts(v0)}, and that initial ` +
                  `condition enters through the $(x_0 - x_\\infty)$ term.`,
              },
            ]
          : []),
      ]),
      explanation: {
        steps: [
          `Every first-order response has the same shape: $x(t) = x_\\infty + (x_0 - x_\\infty)e^{-t/\\tau}$.`,
          `Identify the three pieces: $x_0 = ${trimNumber(v0)}$ V, $x_\\infty = ${trimNumber(vFinal)}$ V, and $\\tau = RC = (${trimNumber(r)})(${trimNumber(c)}) = ${seconds(tau)}$.`,
          `At $t = ${trimNumber(tMultiple)}\\tau$ the exponential is $e^{-${trimNumber(tMultiple)}} = ${trimNumber(Math.exp(-tMultiple), 4)}$.`,
          `$v(t) = ${trimNumber(vFinal)} + (${trimNumber(v0)} - ${trimNumber(vFinal)})(${trimNumber(Math.exp(-tMultiple), 4)}) = ${volts(vt)}$.`,
        ],
        principle:
          'One formula covers every first-order transient; the work is identifying the initial value, the final value and the time constant.',
        hints: [
          'Write the general form before substituting any numbers.',
          'What value is the capacitor heading toward, and what did it start from?',
        ],
      },
    };
  },
};

/**
 * Damping classification for a series RLC.
 *
 * Multiple choice on purpose: the discrimination is conceptual — comparing
 * alpha to omega_0 — and a numeric answer would let a student who computed both
 * correctly still fail on arithmetic that is not the point of the item.
 */
export const rlcDamping: Generator = {
  id: 'ee2300.second-order-rlc.classify',
  title: 'RLC damping classification',
  kcRefs: [{ kc: 'ee2300.second-order-rlc', weight: 1 }],
  difficultyB: 1.2,
  generate(rng: Rng) {
    const l = inductance(rng);
    const c = capacitance(rng);
    const omega0 = 1 / Math.sqrt(l * c);

    // Choose R to land deliberately in one regime rather than by accident.
    const regime = pick(rng, ['over', 'under', 'critical'] as const);
    const rCritical = 2 * l * omega0;
    const r =
      regime === 'critical'
        ? rCritical
        : regime === 'over'
          ? rCritical * pick(rng, [1.8, 2.5, 4])
          : rCritical * pick(rng, [0.15, 0.3, 0.5]);

    const alpha = r / (2 * l);
    const correctId = regime === 'over' ? 'a' : regime === 'critical' ? 'b' : 'c';
    // The closer alpha sits to omega_0, the less the classification can be
    // judged by inspection and the more it demands an actual comparison.
    const separation = Math.abs(Math.log10(alpha / omega0));
    const difficultyB = adjustDifficulty(this.difficultyB, [
      Math.min(1, Math.max(-1, 1 - separation * 3)),
      mantissaDifficulty(r),
    ]);

    return {
      type: 'multiple-choice' as const,
      kcRefs: this.kcRefs,
      difficultyB,
      stem:
        `A **series** RLC circuit has $R = ${ohms(r)}$, $L = ${trimNumber(l * 1e3)}\\,\\text{mH}$ and ` +
        `$C = ${trimNumber(c * 1e9)}\\,\\text{nF}$. Classify its natural response.`,
      answer: { kind: 'choice' as const, correctId },
      options: [
        { id: 'a', text: 'Overdamped', ...(correctId === 'a' ? {} : { misconception: 'rlc.regime-misclassified', rationale: `Overdamped requires $\\alpha > \\omega_0$. Here $\\alpha = ${trimNumber(alpha, 4)}$ and $\\omega_0 = ${trimNumber(omega0, 4)}$.` }) },
        { id: 'b', text: 'Critically damped', ...(correctId === 'b' ? {} : { misconception: 'rlc.regime-misclassified', rationale: `Critical damping needs $\\alpha = \\omega_0$ exactly. Here $\\alpha = ${trimNumber(alpha, 4)}$ and $\\omega_0 = ${trimNumber(omega0, 4)}$.` }) },
        { id: 'c', text: 'Underdamped', ...(correctId === 'c' ? {} : { misconception: 'rlc.regime-misclassified', rationale: `Underdamped requires $\\alpha < \\omega_0$. Here $\\alpha = ${trimNumber(alpha, 4)}$ and $\\omega_0 = ${trimNumber(omega0, 4)}$.` }) },
        { id: 'd', text: 'Undamped (lossless)', misconception: 'rlc.resistance-ignored', rationale: 'A lossless response needs $R = 0$. Any non-zero resistance dissipates energy and damps the response.' },
      ],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `For a **series** RLC, the damping coefficient is $\\alpha = \\dfrac{R}{2L}$ and the resonant frequency is $\\omega_0 = \\dfrac{1}{\\sqrt{LC}}$.`,
          `$\\alpha = \\dfrac{${trimNumber(r)}}{2(${trimNumber(l)})} = ${trimNumber(alpha, 4)}$ rad/s.`,
          `$\\omega_0 = \\dfrac{1}{\\sqrt{(${trimNumber(l)})(${trimNumber(c)})}} = ${trimNumber(omega0, 4)}$ rad/s.`,
          `Since $\\alpha ${regime === 'over' ? '>' : regime === 'critical' ? '=' : '<'} \\omega_0$, the response is **${regime === 'over' ? 'overdamped' : regime === 'critical' ? 'critically damped' : 'underdamped'}**.`,
          `Note the series form: for a **parallel** RLC, $\\alpha = \\dfrac{1}{2RC}$ instead, and larger $R$ moves the circuit the opposite way.`,
        ],
        principle:
          'Damping is the comparison of alpha to omega_0; only the expression for alpha differs between the series and parallel topologies.',
        hints: [
          'Compute $\\alpha$ and $\\omega_0$ separately, then compare them.',
          'Is this the series or the parallel form of $\\alpha$?',
        ],
      },
    };
  },
};
