import type { Generator } from '../types.js';
import { DEFAULT_TOLERANCE } from '../types.js';
import {
  adjustDifficulty, capacitance, inductance, mantissaDifficulty, ohms, pick, ratioDifficulty,
  resampleUntil, resistor, trimNumber, type Rng,
} from '../rng.js';
import { figure } from '../figures.js';
import { separatedTraps } from '../traps.js';

/**
 * Frequency response, resonance, coupling and three-phase.
 *
 * These answers are real-valued — a cutoff frequency, a quality factor, a line
 * current — so they are ordinary numeric items. The complex arithmetic is in
 * the derivation rather than the answer, which is exactly why the traps here
 * name algebraic slips (a square root left off, a factor of 2π dropped, a turns
 * ratio not squared) rather than sign conventions.
 */

/** Series resonance: the frequency where the reactances cancel. */
export const seriesResonance: Generator = {
  id: 'ee3300.resonance.series',
  title: 'Series resonant frequency and Q',
  kcRefs: [
    { kc: 'ee3300.series-resonance', weight: 0.6 },
    { kc: 'ee3300.quality-factor-bandwidth', weight: 0.4 },
  ],
  difficultyB: 0.3,
  generate(rng: Rng) {
    const l = inductance(rng);
    const c = capacitance(rng);
    const r = resistor(rng, { minDecade: 0, maxDecade: 2 });

    const f0 = 1 / (2 * Math.PI * Math.sqrt(l * c));
    const q = (1 / r) * Math.sqrt(l / c);
    const bandwidth = f0 / q;

    const mode = pick(rng, ['f0', 'q', 'bandwidth'] as const);
    const answer = mode === 'f0' ? f0 : mode === 'q' ? q : bandwidth;
    const unit = mode === 'q' ? '' : 'Hz';

    // omega0 rather than f0 is the classic slip, and it is a factor of 2pi;
    // the "forgot the square root" one is a factor of sqrt(LC).
    const asOmega = 1 / Math.sqrt(l * c);
    const noRoot = 1 / (2 * Math.PI * l * c);

    const question =
      mode === 'f0'
        ? 'Find the resonant frequency $f_0$.'
        : mode === 'q'
          ? 'Find the quality factor $Q$.'
          : 'Find the half-power bandwidth, in hertz.';

    const traps =
      mode === 'f0'
        ? [
            {
              misconception: 'resonance.omega-reported-as-f',
              value: asOmega,
              tolerance: { rel: 0.02 },
              feedback:
                `That is $\\omega_0 = 1/\\sqrt{LC} = ${trimNumber(asOmega, 5)}\\,\\mathrm{rad/s}$. ` +
                `The question asks for hertz: divide by $2\\pi$.`,
            },
            {
              misconception: 'resonance.square-root-omitted',
              value: noRoot,
              tolerance: { rel: 0.02 },
              feedback:
                `You left off the square root. $\\omega_0^2 = 1/(LC)$, so $\\omega_0 = 1/\\sqrt{LC}$.`,
            },
          ]
        : mode === 'q'
          ? [
              {
                misconception: 'resonance.q-inverted',
                value: 1 / q,
                tolerance: { rel: 0.02 },
                feedback:
                  `That is $1/Q$. For a **series** RLC, $Q = \\dfrac{1}{R}\\sqrt{L/C}$ — the inverted form ` +
                  `is the parallel case, where the roles of R swap.`,
              },
              {
                misconception: 'resonance.square-root-omitted',
                value: (1 / r) * (l / c),
                tolerance: { rel: 0.02 },
                feedback: `You left off the square root: $Q = \\dfrac{1}{R}\\sqrt{L/C}$, not $\\dfrac{L}{RC}$.`,
              },
            ]
          : [
              {
                misconception: 'resonance.bandwidth-multiplied-by-q',
                value: f0 * q,
                tolerance: { rel: 0.02 },
                feedback:
                  `You multiplied. A high-$Q$ circuit is **more** selective, so its bandwidth is ` +
                  `narrower: $\\mathrm{BW} = f_0/Q$.`,
              },
              {
                misconception: 'resonance.omega-reported-as-f',
                value: asOmega / q,
                tolerance: { rel: 0.02 },
                feedback: `That is the bandwidth in rad/s. The question asks for hertz.`,
              },
            ];

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [mantissaDifficulty(f0), ratioDifficulty(q, 5)]),
      stem:
        `A series RLC circuit has $R = ${ohms(r)}$, $L = ${trimNumber(l * 1000)}\\,\\mathrm{mH}$ and ` +
        `$C = ${trimNumber(c * 1e6, 3)}\\,\\mathrm{\\mu F}$.\n\n${question}`,
      answer: { kind: 'numeric' as const, value: answer, unit, tolerance: DEFAULT_TOLERANCE },
      figure: figure('Series RLC resonator')
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
      misconceptionTraps: separatedTraps(answer, DEFAULT_TOLERANCE, traps),
      explanation: {
        steps: [
          `At resonance $X_L = X_C$, so $\\omega_0 L = \\dfrac{1}{\\omega_0 C}$ and $\\omega_0 = \\dfrac{1}{\\sqrt{LC}} = ${trimNumber(asOmega, 5)}\\,\\mathrm{rad/s}$.`,
          `$f_0 = \\dfrac{\\omega_0}{2\\pi} = ${trimNumber(f0, 5)}\\,\\mathrm{Hz}$.`,
          `$Q = \\dfrac{1}{R}\\sqrt{\\dfrac{L}{C}} = ${trimNumber(q, 4)}$, and $\\mathrm{BW} = \\dfrac{f_0}{Q} = ${trimNumber(bandwidth, 5)}\\,\\mathrm{Hz}$.`,
          `The answer is $${trimNumber(answer, 5)}${unit ? `\\,\\mathrm{${unit}}` : ''}$.`,
        ],
        principle:
          'Resonance is where the reactances cancel. Q measures how sharply, and bandwidth is inversely proportional to it.',
        hints: [
          'Set the two reactances equal and solve for omega.',
          'Is the question asking in rad/s or in hertz?',
        ],
      },
    };
  },
};

