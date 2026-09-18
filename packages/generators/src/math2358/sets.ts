import type { Generator } from '../types.js';
import { adjustDifficulty, intBetween, pick, resampleUntil, type Rng } from '../rng.js';
import { separatedTraps } from '../traps.js';
import { rowsOf, tex, texTable } from '../logic-common.js';

/**
 * MATH 2358, Unit 2 — sets, relations and functions.
 *
 * The membership-table generator is the reason this unit shares machinery with
 * the logic unit and with EE 2320: a membership table *is* a truth table with
 * the columns relabelled. Union is disjunction, intersection is conjunction,
 * complement is negation, and the identity being proved is the same identity in
 * all three notations. Reusing the grader and the widget is not a shortcut —
 * it is the claim the course makes, implemented.
 */

const SET_NAMES = ['A', 'B', 'C'] as const;

export const setOperationCount: Generator = {
  id: 'math2358.sets.operation-count',
  title: 'Cardinality of a set expression',
  kcRefs: [{ kc: 'math2358.set-operations', weight: 1 }],
  difficultyB: -1.0,
  generate(rng: Rng) {
    const universe = intBetween(rng, 12, 30);
    const sizeA = intBetween(rng, 4, Math.floor(universe / 2));
    const sizeB = intBetween(rng, 4, Math.floor(universe / 2));
    // Overlap must fit inside both sets and leave the union inside the universe.
    const both = intBetween(rng, 1, Math.min(sizeA, sizeB) - 1);

    const operation = pick(rng, ['union', 'difference', 'symmetric', 'complement'] as const);
    const union = sizeA + sizeB - both;

    const value =
      operation === 'union' ? union
      : operation === 'difference' ? sizeA - both
      : operation === 'symmetric' ? union - both
      : universe - union;

    const label =
      operation === 'union' ? 'A \\cup B'
      : operation === 'difference' ? 'A \\setminus B'
      : operation === 'symmetric' ? 'A \\oplus B'
      : '\\overline{A \\cup B}';

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        operation === 'union' ? -1 : operation === 'complement' ? 0.8 : 0.3,
      ]),
      stem:
        `In a universe of ${universe} elements, $|A| = ${sizeA}$, $|B| = ${sizeB}$ and ` +
        `$|A \\cap B| = ${both}$.\\n\\nFind $|${label}|$.`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { abs: 0.01 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { abs: 0.01 }, [
        {
          misconception: 'sets.overlap-double-counted',
          value: sizeA + sizeB,
          tolerance: { abs: 0.01 },
          feedback:
            `You added the two sizes without removing the overlap. The ${both} elements in both sets ` +
            `were counted twice: $|A \\cup B| = |A| + |B| - |A \\cap B|$.`,
        },
        {
          misconception: 'sets.complement-of-wrong-set',
          value: universe - sizeA,
          tolerance: { abs: 0.01 },
          feedback: `That is the complement of $A$ alone. Build the set inside the bar first, then subtract from the universe.`,
        },
      ]),
      explanation: {
        steps: [
          `$|A \\cup B| = |A| + |B| - |A \\cap B| = ${sizeA} + ${sizeB} - ${both} = ${union}$.`,
          operation === 'union'
            ? `That is what was asked.`
            : operation === 'difference'
              ? `$|A \\setminus B| = |A| - |A \\cap B| = ${sizeA} - ${both}$.`
              : operation === 'symmetric'
                ? `The symmetric difference drops the shared part once more: $${union} - ${both}$.`
                : `The complement is everything outside the union: $${universe} - ${union}$.`,
          `So $|${label}| = ${value}$.`,
        ],
        principle:
          'Inclusion–exclusion is the whole of finite set counting: add the parts, then remove whatever you counted twice.',
        hints: ['Draw the two-circle Venn diagram and label each region.', 'How many elements are in exactly one set?'],
      },
    };
  },
};

