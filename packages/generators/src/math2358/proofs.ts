import type { Generator } from '../types.js';
import { adjustDifficulty, intBetween, pick, type Rng } from '../rng.js';

/**
 * Proof construction, which the bank could not ask for until the answer engine
 * grew the kinds to grade it.
 *
 * MATH 2358's weekly quizzes ask for an induction, an irrationality argument,
 * a conjecture formulated and then proved. What the bank had was eight
 * multiple-choice items asking which strategy "is the natural first choice" —
 * recognising a proof's shape rather than building one, and no amount of more
 * of them would have closed the gap.
 *
 * The three kinds here sit at different points on the same trade-off. A
 * skeleton grades the parts of a proof that have unambiguous answers and so
 * produces hard evidence, at the cost of scaffolding the exam does not give.
 * An ordering tests that the steps depend on each other in the right direction,
 * which is the thing a wrong proof usually gets wrong. A rubric asks for the
 * real task and accepts softer evidence in return, which is why those items
 * carry a reduced KC weight.
 */

interface Identity {
  /** The summand, as LaTeX. */
  readonly summand: string;
  /** The closed form in n, as LaTeX. */
  readonly closed: string;
  /** The summand at a given index, as an expression the sampler can evaluate. */
  readonly termAt: (v: string) => string;
  /** The closed form at a given argument, likewise. */
  readonly closedAt: (v: string) => string;
}

export const IDENTITIES: readonly Identity[] = [
  {
    summand: 'i',
    closed: '\\dfrac{n(n+1)}{2}',
    termAt: (v) => `(${v})`,
    closedAt: (v) => `(${v})*((${v})+1)/2`,
  },
  {
    summand: '2i-1',
    closed: 'n^{2}',
    termAt: (v) => `2*(${v})-1`,
    closedAt: (v) => `(${v})^2`,
  },
  {
    summand: 'i(i+1)',
    closed: '\\dfrac{n(n+1)(n+2)}{3}',
    termAt: (v) => `(${v})*((${v})+1)`,
    closedAt: (v) => `(${v})*((${v})+1)*((${v})+2)/3`,
  },
  {
    summand: 'i^{2}',
    closed: '\\dfrac{n(n+1)(2n+1)}{6}',
    termAt: (v) => `(${v})^2`,
    closedAt: (v) => `(${v})*((${v})+1)*(2*(${v})+1)/6`,
  },
  {
    summand: '2^{\\,i}',
    closed: '2^{\\,n+1} - 2',
    termAt: (v) => `2^(${v})`,
    closedAt: (v) => `2^((${v})+1) - 2`,
  },
];

/**
 * Numerically evaluate one of the short arithmetic expressions above.
 *
 * Used for the base case and for the first term. Substituting into the LaTeX
 * instead is what the first draft did, and it is wrong: replacing `i` with `1`
 * turns the summand `2i-1` into `21-1`.
 */
const evaluateAt = (expr: string): number =>
   
  Number(new Function(`return ${expr.replace(/\^/g, '**')};`)());

const closedValue = (identity: Identity, n: number): number => evaluateAt(identity.closedAt(String(n)));

