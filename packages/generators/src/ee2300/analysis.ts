import type { Generator } from '../types.js';
import { DEFAULT_TOLERANCE } from '../types.js';
import {
  adjustDifficulty, amps, mantissaDifficulty, ohms, ratioDifficulty, resistor, supplyVoltage,
  trimNumber, volts, type Rng,
} from '../rng.js';
import { separatedTraps } from '../traps.js';

/**
 * Single-unknown nodal analysis with two independent sources.
 *
 * One node keeps the linear algebra tractable while still requiring the student
 * to assemble KCL correctly — which is where the actual skill lives. The
 * dominant error is a sign flip on a source branch, so that is the trap.
 */
export const nodalTwoSource: Generator = {
  id: 'ee2300.nodal-analysis.two-source',
  title: 'Nodal analysis with two sources',
  kcRefs: [
    { kc: 'ee2300.nodal-analysis', weight: 0.8 },
    { kc: 'ee2300.kcl', weight: 0.2 },
  ],
  difficultyB: 0.15,
  generate(rng: Rng) {
    const vs1 = supplyVoltage(rng);
    const vs2 = supplyVoltage(rng);
    const r1 = resistor(rng, { minDecade: 2, maxDecade: 3 });
    const r2 = resistor(rng, { minDecade: 2, maxDecade: 3 });
    const r3 = resistor(rng, { minDecade: 2, maxDecade: 3 });

    const conductance = 1 / r1 + 1 / r2 + 1 / r3;
    const va = (vs1 / r1 + vs2 / r3) / conductance;
    // Subtracting instead of adding the second source term.
    const signFlipped = (vs1 / r1 - vs2 / r3) / conductance;
    // Similar branch conductances make the arithmetic less forgiving, and an
    // awkward supply value removes the chance of recognising the result.
    const difficultyB = adjustDifficulty(this.difficultyB, [
      ratioDifficulty(r1, r3),
      mantissaDifficulty(vs1),
    ]);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB,
      stem:
        `Node $A$ connects to three branches: a ${volts(vs1)} source through $R_1 = ${ohms(r1)}$, ` +
        `a ${volts(vs2)} source through $R_3 = ${ohms(r3)}$, and $R_2 = ${ohms(r2)}$ to ground. ` +
        `Both sources have their negative terminals at ground. Find the node voltage $V_A$.`,
      answer: { kind: 'numeric' as const, value: va, unit: 'V', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(va, DEFAULT_TOLERANCE, [
        {
          misconception: 'nodal.source-sign-error',
          value: signFlipped,
          tolerance: { rel: 0.015 },
          feedback:
            `You subtracted the second source term. Both sources sit above ground and push current **into** ` +
            `node $A$, so both appear with the same sign on the right-hand side.`,
        },
      ]),
      explanation: {
        steps: [
          `Write KCL at node $A$, taking every branch current as leaving the node:`,
          `$\\dfrac{V_A - ${trimNumber(vs1)}}{R_1} + \\dfrac{V_A}{R_2} + \\dfrac{V_A - ${trimNumber(vs2)}}{R_3} = 0$.`,
          `Collect the $V_A$ terms on the left and the source terms on the right:`,
          `$V_A\\left(\\dfrac{1}{R_1} + \\dfrac{1}{R_2} + \\dfrac{1}{R_3}\\right) = \\dfrac{${trimNumber(vs1)}}{R_1} + \\dfrac{${trimNumber(vs2)}}{R_3}$.`,
          `$V_A = \\dfrac{${trimNumber(vs1 / r1, 4)} + ${trimNumber(vs2 / r3, 4)}}{${trimNumber(conductance, 4)}} = ${volts(va)}$.`,
          `Sanity check: $V_A$ must fall between ground and the larger source, ${volts(Math.max(vs1, vs2))} — and it does.`,
        ],
        principle:
          'Nodal analysis is one KCL equation per unknown node; the coefficient of the node voltage is always the sum of the conductances touching it.',
        hints: [
          'Take every branch current as leaving the node, then set the sum to zero.',
          'The self-conductance term is the sum of 1/R over all branches at the node.',
        ],
      },
    };
  },
};