export const membershipTable: Generator = {
  id: 'math2358.sets.membership-table',
  title: 'Membership table for a set identity',
  kcRefs: [
    { kc: 'math2358.set-identities', weight: 0.8 },
    { kc: 'math2358.set-operations', weight: 0.2 },
  ],
  difficultyB: -0.2,
  generate(rng: Rng) {
    const width = intBetween(rng, 2, 3);
    const sets = SET_NAMES.slice(0, width) as unknown as string[];

    // Set expressions written in Boolean notation: union is +, intersection is
    // product, complement is prime. The grader never learns the difference.
    const shapes = width === 2
      ? [`(A*B)'`, `(A+B)'`, `A*B'`, `A' + B`, `(A+B)*(A'+B')`]
      : [`A*(B+C)`, `(A+B)*(A+C)`, `(A*B)' + C`, `A' * (B+C)`, `(A+B+C)'`, `A*B' + C`];
    const expression = pick(rng, shapes);
    const rows = rowsOf(expression, sets);

    const rendered = expression
      .replace(/\*/g, ' \\cap ')
      .replace(/\+/g, ' \\cup ')
      .replace(/([A-C])'/g, '\\overline{$1}')
      .replace(/\)'/g, ')^c');

    return {
      type: 'truth-table' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [width === 3 ? 1 : -1]),
      stem:
        `Complete the membership table for $${rendered}$.\\n\\n` +
        `Write 1 when an element belongs to the set and 0 when it does not.`,
      answer: { kind: 'truth-table' as const, inputs: sets, output: 'member', rows },
      options: [],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `A membership table is a truth table: $\\cap$ is AND, $\\cup$ is OR, and complement is NOT.`,
          `Each row is one possible pattern of membership in the ${width} sets.`,
          `Evaluating gives $${texTable(sets, rows, 'member')}$.`,
          `This is the same computation as $${tex(expression)}$ in logic, and the same as a gate network in EE 2320.`,
        ],
        principle:
          'Set algebra, propositional logic and switching algebra are one structure — proving an identity in any of them proves it in all three.',
        hints: [
          'Handle the innermost operation for every row first.',
          'Complement flips the column you just built.',
        ],
      },
    };
  },
};