/** An induction proof broken into the parts that have unambiguous answers. */
export const inductionSkeleton: Generator = {
  id: 'math2358.proof.induction-skeleton',
  title: 'Build an induction proof',
  kcRefs: [{ kc: 'math2358.mathematical-induction', weight: 1 }],
  difficultyB: 0.4,
  generate(rng: Rng) {
    const identity = pick(rng, IDENTITIES);
    const base = closedValue(identity, 1);

    return {
      type: 'proof-skeleton' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        identity.summand === 'i' ? -0.6 : identity.summand.includes('2^') ? 0.5 : 0.1,
      ]),
      stem:
        `You are proving by induction that for every positive integer $n$,\n\n` +
        `$\\displaystyle\\sum_{i=1}^{n} ${identity.summand} = ${identity.closed}$.\n\n` +
        `Build the proof one part at a time.`,
      answer: {
        kind: 'proof-skeleton' as const,
        steps: [
          {
            id: 'base',
            prompt: 'Base case: evaluate the right-hand side at $n = 1$.',
            expect: { kind: 'expression' as const, expression: String(base), variables: ['n'] },
          },
          {
            id: 'hypothesis',
            prompt: 'Inductive hypothesis: assume the identity holds at $n = k$. Write the value the sum to $k$ is assumed to take.',
            expect: { kind: 'expression' as const, expression: identity.closedAt('k'), variables: ['k'] },
          },
          {
            id: 'target',
            prompt: 'What must the inductive step establish?',
            expect: {
              kind: 'choice' as const,
              correctId: 'next',
              options: [
                { id: 'next', text: 'That the sum to $k+1$ equals the closed form evaluated at $k+1$' },
                {
                  id: 'restate',
                  text: 'That the sum to $k$ equals the closed form evaluated at $k$',
                  misconception: 'induction.hypothesis-restated-as-goal',
                },
                {
                  id: 'all',
                  text: 'That the identity holds for every $n$ at once',
                  misconception: 'induction.step-proves-the-whole-claim',
                },
              ],
            },
          },
          {
            id: 'bridge',
            prompt: 'Add the $(k+1)$-th term to the hypothesis. Write that sum, before simplifying.',
            expect: {
              kind: 'expression' as const,
              expression: `${identity.closedAt('k')} + ${identity.termAt('k+1')}`,
              variables: ['k'],
            },
          },
        ],
      },
      options: [],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `**Base case.** At $n = 1$ the sum is its single term, $${evaluateAt(identity.termAt('1'))}$, and the closed form gives $${base}$. They agree.`,
          `**Hypothesis.** Assume $\\displaystyle\\sum_{i=1}^{k} ${identity.summand} = ${identity.closed.replace(/n/g, 'k')}$.`,
          `**Step.** The sum to $k+1$ is the sum to $k$ plus the new term, so by the hypothesis it is $${identity.closedAt('k')} + ${identity.termAt('k+1')}$.`,
          `Simplifying that to the closed form evaluated at $k+1$ completes the step, and with the base case the identity holds for all $n \\geq 1$.`,
        ],
        principle:
          'Induction has exactly two obligations and they are independent: the claim is true somewhere, and its truth at k forces its truth at k+1. Neither alone proves anything.',
        hints: [
          'The base case is arithmetic, not algebra.',
          'The hypothesis is an assumption about k; the step is an obligation about k+1.',
        ],
      },
    };
  },
};

interface Claim {
  readonly statement: string;
  readonly strategy: string;
  readonly lines: readonly string[];
  readonly distractor: { readonly text: string; readonly misconception: string };
}

export const CLAIMS: readonly Claim[] = [
  {
    statement: 'If $n$ is an even integer, then $n^{2}$ is even.',
    strategy: 'direct proof',
    lines: [
      'Suppose $n$ is even, so $n = 2k$ for some integer $k$.',
      'Then $n^{2} = (2k)^{2} = 4k^{2}$.',
      'So $n^{2} = 2(2k^{2})$, and $2k^{2}$ is an integer.',
      'Therefore $n^{2}$ is even.',
    ],
    distractor: {
      text: 'Suppose $n^{2}$ is even, which is what we are trying to show.',
      misconception: 'proof.assumes-the-conclusion',
    },
  },
  {
    statement: 'If $3n + 2$ is odd, then $n$ is odd.',
    strategy: 'proof by contraposition',
    lines: [
      'We prove the contrapositive: if $n$ is even, then $3n + 2$ is even.',
      'Suppose $n$ is even, so $n = 2k$ for some integer $k$.',
      'Then $3n + 2 = 6k + 2 = 2(3k + 1)$.',
      'So $3n + 2$ is even, which proves the contrapositive.',
      'Therefore if $3n + 2$ is odd, $n$ is odd.',
    ],
    distractor: {
      text: 'We prove the converse: if $n$ is odd, then $3n + 2$ is odd.',
      misconception: 'logic.converse-confused',
    },
  },
  {
    statement: 'If $mn$ is even, then $m$ is even or $n$ is even.',
    strategy: 'proof by contraposition',
    lines: [
      'We prove the contrapositive: if $m$ and $n$ are both odd, then $mn$ is odd.',
      'Suppose $m = 2a + 1$ and $n = 2b + 1$ for integers $a$ and $b$.',
      'Then $mn = 4ab + 2a + 2b + 1 = 2(2ab + a + b) + 1$.',
      'So $mn$ is odd, which proves the contrapositive.',
      'Therefore if $mn$ is even, at least one of $m$ and $n$ is even.',
    ],
    distractor: {
      text: 'We prove the inverse: if $mn$ is odd, then $m$ is odd or $n$ is odd.',
      misconception: 'logic.inverse-confused',
    },
  },
  {
    statement: '$\\sqrt{2}$ is irrational.',
    strategy: 'proof by contradiction',
    lines: [
      'Suppose for contradiction that $\\sqrt{2} = p/q$ with $p$ and $q$ integers sharing no common factor.',
      'Then $2q^{2} = p^{2}$, so $p^{2}$ is even and therefore $p$ is even.',
      'Write $p = 2r$, so $2q^{2} = 4r^{2}$ and hence $q^{2} = 2r^{2}$.',
      'Then $q^{2}$ is even and therefore $q$ is even.',
      'But now $p$ and $q$ share the factor 2, contradicting the choice of $p/q$ in lowest terms.',
      'Therefore no such $p$ and $q$ exist, and $\\sqrt{2}$ is irrational.',
    ],
    distractor: {
      text: 'Since $\\sqrt{2} \\approx 1.41421356\\ldots$ never repeats, it is irrational.',
      misconception: 'proof.example-offered-as-proof',
    },
  },
];

