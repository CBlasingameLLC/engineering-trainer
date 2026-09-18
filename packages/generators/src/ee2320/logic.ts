import type { Generator } from '../types.js';
import { adjustDifficulty, intBetween, pick, type Rng } from '../rng.js';
import { separatedBooleanTraps, separatedTraps } from '../traps.js';
import {
  SWITCH_VARS, minimalSop, mintermsOf, rowsOf, simplifiableExpression, sopFromMinterms, tex, texTable,
} from '../logic-common.js';

/**
 * EE 2320, Units 2 and 3 — Boolean algebra, canonical forms and minimisation.
 *
 * The same machinery as the MATH 2358 logic unit, asked in switching notation.
 * That reuse is the point rather than a convenience: if a learner can minimise
 * `A'B + AB` but not `¬p ∧ q ∨ p ∧ q`, the difference is notation, and the
 * cross-course edges are what let the model say so instead of recording two
 * unrelated weaknesses.
 */

export const gateTruthTable: Generator = {
  id: 'ee2320.logic.gate-table',
  title: 'Truth table of a gate network',
  kcRefs: [{ kc: 'ee2320.logic-gates', weight: 1 }],
  difficultyB: -1.0,
  generate(rng: Rng) {
    const width = intBetween(rng, 2, 3);
    const variables = SWITCH_VARS.slice(0, width) as unknown as string[];

    const shapes = width === 2
      ? [`(A*B)'`, `(A+B)'`, `A ^ B`, `(A ^ B)'`, `A' + B`]
      : [`(A*B)' + C`, `A*(B+C)'`, `(A+B)*C'`, `A ^ (B*C)`, `(A*B*C)'`, `A'B + C`];
    const expression = pick(rng, shapes);
    const rows = rowsOf(expression, variables);

    const gateName = expression.includes('^')
      ? 'XOR'
      : expression.startsWith('(') && expression.endsWith("')")
        ? 'NAND/NOR'
        : 'mixed';

    return {
      type: 'truth-table' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [width === 3 ? 1 : -1, gateName === 'XOR' ? 0.4 : -0.2]),
      stem: `Complete the truth table for the network $F = ${tex(expression)}$.`,
      answer: { kind: 'truth-table' as const, inputs: variables, output: 'F', rows },
      options: [],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `Evaluate the inner gates for every input combination first, then the output gate.`,
          `A bubble on a gate output inverts *after* the gate, not before.`,
          `The completed table is $${texTable(variables, rows)}$.`,
        ],
        principle:
          'A gate network is a function of its inputs and nothing else; the truth table is that function written out in full.',
        hints: ['Build a column for each intermediate signal.', 'Apply inversions last.'],
      },
    };
  },
};

export const deMorganGate: Generator = {
  id: 'ee2320.logic.de-morgan',
  title: 'De Morgan and bubble pushing',
  kcRefs: [{ kc: 'ee2320.demorgan', weight: 1 }],
  difficultyB: 0.0,
  generate(rng: Rng) {
    const conjunction = rng() < 0.5;
    const threeInput = rng() < 0.4;
    const vars = threeInput ? ['A', 'B', 'C'] : ['A', 'B'];
    const op = conjunction ? '*' : '+';
    const flipped = conjunction ? '+' : '*';

    const source = `(${vars.join(` ${op} `)})'`;
    const answer = vars.map((v) => `${v}'`).join(` ${flipped} `);

    const booleanAnswer = { kind: 'boolean' as const, expression: answer, variables: vars };

    return {
      type: 'boolean' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [threeInput ? 0.7 : -0.7]),
      stem:
        `Push the inversion through using De Morgan's theorem, so that the complement applies only to ` +
        `individual variables:\\n\\n$$F = ${tex(source)}$$`,
      answer: booleanAnswer,
      options: [],
      misconceptionTraps: separatedBooleanTraps(booleanAnswer, [
        {
          misconception: 'boolean.demorgan-operator-kept',
          expression: vars.map((v) => `${v}'`).join(` ${op} `),
          feedback:
            `Every variable is complemented but the operator did not change. Pushing a bubble through a gate ` +
            `**swaps AND and OR** — that swap is the whole content of De Morgan's theorem.`,
        },
        {
          misconception: 'boolean.inversion-dropped',
          expression: vars.join(` ${op} `),
          feedback: `The inversion has vanished rather than been distributed. Compare the two truth tables — they are complements.`,
        },
      ]),
      explanation: {
        steps: [
          `$\\overline{X \\cdot Y} = \\overline{X} + \\overline{Y}$, and $\\overline{X + Y} = \\overline{X}\\cdot\\overline{Y}$.`,
          `Complement each input and swap the operator from ${conjunction ? 'AND to OR' : 'OR to AND'}.`,
          `$F = ${tex(answer)}$.`,
          `Graphically this is a bubble moving from the gate output to all of its inputs, with the gate shape changing as it passes.`,
        ],
        principle:
          'A NAND is an OR with inverted inputs, and a NOR is an AND with inverted inputs — which is what makes NAND and NOR universal.',
        hints: ['Does the operator stay the same?', 'Check both forms on all input combinations.'],
      },
    };
  },
};

