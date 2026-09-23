import type { Generator } from '../types.js';
import { DEFAULT_TOLERANCE } from '../types.js';
import {
  adjustDifficulty, capacitance, engineering, inductance, mantissaDifficulty, ohms, pick,
  ratioDifficulty, resampleUntil, resistor, trimNumber, type Rng,
} from '../rng.js';
import { separatedComplexTraps, separatedTraps } from '../traps.js';

/**
 * The rest of the AC course: the phasor transform itself, rms, power factor
 * correction, the conjugate match, AC Thevenin, parallel resonance, coupling,
 * Bode asymptotes and the s-domain.
 *
 * Written to close the coverage gap rather than to be exhaustive. A knowledge
 * component with no items is worse than one with few: the graph will happily
 * propagate a gap onto it from a failed descendant, and then there is no way to
 * confirm or refute the diagnosis by asking.
 */

const PHASOR_TOLERANCE = { magRel: 0.02, angleDeg: 1.5 } as const;
const degrees = (radians: number): number => (radians * 180) / Math.PI;

/** The phasor transform: amplitude, frequency and phase into a complex number. */
export const sinusoidToPhasor: Generator = {
  id: 'ee3300.sinusoids.phasor-transform',
  title: 'Sinusoid to phasor',
  kcRefs: [{ kc: 'ee3300.sinusoids-phasors', weight: 1 }],
  difficultyB: -1,
  generate(rng: Rng) {
    const amplitude = pick(rng, [2, 5, 10, 12, 15, 24, 100, 170]);
    // Away from 0 and ±180, or the sine/cosine confusion trap lands on the
    // answer and the item can only say "missed".
    const phase = pick(rng, [-135, -120, -90, -60, -45, -30, 30, 45, 60, 90, 120, 135]);
    const asSine = rng() < 0.5;

    // cos(wt + p) is the reference. sin(wt + p) = cos(wt + p - 90).
    const angle = asSine ? phase - 90 : phase;
    const real = amplitude * Math.cos((angle * Math.PI) / 180);
    const imag = amplitude * Math.sin((angle * Math.PI) / 180);

    return {
      type: 'phasor' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [asSine ? 0.9 : -0.9, mantissaDifficulty(amplitude)]),
      stem:
        `Write $v(t) = ${trimNumber(amplitude)}\\,${asSine ? '\\sin' : '\\cos'}(\\omega t ${phase >= 0 ? '+' : '-'} ` +
        `${trimNumber(Math.abs(phase))}^\\circ)\\,\\mathrm{V}$ as a phasor, in polar form, using the **cosine** reference.`,
      answer: { kind: 'complex' as const, real, imag, unit: 'V', tolerance: PHASOR_TOLERANCE },
      options: [],
      misconceptionTraps: separatedComplexTraps(
        { kind: 'complex', real, imag, unit: 'V', tolerance: PHASOR_TOLERANCE },
        [
          {
            misconception: 'phasor.sine-not-converted',
            complex: {
              real: amplitude * Math.cos((phase * Math.PI) / 180),
              imag: amplitude * Math.sin((phase * Math.PI) / 180),
            },
            feedback: asSine
              ? `You read the angle straight off a sine. Against a cosine reference, ` +
                `$\\sin\\theta = \\cos(\\theta - 90^\\circ)$, so the phasor angle is ${trimNumber(angle)}$^\\circ$.`
              : `That is the right angle — check the magnitude.`,
          },
          {
            misconception: 'phasor.conjugate',
            complex: { real, imag: -imag },
            feedback: `The sign of the angle is flipped. A lagging phase is negative against the reference.`,
          },
          {
            misconception: 'phasor.rms-amplitude-confused',
            complex: { real: real / Math.SQRT2, imag: imag / Math.SQRT2 },
            feedback:
              `You converted to rms. The question gives an amplitude and asks for a phasor, so no ` +
              `factor of $\\sqrt{2}$ belongs here.`,
          },
        ],
      ),
      explanation: {
        steps: [
          asSine
            ? `Convert to the cosine reference first: $\\sin(\\omega t + ${trimNumber(phase)}^\\circ) = \\cos(\\omega t + ${trimNumber(phase)}^\\circ - 90^\\circ)$.`
            : `The waveform is already a cosine, so the angle transfers directly.`,
          `The phasor is the amplitude at that angle: $V = ${trimNumber(amplitude)} \\angle ${trimNumber(angle)}^\\circ\\,\\mathrm{V}$.`,
          `In rectangular form that is $${trimNumber(real, 4)} + j(${trimNumber(imag, 4)})\\,\\mathrm{V}$.`,
        ],
        principle:
          'A phasor is an amplitude and a phase against one agreed reference. Which reference is agreed is not optional — a sine has to be converted.',
        hints: ['What is sin θ in terms of cos?', 'The magnitude is untouched by the conversion.'],
      },
    };
  },
};

