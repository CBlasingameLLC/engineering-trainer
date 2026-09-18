import type { Generator } from '../types.js';
import { DEFAULT_TOLERANCE } from '../types.js';
import {
  adjustDifficulty, amps, distinctResistorPair, mantissaDifficulty, ohms, pick, ratioDifficulty,
  resistor, supplyVoltage, trimNumber, volts, type Rng,
} from '../rng.js';
import { separatedTraps } from '../traps.js';

const parallel = (a: number, b: number): number => (a * b) / (a + b);

/** Shared topology: Vs -> R1, divider with R2 to ground, R3 in series to terminals a-b. */
function theveninNetwork(rng: Rng) {
  const vs = supplyVoltage(rng);
  // The divider pair must be clearly unequal, or the inverted-ratio trap on
  // V_th collapses onto the correct answer.
  const [r1, r2] = distinctResistorPair(rng, { minRatio: 1.5, minDecade: 2, maxDecade: 3 });
  const r3 = resistor(rng, { minDecade: 2, maxDecade: 3 });
  const vth = (vs * r2) / (r1 + r2);
  const rth = r3 + parallel(r1, r2);
  // Signals shared by every generator built on this topology: a near-unity
  // divider is harder to reason about, and a large R3 makes the suppressed
  // parallel combination less visible in the result.
  const signals = [ratioDifficulty(r1, r2), mantissaDifficulty(vs), ratioDifficulty(r3, parallel(r1, r2))];
  return { vs, r1, r2, r3, vth, rth, signals };
}

const networkDescription = (n: ReturnType<typeof theveninNetwork>): string =>
  `A ${volts(n.vs)} source drives $R_1 = ${ohms(n.r1)}$ into a node where $R_2 = ${ohms(n.r2)}$ ` +
  `returns to ground. From that node, $R_3 = ${ohms(n.r3)}$ runs out to terminal $a$; terminal $b$ is ground.`;

/**
 * Thevenin resistance.
 *
 * The defining error in this unit is failing to suppress the independent source
 * before computing R_th — which leaves the topology unchanged and collapses the
 * parallel combination into a series one. That is trapped explicitly.
 */
export const theveninResistance: Generator = {
  id: 'ee2300.thevenin.resistance',
  title: 'Thevenin resistance',
  kcRefs: [
    { kc: 'ee2300.thevenin', weight: 0.7 },
    { kc: 'ee2300.linearity-superposition', weight: 0.3 },
  ],
  difficultyB: 0.5,
  generate(rng: Rng) {
    const n = theveninNetwork(rng);
    const notSuppressed = n.r1 + n.r2 + n.r3;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, n.signals),
      stem: `${networkDescription(n)} Find the Thevenin resistance $R_{th}$ seen from terminals $a$-$b$.`,
      answer: { kind: 'numeric' as const, value: n.rth, unit: 'ohm', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(n.rth, DEFAULT_TOLERANCE, [
        {
          misconception: 'thevenin.source-not-suppressed',
          value: notSuppressed,
          tolerance: { rel: 0.015 },
          feedback:
            `You added all three resistances, which is what you get by leaving the voltage source in place. ` +
            `Suppressing it **shorts** that branch, putting $R_1$ in parallel with $R_2$.`,
        },
        {
          misconception: 'thevenin.source-opened',
          value: n.r2 + n.r3,
          tolerance: { rel: 0.015 },
          feedback:
            `You removed the $R_1$ branch entirely, which is how a **current** source is suppressed. ` +
            `An independent **voltage** source is replaced by a short circuit, not an open.`,
        },
      ]),
      explanation: {
        steps: [
          `Suppress the independent source: an ideal voltage source becomes a **short circuit**.`,
          `With that branch shorted, $R_1$ now runs from the divider node to ground, exactly as $R_2$ does — so they are in parallel:`,
          `$R_1 \\| R_2 = \\dfrac{(${trimNumber(n.r1)})(${trimNumber(n.r2)})}{${trimNumber(n.r1)} + ${trimNumber(n.r2)}} = ${ohms(parallel(n.r1, n.r2))}$.`,
          `$R_3$ is in series on the way out to terminal $a$, so it adds:`,
          `$R_{th} = R_3 + (R_1 \\| R_2) = ${ohms(n.rth)}$.`,
        ],
        principle:
          'Suppress independent sources before finding R_th: voltage sources short, current sources open. Dependent sources are never suppressed.',
        hints: [
          'What replaces an ideal voltage source when you suppress it?',
          'Once that branch is shorted, which two resistors share both nodes?',
        ],
      },
    };
  },
};