/** First-order RC or RL filter: the half-power frequency. */
export const filterCutoff: Generator = {
  id: 'ee3300.filters.cutoff',
  title: 'First-order filter cutoff',
  kcRefs: [{ kc: 'ee3300.passive-filters', weight: 1 }],
  difficultyB: -0.3,
  generate(rng: Rng) {
    const kind = pick(rng, ['rc', 'rl'] as const);
    const r = resistor(rng, { minDecade: 2, maxDecade: 4 });
    const c = capacitance(rng);
    const l = inductance(rng);

    const fc = kind === 'rc' ? 1 / (2 * Math.PI * r * c) : r / (2 * Math.PI * l);
    const omegaC = 2 * Math.PI * fc;
    const inverted = kind === 'rc' ? (2 * Math.PI * r * c) : (2 * Math.PI * l) / r;

    const elementText =
      kind === 'rc'
        ? `$C = ${trimNumber(c * 1e6, 3)}\\,\\mathrm{\\mu F}$`
        : `$L = ${trimNumber(l * 1000)}\\,\\mathrm{mH}$`;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [mantissaDifficulty(fc)]),
      stem:
        `A first-order ${kind === 'rc' ? 'RC' : 'RL'} low-pass filter is built from $R = ${ohms(r)}$ and ` +
        `${elementText}.\n\nFind the cutoff (half-power) frequency in hertz.`,
      answer: { kind: 'numeric' as const, value: fc, unit: 'Hz', tolerance: DEFAULT_TOLERANCE },
      figure:
        kind === 'rc'
          ? figure('RC low-pass filter')
              .vac('V1', { x: 4, y: 12 }, 1)
              .r('R1', { x: 12, y: 6 }, r, 90)
              .c('C1', { x: 18, y: 10 }, c)
              .wire({ x: 4, y: 10 }, { x: 4, y: 6 }, { x: 10, y: 6 })
              .wire({ x: 14, y: 6 }, { x: 18, y: 6 }, { x: 18, y: 8 })
              .wire({ x: 4, y: 14 }, { x: 4, y: 18 }, { x: 18, y: 18 })
              .wire({ x: 18, y: 12 }, { x: 18, y: 18 })
              .ground({ x: 4, y: 18 })
              .label({ x: 16, y: 6 }, 'out')
              .build()
          : figure('RL low-pass filter')
              .vac('V1', { x: 4, y: 12 }, 1)
              .l('L1', { x: 12, y: 6 }, l, 90)
              .r('R1', { x: 18, y: 10 }, r)
              .wire({ x: 4, y: 10 }, { x: 4, y: 6 }, { x: 10, y: 6 })
              .wire({ x: 14, y: 6 }, { x: 18, y: 6 }, { x: 18, y: 8 })
              .wire({ x: 4, y: 14 }, { x: 4, y: 18 }, { x: 18, y: 18 })
              .wire({ x: 18, y: 12 }, { x: 18, y: 18 })
              .ground({ x: 4, y: 18 })
              .label({ x: 16, y: 6 }, 'out')
              .build(),
      options: [],
      misconceptionTraps: separatedTraps(fc, DEFAULT_TOLERANCE, [
        {
          misconception: 'filter.omega-reported-as-f',
          value: omegaC,
          tolerance: { rel: 0.02 },
          feedback:
            `That is $\\omega_c = ${trimNumber(omegaC, 5)}\\,\\mathrm{rad/s}$. The question asks for hertz: ` +
            `$f_c = \\omega_c / 2\\pi$.`,
        },
        {
          misconception: 'filter.time-constant-inverted',
          value: inverted,
          tolerance: { rel: 0.02 },
          feedback:
            `You have the reciprocal. The time constant is ${kind === 'rc' ? '$RC$' : '$L/R$'}, and the ` +
            `cutoff is $1/(2\\pi\\tau)$ — a **larger** time constant means a **lower** cutoff.`,
        },
      ]),
      explanation: {
        steps: [
          kind === 'rc'
            ? `The corner is where $|X_C| = R$: $\\dfrac{1}{\\omega C} = R$, so $\\omega_c = \\dfrac{1}{RC}$.`
            : `The corner is where $X_L = R$: $\\omega L = R$, so $\\omega_c = \\dfrac{R}{L}$.`,
          `$\\omega_c = ${trimNumber(omegaC, 5)}\\,\\mathrm{rad/s}$.`,
          `$f_c = \\dfrac{\\omega_c}{2\\pi} = ${trimNumber(fc, 5)}\\,\\mathrm{Hz}$.`,
          `At that frequency the output is $1/\\sqrt{2}$ of the input — half the power, which is what "half-power point" names.`,
        ],
        principle:
          'The cutoff is where the reactance equals the resistance, because that is where the two contributions to the magnitude are equal.',
        hints: [
          'Set the magnitude of the reactance equal to the resistance.',
          'The result of that is in rad/s. What does the question ask for?',
        ],
      },
    };
  },
};

