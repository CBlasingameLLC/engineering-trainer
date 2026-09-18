import type { Generator } from '../types.js';
import { DEFAULT_TOLERANCE } from '../types.js';
import {
  adjustDifficulty, amps, capacitance, distinctResistorPair, inductance, mantissaDifficulty, ohms,
  pick, ratioDifficulty, resistor, seconds, supplyVoltage, trimNumber, volts, type Rng,
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

/**
 * Time constant from the resistance the storage element actually sees.
 *
 * Reading R off the schematic without reducing it is the failure this exists to
 * catch, so the single-resistor and series-sum answers are both trapped.
 */
export const naturalResponseTau: Generator = {
  id: 'ee2300.first-order-natural.time-constant',
  title: 'Natural response time constant',
  kcRefs: [
    { kc: 'ee2300.first-order-natural', weight: 0.8 },
    { kc: 'ee2300.thevenin', weight: 0.2 },
  ],
  difficultyB: 0.45,
  generate(rng: Rng) {
    const c = capacitance(rng);
    const [r1, r2] = distinctResistorPair(rng, { minRatio: 1.6, minDecade: 3, maxDecade: 4 });
    const rEq = (r1 * r2) / (r1 + r2);
    const tau = rEq * c;
    const v0 = supplyVoltage(rng);
    // Asking at a whole number of time constants makes the exponent exactly
    // -n, so the answer is independent of the resistances and the item tests
    // whether the learner found the right equivalent R rather than their
    // calculator work.
    const decades = pick(rng, [1, 2, 3]);
    const vt = v0 * Math.exp(-decades);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        ratioDifficulty(r1, r2),
        decades === 1 ? -1 : 0.5,
      ]),
      stem:
        `A capacitor $C = ${trimNumber(c * 1e9)}\\,\\text{nF}$ is charged to ${volts(v0)} and then discharges ` +
        `through $R_1 = ${ohms(r1)}$ **in parallel with** $R_2 = ${ohms(r2)}$, with no source connected. ` +
        `Find the capacitor voltage after $t = ${trimNumber(decades)}\\tau$.`,
      answer: { kind: 'numeric' as const, value: vt, unit: 'V', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(vt, DEFAULT_TOLERANCE, [
        {
          misconception: 'transient.wrong-equivalent-resistance',
          value: v0 * Math.exp(-(decades * rEq * c) / (r1 * c)),
          tolerance: { rel: 0.015 },
          feedback:
            `You used $R_1$ alone. The capacitor discharges through **everything** connected across it, so ` +
            `$\\tau = (R_1 \\| R_2) C$, not $R_1 C$.`,
        },
        {
          misconception: 'transient.resistances-added',
          value: v0 * Math.exp(-(decades * rEq * c) / ((r1 + r2) * c)),
          tolerance: { rel: 0.015 },
          feedback:
            `You added the resistances. Both sit **across** the capacitor, sharing its voltage, so they are in ` +
            `parallel — which makes the equivalent resistance smaller than either, and the decay faster.`,
        },
      ]),
      explanation: {
        steps: [
          `The time constant uses the resistance the capacitor actually sees, which here is the parallel pair:`,
          `$R_{eq} = \\dfrac{R_1 R_2}{R_1 + R_2} = ${ohms(rEq)}$, so $\\tau = R_{eq} C = ${seconds(tau)}$.`,
          `Source-free decay is $v(t) = V_0 e^{-t/\\tau}$, and at $t = ${trimNumber(decades)}\\tau$ the exponent is simply $-${trimNumber(decades)}$:`,
          `$v = ${trimNumber(v0)} \\, e^{-${trimNumber(decades)}} = ${volts(vt)}$.`,
          `Worth memorising: one time constant leaves about 37% of the initial value, three leaves about 5%.`,
        ],
        principle:
          'The time constant is set by the Thevenin resistance seen from the storage element, not by whichever resistor is drawn nearest it.',
        hints: [
          'What resistance does the capacitor actually discharge through?',
          'Are $R_1$ and $R_2$ in series or parallel from the capacitor\'s point of view?',
        ],
      },
    };
  },
};

/**
 * Inductor i-v relationship and stored energy.
 *
 * Two errors dominate and are trapped separately: using v = Li instead of the
 * derivative, and dropping the one-half from the energy expression.
 */
