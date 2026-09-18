import type { Generator } from '../types.js';
import { adjustDifficulty, intBetween, pick, type Rng } from '../rng.js';
import { separatedTraps } from '../traps.js';

/**
 * MATH 2358, Unit 3 — combinatorics.
 *
 * Every trap in this unit encodes the same confusion from a different angle:
 * whether order matters, and whether choices multiply or add. Those two
 * decisions are made in the first line of a counting problem and everything
 * after them is arithmetic, so the traps are placed on the decision rather than
 * on the arithmetic.
 */

const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
const permute = (n: number, k: number): number => factorial(n) / factorial(n - k);
const choose = (n: number, k: number): number => permute(n, k) / factorial(k);

export const productRule: Generator = {
  id: 'math2358.counting.product-rule',
  title: 'Product and sum rules',
  kcRefs: [{ kc: 'math2358.counting-principles', weight: 1 }],
  difficultyB: -0.9,
  generate(rng: Rng) {
    const stages = intBetween(rng, 2, 3);
    const sizes = Array.from({ length: stages }, () => intBetween(rng, 3, 9));
    const independent = rng() < 0.65;

    const scenarios = independent
      ? [
          `A password uses one character from each of ${stages} disjoint pools`,
          `A meal is one item from each of ${stages} separate courses`,
          `A part number has ${stages} fields, each chosen independently`,
        ]
      : [
          `A single item is chosen from exactly one of ${stages} disjoint shelves`,
          `One route is taken, and the routes fall into ${stages} disjoint groups`,
        ];
    const scenario = pick(rng, scenarios);

    const product = sizes.reduce((a, b) => a * b, 1);
    const sum = sizes.reduce((a, b) => a + b, 0);
    const value = independent ? product : sum;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [stages === 3 ? 0.6 : -0.6, independent ? -0.4 : 0.6]),
      stem:
        `${scenario}, of sizes ${sizes.join(', ')}.\\n\\n` +
        `How many ${independent ? 'combinations are possible' : 'single choices are available in total'}?`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { abs: 0.01 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { abs: 0.01 }, [
        {
          misconception: 'counting.rule-confused',
          value: independent ? sum : product,
          tolerance: { abs: 0.01 },
          feedback: independent
            ? `You added where the choices multiply. Each stage is chosen **as well as** the others, so every combination of stages is distinct: multiply.`
            : `You multiplied where the choices add. Exactly one option is taken, and the groups are disjoint, so the totals simply accumulate: add.`,
        },
      ]),
      explanation: {
        steps: [
          independent
            ? `Independent stages compound: choosing one from each multiplies the counts.`
            : `Disjoint alternatives accumulate: choosing one *or* the other adds the counts.`,
          `${sizes.join(independent ? ' × ' : ' + ')} = ${value}.`,
        ],
        principle:
          '"And" multiplies, "or" over disjoint cases adds — decide which one the problem is before touching arithmetic.',
        hints: ['Are the choices made together, or is exactly one made?', 'Could the same outcome be counted twice?'],
      },
    };
  },
};

export const permutationsAndCombinations: Generator = {
  id: 'math2358.counting.permutations-combinations',
  title: 'Permutations and combinations',
  kcRefs: [
    { kc: 'math2358.combinations', weight: 0.5 },
    { kc: 'math2358.permutations', weight: 0.5 },
  ],
  difficultyB: -0.2,
  generate(rng: Rng) {
    const n = intBetween(rng, 6, 12);
    const k = intBetween(rng, 2, Math.min(5, n - 1));
    const ordered = rng() < 0.5;

    const scenario = ordered
      ? `${k} people are chosen from ${n} candidates and assigned ${k} distinct offices`
      : `a committee of ${k} is chosen from ${n} candidates, with no distinct roles`;

    const value = ordered ? permute(n, k) : choose(n, k);
    const other = ordered ? choose(n, k) : permute(n, k);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [k > 3 ? 0.7 : -0.5, ordered ? -0.3 : 0.3]),
      stem: `In how many ways can this be done: ${scenario}?`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { abs: 0.01 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { abs: 0.01 }, [
        {
          misconception: 'counting.order-relevance-misjudged',
          value: other,
          tolerance: { abs: 0.01 },
          feedback: ordered
            ? `You divided by $${k}!$, which removes the ordering — but the offices are **distinct**, so the same ${k} people in different roles is a different outcome. Use $P(${n},${k})$.`
            : `You counted orderings. A committee has no roles, so the same ${k} people in a different order is the **same** committee. Divide by $${k}!$ — use $C(${n},${k})$.`,
        },
        {
          misconception: 'counting.replacement-assumed',
          value: n ** k,
          tolerance: { abs: 0.01 },
          feedback: `$${n}^{${k}}$ assumes each choice is made from the full set every time. Here people are not reused, so the pool shrinks with each selection.`,
        },
      ]),
      explanation: {
        steps: [
          ordered
            ? `Order matters, so count arrangements: $P(${n},${k}) = \\frac{${n}!}{(${n}-${k})!}$.`
            : `Order does not matter, so count selections: $C(${n},${k}) = \\frac{${n}!}{${k}!\\,(${n}-${k})!}$.`,
          ordered
            ? `$= ${n} \\times ${n - 1}${k > 2 ? ' \\times \\cdots' : ''} = ${value}$.`
            : `$= \\frac{P(${n},${k})}{${k}!} = \\frac{${permute(n, k)}}{${factorial(k)}} = ${value}$.`,
          `So the answer is ${value}.`,
        ],
        principle:
          'A permutation and a combination differ by exactly k! — the number of orderings of one selection.',
        hints: ['Would swapping two chosen people give a different outcome?', 'If not, divide by k!.'],
      },
    };
  },
};

