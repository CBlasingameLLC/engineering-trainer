import type { Generator } from '../types.js';
import { adjustDifficulty, intBetween, pick, resampleUntil, type Rng } from '../rng.js';
import { separatedTraps } from '../traps.js';

/**
 * MATH 3376 — simultaneous linear systems, the machinery under nodal and mesh
 * analysis.
 *
 * The cross-course edge this serves is a specific and otherwise invisible
 * confusion. A student who writes correct node equations and then botches the
 * elimination reads as weak at `ee2300.nodal-analysis`, and every remediation
 * the app could offer on that basis would be about circuits — more KCL
 * practice, for someone whose KCL is fine. Asking for the same algebra with no
 * circuit attached is what separates the two, and it only works if the systems
 * are the size and shape that nodal analysis actually produces.
 */

/** Determinant of a 3x3 by cofactor expansion along the first row. */
const det3 = (m: readonly (readonly number[])[]): number =>
  m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) -
  m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) +
  m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);

/** Replace column `col` with `b`, for Cramer's rule. */
const withColumn = (m: readonly (readonly number[])[], col: number, b: readonly number[]): number[][] =>
  m.map((row, i) => row.map((value, j) => (j === col ? b[i]! : value)));

/** Render a signed coefficient the way it is written in an equation. */
const term = (coefficient: number, name: string, first: boolean): string => {
  if (coefficient === 0) return '';
  const sign = coefficient < 0 ? '-' : first ? '' : '+';
  const magnitude = Math.abs(coefficient);
  return ` ${sign} ${magnitude === 1 ? '' : magnitude}${name}`;
};

const equation = (row: readonly number[], names: readonly string[], rhs: number): string => {
  let out = '';
  let first = true;
  for (const [i, coefficient] of row.entries()) {
    const rendered = term(coefficient, names[i]!, first);
    if (rendered !== '') first = false;
    out += rendered;
  }
  return `${out} &= ${rhs}`;
};

export const solve2x2: Generator = {
  id: 'math3376.linear.solve-2x2',
  title: 'Solve a 2x2 linear system',
  kcRefs: [{ kc: 'math3376.linear-systems', weight: 1 }],
  difficultyB: -0.9,
  generate(rng: Rng) {
    // Built backwards from an integer solution so the answer is exact and the
    // arithmetic stays the kind a student does by hand.
    const x1 = intBetween(rng, -4, 6);
    const x2 = resampleUntil(rng, (r) => intBetween(r, -4, 6), (v) => v !== x1);

    const a = resampleUntil(
      rng,
      (r) => [intBetween(r, -4, 5), intBetween(r, -4, 5), intBetween(r, -4, 5), intBetween(r, -4, 5)] as const,
      ([p, q, r2, s]) => p * s - q * r2 !== 0 && p !== 0 && s !== 0,
    );
    const [p, q, r, s] = a;
    const b1 = p * x1 + q * x2;
    const b2 = r * x1 + s * x2;
    const determinant = p * s - q * r;

    const target = pick(rng, ['x', 'y'] as const);
    const value = target === 'x' ? x1 : x2;
    const other = target === 'x' ? x2 : x1;
    const cramerNumerator = target === 'x' ? det2(b1, q, b2, s) : det2(p, b1, r, b2);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        Math.abs(determinant) === 1 ? -1 : 0.5,
        [p, q, r, s].some((v) => v < 0) ? 0.5 : -0.5,
      ]),
      stem:
        `Solve for $${target}$:\n\n` +
        `$$\\begin{aligned}${equation([p, q], ['x', 'y'], b1)} \\\\ ${equation([r, s], ['x', 'y'], b2)}\\end{aligned}$$`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { abs: 0.02 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { abs: 0.02 }, [
        {
          misconception: 'linear-algebra.wrong-variable-reported',
          value: other,
          tolerance: { abs: 0.02 },
          feedback:
            `That is the other unknown. You solved the system correctly and then reported $${target === 'x' ? 'y' : 'x'}$ — ` +
            `worth noticing, because in nodal analysis this is how a correct solution becomes a wrong node voltage.`,
        },
        {
          misconception: 'linear-algebra.cramer-ratio-inverted',
          value: determinant / cramerNumerator,
          tolerance: { rel: 0.01 },
          feedback:
            `Your ratio is upside down. Cramer's rule is $${target} = \\frac{\\det A_{${target}}}{\\det A}$ — ` +
            `the determinant of the *modified* matrix goes on top.`,
        },
      ]),
      explanation: {
        steps: [
          `In matrix form $A\\mathbf{x} = \\mathbf{b}$ with $A = \\begin{bmatrix}${p} & ${q}\\\\ ${r} & ${s}\\end{bmatrix}$.`,
          `$\\det A = (${p})(${s}) - (${q})(${r}) = ${determinant}$, which is non-zero, so the solution is unique.`,
          `By Cramer's rule, $\\det A_{${target}} = ${cramerNumerator}$.`,
          `$${target} = \\frac{${cramerNumerator}}{${determinant}} = ${value}$.`,
        ],
        principle: 'A non-zero determinant guarantees exactly one solution; elimination and Cramer\'s rule are two routes to the same number.',
        hints: ['Eliminate one variable, or compute the determinants.', 'Check the determinant before solving.'],
      },
    };
  },
};