/** Thevenin voltage: the open-circuit terminal voltage. */
export const theveninVoltage: Generator = {
  id: 'ee2300.thevenin.voltage',
  title: 'Thevenin voltage',
  kcRefs: [{ kc: 'ee2300.thevenin', weight: 1 }],
  difficultyB: 0.35,
  generate(rng: Rng) {
    const n = theveninNetwork(rng);
    const inverted = (n.vs * n.r1) / (n.r1 + n.r2);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, n.signals),
      stem: `${networkDescription(n)} Find the Thevenin voltage $V_{th}$ at terminals $a$-$b$.`,
      answer: { kind: 'numeric' as const, value: n.vth, unit: 'V', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(n.vth, DEFAULT_TOLERANCE, [
        {
          misconception: 'divider.inverted-ratio',
          value: inverted,
          tolerance: { rel: 0.015 },
          feedback: `You inverted the divider ratio. The voltage across $R_2$ puts $R_2$ in the numerator.`,
        },
        {
          misconception: 'thevenin.r3-drop-assumed',
          value: (n.vs * n.r2) / (n.r1 + n.r2 + n.r3),
          tolerance: { rel: 0.015 },
          feedback:
            `You included $R_3$ in the divider. With the terminals **open**, no current flows through $R_3$, ` +
            `so it drops zero volts and cannot affect $V_{th}$.`,
        },
      ]),
      explanation: {
        steps: [
          `$V_{th}$ is the voltage at the **open** terminals, so no current leaves through $R_3$.`,
          `With zero current in $R_3$ there is zero drop across it, so terminal $a$ sits at the divider node voltage.`,
          `$V_{th} = V_s \\dfrac{R_2}{R_1 + R_2} = ${trimNumber(n.vs)} \\cdot \\dfrac{${trimNumber(n.r2)}}{${trimNumber(n.r1)} + ${trimNumber(n.r2)}} = ${volts(n.vth)}$.`,
        ],
        principle:
          'The Thevenin voltage is the open-circuit voltage: any resistance carrying no current drops nothing and drops out of the calculation.',
        hints: [
          'How much current flows out of an open terminal?',
          'If no current flows through $R_3$, what is the voltage across it?',
        ],
      },
    };
  },
};

/** Norton current, obtained from the Thevenin pair. */
export const nortonCurrent: Generator = {
  id: 'ee2300.norton.current',
  title: 'Norton equivalent current',
  kcRefs: [
    { kc: 'ee2300.norton', weight: 0.8 },
    { kc: 'ee2300.thevenin', weight: 0.2 },
  ],
  difficultyB: 0.55,
  generate(rng: Rng) {
    const n = theveninNetwork(rng);
    const iN = n.vth / n.rth;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, n.signals),
      stem: `${networkDescription(n)} Find the Norton current $I_N$ for terminals $a$-$b$.`,
      answer: { kind: 'numeric' as const, value: iN, unit: 'A', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(iN, DEFAULT_TOLERANCE, [
        {
          misconception: 'norton.wrong-resistance',
          value: n.vth / (n.r1 + n.r2 + n.r3),
          tolerance: { rel: 0.015 },
          feedback: `You divided by the un-suppressed total resistance. $I_N = V_{th}/R_{th}$, and $R_{th}$ requires shorting the source.`,
        },
      ]),
      explanation: {
        steps: [
          `The Norton and Thevenin equivalents describe the same network, sharing the same resistance $R_{th} = R_N$.`,
          `First find the pair: $V_{th} = ${volts(n.vth)}$ and $R_{th} = ${ohms(n.rth)}$.`,
          `$I_N$ is the short-circuit terminal current, which is $V_{th}$ driven through $R_{th}$:`,
          `$I_N = \\dfrac{V_{th}}{R_{th}} = \\dfrac{${trimNumber(n.vth, 4)}}{${trimNumber(n.rth, 4)}} = ${amps(iN)}$.`,
        ],
        principle:
          'Norton and Thevenin are source transformations of one another: same resistance, and I_N = V_th / R_th.',
        hints: ['Find the Thevenin pair first.', 'The Norton current is the short-circuit current.'],
      },
    };
  },
};

/**
 * Maximum power transfer. The missing factor of 4 is near-universal, so it is
 * always trapped.
 */
