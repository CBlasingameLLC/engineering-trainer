import { checkAnswer, toleranceFor, type Response } from '@et/answer-engine';
import { findMarkupProblems, type Item, type Pack } from '@et/content-schema';
import { generatorById, gradeFigure, makeRng } from '@et/generators';
import { gradeCircuit, nodesOf, parseNetlist } from '@et/circuits';

import { checkResidual } from './symbolic.js';

/**
 * The verification gate.
 *
 * This is what makes it safe to accept content from a language model, a
 * scheduled Claude Routine or a textbook transcription. Structural validation
 * proves an item is well-formed; verification tries to prove it is *right*, and
 * anything that fails is rejected rather than quietly entering the bank. An
 * item with a wrong answer key does more damage than a missing item: it teaches
 * the wrong thing and scores a correct learner as wrong, poisoning the mastery
 * estimate that everything else depends on.
 */

export type VerifySeverity = 'error' | 'warning';

export interface VerifyFinding {
  itemId: string;
  check: string;
  severity: VerifySeverity;
  message: string;
}

export interface VerifyReport {
  packId: string;
  itemsChecked: number;
  findings: VerifyFinding[];
  /** Items that passed every error-level check. */
  passed: number;
  ok: boolean;
}

const error = (itemId: string, check: string, message: string): VerifyFinding => ({
  itemId, check, severity: 'error', message,
});
const warn = (itemId: string, check: string, message: string): VerifyFinding => ({
  itemId, check, severity: 'warning', message,
});

/**
 * Check 1 — self-consistency.
 *
 * Feed the item's own stated answer back through the real grading path. A
 * numeric answer that will not grade itself correct is unusable: the learner
 * could not have got it right either.
 */
function checkSelfConsistency(item: Item): VerifyFinding[] {
  const response: Response | null =
    item.answer.kind === 'choice'
      ? { kind: 'choice', optionId: item.answer.correctId }
      : item.answer.kind === 'truth-table'
        ? { kind: 'truth-table', rows: [...item.answer.rows] }
        : item.answer.kind === 'numeric'
          ? { kind: 'text', value: String(item.answer.value) }
          : item.answer.kind === 'symbolic' || item.answer.kind === 'boolean'
            ? { kind: 'text', value: item.answer.expression }
            : null;

  if (!response) return []; // circuit items are graded by the simulator

  const result = checkAnswer(response, item);
  return result.correct
    ? []
    : [error(item.id, 'self-consistency', `item rejects its own stated answer (${result.outcome}): ${result.feedback ?? ''}`)];
}

/**
 * Check 2 — the worked solution agrees with the answer key.
 *
 * The characteristic failure of generated content is a solution that reasons
 * correctly to one number while the answer field holds another. Nothing
 * structural catches it, and a learner following the explanation would conclude
 * the app is broken. Requiring the final step to contain the answer catches it
 * cheaply.
 */
function checkExplanationAgreement(item: Item): VerifyFinding[] {
  if (item.answer.kind !== 'numeric') return [];

  const finalSteps = item.explanation.steps.slice(-2).join(' ');
  const numbers = extractNumbers(finalSteps);
  if (numbers.length === 0) {
    return [warn(item.id, 'explanation-agreement', 'closing steps of the worked solution contain no numeric result')];
  }

  const target = Math.abs(item.answer.value);
  const tolerance = Math.max(toleranceFor(item.answer.tolerance, item.answer.value), target * 0.02, 1e-12);
  const agrees = numbers.some((n) => Math.abs(Math.abs(n) - target) <= tolerance);

  return agrees
    ? []
    : [error(
        item.id,
        'explanation-agreement',
        `worked solution ends on ${numbers.slice(-3).join(', ')} but the answer key says ${item.answer.value}`,
      )];
}

/**
 * Unit symbols an SI prefix may attach to.
 *
 * The prefix is only folded when what follows it is one of these *and* the
 * group then closes, because a leading prefix letter is not evidence of a
 * prefix: `mol`, `m/s` and `kg` all begin with one and none of them is scaled.
 * Reading them as prefixed divides a molar quantity by a thousand and
 * multiplies a mass by a thousand, which is a worked solution disagreeing with
 * its own correct answer key — the exact failure this check exists to report.
 *
 * Longest first, so `VAR` is not read as `VA`, `Hz` not as `H`, `Wb` not as `W`.
 */