/** RMS of a sinusoid, a square wave and a triangle. */
export const rmsValue: Generator = {
  id: 'ee3300.rms.waveform',
  title: 'RMS value of a periodic waveform',
  kcRefs: [{ kc: 'ee3300.rms-values', weight: 1 }],
  difficultyB: -0.6,
  generate(rng: Rng) {
    const amplitude = pick(rng, [5, 10, 12, 15, 24, 100, 170, 340]);
    const shape = pick(rng, ['sine', 'square', 'triangle'] as const);
    const factor = shape === 'sine' ? 1 / Math.SQRT2 : shape === 'square' ? 1 : 1 / Math.sqrt(3);
    const value = amplitude * factor;

    const shapeName = { sine: 'sinusoid', square: 'symmetric square wave', triangle: 'symmetric triangle wave' }[shape];

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        shape === 'sine' ? -0.9 : 0.6,
        mantissaDifficulty(amplitude),
      ]),
      stem:
        `A ${shapeName} has a peak value of $${trimNumber(amplitude)}\\,\\mathrm{V}$ and no DC offset.\n\n` +
        `Find its rms value.`,
      answer: { kind: 'numeric' as const, value, unit: 'V', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(value, DEFAULT_TOLERANCE, [
        {
          misconception: 'rms.sine-factor-applied-to-every-shape',
          value: amplitude / Math.SQRT2,
          tolerance: { rel: 0.02 },
          feedback:
            `$V_p/\\sqrt{2}$ is the sinusoid's factor and nothing else's. It comes from ` +
            `$\\overline{\\cos^2} = 1/2$, which is a fact about cosines.`,
        },
        {
          misconception: 'rms.peak-reported',
          value: amplitude,
          tolerance: { rel: 0.02 },
          feedback: `That is the peak. RMS is the equivalent DC value, which for anything but a square wave is smaller.`,
        },
        {
          misconception: 'rms.average-reported',
          value: (2 * amplitude) / Math.PI,
          tolerance: { rel: 0.02 },
          feedback:
            `That is the average of the rectified wave, not the rms. Squaring first is what makes ` +
            `rms track power rather than displacement.`,
        },
      ]),
      explanation: {
        steps: [
          `RMS is the square **root** of the **mean** of the **square**: $V_{rms} = \\sqrt{\\overline{v^2}}$.`,
          shape === 'sine'
            ? `For a sinusoid, $\\overline{v^2} = V_p^2/2$, so $V_{rms} = V_p/\\sqrt{2}$.`
            : shape === 'square'
              ? `A symmetric square wave sits at $\\pm V_p$ the whole time, so $\\overline{v^2} = V_p^2$ and $V_{rms} = V_p$.`
              : `For a triangle, $\\overline{v^2} = V_p^2/3$, so $V_{rms} = V_p/\\sqrt{3}$.`,
          `$V_{rms} = ${trimNumber(amplitude)} \\times ${trimNumber(factor, 4)} = ${trimNumber(value, 4)}\\,\\mathrm{V}$.`,
        ],
        principle:
          'RMS is defined by the integral, not by a factor. The factor differs per waveform because the mean of the square does.',
        hints: ['Write down the definition before reaching for a factor.', 'What fraction of the time is a square wave at its peak?'],
      },
    };
  },
};

