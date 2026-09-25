import type { Generator } from '../types.js';
import { adjustDifficulty, intBetween, mantissaDifficulty, pick, resampleUntil, type Rng } from '../rng.js';
import { separatedTraps } from '../traps.js';

/**
 * The sections MATH 2358's syllabus teaches that the graph had no component
 * for — Rosen 2.4, 2.5, 4.2, 4.4, 10.3, 10.6 and 11.3/11.4.
 *
 * The graph had been written from what a discrete maths course usually
 * contains. This one's syllabus lists its sections day by day, and against it
 * nine taught sections had nothing at all. Two of them, sequences and
 * summations and cardinality, are on the first test.
 */

const EXACT = { abs: 0.5 } as const;

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

/** Sums whose closed form the course states, and sequences given by recurrence. */
export const sequencesSummations: Generator = {
  id: 'math2358.sequences.summation',
  title: 'Sequences and summations',
  kcRefs: [{ kc: 'math2358.sequences-summations', weight: 1 }],
  difficultyB: -0.2,
  generate(rng: Rng) {
    const mode = pick(rng, ['geometric', 'power', 'recursive'] as const);

    if (mode === 'geometric') {
      const a = pick(rng, [1, 2, 3, 5]);
      const r = pick(rng, [2, 3, 4, 5]);
      const n = intBetween(rng, 4, 9);
      // sum_{j=0}^{n} a r^j has n + 1 terms.
      const answer = (a * (r ** (n + 1) - 1)) / (r - 1);
      const offByOne = (a * (r ** n - 1)) / (r - 1);

      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [0.3, mantissaDifficulty(answer)]),
        stem: `Evaluate $\\displaystyle\\sum_{j=0}^{${n}} ${a === 1 ? '' : a} \\cdot ${r}^{\\,j}$.`,
        answer: { kind: 'numeric' as const, value: answer, unit: '', tolerance: EXACT },
        options: [],
        misconceptionTraps: separatedTraps(answer, EXACT, [
          {
            misconception: 'summation.term-count-off-by-one',
            value: offByOne,
            tolerance: EXACT,
            feedback:
              `A sum running from $j = 0$ to $j = ${n}$ has **${n + 1}** terms, not ${n}. The closed form is ` +
              `$\\dfrac{a(r^{\\,n+1} - 1)}{r - 1}$, and the exponent is $n + 1$ for exactly that reason.`,
          },
          {
            misconception: 'summation.arithmetic-form-on-geometric',
            value: ((n + 1) * (a + a * r ** n)) / 2,
            tolerance: EXACT,
            feedback:
              `That averages the first and last terms, which is the **arithmetic** closed form. A geometric ` +
              `series grows too fast for its mean to be the midpoint of its ends.`,
          },
        ]),
        explanation: {
          steps: [
            `This is geometric with first term $a = ${a}$ and ratio $r = ${r}$.`,
            `$\\displaystyle\\sum_{j=0}^{n} ar^{\\,j} = \\dfrac{a(r^{\\,n+1} - 1)}{r - 1}$, with $n = ${n}$.`,
            `$= \\dfrac{${a}(${r}^{${n + 1}} - 1)}{${r - 1}} = ${answer}$.`,
          ],
          principle:
            'A geometric sum from 0 to n has n + 1 terms, and the closed form carries that as the exponent n + 1. Almost every error here is the term count.',
          hints: ['How many terms are there, counting the j = 0 one?', 'Use the closed form rather than adding them up.'],
        },
      };
    }

    if (mode === 'power') {
      const power = pick(rng, [1, 2] as const);
      const n = intBetween(rng, 6, 20);
      const answer = power === 1 ? (n * (n + 1)) / 2 : (n * (n + 1) * (2 * n + 1)) / 6;
      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [power === 2 ? 0.5 : -0.5, mantissaDifficulty(answer)]),
        stem: `Evaluate $\\displaystyle\\sum_{k=1}^{${n}} k${power === 2 ? '^{2}' : ''}$.`,
        answer: { kind: 'numeric' as const, value: answer, unit: '', tolerance: EXACT },
        options: [],
        misconceptionTraps: separatedTraps(answer, EXACT, [
          {
            misconception: 'summation.closed-form-squared',
            value: power === 2 ? ((n * (n + 1)) / 2) ** 2 : (n * n) / 2,
            tolerance: EXACT,
            feedback:
              power === 2
                ? `Squaring the sum of $k$ gives $\\sum k^{3}$, not $\\sum k^{2}$. The squares have their own ` +
                  `closed form, $\\dfrac{n(n+1)(2n+1)}{6}$.`
                : `$\\dfrac{n(n+1)}{2}$, not $\\dfrac{n^{2}}{2}$ — the two differ by $n/2$, which matters at every $n$.`,
          },
          {
            misconception: 'summation.term-count-off-by-one',
            value: power === 1 ? (n * (n - 1)) / 2 : ((n - 1) * n * (2 * n - 1)) / 6,
            tolerance: EXACT,
            feedback: `That is the sum to $n - 1$. The upper limit here is $${n}$ and it is included.`,
          },
        ]),
        explanation: {
          steps: [
            power === 1
              ? `$\\displaystyle\\sum_{k=1}^{n} k = \\dfrac{n(n+1)}{2}$.`
              : `$\\displaystyle\\sum_{k=1}^{n} k^{2} = \\dfrac{n(n+1)(2n+1)}{6}$.`,
            `With $n = ${n}$ this is $${answer}$.`,
          ],
          principle:
            'These closed forms are worth knowing cold: they turn a loop into one line, and they are the base cases most induction proofs in this course are built on.',
          hints: ['Which closed form matches this power?', 'Check the upper limit is included.'],
        },
      };
    }

    // a_1 = c, a_k = p*a_{k-1} + q
    const c = intBetween(rng, 1, 6);
    const pMul = pick(rng, [2, 3]);
    const q = intBetween(rng, 1, 6);
    const k = intBetween(rng, 4, 7);
    let term = c;
    const seen: number[] = [c];
    for (let i = 2; i <= k; i += 1) { term = pMul * term + q; seen.push(term); }
    const answer = term;
    const offBy = seen[k - 2]!;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [0.2, mantissaDifficulty(answer)]),
      stem:
        `A sequence is defined by $a_1 = ${c}$ and $a_k = ${pMul}a_{k-1} + ${q}$ for $k \\geq 2$.\n\n` +
        `What is $a_{${k}}$?`,
      answer: { kind: 'numeric' as const, value: answer, unit: '', tolerance: EXACT },
      options: [],
      misconceptionTraps: separatedTraps(answer, EXACT, [
        {
          misconception: 'summation.term-count-off-by-one',
          value: offBy,
          tolerance: EXACT,
          feedback:
            `That is $a_{${k - 1}}$. Starting from $a_1$, reaching $a_{${k}}$ takes ${k - 1} applications of the ` +
            `recurrence, not ${k - 2}.`,
        },
        {
          misconception: 'summation.recurrence-constant-dropped',
          value: c * pMul ** (k - 1),
          tolerance: EXACT,
          feedback:
            `The $+ ${q}$ is applied at every step, not once. Dropping it leaves the purely geometric part.`,
        },
      ]),
      explanation: {
        steps: [
          `Apply the recurrence term by term from $a_1 = ${c}$:`,
          seen.map((v, i) => `$a_{${i + 1}} = ${v}$`).join(', ') + '.',
          `So $a_{${k}} = ${answer}$.`,
        ],
        principle:
          'A recursively defined sequence is only defined through its predecessor, so there is no shortcut to the k-th term without the k - 1 steps before it.',
        hints: ['How many times must the rule be applied to get from a_1 to a_k?', 'The constant is added at every step.'],
      },
    };
  },
};

