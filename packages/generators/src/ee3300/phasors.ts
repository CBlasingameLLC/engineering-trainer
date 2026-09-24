import type { Generator } from '../types.js';
import {
  adjustDifficulty, capacitance, inductance, ohms, pick, ratioDifficulty, resampleUntil,
  resistor, trimNumber, type Rng,
} from '../rng.js';
import { figure } from '../figures.js';
import { separatedComplexTraps } from '../traps.js';

/**
 * Sinusoidal steady state.
 *
 * Every answer here is complex, and the errors that matter are not wrong
 * numbers but wrong *forms* of the right number: the conjugate, the reciprocal,
 * the magnitude with the phase dropped. Those are what the traps name, and they
 * are why `complex` exists as an answer kind rather than splitting each
 * question into a magnitude half and a phase half — a learner who conjugates
 * gets the magnitude question right and the phase question wrong, and two
 * separate scores cannot say that the single mistake was a sign convention.
 */

const PHASOR_TOLERANCE = { magRel: 0.02, angleDeg: 1.5 } as const;

/** Standard engineering frequencies, in hertz. */
const frequency = (rng: Rng): number => pick(rng, [50, 60, 100, 120, 400, 1000, 2000, 5000, 10000]);

const degrees = (radians: number): number => (radians * 180) / Math.PI;
const polar = (real: number, imag: number): string =>
  `${trimNumber(Math.hypot(real, imag), 4)} \\angle ${trimNumber(degrees(Math.atan2(imag, real)), 4)}^\\circ`;

/**
 * Series RLC impedance at a frequency.
 *
 * The reactances are constrained apart so the net reactance is never near zero:
 * at resonance Z is purely real, the phase angle is 0, and every phase-related
 * trap lands on the answer — the item would grade correctly and diagnose
 * nothing, which is the failure this whole bank is built to avoid. Resonance is
 * a fine question; it is just a different one, and it has its own generator.
 */
