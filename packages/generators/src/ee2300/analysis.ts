import type { Generator } from '../types.js';
import { DEFAULT_TOLERANCE } from '../types.js';
import {
  adjustDifficulty, amps, mantissaDifficulty, ohms, pick, ratioDifficulty, resistor, supplyVoltage,
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

/**
 * Supernode analysis.
 *
 * A voltage source floating between two non-reference nodes carries an unknown
 * current, so KCL cannot be written at either node alone. Enclosing both trades
 * that unknown current for a constraint equation between the node voltages.
 * Omitting the constraint - two unknowns, one equation - is the defining error.
 */
export const supernode: Generator = {
  id: 'ee2300.supernode.floating-source',
  title: 'Supernode with a floating source',
  kcRefs: [
    { kc: 'ee2300.supernode', weight: 0.8 },
    { kc: 'ee2300.nodal-analysis', weight: 0.2 },
  ],
  difficultyB: 0.65,
  generate(rng: Rng) {
    const vs = supplyVoltage(rng);
    const isMa = pick(rng, [2, 3, 4, 5, 8, 10]);
    const is = isMa / 1000;
    const r1 = resistor(rng, { minDecade: 2, maxDecade: 3 });
    const r2 = resistor(rng, { minDecade: 2, maxDecade: 3 });

    // Constraint: Va - Vb = Vs. Supernode KCL: Va/R1 + Vb/R2 = Is.
    const vb = (is - vs / r1) / (1 / r1 + 1 / r2);
    const va = vb + vs;

    // Treating the pair as one node and dropping the source entirely.
    const constraintOmitted = is / (1 / r1 + 1 / r2);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        ratioDifficulty(r1, r2),
        mantissaDifficulty(vs),
      ]),
      stem:
        `A ${amps(is)} current source drives node $A$. A ${volts(vs)} source sits **between** nodes $A$ and $B$ ` +
        `with its **+** terminal at $A$, so neither node is grounded through it. ` +
        `$R_1 = ${ohms(r1)}$ runs from $A$ to ground and $R_2 = ${ohms(r2)}$ from $B$ to ground. Find $V_A$.`,
      answer: { kind: 'numeric' as const, value: va, unit: 'V', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(va, DEFAULT_TOLERANCE, [
        {
          misconception: 'supernode.constraint-omitted',
          value: constraintOmitted,
          tolerance: { rel: 0.015 },
          feedback:
            `You wrote KCL around the supernode but never used the source constraint, so the two node ` +
            `voltages were treated as one. Two unknowns need two equations: $V_A - V_B = ${trimNumber(vs)}$ is the second.`,
        },
        {
          misconception: 'supernode.constraint-sign-error',
          value: vb - vs + (va - vb),
          tolerance: { rel: 0.015 },
          feedback:
            `Check the polarity in your constraint. The **+** terminal is at $A$, so $V_A - V_B = +${trimNumber(vs)}$, not the reverse.`,
        },
      ]),
      explanation: {
        steps: [
          `The current through a voltage source is unknown, so KCL at $A$ or $B$ alone introduces a term you cannot write.`,
          `Enclose both nodes in a supernode. The source current is now internal and cancels, leaving only the resistor branches:`,
          `$\\dfrac{V_A}{R_1} + \\dfrac{V_B}{R_2} = ${trimNumber(is)}$.`,
          `That is one equation in two unknowns. The source itself supplies the second: $V_A - V_B = ${trimNumber(vs)}$.`,
          `Substituting $V_A = V_B + ${trimNumber(vs)}$ and solving: $V_B = ${volts(vb)}$, so $V_A = ${volts(va)}$.`,
        ],
        principle:
          'A supernode trades the unknown current through a floating source for a constraint equation between its two node voltages — the equation count never changes.',
        hints: [
          'What do you know about the current through an ideal voltage source?',
          'After the supernode KCL you have one equation and two unknowns. Where does the second come from?',
        ],
      },
    };
  },
};

/**
 * Supermesh analysis.
 *
 * The dual of the supernode: a current source shared between two meshes has an
 * unknown voltage across it, so KVL cannot pass through that branch. The loop
 * is drawn around it and the source supplies the constraint.
 */