export const inductorBehaviour: Generator = {
  id: 'ee2300.inductor-iv.relationship',
  title: 'Inductor voltage and stored energy',
  kcRefs: [{ kc: 'ee2300.inductor-iv', weight: 1 }],
  difficultyB: 0.15,
  generate(rng: Rng) {
    const l = inductance(rng);
    const askEnergy = rng() < 0.5;

    if (askEnergy) {
      const i = pick(rng, [0.1, 0.2, 0.25, 0.4, 0.5, 0.8, 1, 1.5]);
      const energy = 0.5 * l * i * i;
      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [mantissaDifficulty(i), 0.3]),
        stem:
          `An inductor $L = ${trimNumber(l * 1e3)}\\,\\text{mH}$ carries a steady current of ${amps(i)}. ` +
          `Find the energy stored in its magnetic field.`,
        answer: { kind: 'numeric' as const, value: energy, unit: 'J', tolerance: DEFAULT_TOLERANCE },
        options: [],
        misconceptionTraps: separatedTraps(energy, DEFAULT_TOLERANCE, [
          {
            misconception: 'energy.half-dropped',
            value: l * i * i,
            tolerance: { rel: 0.015 },
            feedback: `You dropped the one-half. Stored energy is $w = \\tfrac{1}{2} L i^2$.`,
          },
          {
            misconception: 'energy.not-squared',
            value: 0.5 * l * i,
            tolerance: { rel: 0.015 },
            feedback: `The current is **squared**: $w = \\tfrac{1}{2} L i^2$, not $\\tfrac{1}{2} L i$.`,
          },
        ]),
        explanation: {
          steps: [
            `An inductor stores energy in its magnetic field as $w = \\tfrac{1}{2} L i^2$.`,
            `$w = \\tfrac{1}{2}(${trimNumber(l)})(${trimNumber(i)})^2 = ${trimNumber(energy, 4)}\\,\\text{J}$.`,
            `The current is squared, so doubling it quadruples the stored energy — which is why inductor current cannot change instantaneously.`,
          ],
          principle:
            'Stored energy goes as the square of current, which is why inductor current is the continuous state variable.',
          hints: ['Which quantity is squared?', 'Is there a factor of one-half?'],
        },
      };
    }

    const diMa = pick(rng, [50, 100, 200, 250, 400, 500]);
    const dtMs = pick(rng, [1, 2, 5, 10, 20]);
    const didt = diMa / 1000 / (dtMs / 1000);
    const v = l * didt;
    const iFinal = diMa / 1000;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [mantissaDifficulty(dtMs), -0.3]),
      stem:
        `The current through an inductor $L = ${trimNumber(l * 1e3)}\\,\\text{mH}$ ramps linearly from 0 to ` +
        `${amps(iFinal)} over ${trimNumber(dtMs)} ms. Find the voltage across it during the ramp.`,
      answer: { kind: 'numeric' as const, value: v, unit: 'V', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(v, DEFAULT_TOLERANCE, [
        {
          misconception: 'inductor.ohmic-treatment',
          value: l * iFinal,
          tolerance: { rel: 0.015 },
          feedback:
            `You used $v = Li$, treating the inductor like a resistor. An inductor responds to the **rate of ` +
            `change**: $v = L\\,di/dt$. A steady current produces no voltage at all.`,
        },
      ]),
      explanation: {
        steps: [
          `An inductor opposes changes in current: $v = L \\dfrac{di}{dt}$.`,
          `The ramp is linear, so the slope is constant: $\\dfrac{di}{dt} = \\dfrac{${trimNumber(iFinal)}}{${trimNumber(dtMs / 1000)}} = ${trimNumber(didt, 4)}$ A/s.`,
          `$v = (${trimNumber(l)})(${trimNumber(didt, 4)}) = ${volts(v)}$, constant for the whole ramp.`,
          `Once the current settles, $di/dt = 0$ and the voltage collapses to zero — an inductor looks like a short circuit to DC.`,
        ],
        principle:
          'An inductor responds to the rate of change of current, not its value, which is the mirror image of a capacitor responding to the rate of change of voltage.',
        hints: ['What is the slope of the current ramp?', 'Does an inductor respond to current, or to how fast it changes?'],
      },
    };
  },
};