/** Arrange the lines of a proof so each follows from the ones above it. */
export const proofOrdering: Generator = {
  id: 'math2358.proof.ordering',
  title: 'Arrange a proof',
  kcRefs: [{ kc: 'math2358.proof-methods', weight: 1 }],
  difficultyB: 0.2,
  generate(rng: Rng) {
    const claim = pick(rng, CLAIMS);
    return {
      type: 'derivation-order' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        claim.lines.length >= 6 ? 0.5 : claim.lines.length >= 5 ? 0.1 : -0.4,
      ]),
      stem:
        `Arrange these lines into a valid **${claim.strategy}** of the claim:\n\n` +
        `${claim.statement}\n\n` +
        `One line does not belong in any correct proof of it.`,
      answer: {
        kind: 'ordering' as const,
        lines: claim.lines.map((text, i) => ({ id: `l${i + 1}`, text })),
        distractors: [{ id: 'x', text: claim.distractor.text, misconception: claim.distractor.misconception }],
      },
      options: [],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `This is a ${claim.strategy}, so the first line has to set up what is being assumed.`,
          ...claim.lines.map((l, i) => `${i + 1}. ${l}`),
          `The discarded line — "${claim.distractor.text}" — cannot appear anywhere: it is not a step in this argument.`,
        ],
        principle:
          'A proof is an order, not a set. Every line must follow from what is above it, which is why a correct collection of lines in the wrong sequence proves nothing.',
        hints: [
          'What does this strategy assume, and what does it conclude?',
          'Find the line that is not a step in the argument at all.',
        ],
      },
    };
  },
};

interface RubricTask {
  readonly ask: string;
  readonly model: string;
  readonly criteria: readonly { readonly id: string; readonly text: string; readonly weight: number }[];
}