/** Balanced three-phase: line and phase quantities, and total power. */
export const threePhase: Generator = {
  id: 'ee3300.three-phase.balanced',
  title: 'Balanced three-phase quantities',
  kcRefs: [
    { kc: 'ee3300.three-phase-wye-delta', weight: 0.5 },
    { kc: 'ee3300.three-phase-power', weight: 0.5 },
  ],
  difficultyB: 0.6,
  generate(rng: Rng) {
    const vLine = pick(rng, [208, 240, 380, 415, 480]);
    const zMagnitude = pick(rng, [10, 12, 15, 20, 24, 30]);
    const theta = pick(rng, [20, 25, 30, 36.87, 45, 53.13]);
    const connection = pick(rng, ['wye', 'delta'] as const);
    const mode = pick(rng, ['line-current', 'total-power'] as const);

    const root3 = Math.sqrt(3);
    const vPhase = connection === 'wye' ? vLine / root3 : vLine;
    const iPhase = vPhase / zMagnitude;
    const iLine = connection === 'wye' ? iPhase : iPhase * root3;
    const power = root3 * vLine * iLine * Math.cos((theta * Math.PI) / 180);

    const answer = mode === 'line-current' ? iLine : power;
    const unit = mode === 'line-current' ? 'A' : 'W';

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      // Four signals, because with one the whole generator landed in a single
      // difficulty band and CAT had nothing to choose between. A delta needs
      // the root-three step on currents rather than voltages, and a power
      // question needs it on top of the current it already had to find.
      difficultyB: adjustDifficulty(this.difficultyB, [
        ratioDifficulty(theta, 30),
        mantissaDifficulty(zMagnitude),
        mantissaDifficulty(vLine),
        connection === 'delta' ? 0.7 : -0.7,
        mode === 'total-power' ? 0.7 : -0.7,
      ]),
      stem:
        `A balanced **${connection}**-connected load of $Z = ${trimNumber(zMagnitude)} \\angle ${trimNumber(theta)}^\\circ\\,\\mathrm{\\Omega}$ ` +
        `per phase is supplied from a $${trimNumber(vLine)}\\,\\mathrm{V}$ (rms, line-to-line) three-phase source.\n\n` +
        (mode === 'line-current' ? 'Find the line current.' : 'Find the total real power delivered.'),
      answer: { kind: 'numeric' as const, value: answer, unit, tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(
        answer,
        DEFAULT_TOLERANCE,
        mode === 'line-current'
          ? [
              {
                misconception: 'three-phase.line-phase-confused',
                value: iPhase === iLine ? iLine / root3 : iPhase,
                tolerance: { rel: 0.02 },
                feedback:
                  connection === 'wye'
                    ? `In a wye the line and phase currents are the **same**; it is the voltages that differ by $\\sqrt{3}$.`
                    : `In a delta the line current is $\\sqrt{3}$ times the phase current; it is the voltages that are the same.`,
              },
              {
                misconception: 'three-phase.root-three-omitted',
                value: connection === 'wye' ? vLine / zMagnitude : (vLine / zMagnitude) / root3,
                tolerance: { rel: 0.02 },
                feedback:
                  `You used the line voltage directly across one phase of a ${connection}. ` +
                  `Check which voltage appears across a single phase impedance.`,
              },
            ]
          : [
              {
                misconception: 'three-phase.power-factor-omitted',
                value: root3 * vLine * iLine,
                tolerance: { rel: 0.02 },
                feedback:
                  `That is the **apparent** power. Real power carries the power factor: ` +
                  `$P = \\sqrt{3}\\,V_L I_L \\cos\\theta$, and $\\cos${trimNumber(theta)}^\\circ = ${trimNumber(Math.cos((theta * Math.PI) / 180), 4)}$.`,
              },
              {
                misconception: 'three-phase.root-three-omitted',
                value: vLine * iLine * Math.cos((theta * Math.PI) / 180),
                tolerance: { rel: 0.02 },
                feedback:
                  `You dropped the $\\sqrt{3}$. Three phases each deliver $V_\\phi I_\\phi \\cos\\theta$, and ` +
                  `writing that in line quantities produces $\\sqrt{3}\\,V_L I_L \\cos\\theta$.`,
              },
            ],
      ),
      explanation: {
        steps: [
          connection === 'wye'
            ? `In a wye, each phase impedance sees $V_\\phi = V_L/\\sqrt{3} = ${trimNumber(vPhase, 5)}\\,\\mathrm{V}$.`
            : `In a delta, each phase impedance sees the full line voltage: $V_\\phi = ${trimNumber(vPhase, 5)}\\,\\mathrm{V}$.`,
          `$I_\\phi = \\dfrac{V_\\phi}{|Z|} = ${trimNumber(iPhase, 5)}\\,\\mathrm{A}$.`,
          connection === 'wye'
            ? `In a wye the line current equals the phase current: $I_L = ${trimNumber(iLine, 5)}\\,\\mathrm{A}$.`
            : `In a delta, $I_L = \\sqrt{3} I_\\phi = ${trimNumber(iLine, 5)}\\,\\mathrm{A}$.`,
          `$P = \\sqrt{3} V_L I_L \\cos\\theta = ${trimNumber(power, 5)}\\,\\mathrm{W}$, so the answer is $${trimNumber(answer, 5)}\\,\\mathrm{${unit}}$.`,
        ],
        principle:
          'Wye and delta each share one quantity between line and phase and scale the other by root three. Which one is shared is the whole distinction.',
        hints: [
          'Which voltage actually appears across one phase impedance?',
          'In this connection, are the line and phase currents the same?',
        ],
      },
    };
  },
};

