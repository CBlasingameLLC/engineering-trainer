import type { Generator } from '../types.js';
import { adjustDifficulty, intBetween, pick, resampleUntil, type Rng } from '../rng.js';
import { separatedTraps } from '../traps.js';

/**
 * MATH 2358, Unit 4 and 5 — induction, recursion, graphs and number theory.
 *
 * The recurrence generator is deliberately the same mathematics as
 * `math3323.second-order.characteristic-roots`: a linear homogeneous recurrence
 * is solved by characteristic root exactly as a second-order ODE is, over
 * integers instead of reals. A learner strong in one and weak in the other is
 * telling the model something useful, and the KC graph can only notice if both
 * are asked.
 */

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export const handshakeDegree: Generator = {
  id: 'math2358.graphs.handshake',
  title: 'Degree sum and edge count',
  kcRefs: [{ kc: 'math2358.graph-basics', weight: 1 }],
  difficultyB: -0.4,
  generate(rng: Rng) {
    const vertices = intBetween(rng, 5, 10);
    const degree = intBetween(rng, 2, Math.min(5, vertices - 1));
    // A k-regular graph on n vertices exists only when nk is even.
    const [n, k] = (vertices * degree) % 2 === 0 ? [vertices, degree] : [vertices + 1, degree];

    const edges = (n * k) / 2;
    const askEdges = rng() < 0.6;
    const value = askEdges ? edges : n * k;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [askEdges ? 1 : -1, k > 3 ? 1 : -1]),
      stem:
        `A simple graph has ${n} vertices, every one of degree ${k}.\\n\\n` +
        `How many ${askEdges ? 'edges' : 'does the sum of all degrees come to'}?`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { abs: 0.01 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { abs: 0.01 }, [
        {
          misconception: 'graphs.handshake-factor-two',
          value: askEdges ? n * k : edges,
          tolerance: { abs: 0.01 },
          feedback: askEdges
            ? `That is the **degree sum**, not the edge count. Each edge contributes to the degree of both its endpoints, so it is counted twice: $|E| = \\frac{1}{2}\\sum \\deg(v)$.`
            : `That is the edge count. The degree sum is twice as large, because every edge is counted at both ends.`,
        },
      ]),
      explanation: {
        steps: [
          `The handshake theorem: $\\sum_{v} \\deg(v) = 2|E|$.`,
          `Here the degree sum is $${n} \\times ${k} = ${n * k}$.`,
          askEdges ? `So $|E| = ${n * k}/2 = ${edges}$.` : `So the degree sum is ${n * k}.`,
        ],
        principle:
          'Every edge has two ends, so the degrees always sum to twice the edges — which is also why a graph cannot have an odd number of odd-degree vertices.',
        hints: ['How many endpoints does each edge contribute?', 'Sum the degrees first, then relate that to edges.'],
      },
    };
  },
};

export const eulerCircuit: Generator = {
  id: 'math2358.graphs.euler',
  title: 'Euler paths and circuits',
  kcRefs: [{ kc: 'math2358.graph-connectivity', weight: 1 }],
  difficultyB: 0.5,
  generate(rng: Rng) {
    const oddCount = pick(rng, [0, 2, 4] as const);
    const vertices = intBetween(rng, 5, 8);
    const degrees = Array.from({ length: vertices }, (_, i) =>
      i < oddCount ? intBetween(rng, 1, 2) * 2 - 1 : intBetween(rng, 1, 2) * 2,
    );

    const correctId = oddCount === 0 ? 'a' : oddCount === 2 ? 'b' : 'c';

    return {
      type: 'multiple-choice' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [oddCount === 4 ? 0.6 : -0.4]),
      stem:
        `A connected graph has vertex degrees ${degrees.join(', ')}.\\n\\n` +
        `What can be said about Euler paths and circuits?`,
      answer: { kind: 'choice' as const, correctId },
      options: [
        {
          id: 'a', text: 'It has an Euler circuit',
          ...(correctId === 'a' ? {} : { misconception: 'graphs.euler-parity-miscounted' }),
          rationale: 'An Euler circuit needs **every** vertex to have even degree.',
        },
        {
          id: 'b', text: 'It has an Euler path but no Euler circuit',
          ...(correctId === 'b' ? {} : { misconception: 'graphs.euler-parity-miscounted' }),
          rationale: 'An Euler path that is not a circuit needs exactly two odd-degree vertices — its two endpoints.',
        },
        {
          id: 'c', text: 'It has neither an Euler path nor an Euler circuit',
          ...(correctId === 'c' ? {} : { misconception: 'graphs.euler-parity-miscounted' }),
          rationale: 'With four or more odd-degree vertices neither exists.',
        },
        {
          id: 'd', text: 'It has a Hamiltonian circuit',
          misconception: 'graphs.euler-hamilton-confused',
          rationale:
            'Different question entirely. Euler is about using every **edge** once and has a degree criterion; Hamilton is about visiting every **vertex** once and has no simple test.',
        },
      ],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `Count the odd degrees: ${degrees.filter((d) => d % 2 === 1).join(', ') || 'none'} — that is ${oddCount}.`,
          `Zero odd vertices gives an Euler circuit; exactly two gives an Euler path between them; more than two gives neither.`,
          `With ${oddCount} odd vertices, ${oddCount === 0 ? 'an Euler circuit exists' : oddCount === 2 ? 'an Euler path exists but no circuit' : 'neither exists'}.`,
        ],
        principle:
          'Euler traversal is decided entirely by degree parity — and that clean criterion is exactly what Hamiltonian circuits lack.',
        hints: ['Count how many vertices have odd degree.', 'Every time a path passes through a vertex it uses two edges.'],
      },
    };
  },
};