export const powerSetAndProducts: Generator = {
  id: 'math2358.sets.power-set',
  title: 'Power sets and Cartesian products',
  kcRefs: [
    { kc: 'math2358.cartesian-products', weight: 0.6 },
    { kc: 'math2358.set-operations', weight: 0.4 },
  ],
  difficultyB: -0.6,
  generate(rng: Rng) {
    const kind = pick(rng, ['power', 'product', 'product-power'] as const);

    // 2 is the one size where 2^n, 2n and n^2 all coincide, so a power draw at
    // |A| = 2 puts both traps exactly on the answer and `separatedTraps`
    // rightly deletes them — shipping an item that cannot diagnose anything.
    // The same happens to the product form whenever |A| = |B| (the squared
    // trap lands on the answer) or |A| = |B| = 2 (so does the additive one).
    // Constrain the draw rather than leaving the backstop to empty it.
    const [sizeA, sizeB] = resampleUntil(
      rng,
      (r) => [intBetween(r, 2, 6), intBetween(r, 2, 5)] as [number, number],
      ([a, b]) => {
        const answer = kind === 'power' ? 2 ** a : kind === 'product' ? a * b : 2 ** (a * b);
        const linear = kind === 'product' ? a + b : 2 * a;
        const confused = kind === 'product-power' ? 2 ** a * 2 ** b : a ** 2;
        return linear !== answer && confused !== answer;
      },
    );

    const value =
      kind === 'power' ? 2 ** sizeA
      : kind === 'product' ? sizeA * sizeB
      : 2 ** (sizeA * sizeB);

    const label =
      kind === 'power' ? '|\\mathcal{P}(A)|'
      : kind === 'product' ? '|A \\times B|'
      : '|\\mathcal{P}(A \\times B)|';

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        kind === 'product' ? -1 : kind === 'power' ? 0 : 1,
      ]),
      stem: `Given $|A| = ${sizeA}$ and $|B| = ${sizeB}$, find $${label}$.`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { abs: 0.01 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { abs: 0.01 }, [
        {
          misconception: 'sets.power-set-size-linear',
          value: kind === 'product' ? sizeA + sizeB : 2 * sizeA,
          tolerance: { abs: 0.01 },
          feedback:
            kind === 'product'
              ? `You added the sizes. A Cartesian product pairs *every* element of $A$ with *every* element of $B$, so the sizes multiply.`
              : `A power set is not twice the size — it is $2^{|A|}$, because each element is independently in or out of a subset.`,
        },
        {
          misconception: 'sets.product-then-power-confused',
          value: kind === 'product-power' ? 2 ** sizeA * 2 ** sizeB : sizeA ** 2,
          tolerance: { abs: 0.01 },
          feedback: `Build the inner set first and take its size, then apply the outer operation to that number.`,
        },
      ]),
      explanation: {
        steps: [
          kind === 'product' || kind === 'product-power'
            ? `$|A \\times B| = |A|\\cdot|B| = ${sizeA} \\cdot ${sizeB} = ${sizeA * sizeB}$.`
            : `Each of the ${sizeA} elements is either in a subset or not, independently.`,
          kind === 'power'
            ? `So $|\\mathcal{P}(A)| = 2^{${sizeA}} = ${value}$.`
            : kind === 'product'
              ? `So $|A \\times B| = ${value}$.`
              : `Then $|\\mathcal{P}(A \\times B)| = 2^{${sizeA * sizeB}} = ${value}$.`,
        ],
        principle:
          'Products multiply and power sets exponentiate, because one is a choice per pair and the other a choice per element.',
        hints: ['How many independent binary choices are there?', 'Work from the inside out.'],
      },
    };
  },
};

export const relationProperties: Generator = {
  id: 'math2358.sets.relation-properties',
  title: 'Properties of a relation',
  kcRefs: [{ kc: 'math2358.relation-properties', weight: 1 }],
  difficultyB: 0.4,
  generate(rng: Rng) {
    const size = 3;
    const elements = [1, 2, 3];

    // Build a relation with known properties rather than testing a random one,
    // so the stem and the key are derived from the same construction.
    const reflexive = rng() < 0.5;
    const symmetric = rng() < 0.5;

    const pairs = new Set<string>();
    if (reflexive) for (const e of elements) pairs.add(`${e},${e}`);
    else pairs.add(`1,1`); // partially reflexive: enough to make it not reflexive

    const extra = resampleUntil(
      rng,
      (r) => [intBetween(r, 1, size), intBetween(r, 1, size)] as [number, number],
      ([a, b]) => a !== b,
    );
    pairs.add(`${extra[0]},${extra[1]}`);
    if (symmetric) pairs.add(`${extra[1]},${extra[0]}`);

    const rendered = [...pairs]
      .map((p) => `(${p.replace(',', ', ')})`)
      .sort()
      .join(', ');

    const isReflexive = elements.every((e) => pairs.has(`${e},${e}`));
    const isSymmetric = [...pairs].every((p) => {
      const [a, b] = p.split(',');
      return pairs.has(`${b},${a}`);
    });

    const correctId = isReflexive && isSymmetric ? 'a' : isReflexive ? 'b' : isSymmetric ? 'c' : 'd';

    return {
      type: 'multiple-choice' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [isReflexive === isSymmetric ? -0.5 : 0.5]),
      stem:
        `On the set $\\{1, 2, 3\\}$, let $R = \\{${rendered}\\}$.\\n\\n` +
        `Which describes $R$?`,
      answer: { kind: 'choice' as const, correctId },
      options: [
        { id: 'a', text: 'Reflexive and symmetric', ...(correctId === 'a' ? {} : { misconception: 'relations.property-overclaimed' }) },
        { id: 'b', text: 'Reflexive but not symmetric', ...(correctId === 'b' ? {} : { misconception: 'relations.symmetry-misread' }) },
        { id: 'c', text: 'Symmetric but not reflexive', ...(correctId === 'c' ? {} : { misconception: 'relations.reflexivity-misread' }) },
        { id: 'd', text: 'Neither reflexive nor symmetric', ...(correctId === 'd' ? {} : { misconception: 'relations.property-underclaimed' }) },
      ].map((o) => ({
        ...o,
        rationale:
          o.id === correctId
            ? `Reflexive needs all three of $(1,1), (2,2), (3,3)$ — ${isReflexive ? 'all present' : 'not all present'}. Symmetric needs every $(a,b)$ matched by $(b,a)$ — ${isSymmetric ? 'it is' : 'it is not'}.`
            : 'Check both conditions separately against the listed pairs.',
      })),
      misconceptionTraps: [],
      explanation: {
        steps: [
          `Reflexive: every element relates to itself, so all of $(1,1), (2,2), (3,3)$ must appear. ${isReflexive ? 'They do.' : 'They do not.'}`,
          `Symmetric: whenever $(a,b) \\in R$, $(b,a)$ must too. ${isSymmetric ? 'Every pair is matched.' : 'At least one pair is unmatched.'}`,
          `So $R$ is ${isReflexive ? '' : 'not '}reflexive and ${isSymmetric ? '' : 'not '}symmetric.`,
        ],
        principle:
          'Each property is a separate condition checked over the whole relation; a relation can hold any combination of them.',
        hints: ['List the three pairs reflexivity requires and check them off.', 'For symmetry, look for a pair whose reverse is missing.'],
      },
    };
  },
};