export const pigeonholeMinimum: Generator = {
  id: 'math2358.counting.pigeonhole',
  title: 'Pigeonhole principle',
  kcRefs: [{ kc: 'math2358.pigeonhole', weight: 1 }],
  difficultyB: 0.4,
  generate(rng: Rng) {
    const holes = intBetween(rng, 3, 12);
    const guarantee = intBetween(rng, 2, 4);
    const value = holes * (guarantee - 1) + 1;

    const scenarios = [
      `socks of ${holes} colours are drawn from a drawer`,
      `items are sorted into ${holes} bins`,
      `people are grouped by which of ${holes} months they were born in`,
    ];

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [guarantee > 2 ? 0.8 : -0.6, holes > 8 ? 0.3 : -0.3]),
      stem:
        `Suppose ${pick(rng, scenarios)}.\\n\\n` +
        `What is the smallest number that **guarantees** at least ${guarantee} fall into the same category?`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { abs: 0.01 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { abs: 0.01 }, [
        {
          misconception: 'counting.pigeonhole-off-by-one',
          value: holes * (guarantee - 1),
          tolerance: { abs: 0.01 },
          feedback:
            `That is the largest number that can be distributed **without** forcing it — every category holding ` +
            `${guarantee - 1}. One more is what makes the guarantee, so add 1.`,
        },
        {
          misconception: 'counting.pigeonhole-holes-times-target',
          value: holes * guarantee,
          tolerance: { abs: 0.01 },
          feedback:
            `That would fill every category to ${guarantee}, which is far more than needed. The worst case only has to be ` +
            `broken once: $${holes}(${guarantee}-1) + 1$.`,
        },
      ]),
      explanation: {
        steps: [
          `Consider the worst case: spread them as evenly as possible.`,
          `Each of the ${holes} categories can hold ${guarantee - 1} without reaching ${guarantee}, giving $${holes} \\times ${guarantee - 1} = ${holes * (guarantee - 1)}$.`,
          `One more forces some category to ${guarantee}: $${holes * (guarantee - 1)} + 1 = ${value}$.`,
        ],
        principle:
          'Pigeonhole is an argument about the worst case: find the largest arrangement that avoids the conclusion, then add one.',
        hints: ['How many could you have while still avoiding the outcome?', 'The answer is always that number plus one.'],
      },
    };
  },
};

