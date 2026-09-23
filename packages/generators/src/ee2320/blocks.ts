import type { Generator } from '../types.js';
import { adjustDifficulty, intBetween, pick, type Rng } from '../rng.js';
import { separatedBooleanTraps, separatedTraps } from '../traps.js';
import { SWITCH_VARS, rowsOf, tex, texTable } from '../logic-common.js';

/**
 * EE 2320, Unit 4 — combinational building blocks.
 *
 * These are the items that exercise *modelling* rather than manipulation: the
 * work is turning a stated behaviour into a truth table, and only then into an
 * expression. A course assessed purely on algebra never tests that step, which
 * is why the specification items here carry their own KC.
 */

export const specificationToTable: Generator = {
  id: 'ee2320.blocks.spec-to-table',
  title: 'From specification to truth table',
  kcRefs: [{ kc: 'ee2320.truth-table-to-expression', weight: 1 }],
  difficultyB: 0.3,
  generate(rng: Rng) {
    const specs = [
      {
        text: 'the output is 1 when **strictly more** of the three inputs are 1 than are 0',
        expr: 'A*B + A*C + B*C',
      },
      { text: 'the output is 1 when an **odd number** of the three inputs are 1', expr: 'A ^ B ^ C' },
      { text: 'the output is 1 when **all three** inputs agree', expr: "A*B*C + A'*B'*C'" },
      { text: 'the output is 1 when **exactly one** input is 1', expr: "A*B'*C' + A'*B*C' + A'*B'*C" },
      { text: 'the output is 1 when the three inputs, read as a binary number with $A$ most significant, are **greater than 4**', expr: 'A*B + A*C' },
    ] as const;
    const spec = pick(rng, specs);
    const variables = SWITCH_VARS.slice(0, 3) as unknown as string[];
    const rows = rowsOf(spec.expr, variables);

    return {
      type: 'truth-table' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        rows.filter(Boolean).length > 4 ? 1 : -1,
        spec.expr.includes('^') ? 1 : -0.5,
      ]),
      stem:
        `A combinational circuit has inputs $A$, $B$, $C$ and one output $F$, where ${spec.text}.\n\n` +
        `Complete the truth table.`,
      answer: { kind: 'truth-table' as const, inputs: variables, output: 'F', rows },
      options: [],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `Take the rows in order and test the stated condition on each.`,
          `The table is $${texTable(variables, rows)}$.`,
          `Algebraically this is $F = ${tex(spec.expr)}$.`,
        ],
        principle:
          'Specification to table is the modelling step, and it is where design errors originate — the algebra afterwards is mechanical.',
        hints: ['Check the condition row by row; do not try to guess the expression first.', 'How many rows should be 1?'],
      },
    };
  },
};

export const fullAdderBehaviour: Generator = {
  id: 'ee2320.blocks.full-adder',
  title: 'Full adder outputs',
  kcRefs: [{ kc: 'ee2320.adders', weight: 1 }],
  difficultyB: 0.2,
  generate(rng: Rng) {
    const wantCarry = rng() < 0.5;
    // Single-letter variables for the parser, longer names for the column
    // headings. They are positionally the same three signals.
    const variables = ['A', 'B', 'C'];
    const labels = ['A', 'B', 'Cin'];
    const expression = wantCarry ? 'A*B + A*C + B*C' : 'A ^ B ^ C';
    const rows = rowsOf(expression, variables);

    return {
      type: 'truth-table' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [wantCarry ? 0.4 : -0.4]),
      stem:
        `Complete the truth table for the **${wantCarry ? 'carry-out' : 'sum'}** output of a full adder ` +
        `with inputs $A$, $B$ and $C_{in}$.`,
      answer: {
        kind: 'truth-table' as const,
        inputs: labels,
        output: wantCarry ? 'Cout' : 'Sum',
        rows,
      },
      options: [],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `A full adder computes $A + B + C_{in}$ as a two-bit result.`,
          wantCarry
            ? `The carry is 1 whenever **at least two** inputs are 1: $C_{out} = AB + AC_{in} + BC_{in}$.`
            : `The sum bit is the parity of the inputs: $S = A \\oplus B \\oplus C_{in}$.`,
          `So the column is $${texTable(labels, rows, wantCarry ? 'Cout' : 'Sum')}$.`,
        ],
        principle:
          'Sum is parity and carry is majority — two different functions of the same three bits, which is why a full adder needs both.',
        hints: [
          wantCarry ? 'How many inputs must be 1 before a carry is produced?' : 'Count the 1s in each row.',
          'The two outputs together encode the three-input sum in binary.',
        ],
      },
    };
  },
};

