import type { Generator } from '../types.js';
import { DEFAULT_TOLERANCE } from '../types.js';
import {
  adjustDifficulty, amps, mantissaDifficulty, ohms, pick, resistor, supplyVoltage, trimNumber,
  volts, type Rng,
} from '../rng.js';
import { separatedTraps } from '../traps.js';

/**
 * Ohm's law, solved for whichever quantity is withheld.
 *
 * Rotating the unknown matters: a student who has only ever solved for current
 * can be fluent at V/R and still stall on R = V/I, and an item bank that always
 * asks the same way never detects that.
 */
export const ohmsLaw: Generator = {
  id: 'ee2300.ohms-law.solve',
  title: "Ohm's law",
  kcRefs: [{ kc: 'ee2300.ohms-law', weight: 1 }],
  difficultyB: -1.3,
  generate(rng: Rng) {
    const r = resistor(rng);
    const v = supplyVoltage(rng);
    const i = v / r;
    const unknown = pick(rng, ['V', 'I', 'R'] as const);

    // Solving for V is a direct multiplication; solving for R requires
    // rearranging and dividing by an awkward current, so it is harder.
    const unknownCost = unknown === 'V' ? -1 : unknown === 'I' ? 0 : 1;
    const difficultyB = adjustDifficulty(this.difficultyB, [unknownCost, mantissaDifficulty(r)]);

    if (unknown === 'I') {
      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB,
        stem: `A resistor of ${ohms(r)} has ${volts(v)} across it. Find the current through it.`,
        answer: { kind: 'numeric' as const, value: i, unit: 'A', tolerance: DEFAULT_TOLERANCE },
        options: [],
        misconceptionTraps: separatedTraps(i, DEFAULT_TOLERANCE, [
          {
            misconception: 'ohms-law.inverted',
            value: r / v,
            tolerance: { rel: 0.02 },
            feedback: `You computed $R/V$. Ohm's law solved for current is $I = V/R = ${trimNumber(v)}/${trimNumber(r)}$.`,
          },
        ]),
        explanation: {
          steps: [
            `Ohm's law relates the three quantities as $V = IR$.`,
            `Solve for the current: $I = \\dfrac{V}{R}$.`,
            `$I = \\dfrac{${trimNumber(v)}}{${trimNumber(r)}} = ${amps(i)}$.`,
          ],
          principle: 'Current through a resistor is the voltage across it divided by its resistance.',
          hints: ['Which of the three quantities is unknown?', 'Rearrange $V = IR$ to isolate $I$.'],
        },
      };
    }

    if (unknown === 'V') {
      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB,
        stem: `A current of ${amps(i)} flows through a ${ohms(r)} resistor. Find the voltage across it.`,
        answer: { kind: 'numeric' as const, value: v, unit: 'V', tolerance: DEFAULT_TOLERANCE },
        options: [],
        misconceptionTraps: [],
        explanation: {
          steps: [
            `Ohm's law gives the voltage directly: $V = IR$.`,
            `$V = ${trimNumber(i)} \\times ${trimNumber(r)} = ${volts(v)}$.`,
          ],
          principle: 'Voltage across a resistor is the product of its current and resistance.',
          hints: ['Apply $V = IR$ without rearranging.'],
        },
      };
    }

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB,
      stem: `A resistor carries ${amps(i)} when ${volts(v)} is placed across it. Find its resistance.`,
      answer: { kind: 'numeric' as const, value: r, unit: 'ohm', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(r, DEFAULT_TOLERANCE, [
        {
          misconception: 'ohms-law.inverted',
          value: i / v,
          tolerance: { rel: 0.02 },
          feedback: `You computed $I/V$, which is conductance. Resistance is $R = V/I$.`,
        },
      ]),
      explanation: {
        steps: [
          `Ohm's law relates the three quantities as $V = IR$.`,
          `Solve for resistance: $R = \\dfrac{V}{I}$.`,
          `$R = \\dfrac{${trimNumber(v)}}{${trimNumber(i)}} = ${ohms(r)}$.`,
        ],
        principle: 'Resistance is the ratio of voltage across an element to the current through it.',
        hints: ['Rearrange $V = IR$ to isolate $R$.'],
      },
    };
  },
};

/**
 * Power with an explicit sign convention.
 *
 * The arithmetic is trivial; the discrimination is entirely in whether the
 * student tracked which terminal the current entered. Reporting a magnitude
 * without the sign is the error worth catching.
 */
export const powerSignConvention: Generator = {
  id: 'ee2300.passive-sign-convention.power',
  title: 'Power and the passive sign convention',
  kcRefs: [
    { kc: 'ee2300.passive-sign-convention', weight: 0.7 },
    { kc: 'ee2300.charge-current-voltage', weight: 0.3 },
  ],
  difficultyB: -1.0,
  generate(rng: Rng) {
    const v = supplyVoltage(rng);
    const iMa = pick(rng, [10, 20, 25, 40, 50, 100, 150, 200]);
    const i = iMa / 1000;
    // Current entering the + terminal means the element absorbs power.
    const entersPositive = rng() < 0.5;
    const power = entersPositive ? v * i : -v * i;
    const verb = entersPositive ? 'entering' : 'leaving';
    const difficultyB = adjustDifficulty(this.difficultyB, [entersPositive ? -1 : 1]);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB,
      stem:
        `An element has ${volts(v)} across it, with the reference **+** terminal at the top. ` +
        `A current of ${amps(i)} is measured **${verb}** the **+** terminal. ` +
        `Find the power absorbed by the element, with sign.`,
      answer: { kind: 'numeric' as const, value: power, unit: 'W', tolerance: { rel: 0.02, abs: 1e-6 } },
      options: [],
      misconceptionTraps: separatedTraps(power, { rel: 0.02, abs: 1e-6 }, [
        {
          misconception: 'psc.sign-dropped',
          value: -power,
          tolerance: { rel: 0.02 },
          feedback:
            `The magnitude is right but the sign is inverted. Power is absorbed ($P > 0$) only when ` +
            `current **enters** the **+** terminal; here it is ${verb} it.`,
        },
      ]),
      explanation: {
        steps: [
          `Under the passive sign convention, $P = VI$ is the power **absorbed** when current enters the **+** terminal.`,
          entersPositive
            ? `Current enters the **+** terminal, so the convention applies directly and $P$ is positive.`
            : `Current **leaves** the **+** terminal, so the current is $-I$ relative to the convention and $P$ is negative.`,
          `$P = ${entersPositive ? '' : '-'}(${trimNumber(v)})(${trimNumber(i)}) = ${trimNumber(power, 4)}\\,\\text{W}$.`,
          entersPositive
            ? `A positive result means the element absorbs power.`
            : `A negative result means the element **delivers** ${trimNumber(Math.abs(power), 4)} W to the rest of the circuit.`,
        ],
        principle:
          'The sign of absorbed power records the direction of energy flow; a magnitude without a sign is only half the answer.',
        hints: [
          'Which terminal does the current enter?',
          'Absorbed power is positive only when current enters the + terminal.',
        ],
      },
    };
  },
};