/** Impedance reflected through an ideal transformer. */
export const reflectedImpedance: Generator = {
  id: 'ee3300.transformer.reflected',
  title: 'Impedance through an ideal transformer',
  kcRefs: [{ kc: 'ee3300.ideal-transformer', weight: 1 }],
  difficultyB: 0.2,
  generate(rng: Rng) {
    // A turns ratio of 1 makes every trap equal the answer, and a ratio of 2
    // makes n^2 = 2n, so the "did not square" trap lands on it as well.
    const n = resampleUntil(
      rng,
      (g) => pick(g, [2, 2.5, 3, 4, 5, 8, 10]),
      (ratio) => ratio !== 1 && ratio * ratio !== 2 * ratio,
    );
    const zLoad = resistor(rng, { minDecade: 0, maxDecade: 2 });
    const primaryToSecondary = rng() < 0.5;

    const reflected = primaryToSecondary ? zLoad / (n * n) : zLoad * n * n;
    const notSquared = primaryToSecondary ? zLoad / n : zLoad * n;
    const wrongWay = primaryToSecondary ? zLoad * n * n : zLoad / (n * n);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [ratioDifficulty(n, 3)]),
      stem:
        `An ideal transformer has $N_1 : N_2 = ${primaryToSecondary ? `1 : ${trimNumber(n)}` : `${trimNumber(n)} : 1`}$. ` +
        `A resistive load of $${ohms(zLoad)}$ is connected across the **secondary**.\n\n` +
        `What resistance does a source connected to the primary see?`,
      answer: { kind: 'numeric' as const, value: reflected, unit: 'ohm', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(reflected, DEFAULT_TOLERANCE, [
        {
          misconception: 'transformer.turns-ratio-not-squared',
          value: notSquared,
          tolerance: { rel: 0.02 },
          feedback:
            `You scaled by the turns ratio once. Voltage scales by $n$ and current by $1/n$, so impedance — ` +
            `their ratio — scales by $n^2$.`,
        },
        {
          misconception: 'transformer.reflection-direction-reversed',
          value: wrongWay,
          tolerance: { rel: 0.02 },
          feedback:
            `You reflected the wrong way. Looking from the primary at a load on the secondary, ` +
            `$Z_{in} = \\left(\\dfrac{N_1}{N_2}\\right)^2 Z_L$.`,
        },
      ]),
      explanation: {
        steps: [
          `Voltage scales with the turns ratio and current inversely: $V_1 = \\dfrac{N_1}{N_2}V_2$, $I_1 = \\dfrac{N_2}{N_1}I_2$.`,
          `Impedance is their ratio, so it scales with the **square**: $Z_{in} = \\left(\\dfrac{N_1}{N_2}\\right)^2 Z_L$.`,
          `$\\left(\\dfrac{N_1}{N_2}\\right)^2 = ${trimNumber(primaryToSecondary ? 1 / (n * n) : n * n, 4)}$.`,
          `$Z_{in} = ${trimNumber(primaryToSecondary ? 1 / (n * n) : n * n, 4)} \\times ${trimNumber(zLoad)} = ${ohms(reflected)}$.`,
        ],
        principle:
          'A transformer scales impedance by the square of the turns ratio, because impedance is a ratio of two quantities that scale oppositely.',
        hints: [
          'What happens to the voltage, and what happens to the current?',
          'Impedance is voltage over current — combine the two scalings.',
        ],
      },
    };
  },
};