export const seriesImpedance: Generator = {
  id: 'ee3300.impedance.series-rlc',
  title: 'Series RLC impedance',
  kcRefs: [{ kc: 'ee3300.impedance-admittance', weight: 1 }],
  difficultyB: -0.2,
  generate(rng: Rng) {
    const f = frequency(rng);
    const omega = 2 * Math.PI * f;
    const r = resistor(rng, { minDecade: 1, maxDecade: 3 });

    const [l, c] = resampleUntil(
      rng,
      (g) => [inductance(g), capacitance(g)] as [number, number],
      ([henries, farads]) => {
        const x = omega * henries - 1 / (omega * farads);
        // The reactance has to be doing visible work, or the phase is noise.
        return Math.abs(x) >= 0.25 * r && Math.abs(x) <= 8 * r;
      },
    );

    const xl = omega * l;
    const xc = 1 / (omega * c);
    const x = xl - xc;
    const magnitude = Math.hypot(r, x);

    return {
      type: 'phasor' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [ratioDifficulty(Math.abs(x), r)]),
      stem:
        `A resistor $R = ${ohms(r)}$, an inductor $L = ${trimNumber(l * 1000)}\\,\\mathrm{mH}$ and a capacitor ` +
        `$C = ${trimNumber(c * 1e6, 3)}\\,\\mathrm{\\mu F}$ are connected **in series** across a ` +
        `$${trimNumber(f)}\\,\\mathrm{Hz}$ source.\n\nFind the total impedance $Z$ in polar form.`,
      answer: {
        kind: 'complex' as const,
        real: r,
        imag: x,
        unit: 'ohm',
        tolerance: PHASOR_TOLERANCE,
      },
      figure: figure('Series RLC')
        .vac('V1', { x: 4, y: 12 }, 1)
        .r('R1', { x: 12, y: 6 }, r, 90)
        .l('L1', { x: 20, y: 6 }, l, 90)
        .c('C1', { x: 28, y: 6 }, c, 90)
        .wire({ x: 4, y: 10 }, { x: 4, y: 6 }, { x: 10, y: 6 })
        .wire({ x: 14, y: 6 }, { x: 18, y: 6 })
        .wire({ x: 22, y: 6 }, { x: 26, y: 6 })
        .wire({ x: 30, y: 6 }, { x: 34, y: 6 }, { x: 34, y: 18 })
        .wire({ x: 4, y: 14 }, { x: 4, y: 18 }, { x: 34, y: 18 })
        .ground({ x: 4, y: 18 })
        .build(),
      options: [],
      misconceptionTraps: separatedComplexTraps(
        { kind: 'complex', real: r, imag: x, unit: 'ohm', tolerance: PHASOR_TOLERANCE },
        [
        {
          misconception: 'phasor.reactance-signs-swapped',
          complex: { real: r, imag: xc - xl },
          feedback:
            `You swapped the signs: $X_L = +\\omega L$ and $X_C = -1/(\\omega C)$, so ` +
            `$X = ${trimNumber(xl)} - ${trimNumber(xc)} = ${trimNumber(x)}\\,\\mathrm{\\Omega}$.`,
        },
        {
          misconception: 'phasor.reactances-added-as-magnitudes',
          complex: { real: r, imag: xl + xc },
          feedback:
            `You added the reactances instead of subtracting. They point in opposite directions ` +
            `on the imaginary axis — that cancellation is what resonance is.`,
        },
        {
          misconception: 'phasor.magnitude-without-phase',
          complex: { real: magnitude, imag: 0 },
          feedback:
            `That is the magnitude, $|Z| = ${trimNumber(magnitude)}\\,\\mathrm{\\Omega}$, with the phase ` +
            `dropped. An impedance without its angle cannot tell you whether the circuit leads or lags.`,
        },
        ],
      ),
      explanation: {
        steps: [
          `$\\omega = 2\\pi f = 2\\pi(${trimNumber(f)}) = ${trimNumber(omega, 5)}\\,\\mathrm{rad/s}$.`,
          `$X_L = \\omega L = ${trimNumber(xl, 4)}\\,\\mathrm{\\Omega}$ and $X_C = \\dfrac{1}{\\omega C} = ${trimNumber(xc, 4)}\\,\\mathrm{\\Omega}$.`,
          `In series the impedances add: $Z = R + j(X_L - X_C) = ${trimNumber(r)} + j(${trimNumber(x, 4)})\\,\\mathrm{\\Omega}$.`,
          `In polar form, $Z = ${polar(r, x)}\\,\\mathrm{\\Omega}$ — ${x > 0 ? 'inductive, so the current lags' : 'capacitive, so the current leads'}.`,
        ],
        principle:
          'Series impedances add as complex numbers. The two reactances subtract because they sit on opposite halves of the imaginary axis.',
        hints: [
          'Work out the two reactances separately before combining anything.',
          'Which of the two reactances is negative, and why?',
        ],
      },
    };
  },
};

/**
 * The output of an RC low-pass section, as a phasor.
 *
 * A divider the learner has already met in Circuits I, with one element
 * replaced by an impedance — which is the whole claim of the unit, and the
 * reason the edge in the graph runs from `ee2300.voltage-divider`.
 */