const det2 = (a: number, b: number, c: number, d: number): number => a * d - b * c;

export const solve3x3: Generator = {
  id: 'math3376.linear.solve-3x3',
  title: 'Solve a 3x3 linear system',
  kcRefs: [{ kc: 'math3376.linear-systems', weight: 1 }],
  difficultyB: 0.4,
  generate(rng: Rng) {
    const solution = resampleUntil(
      rng,
      (r) => [intBetween(r, -3, 5), intBetween(r, -3, 5), intBetween(r, -3, 5)],
      (v) => new Set(v).size === 3, // distinct, so the wrong-variable trap separates
    );

    const matrix = resampleUntil(
      rng,
      (r): number[][] => [
        [intBetween(r, 1, 4), intBetween(r, -3, 3), intBetween(r, -3, 3)],
        [intBetween(r, -3, 3), intBetween(r, 1, 4), intBetween(r, -3, 3)],
        [intBetween(r, -3, 3), intBetween(r, -3, 3), intBetween(r, 1, 4)],
      ],
      (m) => Math.abs(det3(m)) >= 2 && Math.abs(det3(m)) <= 60,
    );

    const b = matrix.map((row) => row.reduce((sum, value, j) => sum + value * solution[j]!, 0));
    const determinant = det3(matrix);

    const index = intBetween(rng, 0, 2);
    const names = ['x', 'y', 'z'] as const;
    const target = names[index]!;
    const value = solution[index]!;
    const numerator = det3(withColumn(matrix, index, b));

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        Math.abs(determinant) > 30 ? 1 : -0.4,
        matrix.flat().filter((v) => v < 0).length > 3 ? 0.6 : -0.4,
      ]),
      stem:
        `Solve for $${target}$:\n\n` +
        `$$\\begin{aligned}` +
        `${equation(matrix[0]!, names, b[0]!)} \\\\ ` +
        `${equation(matrix[1]!, names, b[1]!)} \\\\ ` +
        `${equation(matrix[2]!, names, b[2]!)}` +
        `\\end{aligned}$$`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { abs: 0.02 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { abs: 0.02 }, [
        {
          misconception: 'linear-algebra.wrong-variable-reported',
          value: solution[(index + 1) % 3]!,
          tolerance: { abs: 0.02 },
          feedback:
            `That is $${names[(index + 1) % 3]}$, not $${target}$. Back-substitution produces the unknowns in ` +
            `reverse order, which is exactly where they get swapped.`,
        },
        {
          misconception: 'linear-algebra.cramer-ratio-inverted',
          value: determinant / numerator,
          tolerance: { rel: 0.01 },
          feedback:
            `Inverted ratio. Cramer's rule divides the modified determinant **by** $\\det A$: ` +
            `$${target} = \\frac{\\det A_{${target}}}{\\det A}$.`,
        },
      ]),
      explanation: {
        steps: [
          `Write the coefficient matrix $A$ and compute $\\det A = ${determinant}$ — non-zero, so there is a unique solution.`,
          `Replace the $${target}$ column of $A$ with the right-hand side to form $A_{${target}}$.`,
          `$\\det A_{${target}} = ${numerator}$.`,
          `$${target} = \\frac{${numerator}}{${determinant}} = ${value}$.`,
        ],
        principle: 'A 3x3 system is the size nodal analysis produces, and it yields to elimination or determinants equally well.',
        hints: [
          'Eliminate one unknown from two equations to reduce it to a 2x2.',
          'Or compute two determinants and divide.',
        ],
      },
    };
  },
};