export const functionClassification: Generator = {
  id: 'math2358.sets.function-classification',
  title: 'Injective, surjective or bijective',
  kcRefs: [{ kc: 'math2358.functions', weight: 1 }],
  difficultyB: 0.3,
  generate(rng: Rng) {
    const cases = [
      { f: 'f: \\mathbb{Z} \\to \\mathbb{Z}, \\; f(n) = 2n', kind: 'injective', why: 'Distinct inputs give distinct outputs, but no odd integer is ever an output.' },
      { f: 'f: \\mathbb{Z} \\to \\mathbb{Z}, \\; f(n) = n + 7', kind: 'bijective', why: 'Every integer has exactly one preimage, namely $n - 7$.' },
      { f: 'f: \\mathbb{Z} \\to \\mathbb{Z}, \\; f(n) = n^2', kind: 'neither', why: '$f(3) = f(-3)$ breaks injectivity, and no negative integer is an output.' },
      { f: 'f: \\mathbb{R} \\to \\mathbb{R}, \\; f(x) = x^3', kind: 'bijective', why: 'Strictly increasing and unbounded in both directions.' },
      { f: 'f: \\mathbb{Z} \\to \\mathbb{N}, \\; f(n) = |n|', kind: 'surjective', why: 'Every natural number is hit, but $f(3) = f(-3)$.' },
      { f: 'f: \\mathbb{R} \\to \\mathbb{R}, \\; f(x) = x^2', kind: 'neither', why: 'Not one-to-one, and negative reals are never outputs.' },
    ] as const;
    const chosen = pick(rng, cases);

    const options = [
      { id: 'a', key: 'injective', text: 'Injective but not surjective' },
      { id: 'b', key: 'surjective', text: 'Surjective but not injective' },
      { id: 'c', key: 'bijective', text: 'Bijective' },
      { id: 'd', key: 'neither', text: 'Neither injective nor surjective' },
    ];
    const correct = options.find((o) => o.key === chosen.kind)!;

    return {
      type: 'multiple-choice' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [chosen.kind === 'bijective' ? -0.5 : 0.4]),
      stem: `Classify $${chosen.f}$.`,
      answer: { kind: 'choice' as const, correctId: correct.id },
      options: options.map((o) => ({
        id: o.id,
        text: o.text,
        ...(o.id === correct.id ? {} : { misconception: `functions.${o.key}-misjudged` }),
        rationale: o.id === correct.id ? chosen.why : 'Test the two conditions separately against the stated domain and codomain.',
      })),
      misconceptionTraps: [],
      explanation: {
        steps: [
          `Injective: does $f(a) = f(b)$ force $a = b$?`,
          `Surjective: is every element of the **stated codomain** an output?`,
          chosen.why,
          `So it is ${correct.text.toLowerCase()}.`,
        ],
        principle:
          'Both properties depend on the declared domain and codomain, not on the formula alone — changing the codomain can make the same rule surjective or not.',
        hints: ['Try to find two inputs with the same output.', 'Name an element of the codomain and ask what maps to it.'],
      },
    };
  },
};