export const rcDividerPhasor: Generator = {
  id: 'ee3300.phasor.rc-divider',
  title: 'RC divider output phasor',
  kcRefs: [
    { kc: 'ee3300.phasor-circuit-analysis', weight: 0.6 },
    { kc: 'ee3300.transfer-functions', weight: 0.4 },
  ],
  difficultyB: 0.1,
  generate(rng: Rng) {
    const f = frequency(rng);
    const omega = 2 * Math.PI * f;
    const vin = pick(rng, [1, 2, 5, 10, 12, 24]);

    // Away from both asymptotes: at wRC << 1 the output is the input and at
    // wRC >> 1 it is nothing, and in both cases the phase is what the item is
    // actually about and both are uninformative.
    const [r, c] = resampleUntil(
      rng,
      (g) => [resistor(g, { minDecade: 2, maxDecade: 4 }), capacitance(g)] as [number, number],
      ([ohmsValue, farads]) => {
        const wrc = omega * ohmsValue * farads;
        return wrc >= 0.3 && wrc <= 3;
      },
    );

    const wrc = omega * r * c;
    // Vout = Vin / (1 + jwRC)
    const denominator = 1 + wrc * wrc;
    const real = vin / denominator;
    const imag = (-vin * wrc) / denominator;
    const magnitude = Math.hypot(real, imag);
    const angle = degrees(Math.atan2(imag, real));

    return {
      type: 'phasor' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [ratioDifficulty(wrc, 1)]),
      stem:
        `A $${trimNumber(vin)}\\,\\mathrm{V}$ (amplitude) source at $${trimNumber(f)}\\,\\mathrm{Hz}$ with zero phase drives ` +
        `$R = ${ohms(r)}$ in series with $C = ${trimNumber(c * 1e6, 3)}\\,\\mathrm{\\mu F}$.\n\n` +
        `Find the phasor voltage **across the capacitor**, in polar form.`,
      answer: { kind: 'complex' as const, real, imag, unit: 'V', tolerance: PHASOR_TOLERANCE },
      figure: figure('RC low-pass section')
        .vac('V1', { x: 4, y: 12 }, vin)
        .r('R1', { x: 12, y: 6 }, r, 90)
        .c('C1', { x: 18, y: 10 }, c)
        .wire({ x: 4, y: 10 }, { x: 4, y: 6 }, { x: 10, y: 6 })
        .wire({ x: 14, y: 6 }, { x: 18, y: 6 }, { x: 18, y: 8 })
        .wire({ x: 4, y: 14 }, { x: 4, y: 18 }, { x: 18, y: 18 })
        .wire({ x: 18, y: 12 }, { x: 18, y: 18 })
        .ground({ x: 4, y: 18 })
        .label({ x: 16, y: 6 }, 'out')
        .expectAcMagnitude('out', f, magnitude)
        .expectAcPhase('out', f, angle)
        .build(),
      options: [],
      misconceptionTraps: separatedComplexTraps(
        { kind: 'complex', real, imag, unit: 'V', tolerance: PHASOR_TOLERANCE },
        [
        {
          misconception: 'phasor.conjugate',
          complex: { real, imag: -imag },
          feedback:
            `The magnitude is right but the phase leads instead of lagging. A capacitor's impedance is ` +
            `$-j/(\\omega C)$, so the output of an RC low-pass **lags** the input.`,
        },
        {
          misconception: 'phasor.reactance-treated-as-resistance',
          complex: {
            real: (vin / (r + 1 / (omega * c))) * (1 / (omega * c)),
            imag: 0,
          },
          feedback:
            `You used the reactance as though it were a resistance and divided magnitudes. ` +
            `$R$ and $X_C$ are at right angles; the denominator is $|R - j/(\\omega C)|$, not $R + 1/(\\omega C)$.`,
        },
        {
          misconception: 'phasor.magnitude-without-phase',
          complex: { real: magnitude, imag: 0 },
          feedback:
            `That is $|V_C| = ${trimNumber(magnitude, 4)}\\,\\mathrm{V}$ with the phase dropped. ` +
            `The phase shift is what makes this a filter rather than an attenuator.`,
        },
        ],
      ),
      explanation: {
        steps: [
          `$\\omega = 2\\pi(${trimNumber(f)}) = ${trimNumber(omega, 5)}\\,\\mathrm{rad/s}$, so $\\omega RC = ${trimNumber(wrc, 4)}$.`,
          `The divider still holds, with impedances: $V_C = V_s \\dfrac{1/(j\\omega C)}{R + 1/(j\\omega C)} = \\dfrac{V_s}{1 + j\\omega RC}$.`,
          `$V_C = \\dfrac{${trimNumber(vin)}}{1 + j(${trimNumber(wrc, 4)})} = ${trimNumber(real, 4)} + j(${trimNumber(imag, 4)})\\,\\mathrm{V}$.`,
          `In polar form, $V_C = ${polar(real, imag)}\\,\\mathrm{V}$ — the output lags by ${trimNumber(Math.abs(angle), 4)} degrees.`,
        ],
        principle:
          'A divider works the same way over impedances. Dividing by a complex denominator is what produces the phase shift.',
        hints: [
          'Write the capacitor impedance as $1/(j\\omega C)$ and use the divider you already know.',
          'Multiply by the conjugate of the denominator to separate real and imaginary parts.',
        ],
      },
    };
  },
};