export const RUBRIC_TASKS: readonly RubricTask[] = [
  {
    ask: 'Prove that $\\sqrt{3}$ is irrational.',
    model:
      'Suppose $\\sqrt{3} = p/q$ with $\\gcd(p,q) = 1$. Then $3q^{2} = p^{2}$, so $3 \\mid p^{2}$, and since 3 is prime, $3 \\mid p$. ' +
      'Write $p = 3r$: then $3q^{2} = 9r^{2}$, so $q^{2} = 3r^{2}$ and by the same argument $3 \\mid q$. ' +
      'But then 3 divides both $p$ and $q$, contradicting $\\gcd(p,q) = 1$. Hence $\\sqrt{3}$ is irrational.',
    criteria: [
      { id: 'negate', text: 'Assumes the negation and puts the fraction in lowest terms', weight: 1 },
      { id: 'divides-p', text: 'Derives that 3 divides p, using that 3 is prime', weight: 2 },
      { id: 'divides-q', text: 'Repeats the argument to show 3 divides q', weight: 2 },
      { id: 'contradiction', text: 'States the contradiction with lowest terms explicitly', weight: 2 },
    ],
  },
  {
    ask: 'Prove that $2^{n} > n^{2}$ for every integer $n > 4$.',
    model:
      'Base case $n = 5$: $32 > 25$. Assume $2^{k} > k^{2}$ for some $k > 4$. Then $2^{k+1} = 2 \\cdot 2^{k} > 2k^{2}$. ' +
      'It suffices to show $2k^{2} \\geq (k+1)^{2}$, i.e. $k^{2} - 2k - 1 \\geq 0$, which holds for $k \\geq 3$ and so certainly for $k > 4$. ' +
      'Hence $2^{k+1} > (k+1)^{2}$, and by induction the claim holds for all $n > 4$.',
    criteria: [
      { id: 'base', text: 'Verifies the base case at n = 5, not at n = 1', weight: 2 },
      { id: 'hypothesis', text: 'States the inductive hypothesis for a specific k > 4', weight: 1 },
      { id: 'step', text: 'Derives 2^(k+1) > 2k^2 from the hypothesis', weight: 2 },
      { id: 'bridge', text: 'Shows 2k^2 >= (k+1)^2 for the k in range, closing the gap', weight: 2 },
    ],
  },
  {
    ask:
      'The harmonic mean of positive reals $x$ and $y$ is $\\dfrac{2xy}{x+y}$, and the geometric mean is $\\sqrt{xy}$. ' +
      'Form a conjecture about their relative sizes, and prove it.',
    model:
      'Conjecture: the harmonic mean is at most the geometric mean, with equality exactly when $x = y$. ' +
      'Since $(\\sqrt{x} - \\sqrt{y})^{2} \\geq 0$, we get $x + y \\geq 2\\sqrt{xy}$. ' +
      'Multiplying both sides by $\\sqrt{xy}/(x+y) > 0$ gives $\\sqrt{xy} \\geq 2xy/(x+y)$, which is the claim. ' +
      'Equality in the first inequality holds exactly when $\\sqrt{x} = \\sqrt{y}$, that is when $x = y$.',
    criteria: [
      { id: 'conjecture', text: 'States the conjecture in the right direction before proving it', weight: 2 },
      { id: 'equality', text: 'Identifies when equality holds', weight: 1 },
      { id: 'square', text: 'Starts from a square being non-negative', weight: 2 },
      { id: 'algebra', text: 'Manipulates the inequality without dividing by a possibly-negative quantity', weight: 2 },
    ],
  },
];

/**
 * Write the proof, then score it against the rubric.
 *
 * `evidenceWeight` is 0.35 rather than 1 on purpose: the replay scales both
 * the Elo step and the BKT blend by it, so a self-scored attempt moves the
 * model about a third as far as a graded one. That is the honest weight for
 * evidence a learner produced about their own work — enough to register, not
 * enough to certify mastery on its own.
 */
export const proofRubric: Generator = {
  id: 'math2358.proof.rubric',
  title: 'Write a proof and score it',
  kcRefs: [{ kc: 'math2358.proof-methods', weight: 1 }],
  difficultyB: 0.8,
  generate(rng: Rng) {
    const task = pick(rng, RUBRIC_TASKS);
    const pad = intBetween(rng, 0, 0); // keeps the rng advancing identically per seed
    void pad;

    return {
      type: 'proof-rubric' as const,
      kcRefs: this.kcRefs,
      // Self-scored, so it registers at about a third of a graded attempt.
      evidenceWeight: 0.35,
      difficultyB: adjustDifficulty(this.difficultyB, [task.criteria.length >= 4 ? 0.2 : -0.3]),
      stem:
        `${task.ask}\n\n` +
        `Write the proof out in full on paper. When you are done, mark which of the criteria your proof actually meets — ` +
        `the model proof appears once you submit.`,
      answer: {
        kind: 'proof-rubric' as const,
        model: task.model,
        criteria: task.criteria.map((c) => ({ ...c })),
        passingScore: 0.75,
      },
      options: [],
      misconceptionTraps: [],
      explanation: {
        steps: [
          'Compare your proof against the model line by line, and mark a criterion only if your own argument contains it.',
          task.model,
          'A criterion you nearly met is one you did not meet. The point of scoring it yourself is the comparison, not the score.',
        ],
        principle:
          'This is the only item kind here that asks for the real task, and the only one whose evidence is self-reported. It therefore counts for about a third of a graded attempt — enough to register, not enough to claim mastery on its own.',
        hints: [
          'Write the whole proof before looking at the criteria.',
          'Be strict with yourself: the exam will be.',
        ],
      },
    };
  },
};

export const MATH2358_PROOF_GENERATORS: readonly Generator[] = [
  inductionSkeleton,
  proofOrdering,
  proofRubric,
];