/** Sizing the capacitor that corrects a lagging load's power factor. */
export const powerFactorCorrection: Generator = {
  id: 'ee3300.power.factor-correction',
  title: 'Power factor correction',
  kcRefs: [{ kc: 'ee3300.power-factor-correction', weight: 1 }],
  difficultyB: 0.8,
  generate(rng: Rng) {
    const vrms = pick(rng, [120, 208, 240, 277, 480]);
    const f = pick(rng, [50, 60]);
    const p = pick(rng, [1000, 1500, 2000, 3000, 5000, 7500, 10000]);
    const pf1 = pick(rng, [0.6, 0.65, 0.7, 0.75, 0.8]);
    const pf2 = pick(rng, [0.9, 0.92, 0.95, 0.98]);

    const theta1 = Math.acos(pf1);
    const theta2 = Math.acos(pf2);
    const qc = p * (Math.tan(theta1) - Math.tan(theta2));
    const c = qc / (2 * Math.PI * f * vrms * vrms);

    // Correcting to unity instead of the stated target, and using the apparent
    // power where the real power belongs.
    const toUnity = (p * Math.tan(theta1)) / (2 * Math.PI * f * vrms * vrms);
    const usingS = (p / pf1) * (Math.tan(theta1) - Math.tan(theta2)) / (2 * Math.PI * f * vrms * vrms);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [ratioDifficulty(pf2, pf1), mantissaDifficulty(p)]),
      stem:
        `A load draws $${trimNumber(p)}\\,\\mathrm{W}$ at a power factor of $${trimNumber(pf1)}$ **lagging**, from a ` +
        `$${trimNumber(vrms)}\\,\\mathrm{V}$ rms, $${trimNumber(f)}\\,\\mathrm{Hz}$ supply.\n\n` +
        `What capacitance, connected in parallel, raises the power factor to $${trimNumber(pf2)}$ lagging?`,
      answer: { kind: 'numeric' as const, value: c, unit: 'F', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(c, DEFAULT_TOLERANCE, [
        {
          misconception: 'power-factor.corrected-to-unity',
          value: toUnity,
          tolerance: { rel: 0.02 },
          feedback:
            `That corrects all the way to unity. The target is $${trimNumber(pf2)}$, so the capacitor only has ` +
            `to supply the **difference** in reactive power: $Q_C = P(\\tan\\theta_1 - \\tan\\theta_2)$.`,
        },
        {
          misconception: 'power-factor.apparent-used-for-real',
          value: usingS,
          tolerance: { rel: 0.02 },
          feedback:
            `You used the apparent power. The formula takes the **real** power, because P is what stays ` +
            `fixed while the correction changes Q.`,
        },
      ]),
      explanation: {
        steps: [
          `$\\theta_1 = \\arccos(${trimNumber(pf1)}) = ${trimNumber(degrees(theta1), 4)}^\\circ$, so $Q_1 = P\\tan\\theta_1 = ${trimNumber(p * Math.tan(theta1), 5)}\\,\\mathrm{VAR}$.`,
          `$\\theta_2 = \\arccos(${trimNumber(pf2)}) = ${trimNumber(degrees(theta2), 4)}^\\circ$, so $Q_2 = ${trimNumber(p * Math.tan(theta2), 5)}\\,\\mathrm{VAR}$.`,
          `The capacitor supplies the difference: $Q_C = ${trimNumber(qc, 5)}\\,\\mathrm{VAR}$.`,
          `$C = \\dfrac{Q_C}{\\omega V^2} = ${trimNumber(c * 1e6, 4)}\\,\\mathrm{\\mu F}$, that is $${trimNumber(c, 4)}\\,\\mathrm{F}$.`,
        ],
        principle:
          'Correction changes the reactive power while leaving the real power alone. That is why P, not S, appears in the formula.',
        hints: ['How much reactive power does the load draw now, and how much should it draw after?', 'A capacitor supplies reactive power rather than consuming it.'],
      },
    };
  },
};