export const multiplexerOutput: Generator = {
  id: 'ee2320.blocks.multiplexer',
  title: 'Multiplexer selection',
  kcRefs: [{ kc: 'ee2320.multiplexers', weight: 1 }],
  difficultyB: 0.2,
  generate(rng: Rng) {
    const selectBits = pick(rng, [2, 3] as const);
    const inputs = 2 ** selectBits;
    const data = Array.from({ length: inputs }, () => intBetween(rng, 0, 1));
    const select = intBetween(rng, 0, inputs - 1);
    const value = data[select]!;

    const selectPattern = select.toString(2).padStart(selectBits, '0');
    const reversed = Number.parseInt(selectPattern.split('').reverse().join(''), 2);

    return {
      type: 'multiple-choice' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [selectBits === 3 ? 0.6 : -0.6]),
      stem:
        `A ${inputs}-to-1 multiplexer has data inputs $D_0 \\ldots D_{${inputs - 1}}$ set to ` +
        `${data.join(', ')} respectively.\n\n` +
        `The select lines are $S_{${selectBits - 1}}\\ldots S_0 = ${selectPattern}$. What is the output?`,
      answer: { kind: 'choice' as const, correctId: value === 1 ? 'a' : 'b' },
      options: [
        {
          id: 'a', text: '1',
          ...(value === 1 ? {} : { misconception: 'mux.select-index-misread' }),
          rationale: `Select ${selectPattern} is index ${select}, and $D_{${select}} = ${value}$.${reversed !== select ? ` Reading the select bits backwards would give index ${reversed}.` : ''}`,
        },
        {
          id: 'b', text: '0',
          ...(value === 0 ? {} : { misconception: 'mux.select-index-misread' }),
          rationale: `Select ${selectPattern} is index ${select}, and $D_{${select}} = ${value}$.`,
        },
      ],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `The select lines form a binary index with $S_{${selectBits - 1}}$ most significant.`,
          `$${selectPattern}_2 = ${select}$, so the multiplexer passes $D_{${select}}$.`,
          `$D_{${select}} = ${value}$.`,
        ],
        principle:
          'A multiplexer is a data-controlled lookup: the select lines address one input, which is also why an n-select mux can realise any n+1-variable function.',
        hints: ['Convert the select pattern to decimal.', 'Which bit is the most significant?'],
      },
    };
  },
};