export const canonicalForm: Generator = {
  id: 'ee2320.logic.canonical-form',
  title: 'Minterms and canonical SOP',
  kcRefs: [{ kc: 'ee2320.canonical-forms', weight: 1 }],
  difficultyB: 0.2,
  generate(rng: Rng) {
    const width = 3;
    const variables = SWITCH_VARS.slice(0, width) as unknown as string[];
    const count = intBetween(rng, 2, 5);
    const minterms = [...new Set(Array.from({ length: count }, () => intBetween(rng, 0, 7)))].sort((a, b) => a - b);
    const rows = Array.from({ length: 8 }, (_, i) => minterms.includes(i));

    const askIndex = rng() < 0.5;
    if (askIndex) {
      // Which minterm index does a given product term correspond to?
      const target = pick(rng, minterms);
      const term = variables
        .map((name, col) => (((target >> (width - 1 - col)) & 1) === 1 ? name : `${name}'`))
        .join('');

      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [-0.5]),
        stem:
          `For variables $A, B, C$ with $A$ most significant, which minterm index does the product term ` +
          `$${tex(term)}$ correspond to?`,
        answer: { kind: 'numeric' as const, value: target, unit: '', tolerance: { abs: 0.01 } },
        options: [],
        misconceptionTraps: separatedTraps(target, { abs: 0.01 }, [
          {
            misconception: 'canonical.minterm-bit-order-reversed',
            value: Number.parseInt(
              target.toString(2).padStart(width, '0').split('').reverse().join(''),
              2,
            ),
            tolerance: { abs: 0.01 },
            feedback:
              `The bits are reversed. $A$ is the most significant variable, so $A$ supplies the leftmost bit of the index.`,
          },
          {
            misconception: 'canonical.complement-sense-inverted',
            value: 7 - target,
            tolerance: { abs: 0.01 },
            feedback:
              `A complemented variable contributes **0** to the index and an uncomplemented one contributes 1. You have it the other way round.`,
          },
        ]),
        explanation: {
          steps: [
            `In a minterm, an uncomplemented variable is a 1 and a complemented variable is a 0.`,
            `$${tex(term)}$ gives the bit pattern $${target.toString(2).padStart(width, '0')}$.`,
            `Read as binary with $A$ most significant, that is ${target}.`,
          ],
          principle:
            'A minterm is one row of the truth table written algebraically; its index is that row number.',
          hints: ['Write 1 for a plain variable and 0 for a complemented one.', 'A is the most significant bit.'],
        },
      };
    }

    return {
      type: 'truth-table' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [count > 3 ? 0.5 : -0.5]),
      stem:
        `A function is defined as $F(A,B,C) = \\sum m(${minterms.join(', ')})$.\\n\\n` +
        `Complete its truth table.`,
      answer: { kind: 'truth-table' as const, inputs: variables, output: 'F', rows },
      options: [],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `$\\sum m$ lists the rows where the function is 1; every other row is 0.`,
          `Row indices run 0 to 7 in ascending binary with $A$ most significant.`,
          `Rows ${minterms.join(', ')} are 1: $${texTable(variables, rows)}$.`,
          `The canonical SOP is $${tex(sopFromMinterms(variables, minterms))}$.`,
        ],
        principle:
          'Minterm notation and a truth table carry exactly the same information — one is a list of the rows, the other the rows themselves.',
        hints: ['Convert each index to its three-bit pattern.', 'Every unlisted row is 0.'],
      },
    };
  },
};