/** Counting a finite set, and deciding when an infinite one is countable. */
export const cardinalityOfSets: Generator = {
  id: 'math2358.sets.cardinality',
  title: 'Cardinality of sets',
  kcRefs: [{ kc: 'math2358.cardinality', weight: 1 }],
  difficultyB: 0.4,
  generate(rng: Rng, seed: number) {
    const mode = pick(rng, ['finite', 'countable'] as const);

    if (mode === 'finite') {
      const a = intBetween(rng, 3, 7);
      const b = intBetween(rng, 2, 6);
      const which = pick(rng, ['power', 'product', 'power-of-product'] as const);
      const answer = which === 'power' ? 2 ** a : which === 'product' ? a * b : 2 ** (a * b);
      const question =
        which === 'power'
          ? `$|\\mathcal{P}(A)|$`
          : which === 'product'
            ? `$|A \\times B|$`
            : `$|\\mathcal{P}(A \\times B)|$`;

      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [
          which === 'power-of-product' ? 0.6 : which === 'product' ? -0.7 : -0.1,
          mantissaDifficulty(answer),
        ]),
        stem: `Let $|A| = ${a}$ and $|B| = ${b}$.\n\nWhat is ${question}?`,
        answer: { kind: 'numeric' as const, value: answer, unit: '', tolerance: EXACT },
        options: [],
        misconceptionTraps: separatedTraps(answer, EXACT, [
          ...(which !== 'product'
            ? [{
                misconception: 'sets.power-set-size-linear',
                value: which === 'power' ? 2 * a : 2 * a * b,
                tolerance: EXACT,
                feedback:
                  `A power set has $2^{n}$ elements, not $2n$. Each element is independently in or out of a ` +
                  `subset, so the choices multiply.`,
              }]
            : []),
          ...(which === 'product'
            ? [{
                misconception: 'sets.product-size-added',
                value: a + b,
                tolerance: EXACT,
                feedback:
                  `A Cartesian product pairs **every** element of $A$ with **every** element of $B$, so the sizes ` +
                  `multiply. Adding them counts a disjoint union instead.`,
              }]
            : []),
          ...(which === 'power-of-product'
            ? [{
                misconception: 'sets.product-then-power-confused',
                value: 2 ** a * 2 ** b,
                tolerance: EXACT,
                feedback:
                  `That is $|\\mathcal{P}(A)| \\cdot |\\mathcal{P}(B)|$. Take the product **first**: it has ` +
                  `$${a * b}$ elements, and its power set has $2^{${a * b}}$.`,
              }]
            : []),
        ]),
        explanation: {
          steps: [
            which === 'product'
              ? `Every element of $A$ pairs with every element of $B$, so the two sizes multiply.`
              : which === 'power'
                ? `A subset is formed by deciding, independently for each element, whether it is in — so $|\\mathcal{P}(S)| = 2^{|S|}$.`
                : `Work from the inside out: size the product first, then take its power set.`,
            which === 'product'
              ? `$|A \\times B| = |A| \\cdot |B| = ${a} \\cdot ${b} = ${answer}$.`
              : which === 'power'
                ? `$|\\mathcal{P}(A)| = 2^{|A|} = 2^{${a}} = ${answer}$.`
                : `First $|A \\times B| = ${a} \\cdot ${b} = ${a * b}$, then $|\\mathcal{P}(A \\times B)| = 2^{${a * b}} = ${answer}$.`,
          ],
          principle:
            'Products multiply and power sets exponentiate. Both follow from the same counting argument: independent choices multiply.',
          hints: ['Is each element chosen independently?', 'Work from the inside out.'],
        },
      };
    }

    const sets = [
      { name: '$\\mathbb{Z}$, the integers', countable: true, why: 'They can be listed $0, 1, -1, 2, -2, \\ldots$, which is a bijection with $\\mathbb{Z}^{+}$.' },
      { name: '$\\mathbb{Q}$, the rationals', countable: true, why: 'The standard diagonal enumeration of fractions lists every one of them.' },
      { name: '$\\mathbb{Z} \\times \\mathbb{Z}$', countable: true, why: 'A grid of pairs is enumerated along its diagonals.' },
      { name: 'the set of finite binary strings', countable: true, why: 'List them by length, and alphabetically within each length; every string appears.' },
      { name: '$\\mathbb{R}$, the reals', countable: false, why: 'Cantor\'s diagonal argument constructs a real missing from any proposed list.' },
      { name: 'the interval $(0, 1)$', countable: false, why: 'It is in bijection with $\\mathbb{R}$, so it is exactly as large.' },
      { name: '$\\mathcal{P}(\\mathbb{Z}^{+})$, the power set of the positive integers', countable: false, why: 'Cantor\'s theorem: no set is in bijection with its own power set.' },
    ] as const;
    const chosen = pick(rng, sets);
    const ids = ['a', 'b'] as const;
    const correct = chosen.countable ? 0 : 1;
    const rotate = seed % 2 === 1;
    const order = rotate ? [1, 0] : [0, 1];
    const labels = ['Countable', 'Uncountable'] as const;

    return {
      type: 'multiple-choice' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [chosen.countable ? 0.3 : -0.1]),
      stem: `Is ${chosen.name} countable or uncountable?`,
      answer: { kind: 'choice' as const, correctId: ids[order.indexOf(correct)]! },
      options: order.map((which, i) => ({
        id: ids[i]!,
        text: labels[which]!,
        ...(which === correct
          ? { rationale: chosen.why }
          : {
              misconception: chosen.countable ? 'cardinality.infinite-assumed-uncountable' : 'cardinality.uncountable-assumed-listable',
              rationale: chosen.countable
                ? 'Being infinite does not make a set uncountable — only the absence of any enumeration does.'
                : 'No enumeration of this set exists; a diagonal argument defeats every proposed one.',
            }),
      })),
      misconceptionTraps: [],
      explanation: {
        steps: [
          `A set is countable exactly when its elements can be put in a list indexed by $\\mathbb{Z}^{+}$ — that is, when a bijection with $\\mathbb{Z}^{+}$ exists.`,
          chosen.why,
          `So ${chosen.name} is **${chosen.countable ? 'countable' : 'uncountable'}**.`,
        ],
        principle:
          'Countable means listable, not small. The integers, the rationals and the finite strings are all countable and all infinite; the reals are not, and no cleverness in the listing fixes that.',
        hints: ['Can you describe a listing that reaches every element eventually?', 'Would a diagonal argument defeat any proposed list?'],
      },
    };
  },
};

