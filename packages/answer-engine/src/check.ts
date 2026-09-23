import * as math from 'mathjs';
import type {
  Answer,
  BooleanAnswer,
  ComplexAnswer,
  Item,
  MisconceptionTrap,
  NumericAnswer,
  SymbolicAnswer,
  TruthTableAnswer,
} from '@et/content-schema';
import { comparePhasors, formatPhasor, matchPhasorTrap, parsePhasor } from './complex.js';
import { normalizeInput } from './normalize.js';
import {
  BooleanParseError, booleanEquivalent, literalCount, parseBoolean,
} from './boolean.js';

/**
 * Answer checking.
 *
 * Two jobs, same code path. At runtime it grades a learner's response. At
 * authoring time `pack verify` runs an item's *own stated answer* through it,
 * which is what makes LLM-authored content safe to accept: an item whose
 * answer key cannot be independently reproduced never enters the bank.
 */

export type CheckOutcome = 'correct' | 'incorrect' | 'unparseable' | 'wrong-dimension';

export interface CheckResult {
  correct: boolean;
  outcome: CheckOutcome;
  /** Misconception implicated by this specific wrong answer, if recognised. */
  misconception?: string;
  /** Learner-facing message: a parse complaint, or trap feedback. */
  feedback?: string;
  /** The parsed numeric value, for logging and analytics. */
  parsedValue?: number;
}

const ok = (): CheckResult => ({ correct: true, outcome: 'correct' });
const wrong = (extra: Partial<CheckResult> = {}): CheckResult => ({
  correct: false,
  outcome: 'incorrect',
  ...extra,
});

/** Absolute tolerance implied by a relative/absolute tolerance spec. */
export function toleranceFor(
  tolerance: { rel?: number | undefined; abs?: number | undefined },
  reference: number,
): number {
  return Math.max(tolerance.abs ?? 0, (tolerance.rel ?? 0) * Math.abs(reference));
}

const within = (
  actual: number,
  expected: number,
  tolerance: { rel?: number | undefined; abs?: number | undefined },
): boolean => Math.abs(actual - expected) <= toleranceFor(tolerance, expected);

/**
 * Parse a learner response into the answer's unit.
 *
 * Returns `wrong-dimension` rather than `unparseable` when the response is a
 * valid quantity in the wrong units — "you answered in volts, this asks for
 * ohms" is a real diagnosis, and collapsing it into a parse error throws it away.
 */
export function parseQuantity(
  raw: string,
  targetUnit: string,
): { value: number } | { error: 'unparseable' | 'wrong-dimension'; message: string } {
  const normalized = normalizeInput(raw);
  if (normalized === '') return { error: 'unparseable', message: 'No answer entered.' };

  let evaluated: unknown;
  try {
    evaluated = math.evaluate(normalized);
  } catch {
    return { error: 'unparseable', message: `Could not read "${raw}" as a quantity.` };
  }

  if (typeof evaluated === 'number') {
    if (!Number.isFinite(evaluated)) {
      return { error: 'unparseable', message: 'Answer is not a finite number.' };
    }
    // A bare number against a dimensioned target is treated as already being in
    // that unit: entering "10" for a question expecting volts means 10 V.
    return { value: evaluated };
  }

  if (evaluated !== null && typeof evaluated === 'object' && 'toNumber' in evaluated) {
    if (targetUnit === '') {
      return { error: 'wrong-dimension', message: 'This answer should be a plain number.' };
    }
    try {
      return { value: (evaluated as { toNumber(u: string): number }).toNumber(targetUnit) };
    } catch {
      return {
        error: 'wrong-dimension',
        message: `Units do not match: this answer should be in ${targetUnit}.`,
      };
    }
  }

  return { error: 'unparseable', message: `Could not read "${raw}" as a quantity.` };
}

/** Match a wrong numeric value against the item's known error traps. */
function matchTrap(value: number, traps: readonly MisconceptionTrap[]): MisconceptionTrap | undefined {
  return traps.find(
    (t) => t.value !== undefined && t.tolerance !== undefined && within(value, t.value, t.tolerance),
  );
}

export function checkNumeric(
  raw: string,
  answer: NumericAnswer,
  traps: readonly MisconceptionTrap[] = [],
): CheckResult {
  const parsed = parseQuantity(raw, answer.unit);
  if ('error' in parsed) {
    return { correct: false, outcome: parsed.error, feedback: parsed.message };
  }

  if (within(parsed.value, answer.value, answer.tolerance)) {
    return { ...ok(), parsedValue: parsed.value };
  }

  const trap = matchTrap(parsed.value, traps);
  return wrong({
    parsedValue: parsed.value,
    ...(trap ? { misconception: trap.misconception, feedback: trap.feedback } : {}),
  });
}