export const treeProperties: Generator = {
  id: 'math2358.graphs.trees',
  title: 'Tree vertex and edge counts',
  kcRefs: [{ kc: 'math2358.trees', weight: 1 }],
  difficultyB: 0.2,
  generate(rng: Rng) {
    const vertices = intBetween(rng, 6, 20);
    const askEdges = rng() < 0.5;
    const value = askEdges ? vertices - 1 : vertices;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [askEdges ? -0.7 : 0.5]),
      stem: askEdges
        ? `A tree has ${vertices} vertices. How many edges does it have?`
        : `A tree has ${vertices - 1} edges. How many vertices does it have?`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { abs: 0.01 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { abs: 0.01 }, [
        {
          misconception: 'graphs.tree-edge-count-off-by-one',
          value: askEdges ? vertices : vertices - 1,
          tolerance: { abs: 0.01 },
          feedback:
            `A tree has exactly one fewer edge than vertices. An $n$-vertex graph with $n$ edges contains a cycle, ` +
            `so it is not a tree.`,
        },
        {
          misconception: 'graphs.tree-edges-doubled',
          value: askEdges ? 2 * (vertices - 1) : 2 * vertices,
          tolerance: { abs: 0.01 },
          feedback: `You may be thinking of the degree sum, which is $2|E|$. The question asks for the count itself.`,
        },
      ]),
      explanation: {
        steps: [
          `A tree is connected and acyclic, and any such graph on $n$ vertices has exactly $n - 1$ edges.`,
          `Building a tree one vertex at a time, each new vertex arrives on exactly one new edge.`,
          `So the answer is ${value}.`,
        ],
        principle:
          'Connected and acyclic forces |E| = |V| - 1; adding any further edge creates a cycle, and removing any disconnects it.',
        hints: ['Grow the tree one vertex at a time.', 'How many edges does each new vertex bring?'],
      },
    };
  },
};

export const inductionStep: Generator = {
  id: 'math2358.graphs.induction-step',
  title: 'The inductive step',
  kcRefs: [{ kc: 'math2358.mathematical-induction', weight: 1 }],
  difficultyB: 0.7,
  generate(rng: Rng) {
    const claims = [
      { claim: '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}', hypothesis: '\\sum_{i=1}^{k} i = \\frac{k(k+1)}{2}', goal: '\\sum_{i=1}^{k+1} i = \\frac{(k+1)(k+2)}{2}' },
      { claim: '\\sum_{i=1}^{n} (2i-1) = n^2', hypothesis: '\\sum_{i=1}^{k} (2i-1) = k^2', goal: '\\sum_{i=1}^{k+1} (2i-1) = (k+1)^2' },
      { claim: '\\sum_{i=0}^{n} 2^i = 2^{n+1} - 1', hypothesis: '\\sum_{i=0}^{k} 2^i = 2^{k+1} - 1', goal: '\\sum_{i=0}^{k+1} 2^i = 2^{k+2} - 1' },
    ] as const;
    const chosen = pick(rng, claims);

    return {
      type: 'multiple-choice' as const,
      kcRefs: this.kcRefs,
      // Keyed off which claim was drawn: a geometric sum needs the
      // hypothesis substituted into a doubling step, a triangular sum does not.
      difficultyB: adjustDifficulty(this.difficultyB, [chosen.claim.includes('2^i') ? 1 : -1]),
      stem:
        `Proving $${chosen.claim}$ by induction, you have assumed $${chosen.hypothesis}$.\\n\\n` +
        `What must the inductive step establish?`,
      answer: { kind: 'choice' as const, correctId: 'a' },
      options: [
        { id: 'a', text: `$${chosen.goal}$`, rationale: 'The same statement with $k$ replaced by $k+1$, derived using the hypothesis.' },
        {
          id: 'b', text: `$${chosen.claim}$ for all $n$ directly`,
          misconception: 'induction.step-proves-the-whole-claim',
          rationale: 'That is the conclusion of the whole proof, not the step. The step only moves from $k$ to $k+1$.',
        },
        {
          id: 'c', text: `$${chosen.hypothesis}$`,
          misconception: 'induction.hypothesis-restated-as-goal',
          rationale: 'That is the assumption itself. Proving what you already assumed establishes nothing.',
        },
        {
          id: 'd', text: 'The base case holds',
          misconception: 'induction.base-case-confused-with-step',
          rationale: 'The base case is a separate obligation, proved before the step and not by it.',
        },
      ],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `An induction has two obligations: a base case, and a step from $k$ to $k+1$.`,
          `Assuming $${chosen.hypothesis}$, the step must reach $${chosen.goal}$.`,
          `The work is to split off the $(k+1)$th term and substitute the hypothesis for the rest — if the hypothesis is never used, the step is not an induction.`,
        ],
        principle:
          'The step proves one implication, not the claim; and a step that never invokes the hypothesis has proved the wrong thing.',
        hints: ['Write the claim with k+1 substituted for n.', 'Where would the assumption get used?'],
      },
    };
  },
};

