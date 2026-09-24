import type { Generator } from '../types.js';
import {
  adjustDifficulty, mantissaDifficulty, pick, resampleUntil, trimNumber, volts, type Rng,
} from '../rng.js';
import { separatedTraps } from '../traps.js';

/**
 * Chapters 9 and 10 where the existing bank was thinnest, judged against the
 * lecture decks rather than against the chapter headings.
 *
 * The phasor knowledge component had eighteen items and all of them in the two
 * easiest bands, which is a coverage number that looks healthy and measures
 * nothing above the floor; rms had eleven; and the power triangle, which
 * lecture 6 names as an objective in its own right, had no generator at all.
 */

const degrees = (value: number): string => `${trimNumber(value, 4)}^{\\circ}`;

/**
 * The power triangle: P, Q, |S| and the power factor are four views of one
 * complex number, and the exam moves between them in both directions.
 */
export const powerTriangle: Generator = {
  id: 'ee3300.power.triangle',
  title: 'The power triangle',
  kcRefs: [{ kc: 'ee3300.complex-power', weight: 1 }],
  difficultyB: 0.3,
  generate(rng: Rng) {
    const apparent = pick(rng, [250, 400, 500, 600, 750, 1000, 1200, 1500]);
    const pf = pick(rng, [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]);
    const sense = pick(rng, ['lagging', 'leading'] as const);
    const asked = pick(rng, ['reactive', 'real', 'angle'] as const);

    const real = apparent * pf;
    const angle = Math.acos(pf) * (sense === 'lagging' ? 1 : -1);
    const reactive = apparent * Math.sin(angle);

    const answer = asked === 'reactive' ? reactive : asked === 'real' ? real : (angle * 180) / Math.PI;
    const unit = asked === 'reactive' ? 'VAR' : asked === 'real' ? 'W' : 'deg';

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        asked === 'real' ? -0.6 : asked === 'reactive' ? 0.3 : 0.1,
        sense === 'leading' ? 0.4 : -0.2,
      ]),
      stem:
        `A load draws an apparent power of $${trimNumber(apparent, 4)}\\,\\mathrm{VA}$ at a power factor of ` +
        `$${trimNumber(pf, 3)}$ ${sense}.\n\n` +
        (asked === 'reactive'
          ? 'What is the reactive power $Q$, in VAR? (Give the signed value.)'
          : asked === 'real'
            ? 'What is the average (real) power $P$, in watts?'
            : 'What is the power factor angle $\\theta$, in degrees? (Give the signed value.)'),
      answer: { kind: 'numeric' as const, value: answer, unit, tolerance: { rel: 0.02 } },
      options: [],
      misconceptionTraps: separatedTraps(answer, { rel: 0.02 }, [
        ...(asked === 'reactive' || asked === 'angle'
          ? [{
              misconception: 'power-factor.sense-sign-reversed',
              value: -answer,
              tolerance: { rel: 0.02 },
              feedback:
                `The sense sets the sign. A **lagging** power factor is an inductive load, where the current ` +
                `lags and $Q$ is positive; **leading** is capacitive and $Q$ is negative. This load is ${sense}.`,
            }]
          : []),
        ...(asked === 'reactive'
          ? [{
              misconception: 'power.apparent-taken-as-real',
              value: real,
              tolerance: { rel: 0.02 },
              feedback:
                `That is $P$, the real power. $Q = |S|\\sin\\theta$, and it is the other leg of the triangle.`,
            }]
          : []),
        ...(asked === 'real'
          ? [{
              misconception: 'power-factor.apparent-used-for-real',
              value: apparent,
              tolerance: { rel: 0.02 },
              feedback:
                `Apparent power is the hypotenuse. Only $|S|\\cos\\theta$ is actually converted; the rest ` +
                `shuttles back and forth without doing work.`,
            }, {
              misconception: 'power.sine-used-for-power-factor',
              value: apparent * Math.abs(Math.sin(angle)),
              tolerance: { rel: 0.02 },
              feedback:
                `The power factor is $\\cos\\theta$, so the real power is the **adjacent** leg. Using the sine ` +
                `gives the reactive power instead.`,
            }]
          : []),
      ]),
      explanation: {
        steps: [
          `The power factor is $\\cos\\theta$, so $\\theta = \\pm\\arccos(${trimNumber(pf, 3)}) = ${degrees((angle * 180) / Math.PI)}$, ` +
            `taken ${sense === 'lagging' ? 'positive because the factor is lagging' : 'negative because the factor is leading'}.`,
          `$P = |S|\\cos\\theta = ${trimNumber(apparent, 4)} \\times ${trimNumber(pf, 3)} = ${trimNumber(real, 4)}\\,\\mathrm{W}$.`,
          `$Q = |S|\\sin\\theta = ${trimNumber(reactive, 4)}\\,\\mathrm{VAR}$.`,
          asked === 'angle'
            ? `The angle asked for is $\\theta = ${degrees((angle * 180) / Math.PI)}$.`
            : asked === 'real'
              ? `The answer is $P = ${trimNumber(real, 4)}\\,\\mathrm{W}$.`
              : `The answer is $Q = ${trimNumber(reactive, 4)}\\,\\mathrm{VAR}$.`,
        ],
        principle:
          'P, Q and |S| are the two legs and the hypotenuse of one right triangle, and the power factor is the cosine of its angle. The sense of the power factor is not decoration — it is the sign of Q.',
        hints: [
          'Draw the triangle: P along the real axis, Q vertical, |S| the hypotenuse.',
          'Lagging means inductive, which means positive Q.',
        ],
      },
    };
  },
};