/** The conjugate match, and the power it delivers. */
export const conjugateMatch: Generator = {
  id: 'ee3300.power.conjugate-match',
  title: 'Maximum power transfer with reactance',
  kcRefs: [
    { kc: 'ee3300.max-power-transfer-ac', weight: 0.7 },
    { kc: 'ee3300.ac-thevenin', weight: 0.3 },
  ],
  difficultyB: 0.7,
  generate(rng: Rng) {
    const vth = pick(rng, [10, 12, 20, 24, 48, 100]);
    const rth = resistor(rng, { minDecade: 0, maxDecade: 2 });
    // A zero reactance makes the conjugate equal the source impedance and the
    // whole point of the item disappear.
    const xth = resampleUntil(
      rng,
      (g) => pick(g, [-4, -3, -2, -1.5, 1.5, 2, 3, 4]) * rth * pick(g, [0.25, 0.5, 0.75, 1]),
      (x) => Math.abs(x) >= 0.3 * rth,
    );
    const mode = pick(rng, ['load-resistance', 'max-power'] as const);

    const pMax = (vth * vth) / (8 * rth); // amplitude phasor: P = |Vth|^2 / (8 Rth)
    const answer = mode === 'load-resistance' ? rth : pMax;
    const unit = mode === 'load-resistance' ? 'ohm' : 'W';

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [ratioDifficulty(Math.abs(xth), rth)]),
      stem:
        `A source has Thevenin equivalent $V_{th} = ${trimNumber(vth)}\\,\\mathrm{V}$ (amplitude) and ` +
        `$Z_{th} = ${trimNumber(rth)} ${xth >= 0 ? '+' : '-'} j${trimNumber(Math.abs(xth), 4)}\\,\\mathrm{\\Omega}$.\n\n` +
        (mode === 'load-resistance'
          ? 'For maximum power transfer, what **resistance** should the load have?'
          : 'What is the maximum average power the load can draw?'),
      answer: { kind: 'numeric' as const, value: answer, unit, tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(
        answer,
        DEFAULT_TOLERANCE,
        mode === 'load-resistance'
          ? [
              {
                misconception: 'max-power.magnitude-matched',
                value: Math.hypot(rth, xth),
                tolerance: { rel: 0.02 },
                feedback:
                  `You matched the **magnitude** of $Z_{th}$. The conjugate match sets $R_L = R_{th}$ and ` +
                  `$X_L = -X_{th}$ separately — the reactances have to cancel, not scale.`,
              },
            ]
          : [
              {
                misconception: 'max-power.reactance-left-in',
                value: (vth * vth * rth) / (2 * ((2 * rth) ** 2)),
                tolerance: { rel: 0.02 },
                feedback:
                  `Check the denominator. With the reactances cancelled the circuit is purely resistive, ` +
                  `so $P_{max} = \\dfrac{|V_{th}|^2}{8R_{th}}$ for an amplitude phasor.`,
              },
              {
                misconception: 'max-power.rms-amplitude-confused',
                value: (vth * vth) / (4 * rth),
                tolerance: { rel: 0.02 },
                feedback:
                  `$\\dfrac{|V|^2}{4R}$ is the rms form. This $V_{th}$ is an amplitude, and squaring it ` +
                  `brings in the extra factor of two.`,
              },
            ],
      ),
      explanation: {
        steps: [
          `The conjugate match is $Z_L = Z_{th}^* = ${trimNumber(rth)} ${xth >= 0 ? '-' : '+'} j${trimNumber(Math.abs(xth), 4)}\\,\\mathrm{\\Omega}$.`,
          `The two reactances then cancel, leaving $R_{th} + R_L = ${trimNumber(2 * rth)}\\,\\mathrm{\\Omega}$ purely resistive.`,
          `$P_{max} = \\dfrac{|V_{th}|^2}{8R_{th}} = ${trimNumber(pMax, 5)}\\,\\mathrm{W}$ for an amplitude phasor.`,
          `The answer is $${trimNumber(answer, 5)}\\,\\mathrm{${unit}}$.`,
        ],
        principle:
          'Conjugate, not copy. The reactance has to be cancelled before the resistive matching argument applies at all.',
        hints: ['What does the load reactance have to do to the source reactance?', 'Once they cancel, what kind of circuit is left?'],
      },
    };
  },
};