export const karnaughMinimisation: Generator = {
  id: 'ee2320.logic.karnaugh',
  title: 'Minimise with a Karnaugh map',
  kcRefs: [
    { kc: 'ee2320.karnaugh-maps', weight: 0.7 },
    { kc: 'ee2320.boolean-algebra', weight: 0.3 },
  ],
  difficultyB: 0.5,
  generate(rng: Rng) {
    const width = intBetween(rng, 3, 4);
    const variables = SWITCH_VARS.slice(0, width) as unknown as string[];
    const { expression, minimal, literals } = simplifiableExpression(rng, variables);
    const minterms = mintermsOf(expression, variables);

    const booleanAnswer = {
      kind: 'boolean' as const,
      expression: minimal,
      variables,
      maxLiterals: literals,
    };

    return {
      type: 'boolean' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [width === 4 ? 0.8 : -0.6, literals > 3 ? 0.5 : -0.5]),
      stem:
        `Minimise $F(${variables.join(',')}) = \\sum m(${minterms.join(', ')})$ to a minimal sum of products.\\n\\n` +
        `The minimal form uses ${literals} literal${literals === 1 ? '' : 's'}.`,
      answer: booleanAnswer,
      options: [],
      // Caught by the literal budget, not by an equivalence trap: the canonical
      // form is the same function, so no trap could tell it from the key.
      misconceptionTraps: [],
      explanation: {
        steps: [
          `Plot the ${minterms.length} minterms on a ${width}-variable map, with rows and columns in Gray-code order.`,
          `Group adjacent 1s into the **largest** power-of-two blocks, allowing wraparound at the edges.`,
          `Each group of $2^k$ cells eliminates $k$ variables — those that change within the group.`,
          `The minimal form is $${tex(minimal)}$, using ${literals} literal${literals === 1 ? '' : 's'}.`,
        ],
        principle:
          'The map is Gray coded so physical adjacency means a one-variable change; that is the entire reason grouping works.',
        hints: [
          'Find the largest legal group containing each 1 before writing anything down.',
          'The left and right edges are adjacent, and so are the top and bottom.',
        ],
      },
    };
  },
};

export const dontCareMinimisation: Generator = {
  id: 'ee2320.logic.dont-cares',
  title: "Minimise with don't-care conditions",
  kcRefs: [{ kc: 'ee2320.dont-cares', weight: 1 }],
  difficultyB: 0.8,
  generate(rng: Rng) {
    const width = 4;
    const variables = SWITCH_VARS.slice(0, width) as unknown as string[];

    // Pick ones and don't-cares, then minimise over the best completion the
    // don't-cares allow. Assigning every don't-care to 1 is not generally
    // optimal, so the two candidates are compared rather than assumed.
    const ones = [...new Set(Array.from({ length: intBetween(rng, 3, 6) }, () => intBetween(rng, 0, 15)))];
    const dontCares = [...new Set(Array.from({ length: intBetween(rng, 2, 4) }, () => intBetween(rng, 0, 15)))]
      .filter((m) => !ones.includes(m));

    const withAll = minimalSop(sopFromMinterms(variables, [...ones, ...dontCares]), variables);
    const withNone = minimalSop(sopFromMinterms(variables, ones), variables);
    const best = withAll.literals <= withNone.literals ? withAll : withNone;

    const booleanAnswer = {
      kind: 'boolean' as const,
      expression: best.form,
      variables,
      maxLiterals: best.literals,
    };

    return {
      type: 'boolean' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [dontCares.length > 2 ? 0.5 : -0.5]),
      stem:
        `Minimise $F(${variables.join(',')}) = \\sum m(${ones.sort((a, b) => a - b).join(', ')}) + ` +
        `\\sum d(${dontCares.sort((a, b) => a - b).join(', ')})$.\\n\\n` +
        `The minimal form uses ${best.literals} literal${best.literals === 1 ? '' : 's'}. ` +
        `Your answer only has to agree with $F$ on the specified minterms.`,
      answer: booleanAnswer,
      options: [],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `Don't-cares may be taken as 1 or 0, whichever gives larger groups.`,
          `Use one only when it **enlarges** a group — a don't-care covered for its own sake adds a term for nothing.`,
          `The minimal form is $${tex(best.form)}$, with ${best.literals} literal${best.literals === 1 ? '' : 's'}.`,
        ],
        principle:
          "A don't-care is an opportunity, not an obligation: include it when it grows a group and ignore it otherwise.",
        hints: [
          'Try the map twice — once treating the don\'t-cares as 1s, once as 0s.',
          'Never form a group made only of don\'t-cares.',
        ],
      },
    };
  },
};