/**
 * Two-mesh analysis with a shared branch.
 *
 * Deliberately a circuit that can also be solved by series-parallel reduction,
 * so the worked solution can cross-check the answer two ways. Students who
 * distrust mesh analysis usually do so because nothing ever confirmed it.
 */
export const meshTwoLoop: Generator = {
  id: 'ee2300.mesh-analysis.two-loop',
  title: 'Two-mesh analysis',
  kcRefs: [
    { kc: 'ee2300.mesh-analysis', weight: 0.8 },
    { kc: 'ee2300.kvl', weight: 0.2 },
  ],
  difficultyB: 0.25,
  generate(rng: Rng) {
    const vs = supplyVoltage(rng);
    const r1 = resistor(rng, { minDecade: 2, maxDecade: 3 });
    const r2 = resistor(rng, { minDecade: 2, maxDecade: 3 });
    const r3 = resistor(rng, { minDecade: 2, maxDecade: 3 });

    // (R1+R3) i1 - R3 i2 = Vs ;  -R3 i1 + (R2+R3) i2 = 0
    const det = (r1 + r3) * (r2 + r3) - r3 * r3; // = R1(R2+R3) + R2 R3
    const i1 = (vs * (r2 + r3)) / det;
    const i2 = (vs * r3) / det;
    // Ignoring the coupling term is the classic first mistake.
    const uncoupled = vs / (r1 + r3);
    // The closer the shared branch is to the others, the more the coupling
    // term matters and the less a single-loop shortcut resembles the answer.
    const difficultyB = adjustDifficulty(this.difficultyB, [
      -ratioDifficulty(r3, r1),
      mantissaDifficulty(r2),
    ]);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB,
      stem:
        `A ${volts(vs)} source drives mesh 1 through $R_1 = ${ohms(r1)}$. ` +
        `$R_3 = ${ohms(r3)}$ is the shared branch between mesh 1 and mesh 2, and ` +
        `$R_2 = ${ohms(r2)}$ closes mesh 2. With both mesh currents defined clockwise, find $i_1$.`,
      answer: { kind: 'numeric' as const, value: i1, unit: 'A', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(i1, DEFAULT_TOLERANCE, [
        {
          misconception: 'mesh.coupling-term-dropped',
          value: uncoupled,
          tolerance: { rel: 0.015 },
          feedback:
            `You solved mesh 1 alone as $V_s/(R_1+R_3)$, dropping the $-R_3 i_2$ coupling term. ` +
            `The shared resistor carries **both** mesh currents, so the two equations cannot be separated.`,
        },
      ]),
      explanation: {
        steps: [
          `The shared resistor carries the difference of the two mesh currents, so KVL around each loop gives:`,
          `Mesh 1: $(R_1 + R_3) i_1 - R_3 i_2 = ${trimNumber(vs)}$.`,
          `Mesh 2: $-R_3 i_1 + (R_2 + R_3) i_2 = 0$.`,
          `From mesh 2, $i_2 = \\dfrac{R_3}{R_2 + R_3} i_1$. Substituting into mesh 1:`,
          `$i_1 = \\dfrac{V_s (R_2 + R_3)}{(R_1+R_3)(R_2+R_3) - R_3^2} = ${amps(i1)}$, and $i_2 = ${amps(i2)}$.`,
          `Cross-check by reduction: the source sees $R_1$ in series with $R_2 \\| R_3 = ${ohms((r2 * r3) / (r2 + r3))}$, ` +
            `so $i_1 = \\dfrac{${trimNumber(vs)}}{${trimNumber(r1 + (r2 * r3) / (r2 + r3), 4)}} = ${amps(i1)}$ — the same value.`,
        ],
        principle:
          'A resistor shared between two meshes carries the difference of their currents, which is what couples the equations together.',
        hints: [
          'What current actually flows in the shared branch?',
          'Mesh 2 has no source, so its equation sets $i_2$ in terms of $i_1$.',
        ],
      },
    };
  },
};
