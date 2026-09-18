import type { Generator } from '../types.js';
import { adjustDifficulty, intBetween, pick, type Rng } from '../rng.js';
import { separatedBooleanTraps } from '../traps.js';
import {
  PROP_VARS, randomCompound, rowsOf, simplifiableExpression, tex, texTable,
} from '../logic-common.js';

/**
 * MATH 2358, Unit 1 — logic and proof.
 *
 * The answer to every truth-table item here is computed by evaluating the very
 * string the stem renders, so the question and its key cannot disagree. That
 * matters more than usual: a truth table has 2^n independent answers and a
 * transcription error in any one of them is invisible to a reader and fatal to
 * a learner.
 */

export const propositionalTruthTable: Generator = {
  id: 'math2358.logic.truth-table',
  title: 'Complete a truth table',
  kcRefs: [{ kc: 'math2358.propositional-logic', weight: 1 }],
  difficultyB: -1.1,
  generate(rng: Rng) {
    const width = intBetween(rng, 2, 3);
    const variables = PROP_VARS.slice(0, width) as unknown as string[];
    const expression = randomCompound(rng, variables);
    const rows = rowsOf(expression, variables);

    return {
      type: 'truth-table' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        width === 3 ? 1 : -1,
        expression.includes('->') ? 0.6 : -0.2,
      ]),
      stem: `Complete the truth table for $${tex(expression)}$.`,
      answer: {
        kind: 'truth-table' as const,
        inputs: variables,
        output: 'F',
        rows,
      },
      options: [],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `Work outward from the innermost connective, one row at a time.`,
          `Rows run in ascending binary order with $${variables[0]}$ most significant.`,
          `The completed table is $${texTable(variables, rows)}$.`,
        ],
        principle:
          'A truth table is the definition of a compound proposition, not a summary of it — every other technique has to agree with it.',
        hints: [
          'Evaluate the bracketed part for every row first, then combine.',
          'An implication is false in exactly one case: true antecedent, false consequent.',
        ],
      },
    };
  },
};

export const deMorganTransform: Generator = {
  id: 'math2358.logic.de-morgan',
  title: 'Apply De Morgan to a negation',
  kcRefs: [{ kc: 'math2358.logical-equivalence', weight: 1 }],
  difficultyB: -0.4,
  generate(rng: Rng) {
    const [p, q] = ['p', 'q'];
    const conjunction = rng() < 0.5;
    // Negating an already-negated literal exercises double negation at the same
    // time, which is where the second half of the marks usually go.
    const negateLeft = rng() < 0.4;
    const negateRight = rng() < 0.4;

    const left = negateLeft ? `${p}'` : p;
    const right = negateRight ? `${q}'` : q;
    const source = `(${left} ${conjunction ? '*' : '+'} ${right})'`;
    const answer = `${negateLeft ? p : `${p}'`} ${conjunction ? '+' : '*'} ${negateRight ? q : `${q}'`}`;

    const booleanAnswer = {
      kind: 'boolean' as const,
      expression: answer,
      variables: [p, q],
    };

    return {
      type: 'boolean' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        negateLeft || negateRight ? 1 : -1,
        conjunction ? -0.3 : 0.3,
      ]),
      stem:
        `Use De Morgan's law to write an equivalent expression with the negation applied to ` +
        `the individual propositions:\\n\\n$$${tex(source)}$$`,
      answer: booleanAnswer,
      options: [],
      misconceptionTraps: separatedBooleanTraps(booleanAnswer, [
        {
          misconception: 'logic.demorgan-connective-kept',
          expression: `${negateLeft ? p : `${p}'`} ${conjunction ? '*' : '+'} ${negateRight ? q : `${q}'`}`,
          feedback:
            `You negated both propositions but left the connective alone. De Morgan **swaps** it: ` +
            `the negation of a conjunction is a *disjunction* of negations, and vice versa.`,
        },
        {
          misconception: 'logic.negation-not-distributed',
          expression: `(${left} ${conjunction ? '*' : '+'} ${right})`,
          feedback: `The negation has disappeared rather than been distributed. Compare truth tables — these are opposite functions.`,
        },
      ]),
      explanation: {
        steps: [
          `De Morgan: $\\overline{X \\cdot Y} = \\overline{X} + \\overline{Y}$ and $\\overline{X + Y} = \\overline{X}\\cdot\\overline{Y}$.`,
          `Negate each proposition and **swap the connective**.`,
          negateLeft || negateRight
            ? `A doubly negated proposition collapses: $\\overline{\\overline{p}} = p$.`
            : `Neither proposition was already negated, so each simply gains a bar.`,
          `The result is $${tex(answer)}$.`,
        ],
        principle:
          'Negation distributes across a connective only if the connective flips; this is the same theorem that turns an AND gate with inverted inputs into an OR gate.',
        hints: ['What happens to the connective?', 'Check your answer against the original on all four rows.'],
      },
    };
  },
};