/** Base-b expansions, which is EE 2320's binary and hex stated generally. */
export const integerRepresentations: Generator = {
  id: 'math2358.numbertheory.base-expansion',
  title: 'Integer representations',
  kcRefs: [{ kc: 'math2358.integer-representations', weight: 1 }],
  difficultyB: 0.0,
  generate(rng: Rng) {
    const base = pick(rng, [2, 3, 5, 8, 16] as const);
    const digits = intBetween(rng, 3, 5);
    const value = resampleUntil(rng, (r) => intBetween(r, base ** (digits - 1), base ** digits - 1), (v) => v > 0);
    const glyphs = '0123456789ABCDEF';
    const render = (n: number, b: number): string => {
      let out = '';
      let rest = n;
      while (rest > 0) { out = glyphs[rest % b]! + out; rest = Math.floor(rest / b); }
      return out || '0';
    };
    const text = render(value, base);
    // Reading the same glyphs one base off is the characteristic error.
    const wrongBase = base === 2 ? 8 : base === 16 ? 10 : base + 1;
    const misread = Number.parseInt(text, wrongBase);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        base === 2 ? -0.4 : base === 16 ? 0.4 : 0.1,
        mantissaDifficulty(value),
      ]),
      stem: `What is $(${text})_{${base}}$ in decimal?`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: EXACT },
      options: [],
      misconceptionTraps: separatedTraps(value, EXACT, [
        ...(Number.isFinite(misread)
          ? [{
              misconception: 'numbers.digits-read-in-wrong-base',
              value: misread,
              tolerance: EXACT,
              feedback:
                `Those glyphs were read in base ${wrongBase}. The subscript is the base, and every place value is ` +
                `a power of it: $${base}^{0}, ${base}^{1}, ${base}^{2}, \\ldots$`,
            }]
          : []),
        {
          misconception: 'numbers.place-value-off-by-one',
          value: value * base,
          tolerance: EXACT,
          feedback:
            `The rightmost digit sits in the $${base}^{0}$ place, not $${base}^{1}$. Starting the exponents at one ` +
            `multiplies the whole expansion by ${base}.`,
        },
      ]),
      explanation: {
        steps: [
          `Each digit is weighted by a power of ${base}, counting from $${base}^{0}$ on the right.`,
          `$` + text.split('').map((d, i) => `${glyphs.indexOf(d)} \\cdot ${base}^{${text.length - 1 - i}}`).join(' + ') + ` = ${value}$`,
          `$(${text})_{${base}} = ${value}$.`,
        ],
        principle:
          'A base-b expansion is a polynomial in b evaluated at b. Nothing about it is special to 2, 10 or 16.',
        hints: ['Which power of the base does the rightmost digit carry?', 'Work right to left.'],
      },
    };
  },
};

