import type { Generator } from '../types.js';
import { DEFAULT_TOLERANCE } from '../types.js';
import {
  adjustDifficulty, amps, distinctResistorPair, mantissaDifficulty, ohms, ratioDifficulty,
  resampleUntil, resistor, sourceCurrentMa, supplyVoltage, trimNumber, volts, type Rng,
} from '../rng.js';
import { separatedTraps } from '../traps.js';

const parallel = (a: number, b: number): number => (a * b) / (a + b);

/**
 * Equivalent resistance of a series-parallel network.
 *
 * The two traps are the whole point: collapsing everything as series, or
 * everything as parallel. Both are topology-recognition failures rather than
 * arithmetic ones, and they are what `strategy` and `visual` competency
 * weakness actually looks like in this unit.
 */
export const seriesParallel: Generator = {
  id: 'ee2300.series-parallel.equivalent',
  title: 'Equivalent resistance',
  kcRefs: [{ kc: 'ee2300.series-parallel', weight: 1 }],
  difficultyB: -0.6,
  generate(rng: Rng) {
    // Reject draws where R1 dominates so heavily that the all-series and
    // all-parallel errors both land within tolerance of the right answer. Such
    // an item cannot discriminate the topology mistake it exists to catch.
    const [r1, r2, r3] = resampleUntil(
      rng,
      (r) => [resistor(r), resistor(r), resistor(r)] as [number, number, number],
      ([a, b, c]) => {
        const eq = a + parallel(b, c);
        const series = a + b + c;
        const allPar = 1 / (1 / a + 1 / b + 1 / c);
        return Math.abs(series - eq) / eq > 0.12 && Math.abs(allPar - eq) / eq > 0.12;
      },
    );
    const rParallel = parallel(r2, r3);
    const req = r1 + rParallel;

    const allSeries = r1 + r2 + r3;
    const allParallel = 1 / (1 / r1 + 1 / r2 + 1 / r3);
    // Resistors of similar magnitude are harder to reduce by inspection.
    const difficultyB = adjustDifficulty(this.difficultyB, [
      ratioDifficulty(r2, r3),
      mantissaDifficulty(r1),
    ]);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB,
      stem:
        `$R_1 = ${ohms(r1)}$ is in series with the parallel combination of ` +
        `$R_2 = ${ohms(r2)}$ and $R_3 = ${ohms(r3)}$. ` +
        `Find the equivalent resistance seen by the source.`,
      answer: { kind: 'numeric' as const, value: req, unit: 'ohm', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(req, DEFAULT_TOLERANCE, [
        {
          misconception: 'series-parallel.all-series',
          value: allSeries,
          tolerance: { rel: 0.015 },
          feedback:
            `You added all three resistances. $R_2$ and $R_3$ are in **parallel** with each other, ` +
            `and only that combination is in series with $R_1$.`,
        },
        {
          misconception: 'series-parallel.all-parallel',
          value: allParallel,
          tolerance: { rel: 0.015 },
          feedback: `You combined all three in parallel. $R_1$ is in **series** with the $R_2 \\| R_3$ pair.`,
        },
      ]),
      explanation: {
        steps: [
          `Reduce the innermost combination first. $R_2$ and $R_3$ share both nodes, so they are in parallel:`,
          `$R_2 \\| R_3 = \\dfrac{R_2 R_3}{R_2 + R_3} = \\dfrac{(${trimNumber(r2)})(${trimNumber(r3)})}{${trimNumber(r2)} + ${trimNumber(r3)}} = ${ohms(rParallel)}$.`,
          `That combination carries the same current as $R_1$, so the two are in series and add:`,
          `$R_{eq} = R_1 + (R_2 \\| R_3) = ${trimNumber(r1)} + ${trimNumber(rParallel)} = ${ohms(req)}$.`,
        ],
        principle:
          'Reduce from the inside out, and check topology before arithmetic: series elements share a current, parallel elements share a voltage.',
        hints: [
          'Which two resistors share both of their nodes?',
          'Combine the parallel pair first, then add the series element.',
        ],
      },
    };
  },
};

/**
 * Voltage divider. The inverted form is the single most common error in the
 * course, so it is always present as a trap.
 */