export const conditionalRelatives: Generator = {
  id: 'math2358.logic.conditional-relatives',
  title: 'Converse, inverse and contrapositive',
  kcRefs: [{ kc: 'math2358.conditional-statements', weight: 1 }],
  difficultyB: -0.5,
  generate(rng: Rng) {
    const scenarios = [
      ['it is raining', 'the ground is wet'],
      ['the circuit is closed', 'current flows'],
      ['n is divisible by 4', 'n is even'],
      ['the file compiles', 'the syntax is valid'],
      ['the clock edge arrives', 'the register updates'],
    ] as const;
    const [antecedent, consequent] = pick(rng, scenarios);
    const wanted = pick(rng, ['contrapositive', 'converse', 'inverse'] as const);

    const contrapositive = `If ${consequent} is false, then ${antecedent} is false.`;
    const converse = `If ${consequent}, then ${antecedent}.`;
    const inverse = `If ${antecedent} is false, then ${consequent} is false.`;
    const original = `If ${antecedent}, then ${consequent}.`;

    const options = [
      { id: 'a', text: contrapositive, key: 'contrapositive' },
      { id: 'b', text: converse, key: 'converse' },
      { id: 'c', text: inverse, key: 'inverse' },
      { id: 'd', text: original, key: 'original' },
    ];
    const correct = options.find((o) => o.key === wanted)!;

    return {
      type: 'multiple-choice' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [wanted === 'contrapositive' ? -0.5 : 0.7]),
      stem: `Which statement is the **${wanted}** of: *${original}*`,
      answer: { kind: 'choice' as const, correctId: correct.id },
      options: options.map((o) => ({
        id: o.id,
        text: o.text,
        ...(o.id === correct.id
          ? {}
          : { misconception: o.key === 'original' ? 'logic.statement-restated' : `logic.${o.key}-confused` }),
        rationale:
          o.key === 'contrapositive'
            ? 'Negates both parts **and** swaps them. The only one always equivalent to the original.'
            : o.key === 'converse'
              ? 'Swaps the two parts without negating. Not equivalent to the original.'
              : o.key === 'inverse'
                ? 'Negates both parts without swapping. Not equivalent to the original — though it is equivalent to the converse.'
                : 'This is the original statement, unchanged.',
      })),
      misconceptionTraps: [],
      explanation: {
        steps: [
          `Start from $p \\rightarrow q$ where $p$ is "${antecedent}" and $q$ is "${consequent}".`,
          `Converse is $q \\rightarrow p$; inverse is $\\lnot p \\rightarrow \\lnot q$; contrapositive is $\\lnot q \\rightarrow \\lnot p$.`,
          `Only the contrapositive is logically equivalent to the original — a fact worth memorising, because proof by contraposition depends on it entirely.`,
        ],
        principle:
          'Swapping alone or negating alone breaks equivalence; doing both preserves it.',
        hints: ['Which one both swaps *and* negates?', 'Write it as p → q before deciding.'],
      },
    };
  },
};

