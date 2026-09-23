import type { Generator } from '../types.js';
import { DEFAULT_TOLERANCE } from '../types.js';
import {
  adjustDifficulty, distinctResistorPair, mantissaDifficulty, ohms, pick, ratioDifficulty,
  resistor, trimNumber, volts, type Rng,
} from '../rng.js';
import { separatedTraps } from '../traps.js';

/** A small input signal, in volts. */
const signalVoltage = (rng: Rng): number => pick(rng, [0.1, 0.2, 0.25, 0.4, 0.5, 0.75, 1, 1.2, 1.5, 2]);

/**
 * Inverting and non-inverting gain.
 *
 * Two errors dominate and are trapped separately: dropping the minus sign on
 * the inverting configuration, and omitting the "1 +" on the non-inverting one.
 * They are different misunderstandings — one is sign discipline, the other is
 * not seeing that the input is fed forward — so they get distinct tags.
 */
export const opAmpGain: Generator = {
  id: 'ee2300.op-amp-inverting.gain',
  title: 'Op-amp gain',
  kcRefs: [
    { kc: 'ee2300.op-amp-inverting', weight: 0.75 },
    { kc: 'ee2300.op-amp-ideal', weight: 0.25 },
  ],
  difficultyB: 0.3,
  generate(rng: Rng) {
    // Unity gain would make the non-inverting "missing 1+" trap land on the
    // correct answer, so keep the resistors clearly unequal.
    const [rIn, rf] = distinctResistorPair(rng, { minRatio: 1.5, minDecade: 3, maxDecade: 4 });
    const vin = signalVoltage(rng);
    const inverting = rng() < 0.5;

    const vout = inverting ? (-rf / rIn) * vin : (1 + rf / rIn) * vin;
    // A round gain is recognisable; the non-inverting form is harder because
    // of the extra unity term students routinely drop.
    const difficultyB = adjustDifficulty(this.difficultyB, [
      mantissaDifficulty(rf / rIn),
      inverting ? -0.5 : 0.5,
      ratioDifficulty(rf, rIn),
    ]);

    const traps = inverting
      ? [
          {
            misconception: 'op-amp.sign-dropped',
            value: (rf / rIn) * vin,
            tolerance: { rel: 0.015 },
            feedback:
              `The magnitude is right but the sign is missing. An inverting amplifier has gain $-R_f/R_{in}$ — ` +
              `the output swings opposite to the input.`,
          },
        ]
      : [
          {
            misconception: 'op-amp.noninverting-missing-unity',
            value: (rf / rIn) * vin,
            tolerance: { rel: 0.015 },
            feedback:
              `You used $R_f/R_{in}$, the inverting gain. The non-inverting configuration is $1 + R_f/R_{in}$: ` +
              `the input is also fed forward to the output, so the gain can never fall below 1.`,
          },
        ];

    const config = inverting ? 'inverting' : 'non-inverting';
    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB,
      stem:
        `An ideal op-amp is wired as a **${config}** amplifier with $R_{in} = ${ohms(rIn)}$ and ` +
        `$R_f = ${ohms(rf)}$. For an input of $${volts(vin)}$, find the output voltage.`,
      answer: { kind: 'numeric' as const, value: vout, unit: 'V', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(vout, DEFAULT_TOLERANCE, traps),
      explanation: {
        steps: [
          `An ideal op-amp under negative feedback draws no input current and holds its two inputs at the same voltage (the virtual short).`,
          inverting
            ? `With the **+** input grounded, the **-** input sits at a virtual ground, so the input current $V_{in}/R_{in}$ must all flow on through $R_f$.`
            : `The **-** input follows $V_{in}$, and $R_{in}$ with $R_f$ forms a divider from $V_{out}$ back to that node.`,
          inverting
            ? `$V_{out} = -\\dfrac{R_f}{R_{in}} V_{in} = -\\dfrac{${trimNumber(rf)}}{${trimNumber(rIn)}} \\cdot ${trimNumber(vin)} = ${volts(vout)}$.`
            : `$V_{out} = \\left(1 + \\dfrac{R_f}{R_{in}}\\right) V_{in} = \\left(1 + \\dfrac{${trimNumber(rf)}}{${trimNumber(rIn)}}\\right) ${trimNumber(vin)} = ${volts(vout)}$.`,
        ],
        principle:
          'Both configurations follow from the virtual short and zero input current; the inverting one grounds the + input, the non-inverting one drives it.',
        hints: [
          'What is the voltage at the - input?',
          inverting ? 'Where does the input current go, if not into the op-amp?' : 'Can a non-inverting amplifier have gain less than 1?',
        ],
      },
    };
  },
};