/** Inverses and linear congruences, where the Euclidean algorithm earns its keep. */
export const linearCongruences: Generator = {
  id: 'math2358.numbertheory.linear-congruence',
  title: 'Solving a linear congruence',
  kcRefs: [{ kc: 'math2358.linear-congruences', weight: 1 }],
  difficultyB: 0.5,
  generate(rng: Rng) {
    const { a, m } = resampleUntil(rng, (r) => ({
      a: intBetween(r, 2, 20),
      m: pick(r, [7, 9, 11, 13, 17, 19, 23, 26, 29, 31]),
    }), (d) => gcd(d.a, d.m) === 1 && d.a % d.m !== 0 && d.a % d.m !== 1);

    const inverse = (() => {
      for (let x = 1; x < m; x += 1) if ((a * x) % m === 1) return x;
      return 1;
    })();

    const mode = pick(rng, ['inverse', 'solve'] as const);
    if (mode === 'inverse') {
      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [-0.2, mantissaDifficulty(inverse)]),
        stem:
          `Find the inverse of $${a}$ modulo $${m}$.\n\n` +
          `Give the representative in the range $0 \\leq x < ${m}$.`,
        answer: { kind: 'numeric' as const, value: inverse, unit: '', tolerance: EXACT },
        options: [],
        misconceptionTraps: separatedTraps(inverse, EXACT, [
          {
            misconception: 'congruence.inverse-taken-as-negation',
            value: ((m - (a % m)) % m),
            tolerance: EXACT,
            feedback:
              `That is the additive inverse: $${a} + x \\equiv 0$. A **multiplicative** inverse satisfies ` +
              `$${a}x \\equiv 1 \\pmod{${m}}$.`,
          },
          {
            misconception: 'congruence.result-not-reduced',
            value: inverse + m,
            tolerance: EXACT,
            feedback:
              `Correct modulo $${m}$, but outside the requested range. Reduce into $0 \\leq x < ${m}$.`,
          },
        ]),
        explanation: {
          steps: [
            `$\\gcd(${a}, ${m}) = 1$, so an inverse exists — that is the condition, and the Euclidean algorithm is how you check it.`,
            `$${a} \\cdot ${inverse} = ${a * inverse} = ${Math.floor((a * inverse) / m)} \\cdot ${m} + 1$, so $${a} \\cdot ${inverse} \\equiv 1 \\pmod{${m}}$.`,
            `The inverse is $${inverse}$.`,
          ],
          principle:
            'An inverse modulo m exists exactly when gcd(a, m) = 1. Where that fails there is no inverse at all, and the congruence has either no solutions or many.',
          hints: ['Check the gcd first — it decides whether there is an answer.', 'Look for a multiple of a that is one more than a multiple of m.'],
        },
      };
    }

    const b = intBetween(rng, 1, m - 1);
    const answer = (inverse * b) % m;
    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [0.3, mantissaDifficulty(answer || 1)]),
      stem:
        `Solve $${a}x \\equiv ${b} \\pmod{${m}}$.\n\n` +
        `Give the solution in the range $0 \\leq x < ${m}$.`,
      answer: { kind: 'numeric' as const, value: answer, unit: '', tolerance: EXACT },
      options: [],
      misconceptionTraps: separatedTraps(answer, EXACT, [
        {
          misconception: 'congruence.divided-instead-of-inverted',
          value: Math.round(b / a) % m,
          tolerance: EXACT,
          feedback:
            `You cannot divide in modular arithmetic. Multiply both sides by the **inverse** of $${a}$, which here ` +
            `is $${inverse}$.`,
        },
        {
          misconception: 'congruence.result-not-reduced',
          value: inverse * b,
          tolerance: EXACT,
          feedback: `That is $${inverse} \\cdot ${b}$ before reducing. Take it modulo $${m}$.`,
        },
      ]),
      explanation: {
        steps: [
          `$\\gcd(${a}, ${m}) = 1$, so $${a}$ is invertible and the congruence has exactly one solution modulo $${m}$.`,
          `The inverse of $${a}$ is $${inverse}$, since $${a} \\cdot ${inverse} \\equiv 1 \\pmod{${m}}$.`,
          `Multiply both sides: $x \\equiv ${inverse} \\cdot ${b} = ${inverse * b} \\equiv ${answer} \\pmod{${m}}$.`,
        ],
        principle:
          'Solving a linear congruence is multiplication by an inverse, never division. Whether an inverse exists is a gcd question, answered before any solving begins.',
        hints: ['Find the inverse of the coefficient first.', 'Reduce the final product into the requested range.'],
      },
    };
  },
};