export const inclusionExclusion: Generator = {
  id: 'math2358.counting.inclusion-exclusion',
  title: 'Inclusion-exclusion',
  kcRefs: [{ kc: 'math2358.inclusion-exclusion', weight: 1 }],
  difficultyB: 0.5,
  generate(rng: Rng) {
    const total = intBetween(rng, 40, 120);
    const a = intBetween(rng, 15, Math.floor(total * 0.6));
    const b = intBetween(rng, 15, Math.floor(total * 0.6));
    const both = intBetween(rng, 5, Math.min(a, b) - 2);
    const neither = total - (a + b - both);

    const askNeither = rng() < 0.5;
    const value = askNeither ? neither : a + b - both;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [askNeither ? 0.6 : -0.6]),
      stem:
        `Of ${total} students, ${a} take discrete mathematics, ${b} take digital logic, and ${both} take both.\\n\\n` +
        `How many take ${askNeither ? '**neither**' : 'at least one of the two'}?`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { abs: 0.01 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { abs: 0.01 }, [
        {
          misconception: 'sets.overlap-double-counted',
          value: askNeither ? total - (a + b) : a + b,
          tolerance: { abs: 0.01 },
          feedback:
            `The ${both} students taking both were counted in each subject total, so adding the totals counts them twice. ` +
            `Subtract the overlap once: $|A \\cup B| = |A| + |B| - |A \\cap B|$.`,
        },
        {
          misconception: 'sets.exactly-one-vs-at-least-one',
          value: a + b - 2 * both,
          tolerance: { abs: 0.01 },
          feedback:
            `Subtracting the overlap twice counts students taking **exactly one** subject. "At least one" keeps them once.`,
        },
      ]),
      explanation: {
        steps: [
          `$|A \\cup B| = ${a} + ${b} - ${both} = ${a + b - both}$ take at least one.`,
          askNeither
            ? `Everyone else takes neither: $${total} - ${a + b - both} = ${neither}$.`
            : `That is what was asked.`,
          `So the answer is ${value}.`,
        ],
        principle:
          'Add the parts, subtract what you counted twice — and subtract from the universe when the question asks for the outside.',
        hints: ['Sketch the two circles and fill in the middle region first.', 'How many are outside both circles?'],
      },
    };
  },
};

export const binomialCoefficient: Generator = {
  id: 'math2358.counting.binomial',
  title: 'Binomial theorem coefficients',
  kcRefs: [{ kc: 'math2358.binomial-theorem', weight: 1 }],
  difficultyB: 0.4,
  generate(rng: Rng) {
    const n = intBetween(rng, 5, 9);
    const k = intBetween(rng, 2, n - 2);
    const coefficient = intBetween(rng, 2, 3);
    const negative = rng() < 0.4;

    // Coefficient of x^(n-k) y^k in (x + c*y)^n, optionally (x - c*y)^n.
    const sign = negative && k % 2 === 1 ? -1 : 1;
    const value = sign * choose(n, k) * coefficient ** k;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [negative ? 1 : -1, coefficient > 2 ? 1 : -1]),
      stem:
        `Find the coefficient of $x^{${n - k}}y^{${k}}$ in the expansion of ` +
        `$(x ${negative ? '-' : '+'} ${coefficient}y)^{${n}}$.`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { abs: 0.01 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { abs: 0.01 }, [
        {
          misconception: 'binomial.inner-coefficient-dropped',
          value: sign * choose(n, k),
          tolerance: { abs: 0.01 },
          feedback:
            `You used $\\binom{${n}}{${k}}$ alone. The $${coefficient}y$ term is raised to the ${k}th power too, so it ` +
            `contributes $${coefficient}^{${k}} = ${coefficient ** k}$.`,
        },
        ...(negative
          ? [{
              misconception: 'binomial.sign-dropped',
              value: Math.abs(value),
              tolerance: { abs: 0.01 },
              feedback: `The subtraction makes the term $(-${coefficient}y)^{${k}}$, which is ${k % 2 === 1 ? 'negative for an odd power' : 'positive for an even power'}.`,
            }]
          : []),
      ]),
      explanation: {
        steps: [
          `The general term is $\\binom{${n}}{k}x^{${n}-k}(${negative ? '-' : ''}${coefficient}y)^{k}$.`,
          `For $y^{${k}}$ take $k = ${k}$: $\\binom{${n}}{${k}} = ${choose(n, k)}$.`,
          `The inner coefficient contributes $(${negative ? '-' : ''}${coefficient})^{${k}} = ${sign * coefficient ** k}$.`,
          `Coefficient $= ${choose(n, k)} \\times ${sign * coefficient ** k} = ${value}$.`,
        ],
        principle:
          'Everything inside the bracket is raised to the power, not just the variable — the binomial coefficient is only part of the answer.',
        hints: ['Write the general term before substituting.', 'What happens to the numeric coefficient when it is raised to k?'],
      },
    };
  },
};

export const MATH2358_COUNTING_GENERATORS: readonly Generator[] = [
  productRule,
  permutationsAndCombinations,
  pigeonholeMinimum,
  inclusionExclusion,
  binomialCoefficient,
];