export const recurrenceEvaluation: Generator = {
  id: 'math2358.graphs.recurrence',
  title: 'Evaluate a recurrence',
  kcRefs: [{ kc: 'math2358.recurrence-relations', weight: 1 }],
  difficultyB: 0.8,
  generate(rng: Rng) {
    const a = intBetween(rng, 2, 4);
    const b = intBetween(rng, 1, 3);
    const a0 = intBetween(rng, 1, 4);
    const a1 = intBetween(rng, 1, 6);
    const n = intBetween(rng, 4, 6);

    // a_k = a*a_{k-1} + b*a_{k-2}
    const terms = [a0, a1];
    for (let k = 2; k <= n; k++) terms.push(a * terms[k - 1]! + b * terms[k - 2]!);
    const value = terms[n]!;

    // Forgetting the second term entirely is the standard slip.
    const geometricOnly = a0 * a ** n;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [n > 5 ? 0.6 : -0.4, b > 1 ? 0.4 : -0.4]),
      stem:
        `A sequence satisfies $a_k = ${a}a_{k-1} + ${b}a_{k-2}$ with $a_0 = ${a0}$ and $a_1 = ${a1}$.\\n\\n` +
        `Find $a_{${n}}$.`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { abs: 0.01 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { abs: 0.01 }, [
        {
          misconception: 'recurrence.second-term-dropped',
          value: geometricOnly,
          tolerance: { abs: 0.01 },
          feedback:
            `You treated it as the geometric recurrence $a_k = ${a}a_{k-1}$. The $${b}a_{k-2}$ term contributes at every ` +
            `step from $k = 2$ onward, and dropping it loses most of the growth.`,
        },
        {
          misconception: 'recurrence.index-off-by-one',
          value: terms[n - 1]!,
          tolerance: { abs: 0.01 },
          feedback: `That is $a_{${n - 1}}$. Count the iterations: starting from $a_0$ and $a_1$, reaching $a_{${n}}$ takes ${n - 1} steps.`,
        },
      ]),
      explanation: {
        steps: [
          `Iterate from the two given terms.`,
          terms.slice(2, n + 1)
            .map((t, i) => `$a_{${i + 2}} = ${a}(${terms[i + 1]}) + ${b}(${terms[i]}) = ${t}$`)
            .join('; '),
          `So $a_{${n}} = ${value}$.`,
        ],
        principle:
          'A linear homogeneous recurrence is the discrete twin of a constant-coefficient ODE — the same characteristic equation, over integers.',
        hints: ['Tabulate the terms in order; do not try to jump ahead.', 'Both previous terms feed every new one.'],
      },
    };
  },
};