export const booleanSimplification: Generator = {
  id: 'math2358.logic.simplify',
  title: 'Simplify a Boolean expression',
  kcRefs: [{ kc: 'math2358.boolean-algebra', weight: 1 }],
  difficultyB: 0.3,
  generate(rng: Rng) {
    const width = intBetween(rng, 2, 3);
    const variables = PROP_VARS.slice(0, width) as unknown as string[];
    const { expression, minimal, literals } = simplifiableExpression(rng, variables);

    const booleanAnswer = {
      kind: 'boolean' as const,
      expression: minimal,
      variables,
      maxLiterals: literals,
    };

    return {
      type: 'boolean' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [width === 3 ? 0.8 : -0.8, literals > 2 ? 0.4 : -0.4]),
      stem:
        `Simplify to a minimal sum of products:\\n\\n$$${tex(expression)}$$\\n\\n` +
        `The minimal form uses ${literals} literal${literals === 1 ? '' : 's'}.`,
      answer: booleanAnswer,
      options: [],
      // No equivalence trap: an unsimplified answer is equivalent by
      // construction, so the grader catches it through the literal budget and
      // names it `boolean.not-fully-simplified` rather than through a trap that
      // could never be distinguished from the key.
      misconceptionTraps: [],
      explanation: {
        steps: [
          `Look for pairs of terms differing in exactly one variable: $XY + XY' = X$.`,
          `Adjacent terms combine and the differing variable drops out.`,
          `Repeat until no two terms differ in a single variable.`,
          `The minimal form is $${tex(minimal)}$, with ${literals} literal${literals === 1 ? '' : 's'}.`,
        ],
        principle:
          'Simplification is repeated application of one identity: two terms that differ in a single variable collapse into the part they share.',
        hints: [
          'Which pairs of terms differ in exactly one variable?',
          'A Karnaugh map makes the same groupings visible if the algebra stalls.',
        ],
      },
    };
  },
};

export const quantifierNegation: Generator = {
  id: 'math2358.logic.quantifier-negation',
  title: 'Negate a quantified statement',
  kcRefs: [{ kc: 'math2358.predicate-logic', weight: 1 }],
  difficultyB: 0.5,
  generate(rng: Rng) {
    const predicates = [
      ['P(x)', 'x is prime'],
      ['E(x)', 'x is even'],
      ['D(x, y)', 'x divides y'],
      ['G(x)', 'x is greater than 10'],
    ] as const;
    const [symbol, meaning] = pick(rng, predicates);
    const outer = pick(rng, ['\\forall', '\\exists'] as const);
    const nested = rng() < 0.4 && symbol.includes(',');

    const statement = nested
      ? `${outer} x \\, ${outer === '\\forall' ? '\\exists' : '\\forall'} y \\; ${symbol}`
      : `${outer} x \\; ${symbol}`;
    const negated = nested
      ? `${outer === '\\forall' ? '\\exists' : '\\forall'} x \\, ${outer === '\\forall' ? '\\forall' : '\\exists'} y \\; \\lnot ${symbol}`
      : `${outer === '\\forall' ? '\\exists' : '\\forall'} x \\; \\lnot ${symbol}`;

    const keptQuantifier = nested
      ? `${outer} x \\, ${outer === '\\forall' ? '\\exists' : '\\forall'} y \\; \\lnot ${symbol}`
      : `${outer} x \\; \\lnot ${symbol}`;

    const options = [
      { id: 'a', text: `$${negated}$`, correct: true },
      { id: 'b', text: `$${keptQuantifier}$`, correct: false, misconception: 'logic.quantifier-not-flipped' },
      { id: 'c', text: `$\\lnot ${statement}$ cannot be simplified further`, correct: false, misconception: 'logic.negation-left-outside' },
      { id: 'd', text: `$${outer === '\\forall' ? '\\exists' : '\\forall'} x \\; ${symbol}$`, correct: false, misconception: 'logic.predicate-not-negated' },
    ];

    return {
      type: 'multiple-choice' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [nested ? 1 : -0.6]),
      stem: `Where $${symbol}$ means "${meaning}", which is equivalent to $\\lnot\\left(${statement}\\right)$?`,
      answer: { kind: 'choice' as const, correctId: 'a' },
      options: options.map((o) => ({
        id: o.id,
        text: o.text,
        ...(o.misconception ? { misconception: o.misconception } : {}),
        rationale: o.correct
          ? 'Each quantifier flips and the negation lands on the predicate.'
          : o.misconception === 'logic.quantifier-not-flipped'
            ? 'The predicate is negated but the quantifier is unchanged. Pushing a negation past a quantifier always flips it.'
            : o.misconception === 'logic.negation-left-outside'
              ? 'It can: negation moves inward one quantifier at a time.'
              : 'The quantifier flipped but the predicate was never negated.',
      })),
      misconceptionTraps: [],
      explanation: {
        steps: [
          `$\\lnot \\forall x\\, P(x) \\equiv \\exists x\\, \\lnot P(x)$ — "not all" means "at least one fails".`,
          `$\\lnot \\exists x\\, P(x) \\equiv \\forall x\\, \\lnot P(x)$ — "none" means "all fail".`,
          nested
            ? `With nested quantifiers the negation moves inward past each in turn, flipping every one.`
            : `Push the negation inward once, flipping the quantifier as it passes.`,
          `The negation is $${negated}$.`,
        ],
        principle:
          'Negation moves inward through quantifiers, flipping each one it passes — the quantifier version of De Morgan.',
        hints: ['What does it take for "for all" to be false?', 'Move the negation in one step at a time.'],
      },
    };
  },
};