export const supermesh: Generator = {
  id: 'ee2300.supermesh.shared-source',
  title: 'Supermesh with a shared current source',
  kcRefs: [
    { kc: 'ee2300.supermesh', weight: 0.8 },
    { kc: 'ee2300.mesh-analysis', weight: 0.2 },
  ],
  difficultyB: 0.75,
  generate(rng: Rng) {
    const vs = supplyVoltage(rng);
    const isMa = pick(rng, [1, 2, 3, 4, 5]);
    const is = isMa / 1000;
    const r1 = resistor(rng, { minDecade: 2, maxDecade: 3 });
    const r2 = resistor(rng, { minDecade: 2, maxDecade: 3 });

    // Supermesh KVL: -Vs + R1*i1 + R2*i2 = 0, with constraint i2 - i1 = Is.
    const i1 = (vs - r2 * is) / (r1 + r2);
    const i2 = i1 + is;
    // Ignoring the source and solving a single loop.
    const sourceIgnored = vs / (r1 + r2);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        ratioDifficulty(r1, r2),
        mantissaDifficulty(vs),
      ]),
      stem:
        `Two clockwise meshes share a branch containing a ${amps(is)} current source, oriented so that ` +
        `$i_2 - i_1 = ${trimNumber(is)}$ A. Mesh 1 also contains a ${volts(vs)} source and $R_1 = ${ohms(r1)}$; ` +
        `mesh 2 also contains $R_2 = ${ohms(r2)}$. Find $i_1$.`,
      answer: { kind: 'numeric' as const, value: i1, unit: 'A', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(i1, DEFAULT_TOLERANCE, [
        {
          misconception: 'supermesh.source-ignored',
          value: sourceIgnored,
          tolerance: { rel: 0.015 },
          feedback:
            `You solved a single loop as if the current source were not there. The source forces a fixed ` +
            `difference between the mesh currents, and that constraint changes the answer.`,
        },
        {
          misconception: 'supermesh.constraint-sign-error',
          value: (vs + r2 * is) / (r1 + r2),
          tolerance: { rel: 0.015 },
          feedback:
            `Your constraint runs the wrong way. With $i_2 - i_1 = +${trimNumber(is)}$, substituting ` +
            `$i_2 = i_1 + ${trimNumber(is)}$ makes the $R_2 I_s$ term **subtract** from $V_s$.`,
        },
      ]),
      explanation: {
        steps: [
          `The voltage across an ideal current source is unknown, so KVL cannot be written through that branch.`,
          `Draw the loop **around** the source instead — the supermesh — and apply KVL to the outer path:`,
          `$-${trimNumber(vs)} + R_1 i_1 + R_2 i_2 = 0$.`,
          `The source supplies the missing equation: $i_2 - i_1 = ${trimNumber(is)}$.`,
          `Substituting $i_2 = i_1 + ${trimNumber(is)}$: $i_1 = \\dfrac{${trimNumber(vs)} - (${trimNumber(r2)})(${trimNumber(is)})}{${trimNumber(r1)} + ${trimNumber(r2)}} = ${amps(i1)}$, and $i_2 = ${amps(i2)}$.`,
          `Note the symmetry with the supernode: unknown current there, unknown voltage here, and in both cases the source itself provides the constraint.`,
        ],
        principle:
          'A supermesh routes KVL around a shared current source, and the source supplies the constraint between the two mesh currents.',
        hints: [
          'What do you know about the voltage across an ideal current source?',
          'Which path can you take KVL around that avoids the source branch entirely?',
        ],
      },
    };
  },
};

/**
 * Nodal analysis with a current-controlled current source.
 *
 * The skill is writing the controlling variable in terms of the node voltage
 * and carrying it into KCL, rather than treating the dependent source as a
 * fixed independent one.
 */
export const dependentSource: Generator = {
  id: 'ee2300.dependent-sources.cccs',
  title: 'Current-controlled current source',
  kcRefs: [
    { kc: 'ee2300.dependent-sources', weight: 0.75 },
    { kc: 'ee2300.nodal-analysis', weight: 0.25 },
  ],
  difficultyB: 0.85,
  generate(rng: Rng) {
    const vs = supplyVoltage(rng);
    const r1 = resistor(rng, { minDecade: 2, maxDecade: 3 });
    const r2 = resistor(rng, { minDecade: 2, maxDecade: 3 });
    const beta = pick(rng, [0.5, 1, 1.5, 2, 3, 4]);

    // Ix flows through R1 into node A; the source injects beta*Ix into A too.
    // (1 + beta)(Vs - Va)/R1 = Va/R2
    const va = ((1 + beta) * r2 * vs) / (r1 + (1 + beta) * r2);
    // Ignoring the dependent source collapses this to a plain divider.
    const sourceIgnored = (vs * r2) / (r1 + r2);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        mantissaDifficulty(beta * 10),
        ratioDifficulty(r1, r2),
      ]),
      stem:
        `A ${volts(vs)} source drives $R_1 = ${ohms(r1)}$ into node $A$, and $R_2 = ${ohms(r2)}$ returns from ` +
        `$A$ to ground. The current $I_x$ flows through $R_1$ toward $A$, and a dependent current source ` +
        `injects $\\beta I_x$ into node $A$ with $\\beta = ${trimNumber(beta)}$. Find $V_A$.`,
      answer: { kind: 'numeric' as const, value: va, unit: 'V', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(va, DEFAULT_TOLERANCE, [
        {
          misconception: 'dependent.treated-as-absent',
          value: sourceIgnored,
          tolerance: { rel: 0.015 },
          feedback:
            `That is the plain divider result, which is what you get by leaving the dependent source out. ` +
            `It injects $\\beta I_x$ into the node and must appear in KCL.`,
        },
        {
          misconception: 'dependent.control-variable-fixed',
          value: ((1 + beta) * r2 * vs) / (r1 + r2),
          tolerance: { rel: 0.015 },
          feedback:
            `You scaled the answer by $(1+\\beta)$ after solving, treating $I_x$ as if it were already known. ` +
            `$I_x$ depends on $V_A$, so the coupling has to enter **before** you solve, not after.`,
        },
      ]),
      explanation: {
        steps: [
          `Express the controlling variable in terms of the unknown: $I_x = \\dfrac{V_s - V_A}{R_1}$.`,
          `Write KCL at $A$. Current arrives from $R_1$ and from the dependent source, and leaves through $R_2$:`,
          `$\\dfrac{V_s - V_A}{R_1} + \\beta\\dfrac{V_s - V_A}{R_1} = \\dfrac{V_A}{R_2}$.`,
          `Collecting: $(1+\\beta)\\dfrac{V_s - V_A}{R_1} = \\dfrac{V_A}{R_2}$, so $V_A = \\dfrac{(1+\\beta) R_2 V_s}{R_1 + (1+\\beta) R_2} = ${volts(va)}$.`,
          `With $\\beta = 0$ this reduces to the ordinary divider, ${volts(sourceIgnored)} — a useful check that the coupling entered correctly.`,
        ],
        principle:
          'A dependent source is not a known quantity: write its controlling variable in terms of the unknowns and solve the coupled equation, never suppress it.',
        hints: [
          'What is $I_x$ in terms of $V_A$?',
          'Does the dependent source add current to node $A$ or remove it?',
        ],
      },
    };
  },
};