/** Parallel resonance: the dual of the series case. */
export const parallelResonance: Generator = {
  id: 'ee3300.resonance.parallel',
  title: 'Parallel resonance',
  kcRefs: [{ kc: 'ee3300.parallel-resonance', weight: 1 }],
  difficultyB: 0.8,
  generate(rng: Rng) {
    const l = inductance(rng);
    const c = capacitance(rng);
    const r = resistor(rng, { minDecade: 3, maxDecade: 5 });

    const f0 = 1 / (2 * Math.PI * Math.sqrt(l * c));
    const q = r * Math.sqrt(c / l);
    const mode = pick(rng, ['f0', 'q'] as const);
    const answer = mode === 'f0' ? f0 : q;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [mantissaDifficulty(f0), mode === 'q' ? 0.8 : -0.4]),
      stem:
        `A **parallel** RLC tank has $R = ${ohms(r)}$, $L = ${trimNumber(l * 1000)}\\,\\mathrm{mH}$ and ` +
        `$C = ${trimNumber(c * 1e6, 3)}\\,\\mathrm{\\mu F}$.\n\n` +
        (mode === 'f0' ? 'Find the resonant frequency in hertz.' : 'Find the quality factor $Q$.'),
      answer: {
        kind: 'numeric' as const,
        value: answer,
        unit: mode === 'f0' ? 'Hz' : '',
        tolerance: DEFAULT_TOLERANCE,
      },
      options: [],
      misconceptionTraps: separatedTraps(
        answer,
        DEFAULT_TOLERANCE,
        mode === 'f0'
          ? [
              {
                misconception: 'resonance.omega-reported-as-f',
                value: 1 / Math.sqrt(l * c),
                tolerance: { rel: 0.02 },
                feedback: `That is $\\omega_0$ in rad/s. Divide by $2\\pi$.`,
              },
            ]
          : [
              {
                misconception: 'resonance.q-inverted',
                value: 1 / q,
                tolerance: { rel: 0.02 },
                feedback:
                  `That is the **series** form, $\\frac{1}{R}\\sqrt{L/C}$. In parallel, a larger R means a ` +
                  `**higher** Q — the resistor is now the loss path across the tank rather than in series with it.`,
              },
            ],
      ),
      explanation: {
        steps: [
          `Resonance is where the susceptances cancel, which gives the same $\\omega_0 = 1/\\sqrt{LC}$ as the series case.`,
          `$f_0 = ${trimNumber(f0, 5)}\\,\\mathrm{Hz}$.`,
          `The quality factor inverts: $Q = R\\sqrt{C/L} = ${trimNumber(q, 4)}$, because R is now across the tank rather than in series with it.`,
        ],
        principle:
          'Parallel resonance is the dual of series resonance: the frequency is the same and every ratio involving R turns over.',
        hints: ['What has to cancel for the tank to look resistive?', 'Does a bigger R damp a parallel tank more, or less?'],
      },
    };
  },
};

