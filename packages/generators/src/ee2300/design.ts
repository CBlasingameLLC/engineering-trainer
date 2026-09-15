import type { Generator } from '../types.js';
import { adjustDifficulty, capacitance, ohms, pick, resistor, trimNumber, volts, type Rng } from '../rng.js';

/**
 * Design tasks, graded by simulating what the learner built.
 *
 * Everything else in the bank asks the learner to analyse a circuit somebody
 * else drew. These ask them to produce one, which is the harder and more
 * transferable skill — and the one a numeric answer box structurally cannot
 * assess. Grading compares measured behaviour, never topology, so a spec met
 * with two resistors in series counts exactly as much as one met with one.
 *
 * Every item carries a `reference` deck that satisfies its own spec. That is
 * what makes a design task verifiable: an unsatisfiable spec is the design
 * equivalent of a wrong answer key, and without a worked example nothing can
 * catch one.
 */

const deck = (title: string, ...lines: string[]): string => [title, ...lines, '.end'].join('\n');

/**
 * Inverting amplifier to a gain and an input resistance.
 *
 * Two specifications rather than one on purpose. Gain alone fixes only the
 * ratio Rf/R1, and a learner can satisfy it without ever thinking about what
 * the input resistance of an inverting stage is — which is the part that bites
 * them later when the stage loads the thing in front of it.
 */
export const opAmpGainDesign: Generator = {
  id: 'ee2300.op-amp-inverting.design',
  title: 'Design an inverting amplifier',
  kcRefs: [
    { kc: 'ee2300.op-amp-inverting', weight: 0.7 },
    { kc: 'ee2300.op-amp-ideal', weight: 0.3 },
  ],
  difficultyB: 0.9,
  generate(rng: Rng) {
    const rIn = resistor(rng, { minDecade: 3, maxDecade: 4 });
    const gain = pick(rng, [2, 4, 5, 8, 10, 15, 20, 25]);
    const rf = rIn * gain;
    const vIn = 1;
    const vOut = -gain * vIn;

    // A large feedback resistor is the awkward case: students reach for a value
    // that is not in any series they own.
    const difficultyB = adjustDifficulty(this.difficultyB, [gain >= 15 ? 1 : -1, rf > 200e3 ? 1 : 0]);

    return {
      type: 'circuit-build' as const,
      kcRefs: this.kcRefs,
      difficultyB,
      stem:
        `Design an **inverting amplifier** using one ideal op-amp.\n\n` +
        `- Input source \`V1\` drives node \`in\` at ${volts(vIn)} DC.\n` +
        `- Closed-loop gain must be **${-gain}** (so \`out\` sits at ${volts(vOut)}).\n` +
        `- Input resistance seen by the source must be **${ohms(rIn)}**.\n\n` +
        `Name the output node \`out\`. Any resistor network that meets both ` +
        `specifications is accepted — there is more than one right answer.`,
      answer: {
        kind: 'circuit' as const,
        reference: deck(
          'inverting amplifier',
          `V1 in 0 ${vIn}`,
          `R1 in inv ${rIn}`,
          `Rf inv out ${rf}`,
          'XU1 out 0 inv opamp',
          '.op',
        ),
        requiredNodes: ['in', 'out'],
        measurements: [
          {
            probe: 'v(out)',
            analysis: 'op' as const,
            expected: vOut,
            unit: 'V',
            tolerance: { rel: 0.02 },
          },
          {
            // Input resistance, read off the current the source has to supply.
            probe: 'i(V1)',
            analysis: 'op' as const,
            expected: -vIn / rIn,
            unit: 'A',
            tolerance: { rel: 0.03 },
          },
        ],
      },
      options: [],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `For an ideal op-amp with negative feedback the inverting input is a **virtual ground**, so the source sees exactly $R_1$ to ground.`,
          `That fixes $R_1$ from the input-resistance specification: $R_1 = ${ohms(rIn)}$.`,
          `Closed-loop gain of the inverting configuration is $-R_f/R_1$, so $R_f = ${gain} \\times ${trimNumber(rIn)} = ${ohms(rf)}$.`,
          `Check: $v_{out} = -\\dfrac{R_f}{R_1} v_{in} = -${gain} \\times ${trimNumber(vIn)} = ${volts(vOut)}$.`,
        ],
        principle:
          'The inverting amplifier sets gain and input resistance with the same two resistors, so the two specifications are not independent — choose R1 from the input resistance first.',
        hints: [
          'What resistance does the source actually see, given the virtual ground?',
          'Fix R1 from the input-resistance spec, then get Rf from the gain.',
        ],
      },
    };
  },
};

/**
 * First-order RC to a target time constant.
 *
 * Deliberately under-determined: any R and C whose product is tau passes. That
 * is the lesson — the time constant is a product, and the same response can be
 * built from a large resistor and a small capacitor or the reverse.
 */