export const proofMethodChoice: Generator = {
  id: 'math2358.logic.proof-method',
  title: 'Choose a proof strategy',
  kcRefs: [{ kc: 'math2358.proof-methods', weight: 1 }],
  difficultyB: 0.7,
  generate(rng: Rng) {
    const cases = [
      {
        claim: 'If $n^2$ is even then $n$ is even.',
        method: 'contraposition',
        why: 'The hypothesis $n^2$ even is awkward to use directly, while assuming $n$ odd gives you $n = 2k+1$ to expand immediately.',
      },
      {
        claim: '$\\sqrt{2}$ is irrational.',
        method: 'contradiction',
        why: 'There is no constructive handle on "irrational"; assuming a rational form $p/q$ in lowest terms gives something to work with and break.',
      },
      {
        claim: 'The sum of two even integers is even.',
        method: 'direct',
        why: 'Both hypotheses hand you a usable form ($2a$ and $2b$) and the conclusion follows by algebra.',
      },
      {
        claim: 'If $3n + 2$ is odd then $n$ is odd.',
        method: 'contraposition',
        why: 'Assuming $n$ even immediately gives $n = 2k$ and a direct computation; the forward direction gives you nothing to substitute.',
      },
      {
        claim: 'There are infinitely many primes.',
        method: 'contradiction',
        why: 'Assuming a finite list lets you construct a number none of them divides, which is the whole argument.',
      },
    ] as const;
    const chosen = pick(rng, cases);

    const options = [
      { id: 'a', key: 'direct', text: 'Direct proof — assume the hypothesis and derive the conclusion' },
      { id: 'b', key: 'contraposition', text: 'Proof by contraposition — assume the conclusion is false and derive that the hypothesis is false' },
      { id: 'c', key: 'contradiction', text: 'Proof by contradiction — assume the statement is false and derive an impossibility' },
      { id: 'd', key: 'induction', text: 'Proof by induction — establish a base case and an inductive step' },
    ];
    const correct = options.find((o) => o.key === chosen.method)!;

    return {
      type: 'multiple-choice' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [chosen.method === 'direct' ? -0.8 : 0.4]),
      stem: `Which proof strategy is the natural first choice for:\\n\\n> ${chosen.claim}`,
      answer: { kind: 'choice' as const, correctId: correct.id },
      options: options.map((o) => ({
        id: o.id,
        text: o.text,
        ...(o.id === correct.id ? {} : { misconception: `proof.${o.key}-misapplied` }),
        rationale:
          o.id === correct.id
            ? chosen.why
            : o.key === 'induction'
              ? 'Induction needs a statement indexed by a natural number to step through; this one is not.'
              : 'Workable in principle, but it gives you nothing concrete to manipulate at the first step.',
      })),
      misconceptionTraps: [],
      explanation: {
        steps: [
          `Ask what each strategy *hands you* at the first line.`,
          chosen.why,
          `So the natural choice is **${chosen.method}**.`,
        ],
        principle:
          'Pick the strategy whose opening assumption is the most usable one; that choice is most of the difficulty in a proof.',
        hints: ['Which assumption gives you an equation to expand?', 'Is the statement indexed by a natural number?'],
      },
    };
  },
};

export const MATH2358_LOGIC_GENERATORS: readonly Generator[] = [
  propositionalTruthTable,
  deMorganTransform,
  conditionalRelatives,
  booleanSimplification,
  quantifierNegation,
  proofMethodChoice,
];
