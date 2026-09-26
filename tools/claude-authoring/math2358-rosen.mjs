// MATH 2358 Test 1 items — PERSONAL-ONLY.
//
// Derived from Rosen, Discrete Mathematics and its Applications, 8th ed.,
// sections 1.1-1.8, 5.1 and 2.1-2.5 — the scope of Test 1 on Tuesday 29
// September. That is why this pack is personal-only: it is gitignored,
// rejected from any redistributable pack by the schema, and bundled only
// under VITE_ET_INCLUDE_PERSONAL=1.
//
// The scenarios and wording are written independently. What is taken from the
// source is the *shape of the ask*, and here that is worth taking because Dr
// Yang's weekly quizzes have a very consistent one:
//
//   - a quantified statement over a stated domain, whose truth value must be
//     justified rather than asserted (quiz 2);
//   - "give an example of a function that is X but not Y" (quiz 5), which is
//     construction, not recall;
//   - compose two named functions in both orders (quiz 5), where the whole
//     content is that composition does not commute.
//
// The generators cover none of these shapes, because each one turns on a
// judgement the drawn-parameter machinery cannot make.
import { writeFileSync } from 'node:fs';

let n = 0;
const mc = (kc, difficultyB, stem, options, correctId, steps, principle, hints) => {
  n += 1;
  return {
    id: `math2358.rosen.${String(n).padStart(3, '0')}`,
    type: 'multiple-choice',
    kcRefs: [{ kc, weight: 1.0 }],
    difficultyB,
    stem,
    answer: { kind: 'choice', correctId },
    options,
    misconceptionTraps: [],
    explanation: { steps, principle, hints },
    provenance: { producer: 'hand', sourceRef: 'math2358-rosen-test1', licenseTier: 'personal-only' },
  };
};
const o = (id, text, misconception) => (misconception ? { id, text, misconception } : { id, text });