export const maxPowerTransfer: Generator = {
  id: 'ee2300.max-power-transfer.load',
  title: 'Maximum power transfer',
  kcRefs: [
    { kc: 'ee2300.max-power-transfer', weight: 0.8 },
    { kc: 'ee2300.thevenin', weight: 0.2 },
  ],
  difficultyB: 0.45,
  generate(rng: Rng) {
    const n = theveninNetwork(rng);
    const pMax = (n.vth * n.vth) / (4 * n.rth);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, n.signals),
      stem:
        `${networkDescription(n)} A load $R_L$ is connected across $a$-$b$ and chosen for maximum power transfer. ` +
        `Find the power delivered to that load.`,
      answer: { kind: 'numeric' as const, value: pMax, unit: 'W', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(pMax, DEFAULT_TOLERANCE, [
        {
          misconception: 'max-power.missing-factor-four',
          value: (n.vth * n.vth) / n.rth,
          tolerance: { rel: 0.015 },
          feedback:
            `You used $V_{th}^2/R_{th}$. At the matched condition the load sees only **half** of $V_{th}$, ` +
            `and squaring that half introduces the factor of 4: $P_{max} = V_{th}^2/(4R_{th})$.`,
        },
        {
          misconception: 'max-power.total-power',
          value: (n.vth * n.vth) / (2 * n.rth),
          tolerance: { rel: 0.015 },
          feedback:
            `That is the **total** power drawn from the source at the match. Half of it is dissipated in ` +
            `$R_{th}$ itself; the load receives the other half.`,
        },
      ]),
      explanation: {
        steps: [
          `Maximum power transfer occurs when $R_L = R_{th} = ${ohms(n.rth)}$.`,
          `At that match the source and load split $V_{th}$ evenly, so the load sees $V_{th}/2 = ${volts(n.vth / 2)}$.`,
          `$P_{max} = \\dfrac{(V_{th}/2)^2}{R_L} = \\dfrac{V_{th}^2}{4R_{th}} = \\dfrac{(${trimNumber(n.vth, 4)})^2}{4(${trimNumber(n.rth, 4)})} = ${trimNumber(pMax, 4)}\\,\\text{W}$.`,
          `Note the efficiency: the same power is burned in $R_{th}$, so matched transfer is only 50% efficient.`,
        ],
        principle:
          'Matched load means the source and load divide V_th equally, which puts a factor of 4 — not 1 — under V_th squared.',
        hints: [
          'What is $R_L$ at maximum power transfer?',
          'How much of $V_{th}$ actually appears across the load once it is connected?',
        ],
      },
    };
  },
};

/**
 * Source transformation in both directions.
 *
 * Rotating the direction matters: a student fluent at V/R can still stall on
 * I*R, and a bank that always transforms the same way never finds out.
 */
export const sourceTransformation: Generator = {
  id: 'ee2300.source-transformation.convert',
  title: 'Source transformation',
  kcRefs: [{ kc: 'ee2300.source-transformation', weight: 1 }],
  difficultyB: 0.1,
  generate(rng: Rng) {
    const rs = resistor(rng, { minDecade: 2, maxDecade: 3 });
    const toCurrent = rng() < 0.5;

    if (toCurrent) {
      const vs = supplyVoltage(rng);
      const is = vs / rs;
      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [mantissaDifficulty(rs), -0.5]),
        stem:
          `A ${volts(vs)} source sits in series with $R_s = ${ohms(rs)}$. ` +
          `Find the current of the equivalent Norton-form source.`,
        answer: { kind: 'numeric' as const, value: is, unit: 'A', tolerance: DEFAULT_TOLERANCE },
        options: [],
        misconceptionTraps: separatedTraps(is, DEFAULT_TOLERANCE, [
          {
            misconception: 'source-transform.multiplied',
            value: vs * rs,
            tolerance: { rel: 0.015 },
            feedback: `You multiplied. Going from a voltage source to a current source divides: $I_s = V_s / R_s$.`,
          },
        ]),
        explanation: {
          steps: [
            `The two forms must look identical to anything connected outside them, so match their short-circuit currents.`,
            `Shorting the terminals of the series form gives $V_s / R_s$, which is the current the parallel form must supply:`,
            `$I_s = \\dfrac{${trimNumber(vs)}}{${trimNumber(rs)}} = ${amps(is)}$, with the same $R_s$ now in **parallel**.`,
            `The resistance never changes value under the transformation — only whether it sits in series or parallel.`,
          ],
          principle:
            'Source transformation preserves what the outside world sees: the resistance keeps its value and moves between series and parallel.',
          hints: ['What happens if you short the terminals of the series form?', 'Is this a divide or a multiply?'],
        },
      };
    }

    const isMa = pick(rng, [1, 2, 4, 5, 8, 10]);
    const is = isMa / 1000;
    const vs = is * rs;
    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [mantissaDifficulty(rs), 0.5]),
      stem:
        `A ${amps(is)} source sits in parallel with $R_s = ${ohms(rs)}$. ` +
        `Find the voltage of the equivalent Thevenin-form source.`,
      answer: { kind: 'numeric' as const, value: vs, unit: 'V', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(vs, DEFAULT_TOLERANCE, [
        {
          misconception: 'source-transform.divided',
          value: is / rs,
          tolerance: { rel: 0.015 },
          feedback: `You divided. Going from a current source to a voltage source multiplies: $V_s = I_s R_s$.`,
        },
      ]),
      explanation: {
        steps: [
          `Match the open-circuit voltages of the two forms.`,
          `With the terminals open, all of $I_s$ flows through $R_s$, so the terminal voltage is $I_s R_s$:`,
          `$V_s = (${trimNumber(is)})(${trimNumber(rs)}) = ${volts(vs)}$, with the same $R_s$ now in **series**.`,
        ],
        principle:
          'Source transformation preserves what the outside world sees: the resistance keeps its value and moves between series and parallel.',
        hints: ['Where does the source current go when the terminals are open?', 'Is this a divide or a multiply?'],
      },
    };
  },
};