/** Graph invariants: the handshake identity, and what isomorphism must preserve. */
export const graphRepresentation: Generator = {
  id: 'math2358.graphs.representation',
  title: 'Representing graphs and isomorphism',
  kcRefs: [{ kc: 'math2358.graph-isomorphism', weight: 1 }],
  difficultyB: 0.4,
  generate(rng: Rng, seed: number) {
    const mode = pick(rng, ['handshake', 'invariant'] as const);

    if (mode === 'handshake') {
      const n = intBetween(rng, 5, 8);
      const degrees = resampleUntil(rng, (r) => Array.from({ length: n }, () => intBetween(r, 1, n - 1)),
        (d) => d.reduce((x, y) => x + y, 0) % 2 === 0);
      const total = degrees.reduce((x, y) => x + y, 0);
      const answer = total / 2;
      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [-0.5, mantissaDifficulty(answer)]),
        stem:
          `A simple graph has degree sequence $${degrees.join(', ')}$.\n\n` +
          `How many edges does it have?`,
        answer: { kind: 'numeric' as const, value: answer, unit: '', tolerance: EXACT },
        options: [],
        misconceptionTraps: separatedTraps(answer, EXACT, [
          {
            misconception: 'graphs.handshake-factor-two',
            value: total,
            tolerance: EXACT,
            feedback:
              `That is the sum of the degrees, which counts every edge **twice** — once from each end. ` +
              `$\\sum \\deg(v) = 2|E|$.`,
          },
          {
            misconception: 'graphs.edges-counted-as-vertices',
            value: n,
            tolerance: EXACT,
            feedback: `That is the number of vertices. The degree sequence has one entry per vertex, not per edge.`,
          },
        ]),
        explanation: {
          steps: [
            `The handshake theorem: $\\sum_{v} \\deg(v) = 2|E|$, because each edge contributes one to the degree of each endpoint.`,
            `$\\sum \\deg(v) = ${degrees.join(' + ')} = ${total}$.`,
            `So $|E| = ${total}/2 = ${answer}$.`,
          ],
          principle:
            'Every edge has two ends, so the degrees always sum to twice the edge count — which also means the sum can never be odd.',
          hints: ['How many degrees does one edge contribute to?', 'The sum of any degree sequence is even.'],
        },
      };
    }

    const invariants = [
      { claim: 'they have different numbers of edges', decisive: true },
      { claim: 'their degree sequences differ', decisive: true },
      { claim: 'one is connected and the other is not', decisive: true },
      { claim: 'their vertices are labelled differently', decisive: false },
      { claim: 'they are drawn with different numbers of edge crossings', decisive: false },
      { claim: 'their adjacency matrices are not identical', decisive: false },
    ] as const;
    const chosen = pick(rng, invariants);
    const ids = ['a', 'b'] as const;
    const correct = chosen.decisive ? 0 : 1;
    const order = seed % 2 === 1 ? [1, 0] : [0, 1];
    const labels = [
      'No — this rules isomorphism out',
      'Yes — this says nothing either way',
    ] as const;

    return {
      type: 'multiple-choice' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [chosen.decisive ? -0.2 : 0.4]),
      stem:
        `Two simple graphs are compared, and ${chosen.claim}.\n\n` +
        `Can they still be isomorphic?`,
      answer: { kind: 'choice' as const, correctId: ids[order.indexOf(correct)]! },
      options: order.map((which, i) => ({
        id: ids[i]!,
        text: labels[which]!,
        ...(which === correct
          ? { rationale: chosen.decisive ? 'This is an invariant, so isomorphic graphs must agree on it.' : 'This is a property of the drawing or the labelling, not of the graph.' }
          : {
              misconception: chosen.decisive ? 'graphs.invariant-mismatch-ignored' : 'graphs.presentation-mistaken-for-structure',
              rationale: chosen.decisive
                ? 'An isomorphism preserves this, so a mismatch is a proof they are not isomorphic.'
                : 'Relabelling vertices or redrawing edges changes neither the graph nor its isomorphism class.',
            }),
      })),
      misconceptionTraps: [],
      explanation: {
        steps: [
          `An isomorphism is a bijection on vertices that preserves adjacency, so every property defined purely from adjacency is preserved.`,
          chosen.decisive
            ? `Edge count, degree sequence and connectivity are all such properties, so a difference in any of them settles it: **not isomorphic**.`
            : `Labels, drawings and the particular ordering of an adjacency matrix are not: the same graph has many of each. This tells you nothing.`,
        ],
        principle:
          'Matching invariants never prove two graphs isomorphic; one mismatched invariant proves they are not. The negative direction is the tractable one.',
        hints: ['Is this property defined by adjacency alone?', 'Would relabelling the vertices change it?'],
      },
    };
  },
};

