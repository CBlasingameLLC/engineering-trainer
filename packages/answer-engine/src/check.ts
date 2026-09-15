import * as math from 'mathjs';
import type {
  Answer,
  Item,
  MisconceptionTrap,
  NumericAnswer,
  SymbolicAnswer,
  TruthTableAnswer,
} from '@et/content-schema';
import { normalizeInput } from './normalize.js';

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
  return traps.find((t) => within(value, t.value, t.tolerance));
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
  opts: { samples?: number; random?: () => number } = {},
): CheckResult {
  const normalized = normalizeInput(raw);
  if (normalized === '') return { correct: false, outcome: 'unparseable', feedback: 'No answer entered.' };

  const samples = opts.samples ?? 24;
  const random = opts.random ?? Math.random;

  let learner: math.EvalFunction;
  let reference: math.EvalFunction;
  try {
    learner = math.parse(normalized).compile();
  } catch {
    return { correct: false, outcome: 'unparseable', feedback: `Could not read "${raw}" as an expression.` };
  }
  try {
    reference = math.parse(answer.expression).compile();
  } catch {
    return { correct: false, outcome: 'unparseable', feedback: 'The stored answer expression is invalid.' };
  }

  let compared = 0;
  for (let i = 0; i < samples * 4 && compared < samples; i++) {
    const scope: Record<string, number> = {};
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
    if (typeof actual !== 'number' || !Number.isFinite(actual)) return wrong();

    // Relative comparison, with an absolute floor so values near zero do not
    // demand impossible precision.
    if (Math.abs(actual - expected) > Math.max(1e-6, 1e-6 * Math.abs(expected))) return wrong();
    compared++;
  }

  if (compared === 0) {
    return { correct: false, outcome: 'unparseable', feedback: 'Could not evaluate the answer over its domain.' };
  }
  return ok();
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
      return checkSymbolic(response.value, answer);

    case 'choice':
      if (response.kind !== 'choice') return mismatch('a selected option');
      return checkChoice(response.optionId, item);

    case 'truth-table':
      if (response.kind !== 'truth-table') return mismatch('a completed truth table');
      return checkTruthTable(response.rows, answer);

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