export const rcTimeConstantDesign: Generator = {
  id: 'ee2300.first-order-step.design',
  title: 'Design an RC to a target time constant',
  kcRefs: [
    { kc: 'ee2300.first-order-step', weight: 0.6 },
    { kc: 'ee2300.capacitor-iv', weight: 0.4 },
  ],
  difficultyB: 0.5,
  generate(rng: Rng) {
    const c = capacitance(rng);
    const r = resistor(rng, { minDecade: 2, maxDecade: 4 });
    const tau = r * c;
    const supply = pick(rng, [5, 9, 12]);
    const atTau = supply * (1 - Math.exp(-1));

    const difficultyB = adjustDifficulty(this.difficultyB, [tau < 1e-4 ? 1 : -1]);

    return {
      type: 'circuit-build' as const,
      kcRefs: this.kcRefs,
      difficultyB,
      stem:
        `Design a **first-order RC step response**.\n\n` +
        `- Source \`V1\` drives node \`in\` at ${volts(supply)} DC.\n` +
        `- The capacitor starts fully discharged.\n` +
        `- Node \`out\` must reach **${trimNumber(atTau, 4)} V** (that is $63.2\\%$ of ` +
        `${volts(supply)}) at $t = ${trimNumber(tau * 1000, 4)}\\,\\text{ms}$.\n\n` +
        `Give the capacitor an initial condition of 0. Any $R$ and $C$ with the ` +
        `right product is accepted.`,
      answer: {
        kind: 'circuit' as const,
        reference: deck(
          'rc step response',
          `V1 in 0 ${supply}`,
          `R1 in out ${r}`,
          `C1 out 0 ${c} IC=0`,
          '.tran',
        ),
        requiredNodes: ['in', 'out'],
        measurements: [
          {
            probe: 'v(out)',
            analysis: 'tran' as const,
            expected: atTau,
            unit: 'V',
            tolerance: { rel: 0.04 },
            atTime: tau,
          },
        ],
      },
      options: [],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `A step into a series RC gives $v_{out}(t) = V_s\\left(1 - e^{-t/\\tau}\\right)$ with $\\tau = RC$.`,
          `At $t = \\tau$ the exponential has fallen to $e^{-1} = 0.368$, so $v_{out} = 0.632 V_s$ — which is what the specification states.`,
          `So the requirement is simply $RC = ${trimNumber(tau * 1000, 4)}\\,\\text{ms}$.`,
          `One choice among many: $R = ${ohms(r)}$ with $C = ${trimNumber(c * 1e6, 3)}\\,\\mu\\text{F}$, giving $\\tau = ${trimNumber(tau * 1000, 4)}\\,\\text{ms}$.`,
        ],
        principle:
          'A first-order time constant depends only on the product RC, so the design has one equation and two unknowns — one of them is yours to choose.',
        hints: [
          'What fraction of the final value does a step response reach after exactly one time constant?',
          'You only need the product RC. Pick a convenient capacitor first.',
        ],
      },
    };
  },
};

/**
 * Loaded divider: hit an output voltage while respecting a current budget.
 *
 * The current specification is what makes this a design problem rather than
 * arithmetic. A divider ratio alone has infinitely many solutions; adding the
 * supply current forces the learner to think about the trade between stiffness
 * and wasted power, which is the actual engineering content.
 */
export const dividerDesign: Generator = {
  id: 'ee2300.voltage-divider.design',
  title: 'Design a divider to a voltage and a current budget',
  kcRefs: [
    { kc: 'ee2300.voltage-divider', weight: 0.6 },
    { kc: 'ee2300.series-parallel', weight: 0.4 },
  ],
  difficultyB: -0.2,
  generate(rng: Rng) {
    const supply = pick(rng, [5, 9, 12, 15, 24]);
    const fraction = pick(rng, [0.25, 1 / 3, 0.4, 0.5, 0.6, 0.75]);
    const vOut = Number((supply * fraction).toPrecision(4));
    const totalR = resistor(rng, { minDecade: 3, maxDecade: 4 });
    const current = supply / totalR;
    const r2 = Number((totalR * fraction).toPrecision(4));
    const r1 = Number((totalR - r2).toPrecision(4));

    const difficultyB = adjustDifficulty(this.difficultyB, [fraction === 0.5 ? -1 : 1]);

    return {
      type: 'circuit-build' as const,
      kcRefs: this.kcRefs,
      difficultyB,
      stem:
        `Design a **resistive divider**.\n\n` +
        `- Source \`V1\` drives node \`in\` at ${volts(supply)} DC.\n` +
        `- Node \`out\` must sit at **${volts(vOut)}** with no load attached.\n` +
        `- The divider must draw **${trimNumber(current * 1000, 4)} mA** from the supply, ` +
        `so the total resistance across it is fixed.\n\n` +
        `Either resistor may be built from a combination — only the measured ` +
        `behaviour is checked.`,
      answer: {
        kind: 'circuit' as const,
        reference: deck(
          'loaded divider',
          `V1 in 0 ${supply}`,
          `R1 in out ${r1}`,
          `R2 out 0 ${r2}`,
          '.op',
        ),
        requiredNodes: ['in', 'out'],
        measurements: [
          { probe: 'v(out)', analysis: 'op' as const, expected: vOut, unit: 'V', tolerance: { rel: 0.02 } },
          { probe: 'i(V1)', analysis: 'op' as const, expected: -current, unit: 'A', tolerance: { rel: 0.03 } },
        ],
      },
      options: [],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `The supply current fixes the total series resistance: $R_1 + R_2 = \\dfrac{${trimNumber(supply)}}{${trimNumber(current, 4)}} = ${ohms(totalR)}$.`,
          `The divider ratio fixes how that total is split: $\\dfrac{R_2}{R_1 + R_2} = \\dfrac{${trimNumber(vOut)}}{${trimNumber(supply)}} = ${trimNumber(fraction, 3)}$.`,
          `So $R_2 = ${trimNumber(fraction, 3)} \\times ${trimNumber(totalR)} = ${ohms(r2)}$ and $R_1 = ${ohms(r1)}$.`,
          `Check: $v_{out} = ${trimNumber(supply)} \\times \\dfrac{${trimNumber(r2)}}{${trimNumber(r1)} + ${trimNumber(r2)}} = ${volts(vOut)}$.`,
        ],
        principle:
          'A divider ratio fixes only the proportion; the current budget fixes the scale. Two specifications, two resistors.',
        hints: [
          'The supply current and the supply voltage together give you the total resistance.',
          'Split that total in the ratio the output voltage demands.',
        ],
      },
    };
  },
};