const PREFIXABLE_UNITS = String.raw`\\Omega|VAR|rad/s|Hz|VA|Wb|eV|dB|Pa|[VAFHsJWNmT]`;

/**
 * Pull numeric literals out of rendered text, folding SI prefixes so an answer
 * written as "4.7 kohm" compares against a stored value of 4700.
 */
function extractNumbers(text: string): number[] {
  const prefixes: Record<string, number> = {
    G: 1e9, M: 1e6, k: 1e3, m: 1e-3, n: 1e-9, p: 1e-12, '\\mu': 1e-6, u: 1e-6,
  };
  const out: number[] = [];
  // Both macros, because the prefix carries the magnitude: reading `20\,\mathrm{ms}`
  // as a bare 20 makes a correct worked solution disagree with a correct answer
  // key by a factor of a thousand. Tying this to one typesetting macro is what
  // made a `\text` -> `\mathrm` change look like 40 wrong answers.
  const pattern = new RegExp(
    // `(?<!\^)` keeps a unit's own exponent out of the list: `\mathrm{m^2}`
    // would otherwise contribute a bare 2, and a spurious number can only ever
    // make this check pass when it should have failed.
    String.raw`(?<!\^)(-?\d+(?:\.\d+)?)(?:\s*\\,)?(?:\\(?:text|mathrm)\{(\\mu\s?|[GMkmnpu])(?:${PREFIXABLE_UNITS})\})?`,
    'g',
  );
  for (const match of text.matchAll(pattern)) {
    const value = Number(match[1]);
    if (!Number.isFinite(value)) continue;
    const prefix = match[2]?.trim();
    out.push(prefix ? value * (prefixes[prefix] ?? 1) : value);
  }
  return out;
}

/** Exposed so the prefix rule can be pinned by test rather than by inspection. */
export const readNumbers = (text: string): number[] => extractNumbers(text);

/**
 * Check 3 — regenerate from seed.
 *
 * The strongest check available, and it applies to every generator-produced
 * item: re-run the generator at the stored seed and require the result to match
 * byte for byte. This catches a stored pack drifting out of sync with the
 * generator that produced it, which would otherwise surface as a learner seeing
 * a stale question with a newly-wrong answer.
 */
function checkRegeneration(item: Item): VerifyFinding[] {
  if (item.provenance.producer !== 'generator') return [];
  if (item.seed === undefined) {
    return [error(item.id, 'regeneration', 'generator-produced item has no seed and cannot be reproduced')];
  }

  const generator = generatorById(item.provenance.sourceRef);
  if (!generator) {
    return [warn(item.id, 'regeneration', `generator "${item.provenance.sourceRef}" is not registered; cannot reproduce`)];
  }

  const regenerated = generator.generate(makeRng(item.seed), item.seed);
  if (regenerated.stem !== item.stem) {
    return [error(item.id, 'regeneration', 'regenerating from the stored seed produced a different question')];
  }
  if (JSON.stringify(regenerated.answer) !== JSON.stringify(item.answer)) {
    return [error(item.id, 'regeneration', 'regenerating from the stored seed produced a different answer')];
  }
  return [];
}

/**
 * Check 4 — a design task is actually satisfiable.
 *
 * A circuit-build item states a specification rather than an answer, so there
 * is nothing to compare against. What can be checked is whether the spec can be
 * met at all: every such item carries a reference deck, and that deck is graded
 * against the item's own measurements using the same solver that will grade the
 * learner. An unsatisfiable design task is the exact equivalent of a wrong
 * answer key — the learner cannot win, and would reasonably conclude the app is
 * broken rather than that they are.
 */