/**
 * Symbolic equivalence by random-point sampling.
 *
 * Deliberately not a CAS `simplify` comparison. Two correct forms of a divider
 * — `Vs*R2/(R1+R2)` and `Vs/(1+R1/R2)` — are algebraically identical but
 * simplify to different trees, so a structural comparison marks a correct
 * answer wrong. Evaluating both at many random points inside the valid domain
 * settles it: expressions that agree everywhere sampled are equivalent, and the
 * false-positive probability shrinks geometrically with the sample count.
 */
export function checkSymbolic(
  raw: string,
  answer: SymbolicAnswer,
  opts: { samples?: number; random?: () => number; traps?: readonly MisconceptionTrap[] } = {},
): CheckResult {
  const normalized = normalizeInput(raw);
  if (normalized === '') return { correct: false, outcome: 'unparseable', feedback: 'No answer entered.' };

  const samples = opts.samples ?? 24;
  const random = opts.random ?? Math.random;

  let learnerNode: math.MathNode;
  let learner: math.EvalFunction;
  let reference: math.EvalFunction;
  try {
    learnerNode = math.parse(normalized);
    learner = learnerNode.compile();
  } catch {
    return { correct: false, outcome: 'unparseable', feedback: `Could not read "${raw}" as an expression.` };
  }
  try {
    reference = math.parse(answer.expression).compile();
  } catch {
    return { correct: false, outcome: 'unparseable', feedback: 'The stored answer expression is invalid.' };
  }

  // An antiderivative is only determined up to a constant, so `x^2`, `x^2 + 5`
  // and `x^2 + C` are all correct answers to the same question. Comparing
  // values point by point would mark two of the three wrong. Because the item
  // declares that its answer *is* an antiderivative, the right criterion can be
  // derived from the item rather than guessed at: the learner's expression and
  // the key must differ by the same amount everywhere, not by nothing.
  const upToConstant = answer.residual?.kind === 'antiderivative-of';

  // Symbols the learner used that the item never mentioned - the `C` in
  // `x^2 + C`. Each is pinned to one arbitrary value for the whole comparison.
  // Holding it fixed is what makes the constant-difference test meaningful: a
  // genuine constant of integration shifts every sample equally, while a stray
  // variable that actually belongs in the expression does not.
  const extras = freeSymbols(learnerNode).filter((name) => !answer.variables.includes(name));
  const extraScope: Record<string, number> = {};
  for (const name of extras) extraScope[name] = 1 + random() * 4;

  let compared = 0;
  let offset: number | null = null;
  for (let i = 0; i < samples * 4 && compared < samples; i++) {
    const scope: Record<string, number> = { ...extraScope };
    for (const v of answer.variables) {
      const [lo, hi] = answer.domain?.[v] ?? [1, 10];
      scope[v] = lo + random() * (hi - lo);
    }

    let expected: unknown;
    try {
      expected = reference.evaluate(scope);
    } catch {
      continue; // reference undefined here; resample
    }
    if (typeof expected !== 'number' || !Number.isFinite(expected)) continue;

    let actual: unknown;
    try {
      actual = learner.evaluate(scope);
    } catch {
      return wrong({ feedback: 'Your expression could not be evaluated over the expected variables.' });
    }
    if (typeof actual !== 'number' || !Number.isFinite(actual)) return symbolicMiss(normalized, answer, opts);

    // Relative comparison, with an absolute floor so values near zero do not
    // demand impossible precision.
    const tolerance = Math.max(1e-6, 1e-6 * Math.abs(expected));
    if (upToConstant) {
      const difference = actual - expected;
      if (offset === null) {
        offset = difference;
      } else if (Math.abs(difference - offset) > Math.max(tolerance, 1e-6 * Math.abs(offset))) {
        return symbolicMiss(normalized, answer, opts, {
          feedback: 'That differs from the correct antiderivative by more than a constant.',
        });
      }
    } else if (Math.abs(actual - expected) > tolerance) {
      return symbolicMiss(normalized, answer, opts);
    }
    compared++;
  }

  if (compared === 0) {
    return { correct: false, outcome: 'unparseable', feedback: 'Could not evaluate the answer over its domain.' };
  }
  return ok();
}

/**
 * Attribute a wrong expression to a known error, when one explains it.
 *
 * Multiple choice gets this for free because the learner picks from a tagged
 * list. Free response would otherwise lose it, and free response is where the
 * better evidence is: nobody offered the learner `cos(3x)`, so writing it is a
 * specific statement about what they believe the chain rule does.
 *
 * Comparison runs through `checkSymbolic` itself rather than string matching,
 * so a learner who writes an algebraically different spelling of the same
 * mistake is still diagnosed. Recursion terminates because the trap expression
 * is graded against a trap-free answer.
 */