/** Mutual inductance and the dot convention. */
export const mutualInductance: Generator = {
  id: 'ee3300.coupling.mutual-inductance',
  title: 'Mutual inductance and coupling',
  kcRefs: [{ kc: 'ee3300.mutual-inductance', weight: 1 }],
  difficultyB: 0.5,
  generate(rng: Rng) {
    const l1 = pick(rng, [1, 2, 5, 10, 20, 50]) / 1000;
    const l2 = pick(rng, [2, 4, 8, 15, 40, 80]) / 1000;
    const k = pick(rng, [0.3, 0.4, 0.5, 0.6, 0.75, 0.8, 0.9]);
    const m = k * Math.sqrt(l1 * l2);
    const aiding = rng() < 0.5;

    // Series-connected coils: L_eq = L1 + L2 +/- 2M, the sign set by the dots.
    const leq = l1 + l2 + (aiding ? 2 : -2) * m;
    const mode = pick(rng, ['mutual', 'series'] as const);
    const answer = mode === 'mutual' ? m : leq;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [ratioDifficulty(l1, l2), mode === 'series' ? 0.8 : -0.6]),
      stem:
        `Two coils have $L_1 = ${trimNumber(l1 * 1000)}\\,\\mathrm{mH}$ and $L_2 = ${trimNumber(l2 * 1000)}\\,\\mathrm{mH}$, ` +
        `with a coupling coefficient $k = ${trimNumber(k)}$.\n\n` +
        (mode === 'mutual'
          ? 'Find the mutual inductance $M$, in henries.'
          : `They are connected in series, ${aiding ? '**series-aiding** (both currents enter the dotted terminals)' : '**series-opposing** (one current enters a dotted terminal, the other leaves)'}. Find the equivalent inductance, in henries.`),
      answer: { kind: 'numeric' as const, value: answer, unit: 'H', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(
        answer,
        DEFAULT_TOLERANCE,
        mode === 'mutual'
          ? [
              {
                misconception: 'coupling.geometric-mean-replaced-by-arithmetic',
                value: (k * (l1 + l2)) / 2,
                tolerance: { rel: 0.02 },
                feedback:
                  `You averaged the two inductances. $M = k\\sqrt{L_1 L_2}$ uses the **geometric** mean, ` +
                  `which is what makes $k \\le 1$ the right bound.`,
              },
              {
                misconception: 'coupling.coefficient-squared',
                value: k * k * Math.sqrt(l1 * l2),
                tolerance: { rel: 0.02 },
                feedback: `$k$ appears once, not squared. $k^2$ is the fraction of **energy** coupled, not flux.`,
              },
            ]
          : [
              {
                misconception: 'coupling.dot-sign-reversed',
                value: l1 + l2 + (aiding ? -2 : 2) * m,
                tolerance: { rel: 0.02 },
                feedback:
                  `The sign of the $2M$ term is reversed. ${aiding ? 'Series-aiding **adds** it' : 'Series-opposing **subtracts** it'}, ` +
                  `and the dots are the only thing that decides which.`,
              },
              {
                misconception: 'coupling.mutual-term-omitted',
                value: l1 + l2,
                tolerance: { rel: 0.02 },
                feedback: `You added the self-inductances and stopped. The coils see each other's flux, which is the $2M$ term.`,
              },
            ],
      ),
      explanation: {
        steps: [
          `The coupling coefficient scales the **geometric** mean of the two inductances.`,
          `$M = k\\sqrt{L_1 L_2} = ${trimNumber(k)}\\sqrt{(${trimNumber(l1, 4)})(${trimNumber(l2, 4)})} = ${engineering(m, 'H')}$.`,
          ...(mode === 'series'
            ? [
                `In series the coils also see each other's flux: $L_{eq} = L_1 + L_2 \\pm 2M$, and the dots set the sign.`,
                `Here it is ${aiding ? 'aiding, so the term adds' : 'opposing, so the term subtracts'}: $L_{eq} = ${engineering(leq, 'H')}$.`,
              ]
            : [`The answer is $M = ${engineering(m, 'H')}$.`]),
        ],
        principle:
          'Coupling is a geometric mean scaled by k. The dot convention is not decoration — it is the entire sign of the mutual term.',
        hints: ['Which mean of L1 and L2 appears in M?', 'Do the two fluxes reinforce or oppose in this connection?'],
      },
    };
  },
};

/** Bode asymptotes: gain at a decade, and the slope. */
export const bodeAsymptotes: Generator = {
  id: 'ee3300.bode.asymptotes',
  title: 'Bode asymptotes',
  kcRefs: [{ kc: 'ee3300.bode-plots', weight: 1 }],
  difficultyB: 0.4,
  generate(rng: Rng) {
    const fc = pick(rng, [100, 200, 500, 1000, 2000, 5000, 10000]);
    const decades = pick(rng, [1, 2, 3]);
    const order = pick(rng, [1, 2]);
    const dcGainDb = pick(rng, [0, 6, 20, 26, 40]);

    // Asymptotic magnitude a given number of decades past the corner.
    const value = dcGainDb - 20 * order * decades;
    const atCorner = dcGainDb - order * 3.0103;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [order === 2 ? 0.8 : -0.6, ratioDifficulty(decades, 2)]),
      stem:
        `An order-${order} low-pass transfer function has a DC gain of $${trimNumber(dcGainDb)}\\,\\mathrm{dB}$ and a ` +
        `corner at $${trimNumber(fc)}\\,\\mathrm{Hz}$.\n\n` +
        `On the **asymptotic** Bode plot, what is the magnitude ${decades} decade${decades === 1 ? '' : 's'} above the corner, in dB?`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { abs: 0.6 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { abs: 0.6 }, [
        {
          misconception: 'bode.slope-per-octave-used',
          value: dcGainDb - 6 * order * decades,
          tolerance: { abs: 0.6 },
          feedback:
            `$6\\,\\mathrm{dB}$ is the drop per **octave** — a doubling. A decade is a factor of ten, ` +
            `which is $20\\,\\mathrm{dB}$ per pole.`,
        },
        {
          misconception: 'bode.order-ignored',
          value: dcGainDb - 20 * decades,
          tolerance: { abs: 0.6 },
          feedback: `Each pole contributes its own $-20\\,\\mathrm{dB}$/decade, so an order-${order} rolloff is ${20 * order} dB per decade.`,
        },
        {
          misconception: 'bode.corner-value-used-as-asymptote',
          value: atCorner,
          tolerance: { abs: 0.6 },
          feedback:
            `That is the gain **at** the corner, which is ${trimNumber(3.0103 * order, 3)} dB below the asymptote. ` +
            `The question asks for the asymptotic value, which ignores that correction.`,
        },
      ]),
      explanation: {
        steps: [
          `Each pole rolls off at $-20\\,\\mathrm{dB}$ per decade, so an order-${order} response falls at $-${20 * order}\\,\\mathrm{dB}$/decade.`,
          `Over ${decades} decade${decades === 1 ? '' : 's'} that is $-${trimNumber(20 * order * decades)}\\,\\mathrm{dB}$.`,
          `Starting from $${trimNumber(dcGainDb)}\\,\\mathrm{dB}$: $${trimNumber(value)}\\,\\mathrm{dB}$.`,
        ],
        principle:
          'Bode asymptotes are straight lines in log-log: 20 dB per decade per pole, and the order multiplies it.',
        hints: ['How many dB does one pole cost per decade?', 'Is the question asking about one decade or several?'],
      },
    };
  },
};