function checkCircuitReference(item: Item): VerifyFinding[] {
  if (item.answer.kind !== 'circuit') return [];
  const answer = item.answer;

  const parsed = parseNetlist(answer.reference);
  if (parsed.errors.length > 0) {
    return [error(item.id, 'circuit-reference', `reference deck does not parse: ${parsed.errors.join('; ')}`)];
  }

  // Nodes the learner is told to expose must exist in the reference, or the
  // wording and the grading disagree about what the circuit is called.
  const present = new Set(nodesOf(parsed.netlist));
  const missing = answer.requiredNodes.filter((n) => !present.has(n));
  if (missing.length > 0) {
    return [error(item.id, 'circuit-reference', `reference deck is missing required node(s): ${missing.join(', ')}`)];
  }

  const result = gradeCircuit(parsed.netlist, answer.measurements);
  if (result.error) {
    return [error(item.id, 'circuit-reference', `reference deck could not be simulated: ${result.error}`)];
  }
  if (!result.correct) {
    const failed = result.results
      .filter((r) => !r.within)
      .map((r) => `${r.probe} expected ${r.expected} got ${r.actual ?? 'nothing'}${r.message ? ` (${r.message})` : ''}`);
    return [error(item.id, 'circuit-reference', `the item's own reference design fails its specification: ${failed.join('; ')}`)];
  }
  return [];
}

/**
 * Check 5 — a symbolic answer satisfies the relationship it declares.
 *
 * This is the only independent evidence a symbolic item gets. Self-consistency
 * grades the stored expression against itself and always passes; explanation
 * agreement reads numeric keys only. Without this check a symbolic bank enters
 * the repository verified in name alone.
 *
 * A symbolic answer with no declared residual is a gap in that evidence rather
 * than a defect, so it warns instead of failing — but under `--strict` it
 * blocks, which is what the shared bank is built with.
 */
function checkSymbolicResidual(item: Item): VerifyFinding[] {
  if (item.answer.kind !== 'symbolic') return [];

  if (!item.answer.residual) {
    return [warn(
      item.id,
      'symbolic-residual',
      'symbolic answer declares no residual, so nothing independently re-derives it',
    )];
  }

  const outcome = checkResidual(item.answer);
  return outcome.ok
    ? []
    : [error(item.id, 'symbolic-residual', outcome.detail ?? 'the answer fails its declared relationship')];
}

/** Check 6 — misconception coverage. Untagged wrong options teach nothing. */
function checkMisconceptionCoverage(item: Item): VerifyFinding[] {
  if (item.type === 'multiple-choice' && item.answer.kind === 'choice') {
    const { correctId } = item.answer;
    const wrong = item.options.filter((o) => o.id !== correctId);
    const untagged = wrong.filter((o) => !o.misconception);
    if (untagged.length === wrong.length && wrong.length > 0) {
      return [warn(item.id, 'misconception-coverage', 'no distractor is tagged with a misconception')];
    }
  }
  if (item.type === 'circuit-build') return []; // graded by simulation; traps do not apply
  if (item.type === 'numeric' && item.misconceptionTraps.length === 0) {
    return [warn(item.id, 'misconception-coverage', 'numeric item defines no misconception traps')];
  }
  // A phasor has two independent ways to be wrong, and the interesting ones are
  // wrong *forms* of the right number: the angle in radians, the conjugate, the
  // reciprocal of the impedance. An item that names none of them can say only
  // that the learner missed.
  if (item.answer.kind === 'complex' && !item.misconceptionTraps.some((t) => t.complex !== undefined)) {
    return [warn(item.id, 'misconception-coverage', 'phasor item defines no complex traps')];
  }
  // Symbolic items diagnose through expression traps. Without them a wrong
  // answer records only that the learner missed, and the misconception feed
  // never learns that a whole course's worth of errors were chain-rule errors.
  // A Boolean item with a literal budget already has a diagnostic path: the
  // grader names `boolean.not-fully-simplified` when the answer is equivalent
  // but unreduced, which is the error such an item exists to catch. Demanding
  // an equivalence trap on top would be asking for one that cannot exist —
  // the unsimplified form is equivalent by construction, so any such trap is
  // dropped by `separatedBooleanTraps` as indistinguishable from the answer.
  const hasBudget = item.answer.kind === 'boolean' && item.answer.maxLiterals !== undefined;
  if (
    (item.type === 'symbolic' || item.type === 'boolean') &&
    !hasBudget &&
    !item.misconceptionTraps.some((t) => t.expression !== undefined)
  ) {
    return [warn(item.id, 'misconception-coverage', `${item.type} item defines no expression traps`)];
  }
  return [];
}

