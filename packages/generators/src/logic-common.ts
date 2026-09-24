import { booleanToTex, booleanVariables, parseBoolean, truthTable } from '@et/answer-engine';
import { intBetween, pick, type Rng } from './rng.js';

/**
 * Shared machinery for the two courses that speak Boolean.
 *
 * MATH 2358 and EE 2320 ask the same mathematics in different notation, so the
 * generators differ in wording and variable names rather than in mechanism. The
 * helpers here are deliberately notation-agnostic: a generator picks the symbol
 * set its course uses and everything downstream — truth tables, minimal forms,
 * LaTeX — works the same way.
 *
 * Every answer is computed by evaluating the expression the stem renders, never
 * transcribed. That is what makes a truth-table key impossible to get wrong:
 * the key and the question come from the same parse of the same string.
 */

/** Propositional variables, as a discrete maths course writes them. */
export const PROP_VARS = ['p', 'q', 'r', 's'] as const;
/** Switching variables, as a digital logic course writes them. */
export const SWITCH_VARS = ['A', 'B', 'C', 'D'] as const;

/**
 * Evaluate an expression over the given variables, most significant first.
 *
 * Validates that the expression only reads variables it was given. Without this
 * a multi-letter name fails deep inside evaluation with "no value supplied for
 * C", which is a confusing way to be told that `Cin` was read as `C AND i AND
 * n` — juxtaposition is AND, so variables are single letters plus digits.
 * Display labels are free to be longer; they are passed separately.
 */
export function rowsOf(expression: string, variables: readonly string[]): boolean[] {
  const node = parseBoolean(expression);
  const used = booleanVariables(node);
  const stray = used.filter((name) => !variables.includes(name));
  if (stray.length > 0) {
    throw new Error(
      `expression "${expression}" reads ${stray.map((v) => `"${v}"`).join(', ')}, which ${stray.length === 1 ? 'is' : 'are'} not in [${variables.join(', ')}]. ` +
        'Adjacent letters are an implicit AND, so a name like "Cin" parses as three variables — use a single letter and pass a display label instead.',
    );
  }
  return truthTable(node, variables);
}

/** Render an expression as LaTeX through the same parser the grader uses. */
export const tex = (expression: string): string => booleanToTex(parseBoolean(expression));

/** A bit of the input vector for a given row, first variable most significant. */
export const bitAt = (row: number, col: number, width: number): number =>
  (row >> (width - 1 - col)) & 1;

/**
 * Render a truth table as a LaTeX array for a question stem.
 *
 * `output` may be shorter than the table when only some rows are shown, and a
 * `null` entry prints a blank cell — which is how a "complete the table"
 * question states which rows it is giving away.
 */
export function texTable(
  variables: readonly string[],
  output: readonly (boolean | null)[],
  outputLabel = 'F',
): string {
  const spec = `${'c'.repeat(variables.length)}|c`;
  const header = `${variables.join(' & ')} & ${outputLabel}`;
  const body = output
    .map((value, row) => {
      const inputs = variables.map((_, col) => bitAt(row, col, variables.length)).join(' & ');
      const cell = value === null ? '\\;' : value ? '1' : '0';
      return `${inputs} & ${cell}`;
    })
    .join(' \\\\ ');
  return `\\begin{array}{${spec}} ${header} \\\\ \\hline ${body} \\end{array}`;
}

/**
 * A product term over a chosen subset of the variables, each possibly negated.
 *
 * Built from an explicit mask rather than by rejection sampling so a generator
 * can guarantee the term's size, which is what lets it state a literal budget
 * it knows is achievable.
 */
export function productTerm(variables: readonly string[], include: readonly boolean[], negate: readonly boolean[]): string {
  const parts = variables
    .map((name, i) => (include[i] ? (negate[i] ? `${name}'` : name) : null))
    .filter((p): p is string => p !== null);
  return parts.length === 0 ? '1' : parts.join('*');
}

/** Sum of products from a list of minterm indices. */
export function sopFromMinterms(variables: readonly string[], minterms: readonly number[]): string {
  if (minterms.length === 0) return '0';
  if (minterms.length === 2 ** variables.length) return '1';
  return minterms
    .map((m) =>
      variables
        .map((name, col) => (bitAt(m, col, variables.length) === 1 ? name : `${name}'`))
        .join('*'),
    )
    .map((term) => `(${term})`)
    .join(' + ');
}

/** Minterm indices where the expression is true. */
export const mintermsOf = (expression: string, variables: readonly string[]): number[] =>
  rowsOf(expression, variables).flatMap((v, i) => (v ? [i] : []));