/**
 * The inverse phasor transform, which is where the degree-radian collision
 * lives: the phase is stated in degrees and the argument of the cosine is in
 * radians, and a calculator in the wrong mode produces a plausible number.
 */
export const inversePhasorTransform: Generator = {
  id: 'ee3300.phasors.inverse-transform',
  title: 'Inverse phasor transform',
  kcRefs: [{ kc: 'ee3300.sinusoids-phasors', weight: 1 }],
  difficultyB: 0.4,
  generate(rng: Rng) {
    const amplitude = pick(rng, [4, 5, 8, 10, 12, 15, 20, 24, 30]);
    const phaseDeg = pick(rng, [-120, -90, -60, -45, -30, 30, 45, 60, 90, 120]);
    const frequency = pick(rng, [50, 60, 100, 120, 400, 1000]);
    const omega = 2 * Math.PI * frequency;
    // Evaluate at a submultiple of the period so the instant is meaningful.
    const fraction = pick(rng, [1 / 8, 1 / 6, 1 / 4, 1 / 3, 1 / 2]);
    const t = fraction / frequency;

    const phaseRad = (phaseDeg * Math.PI) / 180;
    const answer = amplitude * Math.cos(omega * t + phaseRad);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        Math.abs(answer) < amplitude * 0.25 ? 0.5 : -0.2,
        mantissaDifficulty(Math.abs(answer) || 1),
      ]),
      stem:
        `A voltage has the phasor $\\mathbf{V} = ${trimNumber(amplitude, 4)}\\angle ${degrees(phaseDeg)}\\,\\mathrm{V}$ ` +
        `at a frequency of $${trimNumber(frequency, 4)}\\,\\mathrm{Hz}$, written on the cosine convention with ` +
        `the phasor magnitude as the amplitude.\n\n` +
        `What is $v(t)$ at $t = ${trimNumber(t * 1000, 4)}\\,\\mathrm{{m}s}$, in volts?`,
      answer: { kind: 'numeric' as const, value: answer, unit: 'V', tolerance: { abs: Math.max(0.05, amplitude * 0.02) } },
      options: [],
      misconceptionTraps: separatedTraps(answer, { abs: Math.max(0.05, amplitude * 0.02) }, [
        {
          misconception: 'phase.degrees-for-radians',
          value: amplitude * Math.cos(omega * t + phaseDeg),
          tolerance: { abs: Math.max(0.05, amplitude * 0.02) },
          feedback:
            `The phase is given in degrees but $\\omega t$ is in radians, so the two cannot be added until they ` +
            `agree. $${trimNumber(phaseDeg, 4)}^{\\circ}$ is $${trimNumber(phaseRad, 4)}\\,\\mathrm{rad}$.`,
        },
        {
          misconception: 'phasor.sine-not-converted',
          value: amplitude * Math.sin(omega * t + phaseRad),
          tolerance: { abs: Math.max(0.05, amplitude * 0.02) },
          feedback:
            `The phasor transform here is defined against a **cosine**. Reading it back as a sine shifts the ` +
            `whole waveform by ninety degrees.`,
        },
        {
          misconception: 'phasor.magnitude-without-phase',
          value: amplitude * Math.cos(omega * t),
          tolerance: { abs: Math.max(0.05, amplitude * 0.02) },
          feedback:
            `The phase angle is part of the answer, not a label on it. Dropping it evaluates a different ` +
            `waveform that happens to have the same amplitude.`,
        },
      ]),
      explanation: {
        steps: [
          `$v(t) = ${trimNumber(amplitude, 4)}\\cos(\\omega t + ${degrees(phaseDeg)})$ with ` +
            `$\\omega = 2\\pi(${trimNumber(frequency, 4)}) = ${trimNumber(omega, 5)}\\,\\mathrm{rad/s}$.`,
          `Convert the phase: $${trimNumber(phaseDeg, 4)}^{\\circ} = ${trimNumber(phaseRad, 4)}\\,\\mathrm{rad}$.`,
          `$\\omega t = ${trimNumber(omega * t, 4)}\\,\\mathrm{rad}$, so the argument is ` +
            `$${trimNumber(omega * t + phaseRad, 4)}\\,\\mathrm{rad}$.`,
          `$v = ${trimNumber(amplitude, 4)}\\cos(${trimNumber(omega * t + phaseRad, 4)}) = ${volts(answer)}$.`,
        ],
        principle:
          'The phasor holds amplitude and phase; the frequency is carried separately and has to be put back by hand. Degrees and radians must be reconciled before anything is added.',
        hints: [
          'Write the time function first, then substitute.',
          'Are the two terms inside the cosine in the same units?',
        ],
      },
    };
  },
};