function symbolicMiss(
  normalized: string,
  answer: SymbolicAnswer,
  opts: { samples?: number; random?: () => number; traps?: readonly MisconceptionTrap[] },
  extra: { feedback?: string } = {},
): CheckResult {
  for (const trap of opts.traps ?? []) {
    if (trap.expression === undefined) continue;
    const asAnswer: SymbolicAnswer = { ...answer, expression: trap.expression, residual: undefined };
    if (checkSymbolic(normalized, asAnswer, { samples: opts.samples, random: opts.random }).correct) {
      return wrong({ misconception: trap.misconception, feedback: trap.feedback });
    }
  }
  return wrong(extra);
}

/**
 * Every symbol an expression reads, excluding the ones mathjs resolves itself.
 *
 * `pi` and `e` parse as symbol nodes but need no binding, and treating them as
 * unknown constants would let `e` absorb a real error in an antiderivative
 * check. Function names are excluded too: in `sin(x)` only `x` is a value.
 */
function freeSymbols(node: math.MathNode): string[] {
  const builtin = new Set(['pi', 'e', 'PI', 'E', 'i', 'Infinity', 'NaN', 'tau', 'phi']);
  const found = new Set<string>();
  node.traverse((child, _path, parent) => {
    if (child.type !== 'SymbolNode') return;
    const name = (child as math.SymbolNode).name;
    if (builtin.has(name)) return;
    // The callee of a function call is a SymbolNode too; it names an operation.
    if (parent?.type === 'FunctionNode' && (parent as math.FunctionNode).fn === child) return;
    found.add(name);
  });
  return [...found];
}

/**
 * Boolean expression grading: exact, not sampled.
 *
 * Every assignment over the stated variables is compared, so a pass is a proof
 * of equivalence rather than an inference from agreement at sampled points.
 * Any notation the parser accepts is accepted here — `AB' + CD`, `(p ∧ ¬q) ∨ r`
 * and `A and not B` are the same claim written by three different textbooks,
 * and marking one wrong would be grading notation instead of understanding.
 *
 * When the item sets a literal budget, equivalence alone is not enough. A
 * minimisation question whose grader only checks equivalence accepts the
 * question's own expression as its answer, which teaches nothing and measures
 * less.
 */
export function checkBoolean(
  raw: string,
  answer: BooleanAnswer,
  traps: readonly MisconceptionTrap[] = [],
): CheckResult {
  const text = raw.trim();
  if (text === '') return { correct: false, outcome: 'unparseable', feedback: 'No expression entered.' };

  let learner;
  try {
    learner = parseBoolean(text);
  } catch (error) {
    const detail = error instanceof BooleanParseError ? error.message : 'Could not read that expression.';
    return { correct: false, outcome: 'unparseable', feedback: detail };
  }

  let reference;
  try {
    reference = parseBoolean(answer.expression);
  } catch {
    return { correct: false, outcome: 'unparseable', feedback: 'The stored answer expression is invalid.' };
  }

  // A variable the item never mentions cannot be part of a correct answer, and
  // saying so names the problem better than a bare "incorrect".
  const declared = new Set(answer.variables);
  const stray = booleanVariablesOf(text).filter((name) => !declared.has(name));
  if (stray.length > 0) {
    return {
      correct: false,
      outcome: 'unparseable',
      feedback: `"${stray.join('", "')}" ${stray.length === 1 ? 'is not a variable' : 'are not variables'} in this problem. Use ${answer.variables.join(', ')}.`,
    };
  }

  if (!booleanEquivalent(learner, reference, answer.variables)) {
    return booleanMiss(text, answer, traps);
  }

  if (answer.maxLiterals !== undefined) {
    const used = literalCount(learner);
    if (used > answer.maxLiterals) {
      // Named rather than left as bare feedback: "stops simplifying too early"
      // is a habit worth tracking across both courses, and an unnamed wrong
      // answer tells the misconception feed nothing.
      return wrong({
        misconception: 'boolean.not-fully-simplified',
        feedback:
          `That is the right function, but not reduced: it uses ${used} literals and the minimal form uses ` +
          `${answer.maxLiterals}. Equivalence was never in question — the question is how far it simplifies.`,
      });
    }
  }

  return ok();
}

/** Variables read by an expression, without re-throwing on malformed input. */
function booleanVariablesOf(text: string): string[] {
  try {
    const node = parseBoolean(text);
    const seen: string[] = [];
    const walk = (n: ReturnType<typeof parseBoolean>): void => {
      if (n.kind === 'var') { if (!seen.includes(n.name)) seen.push(n.name); }
      else if (n.kind === 'not') walk(n.operand);
      else if (n.kind === 'binary') { walk(n.left); walk(n.right); }
    };
    walk(node);
    return seen;
  } catch {
    return [];
  }
}