export const equivalenceClasses: Generator = {
  id: 'math2358.sets.equivalence-classes',
  title: 'Equivalence classes and partitions',
  kcRefs: [
    { kc: 'math2358.equivalence-relations', weight: 0.8 },
    { kc: 'math2358.relation-properties', weight: 0.2 },
  ],
  difficultyB: 0.5,
  generate(rng: Rng) {
    const modulus = pick(rng, [3, 4, 5, 6, 7]);
    const upper = modulus * intBetween(rng, 3, 6);
    const askClasses = rng() < 0.6;

    // Congruence mod n partitions any set into exactly n classes, and on
    // {1..upper} with upper a multiple of n each class has upper/n members.
    const value = askClasses ? modulus : upper / modulus;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [askClasses ? -1 : 1, modulus > 4 ? 0.5 : -0.5]),
      stem:
        `On $\\{1, 2, \\ldots, ${upper}\\}$, define $a \\sim b$ when $a \\equiv b \\pmod{${modulus}}$. ` +
        `This is an equivalence relation.\\n\\n` +
        (askClasses
          ? `How many distinct equivalence classes does it have?`
          : `How many elements are in each equivalence class?`),
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { abs: 0.01 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { abs: 0.01 }, [
        {
          misconception: 'relations.classes-confused-with-elements',
          value: askClasses ? upper / modulus : modulus,
          tolerance: { abs: 0.01 },
          feedback: askClasses
            ? `That is the **size** of each class, not how many there are. The classes are the possible remainders: $0, 1, \\ldots, ${modulus - 1}$.`
            : `That is the **number** of classes, not how many elements each holds. Spread ${upper} elements evenly over ${modulus} classes.`,
        },
        {
          misconception: 'relations.partition-not-exhaustive',
          value: upper,
          tolerance: { abs: 0.01 },
          feedback:
            `That is the size of the whole set. A partition splits it into disjoint classes whose sizes sum to ${upper} — ` +
            `it does not leave it whole.`,
        },
      ]),
      explanation: {
        steps: [
          `Two numbers are related exactly when they leave the same remainder mod ${modulus}.`,
          `The possible remainders are $0, 1, \\ldots, ${modulus - 1}$, so there are ${modulus} classes.`,
          `Since ${upper} is a multiple of ${modulus}, each class holds $${upper}/${modulus} = ${upper / modulus}$ elements.`,
          `So the answer is ${value}.`,
        ],
        principle:
          'An equivalence relation and a partition are the same object seen two ways: the classes are the blocks, and every element lies in exactly one.',
        hints: ['What determines whether two numbers are related?', 'How many distinct remainders are there?'],
      },
    };
  },
};

export const MATH2358_SET_GENERATORS: readonly Generator[] = [
  setOperationCount,
  membershipTable,
  powerSetAndProducts,
  relationProperties,
  equivalenceClasses,
  functionClassification,
];