/** s-domain: the pole of a first-order network, and its time constant. */
export const sDomainPole: Generator = {
  id: 'ee3300.laplace.first-order-pole',
  title: 'First-order pole in the s-domain',
  kcRefs: [{ kc: 'ee3300.laplace-circuit-analysis', weight: 1 }],
  difficultyB: 0.6,
  generate(rng: Rng) {
    const kind = pick(rng, ['rc', 'rl'] as const);
    const r = resistor(rng, { minDecade: 2, maxDecade: 4 });
    const c = capacitance(rng);
    const l = inductance(rng);

    const tau = kind === 'rc' ? r * c : l / r;
    const pole = -1 / tau;
    const mode = pick(rng, ['pole', 'tau'] as const);
    const answer = mode === 'pole' ? pole : tau;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [mantissaDifficulty(tau), mode === 'pole' ? 0.7 : -0.5]),
      stem:
        `A series ${kind === 'rc' ? 'RC' : 'RL'} network has $R = ${ohms(r)}$ and ` +
        (kind === 'rc'
          ? `$C = ${trimNumber(c * 1e6, 3)}\\,\\mathrm{\\mu F}$`
          : `$L = ${trimNumber(l * 1000)}\\,\\mathrm{mH}$`) +
        `. Its transfer function has a single pole.\n\n` +
        (mode === 'pole'
          ? 'Where is that pole, in rad/s? (Give the signed value.)'
          : 'What is the time constant, in seconds?'),
      answer: { kind: 'numeric' as const, value: answer, unit: mode === 'pole' ? '' : 's', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(answer, DEFAULT_TOLERANCE, [
        {
          misconception: 'laplace.pole-sign-dropped',
          value: mode === 'pole' ? 1 / tau : -tau,
          tolerance: { rel: 0.02 },
          feedback:
            mode === 'pole'
              ? `The sign is the whole content of the answer. A pole in the **left** half plane is what makes the response decay; ` +
                `$s = +1/\\tau$ would be a circuit that blows up.`
              : `A time constant is positive. The pole is negative; its reciprocal magnitude is the time constant.`,
        },
        {
          misconception: 'laplace.time-constant-inverted',
          value: mode === 'pole' ? -tau : 1 / tau,
          tolerance: { rel: 0.02 },
          feedback:
            `You have the reciprocal. $\\tau = ${kind === 'rc' ? 'RC' : 'L/R'}$ has units of seconds, and the pole ` +
            `is at $-1/\\tau$ in rad/s — check which the question asked for.`,
        },
      ]),
      explanation: {
        steps: [
          kind === 'rc'
            ? `In the s-domain the capacitor is $1/(sC)$, so the divider gives $H(s) = \\dfrac{1}{1 + sRC}$.`
            : `In the s-domain the inductor is $sL$, so the divider gives $H(s) = \\dfrac{1}{1 + sL/R}$.`,
          `The denominator vanishes at $s = -1/${kind === 'rc' ? 'RC' : '(L/R)'}$.`,
          `$\\tau = ${engineering(tau, 's')}$, so the pole is at $s = ${trimNumber(pole, 5)}\\,\\mathrm{rad/s}$.`,
          mode === 'tau'
            ? `The answer is $\\tau = ${engineering(tau, 's')}$.`
            : `The answer is $s = ${trimNumber(pole, 5)}\\,\\mathrm{rad/s}$.`,
        ],
        principle:
          'A pole is a root of the denominator. Its distance from the origin is one over the time constant, and its sign is why the response decays.',
        hints: ['Write the impedance of the reactive element in s, then use the divider.', 'Which side of the imaginary axis must a stable pole be on?'],
      },
    };
  },
};