/**
 * Exhaustive minimisation by search over sum-of-products forms.
 *
 * Quine-McCluskey would be the textbook algorithm, and this is not it: for the
 * three and four variable problems these courses actually set, enumerating
 * candidate implicants and greedily covering is both simpler to verify and
 * exact enough to state a literal budget. The budget is the load-bearing
 * output — it is what stops a "simplify" item accepting its own question as an
 * answer — so it matters far more that this is *correct* than that it is fast.
 */
export function minimalSop(expression: string, variables: readonly string[]): { form: string; literals: number } {
  const n = variables.length;
  const target = rowsOf(expression, variables);
  const ones = target.flatMap((v, i) => (v ? [i] : []));

  if (ones.length === 0) return { form: '0', literals: 0 };
  if (ones.length === 2 ** n) return { form: '1', literals: 0 };

  // Every implicant is a cube: a fixed value for some variables, free for the
  // rest. Enumerating all 3^n cubes is tiny for n <= 4.
  interface Cube { mask: number; value: number; covers: number[]; literals: number }
  const cubes: Cube[] = [];

  for (let mask = 0; mask < 2 ** n; mask++) {
    for (let value = 0; value < 2 ** n; value++) {
      if ((value & ~mask) !== 0) continue; // fixed bits must live inside the mask
      const covers: number[] = [];
      for (let row = 0; row < 2 ** n; row++) {
        if ((row & mask) === value) covers.push(row);
      }
      // An implicant may only cover rows where the function is true.
      if (covers.every((row) => target[row])) {
        const literals = mask.toString(2).split('').filter((b) => b === '1').length;
        cubes.push({ mask, value, covers, literals });
      }
    }
  }

  // Greedy set cover weighted by literals per newly covered row. Exact cover is
  // NP-hard in general; at this size greedy lands on the textbook answer, and
  // the budget it yields is checked against the stated answer by `pack verify`.
  const uncovered = new Set(ones);
  const chosen: Cube[] = [];
  while (uncovered.size > 0) {
    let best: Cube | null = null;
    let bestScore = Infinity;
    for (const cube of cubes) {
      const gain = cube.covers.filter((row) => uncovered.has(row)).length;
      if (gain === 0) continue;
      const score = (cube.literals + 0.001) / gain;
      if (score < bestScore) { bestScore = score; best = cube; }
    }
    if (best === null) break;
    chosen.push(best);
    for (const row of best.covers) uncovered.delete(row);
  }

  const terms = chosen.map((cube) =>
    variables
      .map((name, col) => {
        const bit = 1 << (n - 1 - col);
        if ((cube.mask & bit) === 0) return null; // free variable
        return (cube.value & bit) === 0 ? `${name}'` : name;
      })
      .filter((p): p is string => p !== null)
      .join('*'),
  );

  return {
    form: terms.map((t) => (t.includes('*') ? `(${t})` : t)).join(' + '),
    literals: chosen.reduce((sum, cube) => sum + cube.literals, 0),
  };
}

/**
 * A random expression whose minimal form is genuinely smaller than its stated
 * form, so a "simplify" question has something to simplify.
 */
export function simplifiableExpression(
  rng: Rng,
  variables: readonly string[],
): { expression: string; minimal: string; literals: number } {
  const n = variables.length;
  for (let attempt = 0; attempt < 40; attempt++) {
    const count = intBetween(rng, 2, Math.min(5, 2 ** n - 1));
    const minterms = [...new Set(Array.from({ length: count }, () => intBetween(rng, 0, 2 ** n - 1)))];
    if (minterms.length < 2) continue;

    const expression = sopFromMinterms(variables, minterms);
    const { form, literals } = minimalSop(expression, variables);
    const stated = minterms.length * n;
    if (literals > 0 && literals < stated) return { expression, minimal: form, literals };
  }
  // Fall back to a pair that always reduces: AB + AB' = A.
  const [a, b] = [variables[0]!, variables[1]!];
  return { expression: `(${a}*${b}) + (${a}*${b}')`, minimal: a, literals: 1 };
}

/** A compound proposition of modest depth, for truth-table questions. */
export function randomCompound(rng: Rng, variables: readonly string[]): string {
  const lit = (name: string): string => (rng() < 0.35 ? `${name}'` : name);
  const binary = (): string => pick(rng, ['+', '*', '^', '->']);
  const [a, b, c] = variables;

  if (variables.length <= 2) {
    return `${lit(a!)} ${binary()} ${lit(b!)}`;
  }
  const shape = intBetween(rng, 0, 2);
  if (shape === 0) return `(${lit(a!)} ${binary()} ${lit(b!)}) ${binary()} ${lit(c!)}`;
  if (shape === 1) return `${lit(a!)} ${binary()} (${lit(b!)} ${binary()} ${lit(c!)})`;
  return `(${lit(a!)} ${binary()} ${lit(b!)})' ${binary()} ${lit(c!)}`;
}