/**
 * Complex power from a voltage and current phasor.
 *
 * `S = V I*` and the conjugate on the current is the most-dropped operator in
 * the unit — without it the reactive power comes out with the wrong sign, which
 * turns a lagging load into a leading one and inverts the correction that
 * follows from it.
 */
export const complexPower: Generator = {
  id: 'ee3300.power.complex',
  title: 'Complex power from phasors',
  kcRefs: [{ kc: 'ee3300.complex-power', weight: 1 }],
  difficultyB: 0.4,
  generate(rng: Rng) {
    const vrms = pick(rng, [24, 48, 120, 208, 240, 277, 480]);
    const irms = pick(rng, [2, 3, 5, 8, 10, 12, 15]);
    // Angles far enough from 0 and 90 that neither P nor Q vanishes, and far
    // enough apart that the conjugate trap is a different answer.
    const theta = pick(rng, [-60, -45, -36.87, -25, 25, 36.87, 45, 60]);

    const p = vrms * irms * Math.cos((theta * Math.PI) / 180);
    const q = vrms * irms * Math.sin((theta * Math.PI) / 180);
    const s = vrms * irms;

    return {
      type: 'phasor' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [ratioDifficulty(Math.abs(q), Math.abs(p))]),
      stem:
        `A load draws $I = ${trimNumber(irms)} \\angle ${trimNumber(-theta)}^\\circ\\,\\mathrm{A}$ (rms) when the voltage ` +
        `across it is $V = ${trimNumber(vrms)} \\angle 0^\\circ\\,\\mathrm{V}$ (rms).\n\n` +
        `Find the complex power $S$ in rectangular form, in VA.`,
      answer: { kind: 'complex' as const, real: p, imag: q, unit: '', tolerance: PHASOR_TOLERANCE },
      options: [],
      misconceptionTraps: separatedComplexTraps(
        { kind: 'complex', real: p, imag: q, unit: '', tolerance: PHASOR_TOLERANCE },
        [
        {
          misconception: 'power.conjugate-omitted',
          complex: { real: p, imag: -q },
          feedback:
            `You dropped the conjugate. $S = V I^*$, not $VI$ — without it the reactive power comes out ` +
            `with the wrong sign, and a ${theta > 0 ? 'lagging' : 'leading'} load reads as ${theta > 0 ? 'leading' : 'lagging'}.`,
        },
        {
          misconception: 'power.apparent-taken-as-real',
          complex: { real: s, imag: 0 },
          feedback:
            `That is the **apparent** power $|S| = ${trimNumber(s)}\\,\\mathrm{VA}$. Real power is ` +
            `$|S|\\cos\\theta = ${trimNumber(p, 4)}\\,\\mathrm{W}$; the difference is what the power factor measures.`,
        },
        {
          misconception: 'power.half-factor-applied-to-rms',
          complex: { real: p / 2, imag: q / 2 },
          feedback:
            `The factor of a half belongs with **amplitude** phasors. These are already rms values, so ` +
            `$S = V_{rms} I_{rms}^*$ with no halving.`,
        },
        ],
      ),
      explanation: {
        steps: [
          `$S = V I^*$. Conjugating the current flips its angle: $I^* = ${trimNumber(irms)} \\angle ${trimNumber(theta)}^\\circ$.`,
          `$|S| = ${trimNumber(vrms)} \\times ${trimNumber(irms)} = ${trimNumber(s)}\\,\\mathrm{VA}$, at an angle of $${trimNumber(theta)}^\\circ$.`,
          `$P = |S|\\cos\\theta = ${trimNumber(p, 4)}\\,\\mathrm{W}$ and $Q = |S|\\sin\\theta = ${trimNumber(q, 4)}\\,\\mathrm{VAR}$.`,
          `So $S = ${trimNumber(p, 4)} + j(${trimNumber(q, 4)})\\,\\mathrm{VA}$, a ${theta > 0 ? 'lagging (inductive)' : 'leading (capacitive)'} load.`,
        ],
        principle:
          'S = V I*. The conjugate is what makes the angle of S the angle between voltage and current, which is the power factor angle.',
        hints: [
          'Conjugating a phasor negates its angle.',
          'The angle of S is the angle of V minus the angle of I.',
        ],
      },
    };
  },
};