/** Dijkstra on a small weighted graph. */
export const shortestPath: Generator = {
  id: 'math2358.graphs.shortest-path',
  title: 'Shortest path in a weighted graph',
  kcRefs: [{ kc: 'math2358.shortest-path', weight: 1 }],
  difficultyB: 0.5,
  generate(rng: Rng) {
    // Fixed topology, drawn weights: a, b, c, d, e, f with two routes across.
    const w = {
      ab: intBetween(rng, 1, 9), ac: intBetween(rng, 1, 9), bd: intBetween(rng, 1, 9),
      cd: intBetween(rng, 1, 9), be: intBetween(rng, 1, 9), df: intBetween(rng, 1, 9),
      ef: intBetween(rng, 1, 9), ce: intBetween(rng, 1, 9),
    };
    const edges: [string, string, number][] = [
      ['a', 'b', w.ab], ['a', 'c', w.ac], ['b', 'd', w.bd], ['c', 'd', w.cd],
      ['b', 'e', w.be], ['c', 'e', w.ce], ['d', 'f', w.df], ['e', 'f', w.ef],
    ];
    const nodes = ['a', 'b', 'c', 'd', 'e', 'f'];
    const dist: Record<string, number> = Object.fromEntries(nodes.map((n) => [n, Infinity]));
    dist.a = 0;
    const done = new Set<string>();
    while (done.size < nodes.length) {
      let best: string | null = null;
      for (const n of nodes) if (!done.has(n) && (best === null || dist[n]! < dist[best]!)) best = n;
      if (best === null || dist[best] === Infinity) break;
      done.add(best);
      for (const [x, y, weight] of edges) {
        if (x === best && dist[best]! + weight < dist[y]!) dist[y] = dist[best]! + weight;
        if (y === best && dist[best]! + weight < dist[x]!) dist[x] = dist[best]! + weight;
      }
    }
    const answer = dist.f!;
    const viaD = Math.min(w.ab + w.bd, w.ac + w.cd) + w.df;
    const fewestEdges = w.ab + w.bd + w.df;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        Math.abs(viaD - answer) < 2 ? 0.5 : -0.2,
        mantissaDifficulty(answer),
      ]),
      stem:
        `A weighted graph has these edges:\n\n` +
        edges.map(([x, y, weight]) => `$${x}\\!-\\!${y}$ (${weight})`).join(', ') + `.\n\n` +
        `What is the length of the shortest path from $a$ to $f$?`,
      answer: { kind: 'numeric' as const, value: answer, unit: '', tolerance: EXACT },
      options: [],
      misconceptionTraps: separatedTraps(answer, EXACT, [
        {
          misconception: 'shortest-path.fewest-edges-taken',
          value: fewestEdges,
          tolerance: EXACT,
          feedback:
            `That is a three-edge route, but edge count is not path length. Every path here from $a$ to $f$ ` +
            `has three edges; only their weights distinguish them.`,
        },
        {
          misconception: 'shortest-path.all-edges-summed',
          value: edges.reduce((acc, [, , weight]) => acc + weight, 0),
          tolerance: EXACT,
          feedback: `That totals every edge in the graph. A path uses only the edges it traverses.`,
        },
      ]),
      explanation: {
        steps: [
          `Run Dijkstra from $a$, settling the nearest unvisited vertex each round.`,
          `Final distances: ` + nodes.map((n) => `$${n} = ${dist[n]}$`).join(', ') + `.`,
          `The shortest path to $f$ has length $${answer}$.`,
        ],
        principle:
          'Dijkstra settles vertices in order of distance, and that greedy step is sound only because no edge weight is negative — a negative edge could make a longer-looking route shorter later.',
        hints: ['Settle the closest unvisited vertex, then relax its edges.', 'Compare the routes through d and through e.'],
      },
    };
  },
};