/**
 * Check 8 — every maths macro is inside a `$...$` span.
 *
 * The renderer typesets delimited spans and passes everything else through as
 * text, so `12\\,\\text{V}` written into prose reaches the learner as those
 * literal characters. Nothing else here can see it: the answer verifies, the
 * explanation agrees, the generator regenerates, and the item is still
 * unreadable. It is an error rather than a warning because an item nobody can
 * read is not a degraded item, it is a broken one.
 */
function checkMarkup(item: Item): VerifyFinding[] {
  const fields: [string, string | undefined][] = [
    ['stem', item.stem],
    ['explanation.principle', item.explanation?.principle],
    ...(item.explanation?.steps ?? []).map((s, i): [string, string] => [`explanation.steps[${i}]`, s]),
    ...item.options.map((o, i): [string, string] => [`options[${i}].text`, o.text]),
    ...item.misconceptionTraps.map((t, i): [string, string] => [`misconceptionTraps[${i}].feedback`, t.feedback]),
  ];

  return fields.flatMap(([where, text]) =>
    text === undefined
      ? []
      : findMarkupProblems(text).map((problem) =>
          error(
            item.id,
            'latex-delimiters',
            problem.reason === 'unbalanced-delimiter'
              ? `${where} has an unclosed $ delimiter: "${problem.excerpt}"`
              : `${where} contains maths outside $...$, which renders literally: "${problem.excerpt}"`,
          ),
        ),
  );
}

/**
 * Check 9 — the drawing is the circuit the question is about.
 *
 * A figure is built from the same parameters as the answer, so its *values*
 * agree by construction. Its geometry does not: a generator can wire a figure
 * into a different circuit entirely and every other check still passes, because
 * the answer key is right and the picture still looks like a circuit. The
 * learner is the one who finds out, by reading a diagram that contradicts the
 * question and having no way to know which to believe.
 *
 * So the drawing is turned back into a netlist and solved. A figure that
 * declares nothing still has to build cleanly — an unconnected terminal in a
 * diagram is a drawing that says the circuit is open when it is not.
 */
function checkFigure(item: Item): VerifyFinding[] {
  if (!item.figure) return [];

  const result = gradeFigure(item.figure);
  if (result.error) {
    return [error(item.id, 'figure-agreement', `the figure is not a well-formed circuit: ${result.error}`)];
  }
  if (result.correct) return [];

  const failed = result.results
    .filter((r) => !r.within)
    .map((r) => `${r.probe} expected ${r.expected} but the drawing gives ${r.actual ?? 'nothing'}`);
  return [error(item.id, 'figure-agreement', `simulating the figure disagrees with the item: ${failed.join('; ')}`)];
}

/** Check 10 — KC references resolve against the loaded curriculum. */
function checkKcReferences(item: Item, knownKcs: ReadonlySet<string>): VerifyFinding[] {
  if (knownKcs.size === 0) return []; // no curriculum supplied
  return item.kcRefs
    .filter((ref) => !knownKcs.has(ref.kc))
    .map((ref) => error(item.id, 'kc-reference', `references unknown knowledge component "${ref.kc}"`));
}

export interface VerifyOptions {
  /** KC ids from the loaded curriculum; empty skips reference checking. */
  knownKcs?: ReadonlySet<string>;
  /** Treat warnings as failures. */
  strict?: boolean;
}

export function verifyPack(pack: Pack, options: VerifyOptions = {}): VerifyReport {
  const knownKcs = options.knownKcs ?? new Set<string>();
  const findings: VerifyFinding[] = [];
  let passed = 0;

  for (const item of pack.items) {
    const itemFindings = [
      ...checkSelfConsistency(item),
      ...checkExplanationAgreement(item),
      ...checkRegeneration(item),
      ...checkCircuitReference(item),
      ...checkSymbolicResidual(item),
      ...checkMisconceptionCoverage(item),
      ...checkMarkup(item),
      ...checkFigure(item),
      ...checkKcReferences(item, knownKcs),
    ];
    findings.push(...itemFindings);

    const failing = itemFindings.some(
      (f) => f.severity === 'error' || (options.strict && f.severity === 'warning'),
    );
    if (!failing) passed++;
  }

  const blocking = findings.filter(
    (f) => f.severity === 'error' || (options.strict && f.severity === 'warning'),
  );

  return {
    packId: pack.packId,
    itemsChecked: pack.items.length,
    findings,
    passed,
    ok: blocking.length === 0,
  };
}