export const decoderOutput: Generator = {
  id: 'ee2320.blocks.decoder',
  title: 'Decoders and encoders',
  kcRefs: [{ kc: 'ee2320.decoders-encoders', weight: 1 }],
  difficultyB: 0.2,
  generate(rng: Rng) {
    const bits = pick(rng, [2, 3] as const);
    const outputs = 2 ** bits;
    const activeLow = rng() < 0.4;
    const input = intBetween(rng, 0, outputs - 1);

    // How many outputs are asserted, which is the point of the question.
    const value = activeLow ? outputs - 1 : 1;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [activeLow ? 0.8 : -0.8]),
      stem:
        `A ${bits}-to-${outputs} decoder with **active-${activeLow ? 'low' : 'high'}** outputs is enabled, ` +
        `and its input is ${input.toString(2).padStart(bits, '0')}.\n\n` +
        `How many of its ${outputs} outputs are at logic 1?`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { abs: 0.01 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { abs: 0.01 }, [
        {
          misconception: 'decoder.active-level-ignored',
          value: activeLow ? 1 : outputs - 1,
          tolerance: { abs: 0.01 },
          feedback: activeLow
            ? `With active-low outputs the selected line goes **low** and all the others sit high, so ${outputs - 1} outputs read 1.`
            : `With active-high outputs exactly one line goes high. Only the selected output is 1.`,
        },
        {
          misconception: 'decoder.output-count-confused',
          value: input,
          tolerance: { abs: 0.01 },
          feedback: `That is the input value, not a count of asserted outputs. A decoder asserts exactly one output whatever the input is.`,
        },
      ]),
      explanation: {
        steps: [
          `A decoder asserts exactly one output — the one its input addresses.`,
          activeLow
            ? `Active-low means asserted is 0, so output ${input} is 0 and the other ${outputs - 1} are 1.`
            : `Active-high means asserted is 1, so exactly one output is 1.`,
          `Answer: ${value}.`,
        ],
        principle:
          'A decoder generates every minterm of its inputs; the active level decides whether those minterms appear as 1s or 0s.',
        hints: ['How many outputs does a decoder assert at once?', 'What does active-low mean for the unselected lines?'],
      },
    };
  },
};

export const comparatorLogic: Generator = {
  id: 'ee2320.blocks.comparator',
  title: 'Magnitude comparator logic',
  kcRefs: [{ kc: 'ee2320.comparators', weight: 1 }],
  difficultyB: 0.4,
  generate(rng: Rng) {
    const relation = pick(rng, ['equal', 'greater'] as const);
    const variables = ['A', 'B'];
    const expression = relation === 'equal' ? "A*B + A'*B'" : "A*B'";

    const booleanAnswer = { kind: 'boolean' as const, expression, variables };

    return {
      type: 'boolean' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [relation === 'equal' ? 1 : -1]),
      stem:
        `For two single-bit numbers $A$ and $B$, write a Boolean expression that is 1 exactly when ` +
        `$A ${relation === 'equal' ? '=' : '>'} B$.`,
      answer: booleanAnswer,
      options: [],
      misconceptionTraps: separatedBooleanTraps(booleanAnswer, [
        {
          misconception: 'comparator.relation-inverted',
          expression: relation === 'equal' ? "A ^ B" : "A'*B",
          feedback:
            relation === 'equal'
              ? `That is XOR, which is 1 when the bits **differ**. Equality is its complement.`
              : `That is $A < B$. For $A > B$ you need $A = 1$ and $B = 0$.`,
        },
        ...(relation === 'greater'
          ? [{
              misconception: 'comparator.equality-included',
              expression: "A*B' + A*B",
              feedback: `That is 1 whenever $A = 1$, which includes $A = B = 1$. A strict "greater than" must exclude equality.`,
            }]
          : []),
      ]),
      explanation: {
        steps: [
          relation === 'equal'
            ? `Two bits are equal when both are 1 or both are 0: $AB + \\overline{A}\\,\\overline{B}$.`
            : `$A > B$ for single bits means $A = 1$ and $B = 0$: $A\\overline{B}$.`,
          `That is the complement of XOR in the equality case — which is why XNOR is often called the equivalence gate.`,
        ],
        principle:
          'Single-bit comparison is the base case a multi-bit comparator chains: equality propagates and the first difference decides.',
        hints: ['Enumerate all four input combinations.', 'Which rows should the output be 1 on?'],
      },
    };
  },
};

export const EE2320_BLOCK_GENERATORS: readonly Generator[] = [
  specificationToTable,
  fullAdderBehaviour,
  multiplexerOutput,
  decoderOutput,
  comparatorLogic,
];