/** Traversal order, and the edge count of a spanning tree. */
export const treeTraversal: Generator = {
  id: 'math2358.trees.traversal',
  title: 'Tree traversal and spanning trees',
  kcRefs: [{ kc: 'math2358.tree-traversal', weight: 1 }],
  difficultyB: 0.3,
  generate(rng: Rng) {
    const mode = pick(rng, ['spanning', 'traversal'] as const);

    if (mode === 'spanning') {
      const n = intBetween(rng, 6, 14);
      const extra = intBetween(rng, 3, 9);
      const answer = n - 1;
      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [-0.8, mantissaDifficulty(answer)]),
        stem:
          `A connected simple graph has $${n}$ vertices and $${n - 1 + extra}$ edges.\n\n` +
          `How many edges does any spanning tree of it have?`,
        answer: { kind: 'numeric' as const, value: answer, unit: '', tolerance: EXACT },
        options: [],
        misconceptionTraps: separatedTraps(answer, EXACT, [
          {
            misconception: 'graphs.tree-edge-count-off-by-one',
            value: n,
            tolerance: EXACT,
            feedback:
              `A tree on $n$ vertices has $n - 1$ edges. With $n$ it would contain a cycle and stop being a tree.`,
          },
          {
            misconception: 'trees.spanning-depends-on-graph-edges',
            value: n - 1 + extra,
            tolerance: EXACT,
            feedback:
              `That is the graph's own edge count. A spanning tree keeps every vertex but discards edges until no ` +
              `cycle is left, and the number it keeps depends only on $n$.`,
          },
        ]),
        explanation: {
          steps: [
            `A spanning tree touches all $${n}$ vertices and contains no cycle.`,
            `Any tree on $n$ vertices has exactly $n - 1$ edges, so the answer is $${answer}$ — independent of how many edges the graph started with.`,
          ],
          principle:
            'Every spanning tree of a connected n-vertex graph has n - 1 edges. The graph may have far more; the surplus is exactly what creates its cycles.',
          hints: ['How many edges does a tree on n vertices have?', 'Does the graph\'s own edge count enter into it?'],
        },
      };
    }

    // A fixed seven-node binary tree with drawn labels.
    const labels = resampleUntil(rng, (r) => {
      const pool = Array.from({ length: 9 }, (_, i) => i + 1);
      const out: number[] = [];
      for (let i = 0; i < 7; i += 1) out.push(...pool.splice(Math.floor(r() * pool.length), 1));
      return out;
    }, (l) => new Set(l).size === 7);
    const [root, l1, r1, l2, r2, l3, r3] = labels as [number, number, number, number, number, number, number];
    const preorder = [root, l1, l2, r2, r1, l3, r3];
    const inorder = [l2, l1, r2, root, l3, r1, r3];
    const postorder = [l2, r2, l1, l3, r3, r1, root];
    const which = pick(rng, ['preorder', 'inorder', 'postorder'] as const);
    const order = which === 'preorder' ? preorder : which === 'inorder' ? inorder : postorder;
    const k = intBetween(rng, 2, 6);
    const answer = order[k - 1]!;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [which === 'preorder' ? -0.3 : 0.4]),
      stem:
        `A binary tree has root $${root}$. Its left child is $${l1}$, whose children are $${l2}$ (left) and ` +
        `$${r2}$ (right). Its right child is $${r1}$, whose children are $${l3}$ (left) and $${r3}$ (right).\n\n` +
        `In **${which}** traversal, which node is visited ${k}th?`,
      answer: { kind: 'numeric' as const, value: answer, unit: '', tolerance: EXACT },
      options: [],
      misconceptionTraps: separatedTraps(answer, EXACT, [
        {
          misconception: 'trees.traversal-order-confused',
          value: which === 'preorder' ? inorder[k - 1]! : preorder[k - 1]!,
          tolerance: EXACT,
          feedback:
            `That is ${which === 'preorder' ? 'inorder' : 'preorder'}. The three differ only in **when the root is ` +
            `visited**: preorder before both subtrees, inorder between them, postorder after both.`,
        },
        {
          misconception: 'trees.traversal-read-as-level-order',
          value: labels[k - 1]!,
          tolerance: EXACT,
          feedback:
            `That is level order — the tree read row by row. None of the three named traversals visits nodes that way.`,
        },
      ]),
      explanation: {
        steps: [
          which === 'preorder'
            ? `Preorder visits the root, then the whole left subtree, then the whole right subtree.`
            : which === 'inorder'
              ? `Inorder visits the left subtree, then the root, then the right subtree.`
              : `Postorder visits the left subtree, then the right subtree, then the root.`,
          `That gives $${order.join(',\\ ')}$.`,
          `The ${k}th node is $${answer}$.`,
        ],
        principle:
          'The three traversals differ only in where the root falls relative to its subtrees, and each subtree is traversed the same way recursively.',
        hints: ['Where does the root go in this traversal?', 'Apply the same rule inside each subtree.'],
      },
    };
  },
};

/** The sections Rosen teaches that this graph had been missing. */
export const MATH2358_DISCRETE_GENERATORS: readonly Generator[] = [
  sequencesSummations,
  cardinalityOfSets,
  integerRepresentations,
  linearCongruences,
  graphRepresentation,
  shortestPath,
  treeTraversal,
];
