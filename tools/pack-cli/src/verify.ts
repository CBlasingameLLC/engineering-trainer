import { checkAnswer, toleranceFor, type Response } from '@et/answer-engine';
import type { Item, Pack } from '@et/content-schema';
import { generatorById, makeRng } from '@et/generators';
import { gradeCircuit, nodesOf, parseNetlist } from '@et/circuits';

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
          : item.answer.kind === 'symbolic'
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
 * Pull numeric literals out of rendered text, folding SI prefixes so an answer
 * written as "4.7 kohm" compares against a stored value of 4700.
 */
function extractNumbers(text: string): number[] {
  const prefixes: Record<string, number> = {
    G: 1e9, M: 1e6, k: 1e3, m: 1e-3, n: 1e-9, p: 1e-12, '\\mu': 1e-6, u: 1e-6,
  };
  const out: number[] = [];
  for (const match of text.matchAll(/(-?\d+(?:\.\d+)?)(?:\s*\\,)?(?:\\text\{(\\mu\s?|[GMkmnpu])?)?/g)) {
    const value = Number(match[1]);
    if (!Number.isFinite(value)) continue;
    const prefix = match[2]?.trim();
    out.push(prefix ? value * (prefixes[prefix] ?? 1) : value);
  }
  return out;
}

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

/** Check 5 — misconception coverage. Untagged wrong options teach nothing. */
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
  return [];
}

/** Check 6 — KC references resolve against the loaded curriculum. */
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
      ...checkMisconceptionCoverage(item),
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