export const systemConsistency: Generator = {
  id: 'math3376.linear.consistency',
  title: 'Classify a linear system',
  kcRefs: [{ kc: 'math3376.linear-systems', weight: 1 }],
  difficultyB: 0.2,
  generate(rng: Rng) {
    const kind = pick(rng, ['unique', 'none', 'infinite'] as const);
    const p = intBetween(rng, 1, 4);
    const q = intBetween(rng, 1, 5);
    const multiplier = intBetween(rng, 2, 4);
    const b1 = intBetween(rng, 2, 12);

    // A dependent left-hand side is consistent or not purely by its right-hand
    // side, which is the distinction the item is built to test.
    const [r, s, b2] =
      kind === 'unique'
        ? [q, p + multiplier, intBetween(rng, 2, 14)]
        : kind === 'none'
          ? [p * multiplier, q * multiplier, b1 * multiplier + intBetween(rng, 1, 4)]
          : [p * multiplier, q * multiplier, b1 * multiplier];

    const correctId = kind === 'unique' ? 'a' : kind === 'none' ? 'b' : 'c';
    const determinant = p * s - q * r;

    return {
      type: 'multiple-choice' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [kind === 'unique' ? -0.8 : 0.6]),
      stem:
        `How many solutions does this system have?\n\n` +
        `$$\\begin{aligned}${equation([p, q], ['x', 'y'], b1)} \\\\ ${equation([r, s], ['x', 'y'], b2)}\\end{aligned}$$`,
      answer: { kind: 'choice' as const, correctId },
      options: [
        {
          id: 'a',
          text: 'Exactly one',
          ...(correctId === 'a' ? {} : { misconception: 'linear-algebra.singular-system-unnoticed' }),
          rationale:
            correctId === 'a'
              ? `$\\det A = ${determinant} \\neq 0$, so the two lines cross at one point.`
              : `The determinant is $0$ — the two equations describe parallel lines, so they cannot meet at a single point.`,
        },
        {
          id: 'b',
          text: 'None — the equations contradict each other',
          ...(correctId === 'b' ? {} : { misconception: 'linear-algebra.consistency-misjudged' }),
          rationale:
            correctId === 'b'
              ? `The left sides are proportional but the right sides are not, so the lines are parallel and distinct.`
              : kind === 'infinite'
                ? `The right-hand side scales by the same factor as the left, so the equations agree rather than contradict.`
                : `The determinant is non-zero, so the lines are not parallel and must intersect.`,
        },
        {
          id: 'c',
          text: 'Infinitely many — the equations describe the same line',
          ...(correctId === 'c' ? {} : { misconception: 'linear-algebra.consistency-misjudged' }),
          rationale:
            correctId === 'c'
              ? `The second equation is exactly ${multiplier} times the first, so it adds no information.`
              : kind === 'none'
                ? `The left sides are proportional but the right sides are not, so the equations conflict instead of coinciding.`
                : `Two independent equations in two unknowns pin down exactly one point.`,
        },
      ],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `Compare the two left-hand sides: $(${p}, ${q})$ and $(${r}, ${s})$.`,
          determinant !== 0
            ? `$\\det A = (${p})(${s}) - (${q})(${r}) = ${determinant} \\neq 0$, so the system is non-singular.`
            : `The second row is ${multiplier} times the first, so $\\det A = 0$ and the rows carry the same information.`,
          determinant !== 0
            ? `A non-singular 2x2 system has exactly one solution.`
            : kind === 'none'
              ? `But the right-hand side does not scale the same way: ${multiplier} times $${b1}$ is $${b1 * multiplier}$, not $${b2}$. The equations contradict, so there is no solution.`
              : `The right-hand side scales identically ($${multiplier} \\times ${b1} = ${b2}$), so the second equation is redundant and the solutions form a line.`,
        ],
        principle: 'A zero determinant means the equations are dependent; whether that gives no solutions or infinitely many is decided by the right-hand side.',
        hints: [
          'Is one equation a multiple of the other?',
          'If the left sides are proportional, check whether the right sides are too.',
        ],
      },
    };
  },
};

export const LINEAR_ALGEBRA_GENERATORS: readonly Generator[] = [solve2x2, solve3x3, systemConsistency];