export const voltageDivider: Generator = {
  id: 'ee2300.voltage-divider.output',
  title: 'Voltage divider output',
  kcRefs: [{ kc: 'ee2300.voltage-divider', weight: 1 }],
  difficultyB: -0.7,
  generate(rng: Rng) {
    const vs = supplyVoltage(rng);
    // Equal resistances make the inverted-ratio error numerically identical to
    // the correct answer, so the item could not detect the very mistake it is
    // built around. Force a ratio far enough from 1 to separate them.
    const [r1, r2] = distinctResistorPair(rng, { minRatio: 1.5 });
    const vout = (vs * r2) / (r1 + r2);
    const inverted = (vs * r1) / (r1 + r2);
    // A 10:1 divider can be eyeballed; 6.8k against 4.7k cannot.
    const difficultyB = adjustDifficulty(this.difficultyB, [
      ratioDifficulty(r1, r2),
      mantissaDifficulty(vs),
    ]);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB,
      stem:
        `A ${volts(vs)} source drives $R_1 = ${ohms(r1)}$ in series with $R_2 = ${ohms(r2)}$. ` +
        `Find the voltage across $R_2$.`,
      answer: { kind: 'numeric' as const, value: vout, unit: 'V', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(vout, DEFAULT_TOLERANCE, [
        {
          misconception: 'divider.inverted-ratio',
          value: inverted,
          tolerance: { rel: 0.015 },
          feedback:
            `You used $R_1$ in the numerator. The divider takes the resistance you are measuring **across** — ` +
            `here $R_2$ — over the total.`,
        },
      ]),
      explanation: {
        steps: [
          `The series current is common to both resistors: $I = \\dfrac{V_s}{R_1 + R_2}$.`,
          `The voltage across $R_2$ is $I R_2$, which gives the divider form:`,
          `$V_2 = V_s \\dfrac{R_2}{R_1 + R_2} = ${trimNumber(vs)} \\cdot \\dfrac{${trimNumber(r2)}}{${trimNumber(r1)} + ${trimNumber(r2)}} = ${volts(vout)}$.`,
          `Sanity check: $R_2$ is ${r2 > r1 ? 'larger' : 'smaller'} than $R_1$, so it should take ${r2 > r1 ? 'more' : 'less'} than half the supply — and it does.`,
        ],
        principle:
          'A voltage divider assigns supply voltage in proportion to resistance: the resistor you measure across goes in the numerator.',
        hints: [
          'Both resistors carry the same current.',
          'Which resistance belongs in the numerator — the one you are measuring across, or the other one?',
        ],
      },
    };
  },
};

/**
 * Current divider. The numerator is the *opposite* resistor, which inverts the
 * intuition students carry over from the voltage divider — so the trap here is
 * the same-resistor error.
 */
export const currentDivider: Generator = {
  id: 'ee2300.current-divider.branch',
  title: 'Current divider branch current',
  kcRefs: [{ kc: 'ee2300.current-divider', weight: 1 }],
  difficultyB: -0.45,
  generate(rng: Rng) {
    const isMa = sourceCurrentMa(rng);
    const is = isMa / 1000;
    const [r1, r2] = distinctResistorPair(rng, { minRatio: 1.5 });
    // Current through R1 is set by the OPPOSITE resistance.
    const i1 = (is * r2) / (r1 + r2);
    const sameResistor = (is * r1) / (r1 + r2);
    const difficultyB = adjustDifficulty(this.difficultyB, [
      ratioDifficulty(r1, r2),
      mantissaDifficulty(is),
    ]);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB,
      stem:
        `A ${amps(is)} current source feeds $R_1 = ${ohms(r1)}$ in parallel with $R_2 = ${ohms(r2)}$. ` +
        `Find the current through $R_1$.`,
      answer: { kind: 'numeric' as const, value: i1, unit: 'A', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(i1, DEFAULT_TOLERANCE, [
        {
          misconception: 'divider.current-same-resistor',
          value: sameResistor,
          tolerance: { rel: 0.015 },
          feedback:
            `You put $R_1$ in the numerator, carrying over the voltage-divider pattern. For a **current** ` +
            `divider the numerator is the **opposite** resistance, because current prefers the easier path.`,
        },
      ]),
      explanation: {
        steps: [
          `Both resistors share the same voltage $V = I_s (R_1 \\| R_2)$.`,
          `Then $I_1 = V / R_1$, which simplifies to the current-divider form:`,
          `$I_1 = I_s \\dfrac{R_2}{R_1 + R_2} = ${trimNumber(is)} \\cdot \\dfrac{${trimNumber(r2)}}{${trimNumber(r1)} + ${trimNumber(r2)}} = ${amps(i1)}$.`,
          `Sanity check: $R_1$ is the ${r1 < r2 ? 'smaller' : 'larger'} resistance, so it should carry the ${r1 < r2 ? 'larger' : 'smaller'} share — and it does.`,
        ],
        principle:
          'Current divides in inverse proportion to resistance, so the numerator is the opposite branch — the mirror image of the voltage divider.',
        hints: [
          'Both branches share the same voltage, not the same current.',
          'Current takes the path of least resistance: which branch should carry more?',
        ],
      },
    };
  },
};