/** AC Thevenin: the equivalent impedance seen at a port. */
export const acThevenin: Generator = {
  id: 'ee3300.thevenin.ac-impedance',
  title: 'Thevenin impedance with reactance',
  kcRefs: [{ kc: 'ee3300.ac-thevenin', weight: 1 }],
  difficultyB: 0.6,
  generate(rng: Rng) {
    const f = pick(rng, [60, 100, 400, 1000, 2000]);
    const omega = 2 * Math.PI * f;
    const r1 = resistor(rng, { minDecade: 1, maxDecade: 3 });
    const r2 = resistor(rng, { minDecade: 1, maxDecade: 3 });
    const l = inductance(rng);

    // Z_th = (R1 || R2) + jwL, with the source suppressed.
    const rPar = (r1 * r2) / (r1 + r2);
    const x = omega * l;

    return {
      type: 'phasor' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [ratioDifficulty(x, rPar), ratioDifficulty(r1, r2)]),
      stem:
        `A $${trimNumber(f)}\\,\\mathrm{Hz}$ source drives $R_1 = ${ohms(r1)}$ into a node where $R_2 = ${ohms(r2)}$ ` +
        `returns to ground. From that node, $L = ${trimNumber(l * 1000)}\\,\\mathrm{mH}$ runs out to terminal $a$; ` +
        `terminal $b$ is ground.\n\nFind $Z_{th}$ looking into $a$-$b$, in polar form.`,
      answer: { kind: 'complex' as const, real: rPar, imag: x, unit: 'ohm', tolerance: PHASOR_TOLERANCE },
      options: [],
      misconceptionTraps: separatedComplexTraps(
        { kind: 'complex', real: rPar, imag: x, unit: 'ohm', tolerance: PHASOR_TOLERANCE },
        [
          {
            misconception: 'thevenin.source-not-suppressed',
            complex: { real: r1 + r2, imag: x },
            feedback:
              `You left the source in. Suppressing a voltage source shorts it, which puts $R_1$ in ` +
              `**parallel** with $R_2$ rather than in series.`,
          },
          {
            misconception: 'phasor.reactance-treated-as-resistance',
            complex: { real: rPar + x, imag: 0 },
            feedback:
              `You added the reactance to the resistance as a plain number. They are at right angles: ` +
              `$Z = R + jX$, and the magnitude is $\\sqrt{R^2 + X^2}$.`,
          },
          {
            misconception: 'phasor.conjugate',
            complex: { real: rPar, imag: -x },
            feedback: `An inductor's reactance is $+j\\omega L$. A negative reactance would be capacitive.`,
          },
        ],
      ),
      explanation: {
        steps: [
          `Suppress the source: a voltage source becomes a short, so $R_1$ and $R_2$ are in parallel.`,
          `$R_1 \\parallel R_2 = ${trimNumber(rPar, 4)}\\,\\mathrm{\\Omega}$.`,
          `$X_L = \\omega L = 2\\pi(${trimNumber(f)})(${trimNumber(l, 5)}) = ${trimNumber(x, 4)}\\,\\mathrm{\\Omega}$, in series with that.`,
          `$Z_{th} = ${trimNumber(rPar, 4)} + j${trimNumber(x, 4)} = ${trimNumber(Math.hypot(rPar, x), 4)} \\angle ${trimNumber(degrees(Math.atan2(x, rPar)), 4)}^\\circ\\,\\mathrm{\\Omega}$.`,
        ],
        principle:
          'The Thevenin procedure is unchanged by AC. Suppress the sources and combine impedances — the only new thing is that the result is complex.',
        hints: ['What does a suppressed voltage source look like?', 'Is the inductor in series or parallel with that combination?'],
      },
    };
  },
};