const items = [
  // ---- Quantified statements over a stated domain (quiz 2 shape) ------
  mc('math2358.predicate-logic', 0.1,
    'The domain is all **integers**. Is $\\exists x\\,(x^{2} - x - 12 = 0)$ true?',
    [
      o('a', 'True — the equation factors as $(x-4)(x+3)$, and both roots are integers'),
      o('b', 'True — every quadratic has a root', 'logic.existential-assumed-from-form'),
      o('c', 'False — a quadratic equation is not a proposition', 'logic.predicate-confused-with-proposition'),
      o('d', 'Cannot be determined without a specific $x$', 'strategy.quantifier-treated-as-free-variable'),
    ], 'a',
    [
      'An existential claim over a domain is settled by producing **one** witness in that domain.',
      '$x^{2} - x - 12 = (x-4)(x+3)$, so the roots are $x = 4$ and $x = -3$.',
      'Both are integers, so a witness exists and the statement is true.',
      'Note how little work this takes compared with the universal case: one example settles an existential, and no number of examples settles a universal.',
    ],
    'An existential statement needs one witness; a universal needs an argument. Which of the two you are facing decides the entire strategy before any algebra starts.',
    ['What would a single witness have to satisfy?', 'Try factoring.']),

  mc('math2358.predicate-logic', 0.4,
    'The domain is all **integers**. Is $\\forall x\\,(x^{2} \\geq x)$ true?',
    [
      o('a', 'True — for $x \\leq 0$ and for $x \\geq 1$ it holds, and there are no integers strictly between'),
      o('b', 'False — it fails at $x = \\tfrac12$', 'logic.domain-ignored'),
      o('c', 'False — it fails at $x = 0$', 'logic.boundary-case-misread'),
      o('d', 'True — squaring always makes a number larger', 'numeracy.squaring-assumed-increasing'),
    ], 'a',
    [
      'The inequality $x^{2} \\geq x$ rearranges to $x(x-1) \\geq 0$, which fails exactly on the open interval $(0, 1)$.',
      'That interval contains no integers: $0$ and $1$ are its endpoints and both satisfy the inequality with equality.',
      'So over the integers the statement is **true** — and over the reals the same statement is false.',
      'Option (b) names a real that is not in this domain, which is the trap: the domain is part of the statement, not context for it.',
    ],
    'The same quantified sentence changes truth value with its domain. Reading the domain first is not a formality — here it is the whole answer.',
    ['Where does x^2 >= x actually fail?', 'Does that region contain any integers?']),

  mc('math2358.predicate-logic', 0.6,
    'The domain is all **real numbers**. Is $\\forall x\\,\\exists y\\,(x = y^{2})$ true?',
    [
      o('a', 'False — no real $y$ satisfies it when $x$ is negative'),
      o('b', 'True — take $y = \\sqrt{x}$', 'logic.domain-restriction-ignored'),
      o('c', 'True — $y$ may be chosen after $x$, so there is always room', 'logic.quantifier-order-misapplied'),
      o('d', 'False — $y$ would have to be the same for every $x$', 'logic.quantifier-order-misapplied'),
    ], 'a',
    [
      'The order $\\forall x\\,\\exists y$ does allow $y$ to depend on $x$, so option (d) misreads it — that reading belongs to $\\exists y\\,\\forall x$.',
      'But dependence does not help here: for $x = -1$ there is no **real** $y$ with $y^{2} = -1$, because a real square is never negative.',
      'One counterexample defeats a universal, so the statement is false.',
      'Over the non-negative reals the same statement would be true, which is again the domain doing the work.',
    ],
    'Quantifier order decides what may depend on what; the domain decides whether that dependence can be satisfied. Both have to be checked, and they fail in different ways.',
    ['Can y depend on x here?', 'Try a negative x.']),

  mc('math2358.predicate-logic', 0.5,
    'The domain is all **real numbers**. Is $\\forall x\\,(x \\neq 0 \\rightarrow \\exists y\\,(xy = 1))$ true?',
    [
      o('a', 'True — for each non-zero $x$, take $y = 1/x$'),
      o('b', 'False — it fails at $x = 0$', 'logic.antecedent-ignored'),
      o('c', 'False — $y$ must work for all $x$ at once', 'logic.quantifier-order-misapplied'),
      o('d', 'True — but only for rational $x$', 'logic.domain-restriction-ignored'),
    ], 'a',
    [
      'The implication is vacuously true at $x = 0$: the antecedent $x \\neq 0$ is false there, so nothing is claimed.',
      'For every other real $x$, the witness $y = 1/x$ exists and is real.',
      'So the statement holds for every $x$ in the domain, and is true.',
      'Option (b) is the characteristic error — treating the one excluded case as a counterexample when the implication explicitly excludes it.',
    ],
    'An implication with a false antecedent is true, so the cases a conditional excludes can never be counterexamples to it.',
    ['What does the statement claim when x = 0?', 'Is 1/x real for every non-zero real x?']),

  // ---- Constructing examples (quiz 5 shape) ---------------------------
  mc('math2358.functions', 0.5,
    'Which function from $\\mathbb{R}$ to $\\mathbb{R}$ is **one-to-one but not onto**?',
    [
      o('a', '$f(x) = e^{x}$'),
      o('b', '$f(x) = x^{3}$', 'functions.surjective-misjudged'),
      o('c', '$f(x) = x^{2}$', 'functions.injective-misjudged'),
      o('d', '$f(x) = x^{3} - x$', 'functions.injective-misjudged'),
    ], 'a',
    [
      '$e^{x}$ is strictly increasing, so it is one-to-one.',
      'Its range is $(0, \\infty)$, which is a proper subset of $\\mathbb{R}$ — no $x$ gives $e^{x} = -1$ — so it is not onto.',
      '$x^{3}$ is both one-to-one and onto. $x^{2}$ is neither. $x^{3} - x$ is onto but not one-to-one, since $f(0) = f(1) = f(-1) = 0$.',
    ],
    'Injective and surjective are independent properties, and the codomain is part of the question: the same rule can be onto one codomain and not another.',
    ['Which of these never repeats a value?', 'Which values does it miss?']),

  mc('math2358.functions', 0.5,
    'Which function from $\\mathbb{R}$ to $\\mathbb{R}$ is **onto but not one-to-one**?',
    [
      o('a', '$f(x) = x^{3} - x$'),
      o('b', '$f(x) = e^{x}$', 'functions.surjective-misjudged'),
      o('c', '$f(x) = 2x + 1$', 'functions.injective-misjudged'),
      o('d', '$f(x) = |x|$', 'functions.surjective-misjudged'),
    ], 'a',
    [
      '$x^{3} - x$ is a cubic, so it takes every real value: it is onto.',
      'It is not one-to-one, because $f(0) = f(1) = f(-1) = 0$.',
      '$e^{x}$ misses every non-positive value; $2x+1$ is a bijection; $|x|$ misses every negative value.',
    ],
    'Any odd-degree polynomial is onto the reals by the intermediate value theorem; whether it is one-to-one is a separate question about its turning points.',
    ['Which of these takes every real value?', 'Which repeats a value somewhere?']),

  mc('math2358.functions', 0.4,
    'Let $f(x) = 3x - 4$ and $g(x) = 5x^{2} - 6x + 1$. What is $(f \\circ g)(x)$?',
    [
      o('a', '$15x^{2} - 18x - 1$'),
      o('b', '$45x^{2} - 126x + 89$', 'functions.composition-order-reversed'),
      o('c', '$15x^{2} - 18x + 3$', 'functions.composition-constant-mishandled'),
      o('d', '$15x^{3} - 38x^{2} + 27x - 4$', 'functions.composition-read-as-product'),
    ], 'a',
    [
      '$(f \\circ g)(x)$ means $f(g(x))$: the **inner** function is applied first.',
      '$f(g(x)) = 3(5x^{2} - 6x + 1) - 4 = 15x^{2} - 18x + 3 - 4$.',
      '$= 15x^{2} - 18x - 1$.',
      'Option (b) is $(g \\circ f)(x)$, which is a different function — composition does not commute, and that is the whole point of being asked for both.',
    ],
    'In f∘g the right-hand function goes first. The two orders are different functions, so the notation is carrying real information rather than a convention.',
    ['Which function is applied first?', 'Substitute the whole of g(x) wherever x appears in f.']),

  // ---- Sequences, summations and cardinality (2.4, 2.5) --------------
  mc('math2358.cardinality', 0.6,
    'Let $A$ be the set of positive integers and $B$ the set of **even** positive integers. Which is true?',
    [
      o('a', '$|A| = |B|$, because $n \\mapsto 2n$ is a bijection from $A$ to $B$'),
      o('b', '$|A| > |B|$, because $B$ is a proper subset of $A$', 'cardinality.proper-subset-assumed-smaller'),
      o('c', '$|A| > |B|$, because $A$ has twice as many elements', 'cardinality.proper-subset-assumed-smaller'),
      o('d', 'Neither is defined, since both sets are infinite', 'cardinality.infinite-assumed-incomparable'),
    ], 'a',
    [
      'Two sets have the same cardinality exactly when a bijection exists between them. Size is defined by pairing, not by containment.',
      'The map $n \\mapsto 2n$ sends $1,2,3,\\ldots$ to $2,4,6,\\ldots$, hitting every even positive integer exactly once.',
      'So $|A| = |B|$, even though $B$ omits infinitely many elements of $A$.',
      'This is the point where intuition from finite sets stops being a guide: for finite sets a proper subset really is smaller, and for infinite sets it need not be.',
    ],
    'Cardinality is defined by bijection. A proper subset of an infinite set can be the same size as the whole of it, and that is not a paradox — it is the definition working as stated.',
    ['What is the definition of two sets having the same size?', 'Can you pair them off without leftovers?']),

  mc('math2358.sequences-summations', 0.3,
    'How many terms are in the sum $\\displaystyle\\sum_{j=4}^{17} a_j$?',
    [
      o('a', '14'),
      o('b', '13', 'summation.term-count-off-by-one'),
      o('c', '17', 'summation.lower-limit-ignored'),
      o('d', '21', 'summation.limits-added'),
    ], 'a',
    [
      'The indices run $4, 5, \\ldots, 17$ inclusive at both ends.',
      'That is $17 - 4 + 1 = 14$ terms.',
      'The $+1$ is the whole difficulty: subtracting the limits counts the gaps between the terms, not the terms.',
    ],
    'An inclusive index range from a to b has b - a + 1 members. Almost every summation error in this course is this one.',
    ['Are both endpoints included?', 'Count a tiny case by hand, like j from 4 to 6.']),

  // ---- Proof strategy in the quiz's own shape (1.7, 1.8) -------------
  mc('math2358.proof-methods', 0.5,
    'You are asked to prove: *if $m$ and $n$ are integers and $mn$ is even, then $m$ is even or $n$ is even.* What should the first line be?',
    [
      o('a', 'Suppose $m$ and $n$ are both odd; we show $mn$ is odd.'),
      o('b', 'Suppose $mn$ is even; we show $m$ is even.', 'proof.disjunction-weakened-to-one-side'),
      o('c', 'Suppose $m$ is even or $n$ is even; we show $mn$ is even.', 'logic.converse-confused'),
      o('d', 'Suppose $mn$ is odd; we show $m$ and $n$ are odd.', 'logic.inverse-confused'),
    ], 'a',
    [
      'The conclusion is a disjunction, and disjunctions are awkward to prove directly — you would have to decide *which* disjunct holds.',
      'The contrapositive turns it into something concrete. Negating "$m$ even or $n$ even" gives "$m$ odd **and** $n$ odd", by De Morgan.',
      'Negating the hypothesis gives "$mn$ is odd". So the contrapositive is: if $m$ and $n$ are both odd, then $mn$ is odd — which is a one-line computation.',
      'Option (b) tries to prove a stronger claim than was asked, and it is false: $mn = 6$ with $m = 3$, $n = 2$ has $m$ odd.',
    ],
    'A disjunctive conclusion is the standard signal to take the contrapositive, because De Morgan turns the "or" into an "and" — and an "and" gives you two things to work with instead of a choice to make.',
    ['What does De Morgan do to the negated conclusion?', 'Which form gives you concrete assumptions?']),

  mc('math2358.proof-methods', 0.7,
    'A proof of "$\\sqrt{2}$ is irrational" begins: *Suppose $\\sqrt{2} = p/q$ where $p$ and $q$ are integers.* What is missing?',
    [
      o('a', 'That $p$ and $q$ have no common factor'),
      o('b', 'That $q \\neq 0$', 'proof.incidental-condition-mistaken-for-essential'),
      o('c', 'That $p$ and $q$ are positive', 'proof.incidental-condition-mistaken-for-essential'),
      o('d', 'Nothing — the proof can proceed as written', 'proof.contradiction-source-unidentified'),
    ], 'a',
    [
      'The contradiction this proof reaches is that $p$ and $q$ are **both even**.',
      'That is only a contradiction if they were assumed to share no common factor. Without the lowest-terms assumption, "both even" is merely a fact about one particular representation, and the argument proves nothing.',
      '$q \\neq 0$ is needed for the fraction to be defined, and positivity is harmless to assume, but neither is where the contradiction comes from.',
      'A proof by contradiction is only as good as the thing it contradicts, so that thing has to be stated up front.',
    ],
    'In a proof by contradiction, identify what will be contradicted before you start. An omitted assumption there does not weaken the proof — it removes the contradiction entirely.',
    ['What contradiction does this proof actually reach?', 'Which assumption makes that a contradiction?']),

  mc('math2358.mathematical-induction', 0.6,
    'Proving $2^{n} > n^{2}$ for all integers $n > 4$, what must the base case check?',
    [
      o('a', '$n = 5$: $32 > 25$'),
      o('b', '$n = 1$: $2 > 1$', 'induction.base-case-outside-claim'),
      o('c', '$n = 0$: $1 > 0$', 'induction.base-case-outside-claim'),
      o('d', '$n = 4$: $16 > 16$', 'induction.base-case-boundary-misread'),
    ], 'a',
    [
      'The claim is made for $n > 4$, so the smallest case it asserts is $n = 5$.',
      '$2^{5} = 32$ and $5^{2} = 25$, so the base case holds.',
      '$n = 4$ gives $16 > 16$, which is false — and this is exactly why the claim is stated for $n > 4$ rather than $n \\geq 1$.',
      'Checking $n = 1$ or $n = 0$ would verify cases the claim does not make, and would leave $n = 5$ unproved.',
    ],
    'The base case is the smallest case the claim actually asserts, not the smallest number that exists. Starting lower proves something else; starting higher leaves a hole.',
    ['What is the smallest n the claim covers?', 'What happens at n = 4?']),

  mc('math2358.logical-equivalence', 0.3,
    'Which is logically equivalent to $p \\leftrightarrow q$?',
    [
      o('a', '$(p \\wedge q) \\vee (\\neg p \\wedge \\neg q)$'),
      o('b', '$(p \\wedge q) \\vee (\\neg p \\vee \\neg q)$', 'boolean.demorgan-operator-kept'),
      o('c', '$(p \\rightarrow q) \\vee (q \\rightarrow p)$', 'logic.biconditional-as-disjunction'),
      o('d', '$\\neg p \\vee q$', 'logic.biconditional-as-implication'),
    ], 'a',
    [
      '$p \\leftrightarrow q$ is true exactly when $p$ and $q$ have the same truth value — both true, or both false.',
      'Those two cases are $(p \\wedge q)$ and $(\\neg p \\wedge \\neg q)$, and the biconditional is their disjunction.',
      'Option (c) is a tautology: at least one of the two implications always holds, whatever $p$ and $q$ are.',
      'Option (d) is $p \\rightarrow q$ alone, which is only half of it.',
    ],
    'A biconditional is an "agreement" connective. Writing it as the two agreeing cases is the construction that makes its truth table obvious.',
    ['When exactly is a biconditional true?', 'Build the truth table for option (c) and see what happens.']),

  mc('math2358.set-identities', 0.4,
    'For finite sets, $|A \\cup B| = |A| + |B| - |A \\cap B|$. Why is the last term subtracted?',
    [
      o('a', 'Elements in both sets are counted once by $|A|$ and again by $|B|$'),
      o('b', 'Because the union is always smaller than the sum', 'sets.identity-justified-by-outcome'),
      o('c', 'To exclude elements that are in neither set', 'sets.complement-of-wrong-set'),
      o('d', 'It is a convention with no deeper reason', 'strategy.rule-accepted-without-reason'),
    ], 'a',
    [
      'Adding $|A|$ and $|B|$ counts every element of the overlap twice, once in each term.',
      'Subtracting $|A \\cap B|$ removes exactly one of those two counts, leaving each element counted once.',
      'When $A$ and $B$ are disjoint the intersection is empty and the correction vanishes, which is the check that the formula is doing what it claims.',
    ],
    'Inclusion-exclusion is bookkeeping: add everything, then remove what you double-counted. Stated that way it generalises to three sets and beyond without memorisation.',
    ['How many times is an element of the overlap counted by |A| + |B|?', 'What should the formula give when the sets are disjoint?']),
];

const pack = {
  schemaVersion: '1.0.0',
  packId: 'math2358-rosen-v1',
  version: 1,
  course: 'MATH2358',
  title: 'Test 1 sections in the quiz shapes this course uses',
  provenance: {
    producer: 'hand',
    sourceRef: 'math2358-rosen-test1',
    licenseTier: 'personal-only',
    createdAt: '1970-01-01T00:00:00.000Z',
  },
  items,
};
writeFileSync('content/inbox/math2358-rosen-v1.json', `${JSON.stringify(pack, null, 2)}\n`);
console.log('wrote', items.length, 'personal-only items');