export const universalGates: Generator = {
  id: 'ee2320.logic.universal-gates',
  title: 'NAND and NOR implementations',
  kcRefs: [{ kc: 'ee2320.universal-gates', weight: 1 }],
  difficultyB: 0.5,
  generate(rng: Rng) {
    const target = pick(rng, ['AND', 'OR', 'NOT', 'XOR'] as const);
    const using = pick(rng, ['NAND', 'NOR'] as const);

    const counts: Record<string, Record<string, number>> = {
      NAND: { NOT: 1, AND: 2, OR: 3, XOR: 4 },
      NOR: { NOT: 1, OR: 2, AND: 3, XOR: 5 },
    };
    const value = counts[using]![target]!;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [target === 'XOR' ? 1 : target === 'NOT' ? -1 : 0]),
      stem:
        `What is the minimum number of 2-input ${using} gates needed to implement a ${target} function?` +
        (target === 'NOT' ? '\\n\\n(A gate may have its inputs tied together.)' : ''),
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { abs: 0.01 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { abs: 0.01 }, [
        {
          misconception: 'gates.inverter-not-counted',
          value: Math.max(1, value - 1),
          tolerance: { abs: 0.01 },
          feedback:
            `Each inversion costs a gate too. A ${using} with its inputs tied together is an inverter, and it still ` +
            `counts toward the total.`,
        },
        // NOT costs one gate, so the undercount trap clamps onto the answer and
        // is dropped — leaving the easiest item in the generator unable to
        // diagnose anything. Here the error runs the other way: not knowing that
        // tying the inputs together turns the gate itself into the inverter.
        ...(target === 'NOT'
          ? [
              {
                misconception: 'gates.tied-input-inverter-missed',
                value: value + 1,
                tolerance: { abs: 0.01 },
                feedback:
                  `One gate is enough. Tie both inputs of a ${using} to the same signal and it computes ` +
                  `${using === 'NAND' ? '$\\overline{A \\cdot A} = \\overline{A}$' : '$\\overline{A + A} = \\overline{A}$'}` +
                  ` — that is why ${using} is universal in the first place.`,
              },
            ]
          : []),
      ]),
      explanation: {
        steps: [
          `${using} with both inputs tied is an inverter — that is the first building block.`,
          using === 'NAND'
            ? `AND is NAND followed by an inverter (2). OR is De Morgan: invert both inputs, then NAND (3).`
            : `OR is NOR followed by an inverter (2). AND is De Morgan: invert both inputs, then NOR (3).`,
          `So a ${target} needs ${value} ${using} gate${value === 1 ? '' : 's'}.`,
        ],
        principle:
          'NAND and NOR are universal because each gives you an inverter for free, and De Morgan converts between the two gate shapes.',
        hints: ['How do you build an inverter from one gate?', 'Apply De Morgan to the target function first.'],
      },
    };
  },
};

export const EE2320_LOGIC_GENERATORS: readonly Generator[] = [
  gateTruthTable,
  deMorganGate,
  canonicalForm,
  karnaughMinimisation,
  dontCareMinimisation,
  universalGates,
];