/** Attribute a wrong Boolean expression to a tagged error, when one explains it. */
function booleanMiss(
  text: string,
  answer: BooleanAnswer,
  traps: readonly MisconceptionTrap[],
): CheckResult {
  for (const trap of traps) {
    if (trap.expression === undefined) continue;
    try {
      const wrongForm = parseBoolean(trap.expression);
      const learner = parseBoolean(text);
      if (booleanEquivalent(learner, wrongForm, answer.variables)) {
        return wrong({ misconception: trap.misconception, feedback: trap.feedback });
      }
    } catch {
      continue;
    }
  }
  return wrong();
}

export function checkTruthTable(rows: readonly boolean[], answer: TruthTableAnswer): CheckResult {
  if (rows.length !== answer.rows.length) {
    return { correct: false, outcome: 'unparseable', feedback: `Expected ${answer.rows.length} rows.` };
  }
  return rows.every((r, i) => r === answer.rows[i]) ? ok() : wrong();
}

export function checkChoice(optionId: string, item: Item): CheckResult {
  if (item.answer.kind !== 'choice') {
    return { correct: false, outcome: 'unparseable', feedback: 'Item is not multiple choice.' };
  }
  if (optionId === item.answer.correctId) return ok();

  const chosen = item.options.find((o) => o.id === optionId);
  if (!chosen) return { correct: false, outcome: 'unparseable', feedback: 'Unknown option.' };
  return wrong({
    ...(chosen.misconception ? { misconception: chosen.misconception } : {}),
    ...(chosen.rationale ? { feedback: chosen.rationale } : {}),
  });
}

/**
 * Grade a phasor.
 *
 * The feedback is the point. "Incorrect" is nearly useless on a complex answer
 * because there are two independent ways to be wrong and they mean different
 * things: a magnitude error is arithmetic, and a phase error is almost always a
 * sign convention — which reactance is negative, which way the current lags.
 * Saying which of the two went wrong costs one comparison and is most of the
 * diagnostic value the item has.
 */
export function checkComplex(
  raw: string,
  answer: ComplexAnswer,
  traps: readonly MisconceptionTrap[] = [],
): CheckResult {
  const parsed = parsePhasor(raw);
  if ('error' in parsed) {
    return { correct: false, outcome: 'unparseable', feedback: parsed.error };
  }

  const comparison = comparePhasors(parsed.phasor, answer);
  if (comparison.magnitudeOk && comparison.angleOk) return ok();

  const trap = matchPhasorTrap(parsed.phasor, answer, traps);
  if (trap) return wrong({ misconception: trap.misconception, feedback: trap.feedback });

  const both = !comparison.magnitudeOk && !comparison.angleOk;
  const feedback = both
    ? `Both parts are off: you wrote ${formatPhasor(parsed.phasor, answer.unit)}.`
    : comparison.magnitudeOk
      ? `The magnitude is right, so the arithmetic holds — the phase is off by ${comparison.angleError.toFixed(1)}°. Check which reactance you made negative.`
      : `The phase is right, so the sign conventions hold — the magnitude is off. You wrote ${formatPhasor(parsed.phasor, answer.unit)}.`;
  return wrong({ feedback });
}

export type Response =
  | { kind: 'text'; value: string }
  | { kind: 'choice'; optionId: string }
  | { kind: 'truth-table'; rows: boolean[] };

/** Grade a response against an item, dispatching on the item's answer kind. */
export function checkAnswer(response: Response, item: Item): CheckResult {
  const answer: Answer = item.answer;

  switch (answer.kind) {
    case 'numeric':
      if (response.kind !== 'text') return mismatch('a typed value');
      return checkNumeric(response.value, answer, item.misconceptionTraps);

    case 'symbolic':
      if (response.kind !== 'text') return mismatch('a typed expression');
      return checkSymbolic(response.value, answer, { traps: item.misconceptionTraps });

    case 'choice':
      if (response.kind !== 'choice') return mismatch('a selected option');
      return checkChoice(response.optionId, item);

    case 'boolean':
      if (response.kind !== 'text') return mismatch('a typed Boolean expression');
      return checkBoolean(response.value, answer, item.misconceptionTraps);

    case 'truth-table':
      if (response.kind !== 'truth-table') return mismatch('a completed truth table');
      return checkTruthTable(response.rows, answer);

    case 'complex':
      if (response.kind !== 'text') return mismatch('a typed phasor');
      return checkComplex(response.value, answer, item.misconceptionTraps);

    case 'circuit':
      // Graded by simulating the submitted netlist; see @et/circuits.
      return {
        correct: false,
        outcome: 'unparseable',
        feedback: 'Circuit items are graded by the simulator, not the answer engine.',
      };
  }
}

const mismatch = (expected: string): CheckResult => ({
  correct: false,
  outcome: 'unparseable',
  feedback: `This item expects ${expected}.`,
});