/** Summing amplifier — superposition applied at a virtual ground. */
export const opAmpSumming: Generator = {
  id: 'ee2300.op-amp-summing.output',
  title: 'Summing amplifier output',
  kcRefs: [
    { kc: 'ee2300.op-amp-summing', weight: 0.7 },
    { kc: 'ee2300.linearity-superposition', weight: 0.3 },
  ],
  difficultyB: 0.75,
  generate(rng: Rng) {
    const [r1, r2] = distinctResistorPair(rng, { minRatio: 1.5, minDecade: 3, maxDecade: 4 });
    const rf = resistor(rng, { minDecade: 3, maxDecade: 4 });
    const v1 = signalVoltage(rng);
    const v2 = signalVoltage(rng);

    const vout = -rf * (v1 / r1 + v2 / r2);
    const averaged = -(rf / r1) * ((v1 + v2) / 2);
    // Unequal input resistors defeat the averaging shortcut, which is the
    // whole discrimination this item is built around.
    const difficultyB = adjustDifficulty(this.difficultyB, [
      ratioDifficulty(r1, r2),
      mantissaDifficulty(rf),
    ]);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB,
      stem:
        `An inverting summing amplifier has inputs $${volts(v1)}$ through $R_1 = ${ohms(r1)}$ and ` +
        `$${volts(v2)}$ through $R_2 = ${ohms(r2)}$, with feedback resistor $R_f = ${ohms(rf)}$. ` +
        `Find the output voltage.`,
      answer: { kind: 'numeric' as const, value: vout, unit: 'V', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(vout, DEFAULT_TOLERANCE, [
        {
          misconception: 'op-amp.sign-dropped',
          value: -vout,
          tolerance: { rel: 0.015 },
          feedback: `Magnitude correct, sign missing. A summing amplifier built on the inverting topology outputs a negative sum.`,
        },
        {
          misconception: 'op-amp.summing-averaged',
          value: averaged,
          tolerance: { rel: 0.015 },
          feedback:
            `You averaged the inputs. Each input is weighted by its **own** resistor: $-R_f(V_1/R_1 + V_2/R_2)$. ` +
            `It only reduces to an average when the input resistors are equal and $R_f$ is chosen to divide by $n$.`,
        },
      ]),
      explanation: {
        steps: [
          `The **-** input is a virtual ground, so each source drives its own branch independently — no interaction between inputs.`,
          `Branch currents: $\\dfrac{${trimNumber(v1)}}{${trimNumber(r1)}} = ${trimNumber(v1 / r1, 4)}$ A and $\\dfrac{${trimNumber(v2)}}{${trimNumber(r2)}} = ${trimNumber(v2 / r2, 4)}$ A.`,
          `No current enters the op-amp, so their sum flows through $R_f$:`,
          `$V_{out} = -R_f\\left(\\dfrac{V_1}{R_1} + \\dfrac{V_2}{R_2}\\right) = ${volts(vout)}$.`,
        ],
        principle:
          'A virtual ground decouples the inputs, so each contributes independently and weighted by its own resistor.',
        hints: [
          'What is the voltage at the summing node?',
          'Do the two inputs interact, or does each drive its branch independently?',
        ],
      },
    };
  },
};

/**
 * Two-stage op-amp cascade.
 *
 * Stage gains multiply because each stage's output drives the next, and an
 * ideal op-amp output is a stiff source that the following stage cannot load.
 * Adding them instead is the error, and it is trapped.
 */
export const opAmpCascade: Generator = {
  id: 'ee2300.op-amp-cascade.two-stage',
  title: 'Cascaded op-amp stages',
  kcRefs: [
    { kc: 'ee2300.op-amp-cascade', weight: 0.7 },
    { kc: 'ee2300.op-amp-inverting', weight: 0.3 },
  ],
  difficultyB: 0.95,
  generate(rng: Rng) {
    const [rIn1, rf1] = distinctResistorPair(rng, { minRatio: 1.5, minDecade: 3, maxDecade: 4 });
    const [rIn2, rf2] = distinctResistorPair(rng, { minRatio: 1.5, minDecade: 3, maxDecade: 4 });
    const vin = pick(rng, [0.05, 0.1, 0.15, 0.2, 0.25, 0.4]);

    const gain1 = -rf1 / rIn1; // inverting
    const gain2 = 1 + rf2 / rIn2; // non-inverting
    const vout = vin * gain1 * gain2;

    const gainsAdded = vin * (gain1 + gain2);
    const signDropped = -vout;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        mantissaDifficulty(rf1 / rIn1),
        ratioDifficulty(rf2, rIn2),
      ]),
      stem:
        `A $${volts(vin)}$ signal feeds an **inverting** stage with $R_{in1} = ${ohms(rIn1)}$ and ` +
        `$R_{f1} = ${ohms(rf1)}$, whose output drives a **non-inverting** stage with ` +
        `$R_{in2} = ${ohms(rIn2)}$ and $R_{f2} = ${ohms(rf2)}$. Both op-amps are ideal. Find the final output voltage.`,
      answer: { kind: 'numeric' as const, value: vout, unit: 'V', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(vout, DEFAULT_TOLERANCE, [
        {
          misconception: 'cascade.gains-added',
          value: gainsAdded,
          tolerance: { rel: 0.015 },
          feedback:
            `You added the stage gains. Each stage multiplies what it receives, so the overall gain is the ` +
            `**product** $A_1 A_2$, not the sum.`,
        },
        {
          misconception: 'op-amp.sign-dropped',
          value: signDropped,
          tolerance: { rel: 0.015 },
          feedback:
            `Magnitude right, sign wrong. One stage inverts and the other does not, so exactly one sign ` +
            `flip survives to the output.`,
        },
      ]),
      explanation: {
        steps: [
          `An ideal op-amp output is a stiff voltage source, so the second stage does not load the first and the stages can be analysed independently.`,
          `Stage 1 (inverting): $A_1 = -\\dfrac{R_{f1}}{R_{in1}} = ${trimNumber(gain1, 4)}$.`,
          `Stage 2 (non-inverting): $A_2 = 1 + \\dfrac{R_{f2}}{R_{in2}} = ${trimNumber(gain2, 4)}$.`,
          `Cascaded gains multiply: $V_{out} = V_{in} A_1 A_2 = (${trimNumber(vin)})(${trimNumber(gain1, 4)})(${trimNumber(gain2, 4)}) = ${volts(vout)}$.`,
          `The output is ${vout < 0 ? 'negative' : 'positive'} because only the first stage inverts.`,
        ],
        principle:
          'Cascaded gains multiply, and they can be computed stage by stage only because an ideal op-amp output does not load the next stage.',
        hints: [
          'Does the second stage load the first? What does that let you do?',
          'Do cascaded gains add or multiply?',
        ],
      },
    };
  },
};