/**
 * RMS for shapes that are not sinusoids.
 *
 * The peak-over-root-two factor is a property of the sine, not of rms, and the
 * bank had no item that could tell a learner who believes otherwise apart from
 * one who does not.
 */
export const rmsOfWaveform: Generator = {
  id: 'ee3300.power.rms-waveforms',
  title: 'RMS value of a non-sinusoidal waveform',
  kcRefs: [{ kc: 'ee3300.rms-values', weight: 1 }],
  difficultyB: 0.3,
  generate(rng: Rng) {
    const shape = pick(rng, ['sine', 'square', 'triangle', 'sawtooth', 'offset-sine'] as const);
    const amplitude = pick(rng, [2, 4, 5, 6, 8, 10, 12, 15, 20, 24]);
    const offset = shape === 'offset-sine'
      ? resampleUntil(rng, (r) => pick(r, [2, 3, 5, 6, 8, 10]), (v) => v !== amplitude)
      : 0;

    const factors: Record<typeof shape, number> = {
      sine: Math.SQRT1_2,
      square: 1,
      triangle: 1 / Math.sqrt(3),
      sawtooth: 1 / Math.sqrt(3),
      'offset-sine': 0,
    };
    const answer = shape === 'offset-sine'
      ? Math.sqrt(offset * offset + (amplitude * amplitude) / 2)
      : amplitude * factors[shape];

    const description: Record<typeof shape, string> = {
      sine: `a sinusoid of amplitude $${volts(amplitude)}$`,
      square: `a symmetric square wave alternating between $+${volts(amplitude)}$ and $-${volts(amplitude)}$`,
      triangle: `a symmetric triangular wave of peak value $${volts(amplitude)}$`,
      sawtooth: `a sawtooth ramping linearly from $-${volts(amplitude)}$ to $+${volts(amplitude)}$ each period`,
      'offset-sine': `a sinusoid of amplitude $${volts(amplitude)}$ riding on a $${volts(offset)}$ DC offset`,
    };

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        shape === 'sine' ? -0.8 : shape === 'square' ? -0.4 : shape === 'offset-sine' ? 0.7 : 0.2,
        mantissaDifficulty(answer),
      ]),
      stem: `A periodic voltage is ${description[shape]}.\n\nWhat is its rms value, in volts?`,
      answer: { kind: 'numeric' as const, value: answer, unit: 'V', tolerance: { rel: 0.02 } },
      options: [],
      misconceptionTraps: separatedTraps(answer, { rel: 0.02 }, [
        {
          misconception: 'rms.sine-factor-applied-to-every-shape',
          value: shape === 'offset-sine' ? (amplitude + offset) * Math.SQRT1_2 : amplitude * Math.SQRT1_2,
          tolerance: { rel: 0.02 },
          feedback:
            `Dividing the peak by $\\sqrt{2}$ is a fact about **sinusoids**, not a definition of rms. The ` +
            `definition is the square root of the mean square, and each waveform spends a different fraction ` +
            `of its period near its peak.`,
        },
        {
          misconception: 'rms.peak-reported',
          value: shape === 'offset-sine' ? amplitude + offset : amplitude,
          tolerance: { rel: 0.02 },
          feedback:
            `That is the peak value. The rms value is the constant that would dissipate the same average ` +
            `power in a resistor, which is strictly less than the peak for anything that is not a square wave.`,
        },
        ...(shape === 'offset-sine'
          ? [{
              misconception: 'rms.offset-added-linearly',
              value: offset + amplitude * Math.SQRT1_2,
              tolerance: { rel: 0.02 },
              feedback:
                `Mean squares add, not rms values. $V_{\\mathrm{rms}} = \\sqrt{V_{\\mathrm{dc}}^{2} + V_m^{2}/2}$ ` +
                `— the DC and the sinusoid contribute their powers, and power is what adds.`,
            }]
          : []),
      ]),
      explanation: {
        steps: [
          `RMS is $\\sqrt{\\frac{1}{T}\\int_0^{T} v^{2}\\,dt}$ — a property of the whole waveform's square, not of its peak.`,
          shape === 'sine'
            ? `For a sinusoid the mean of $\\cos^{2}$ is $\\tfrac12$, so $V_{\\mathrm{rms}} = V_m/\\sqrt{2}$.`
            : shape === 'square'
              ? `A symmetric square wave is at $\\pm V_m$ for the whole period, so its mean square is $V_m^{2}$ and ` +
                `$V_{\\mathrm{rms}} = V_m$ exactly.`
              : shape === 'offset-sine'
                ? `The DC and the sinusoid contribute independently: $V_{\\mathrm{rms}} = \\sqrt{V_{\\mathrm{dc}}^{2} + V_m^{2}/2}$.`
                : `A linear ramp between $\\pm V_m$ has mean square $V_m^{2}/3$, so $V_{\\mathrm{rms}} = V_m/\\sqrt{3}$.`,
          `$V_{\\mathrm{rms}} = ${volts(answer)}$.`,
        ],
        principle:
          'RMS is defined by an integral, and every shape has its own factor. A square wave is its own rms; a sinusoid is peak over root two; a linear ramp is peak over root three.',
        hints: [
          'What fraction of its period does this waveform spend near its peak?',
          'Square first, average second, root last.',
        ],
      },
    };
  },
};

/** Chapters 9 and 10, where the bank was thin against the lectures. */
export const EE3300_STEADYSTATE_GENERATORS: readonly Generator[] = [
  powerTriangle,
  inversePhasorTransform,
  rmsOfWaveform,
];