export const gcdAndModular: Generator = {
  id: 'math2358.numbertheory.gcd-modular',
  title: 'GCD and modular arithmetic',
  kcRefs: [
    { kc: 'math2358.gcd-euclidean', weight: 0.5 },
    { kc: 'math2358.modular-arithmetic', weight: 0.5 },
  ],
  difficultyB: -0.1,
  generate(rng: Rng) {
    const mode = pick(rng, ['gcd', 'mod-power', 'mod-sum'] as const);

    if (mode === 'gcd') {
      const [x, y] = resampleUntil(
        rng,
        (r) => [intBetween(r, 24, 400), intBetween(r, 12, 300)] as [number, number],
        ([p, q]) => gcd(p, q) > 1 && p !== q,
      );
      const value = gcd(x, y);
      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [value > 6 ? -0.5 : 0.5]),
        stem: `Use the Euclidean algorithm to find $\\gcd(${x}, ${y})$.`,
        answer: { kind: 'numeric' as const, value, unit: '', tolerance: { abs: 0.01 } },
        options: [],
        misconceptionTraps: separatedTraps(value, { abs: 0.01 }, [
          {
            misconception: 'numbertheory.gcd-lcm-confused',
            value: (x * y) / value,
            tolerance: { abs: 0.01 },
            feedback: `That is the **least common multiple**. The two are related by $\\gcd \\times \\mathrm{lcm} = ${x} \\times ${y}$, but they are not the same number.`,
          },
        ]),
        explanation: {
          steps: [
            `Repeatedly replace the pair by (smaller, remainder).`,
            `$\\gcd(${x}, ${y}) = \\gcd(${y}, ${x % y})$, and so on until the remainder is zero.`,
            `The last non-zero remainder is $${value}$.`,
          ],
          principle: 'gcd(a, b) = gcd(b, a mod b) — the whole algorithm is that one identity applied until it terminates.',
          hints: ['Divide the larger by the smaller and keep the remainder.', 'Stop when the remainder hits zero.'],
        },
      };
    }

    const modulus = pick(rng, [5, 7, 9, 11, 13]);
    const base = intBetween(rng, 2, modulus - 1);

    if (mode === 'mod-power') {
      const modPow = (b: number, e: number) => {
        let acc = 1;
        for (let i = 0; i < e; i++) acc = (acc * b) % modulus;
        return acc;
      };
      // Whenever base^e and base*e happen to agree mod n the trap lands on the
      // answer — 6^6 = 0 and 6*6 = 0 (mod 9) is one of several — and the item
      // ships with nothing to diagnose. Resample instead.
      const exponent = resampleUntil(
        rng,
        (r) => intBetween(r, 3, 8),
        (e) => (base * e) % modulus !== modPow(base, e),
      );
      const value = modPow(base, exponent);
      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [exponent > 5 ? 0.7 : -0.3]),
        stem: `Compute $${base}^{${exponent}} \\bmod ${modulus}$.`,
        answer: { kind: 'numeric' as const, value, unit: '', tolerance: { abs: 0.01 } },
        options: [],
        misconceptionTraps: separatedTraps(value, { abs: 0.01 }, [
          {
            misconception: 'numbertheory.modulus-applied-to-exponent',
            value: (base * exponent) % modulus,
            tolerance: { abs: 0.01 },
            feedback: `You reduced the exponent against the modulus. Exponents do not reduce mod $n$ — reduce the *running product* instead, at every multiplication.`,
          },
        ]),
        explanation: {
          steps: [
            `Reduce after every multiplication so the numbers stay small.`,
            `$${base}^{${exponent}} \\bmod ${modulus}$: multiply by $${base}$ and take the remainder, ${exponent} times.`,
            `The result is $${value}$.`,
          ],
          principle: 'Modular reduction commutes with multiplication, which is why you never have to form the huge number.',
          hints: ['Reduce as you go, not at the end.', 'Look for a repeating cycle of powers.'],
        },
      };
    }

    const other = intBetween(rng, 10, 90);
    const value = (base * other) % modulus;
    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [-0.6]),
      stem: `Compute $(${base} \\times ${other}) \\bmod ${modulus}$.`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { abs: 0.01 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { abs: 0.01 }, [
        {
          misconception: 'numbertheory.remainder-sign-or-range',
          value: base * other,
          tolerance: { abs: 0.01 },
          feedback: `That is the product itself. A result mod ${modulus} always lies in $0 \\ldots ${modulus - 1}$.`,
        },
      ]),
      explanation: {
        steps: [
          `Reduce each factor first: $${other} \\equiv ${other % modulus} \\pmod{${modulus}}$.`,
          `$${base} \\times ${other % modulus} = ${base * (other % modulus)}$.`,
          `$${base * (other % modulus)} \\bmod ${modulus} = ${value}$.`,
        ],
        principle: 'Reducing factors before multiplying gives the same answer with far smaller numbers.',
        hints: ['Reduce each factor first.', 'The answer must be less than the modulus.'],
      },
    };
  },
};

export const MATH2358_GRAPH_GENERATORS: readonly Generator[] = [
  handshakeDegree,
  eulerCircuit,
  treeProperties,
  inductionStep,
  recurrenceEvaluation,
  gcdAndModular,
];
