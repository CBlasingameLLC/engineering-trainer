import { describe, expect, it } from 'vitest';
import { packSchema, parsePack, type Item, type Pack } from '@et/content-schema';
import { GENERATORS, buildPack, generatorById } from '@et/generators';
import { verifyPack } from '../src/verify.js';
import { computeStats, uncoveredKcs } from '../src/stats.js';

/**
 * The gate itself must be trustworthy.
 *
 * `verify` is the only thing standing between LLM- or routine-authored content
 * and the item bank, so these tests deliberately corrupt good packs and assert
 * that each corruption is caught. A gate that passes everything is worse than
 * no gate, because it manufactures confidence.
 */

function goodPack(variants = 4): Pack {
  const { pack, issues } = buildPack(GENERATORS, {
    packId: 'test-pack',
    course: 'EE2300',
    title: 'Test bank',
    variantsPerGenerator: variants,
  });
  expect(issues).toHaveLength(0);
  return pack;
}

/** Deep-clone a pack so corruptions never leak between tests. */
const clone = (pack: Pack): Pack => structuredClone(pack);

/** First item whose answer is numeric, for corruption tests. */
function firstNumeric(pack: Pack): Item {
  const item = pack.items.find((i) => i.answer.kind === 'numeric');
  if (!item) throw new Error('fixture has no numeric item');
  return item;
}

describe('verifyPack on healthy content', () => {
  it('passes a freshly generated pack', () => {
    const report = verifyPack(goodPack());
    expect(report.ok).toBe(true);
    expect(report.passed).toBe(report.itemsChecked);
    expect(report.findings.filter((f) => f.severity === 'error')).toHaveLength(0);
  });

  it('reports how many items it actually checked', () => {
    const pack = goodPack(3);
    expect(verifyPack(pack).itemsChecked).toBe(pack.items.length);
  });
});

describe('verifyPack catches a corrupted answer key', () => {
  it('rejects an answer value silently changed after authoring', () => {
    // The exact failure the gate exists for: a plausible-looking item whose
    // stated answer is simply wrong. Regeneration from the seed catches it.
    const pack = clone(goodPack());
    const item = firstNumeric(pack);
    (item.answer as { value: number }).value *= 1.5;

    const report = verifyPack(pack);
    expect(report.ok).toBe(false);
    const findings = report.findings.filter((f) => f.itemId === item.id && f.severity === 'error');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.map((f) => f.check)).toContain('regeneration');
  });

  it('rejects a hand-authored item whose worked solution contradicts its answer', () => {
    // Without a generator there is no seed to regenerate from, so the
    // explanation-agreement check is the only thing that can catch this - and
    // it is the single most common failure in model-written content.
    const pack = clone(goodPack());
    const item = firstNumeric(pack);
    item.provenance = { producer: 'llm-batch', sourceRef: 'batch-1', licenseTier: 'redistributable' };
    delete (item as { seed?: number }).seed;
    (item.answer as { value: number }).value = 12345.6;

    const report = verifyPack(pack);
    expect(report.ok).toBe(false);
    const checks = report.findings.filter((f) => f.itemId === item.id).map((f) => f.check);
    expect(checks).toContain('explanation-agreement');
  });

  it('accepts a hand-authored item whose solution and answer agree', () => {
    const pack = clone(goodPack());
    for (const item of pack.items) {
      item.provenance = { producer: 'hand', sourceRef: 'author', licenseTier: 'redistributable' };
      delete (item as { seed?: number }).seed;
    }
    expect(verifyPack(pack).ok).toBe(true);
  });

  it('rejects a multiple-choice item whose correct option was retagged', () => {
    const pack = clone(goodPack());
    const item = pack.items.find((i) => i.type === 'multiple-choice');
    if (!item || item.answer.kind !== 'choice') throw new Error('fixture has no MC item');
    item.answer.correctId = item.options.find((o) => o.id !== (item.answer as { correctId: string }).correctId)!.id;

    const report = verifyPack(pack);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.itemId === item.id && f.check === 'regeneration')).toBe(true);
  });

  it('rejects a generator-produced item that lost its seed', () => {
    const pack = clone(goodPack());
    const item = firstNumeric(pack);
    delete (item as { seed?: number }).seed;

    const report = verifyPack(pack);
    expect(report.ok).toBe(false);
    expect(
      report.findings.some((f) => f.itemId === item.id && f.check === 'regeneration' && f.severity === 'error'),
    ).toBe(true);
  });

  it('rejects an item referencing a knowledge component that does not exist', () => {
    const pack = clone(goodPack());
    const item = pack.items[0]!;
    item.kcRefs = [{ kc: 'ee2300.not-a-real-kc', weight: 1 }];

    const report = verifyPack(pack, { knownKcs: new Set(['ee2300.ohms-law']) });
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.check === 'kc-reference')).toBe(true);
  });

  it('skips KC reference checking when no curriculum is supplied', () => {
    const pack = clone(goodPack());
    pack.items[0]!.kcRefs = [{ kc: 'ee2300.not-a-real-kc', weight: 1 }];
    expect(verifyPack(pack).findings.some((f) => f.check === 'kc-reference')).toBe(false);
  });
});

describe('verifyPack severity handling', () => {
  it('treats missing misconception tags as a warning, not a failure', () => {
    // Weak content is worth flagging but is not wrong; only incorrectness blocks.
    const pack = clone(goodPack());
    for (const item of pack.items) item.misconceptionTraps = [];

    const report = verifyPack(pack);
    expect(report.ok).toBe(true);
    expect(report.findings.some((f) => f.check === 'misconception-coverage')).toBe(true);
    expect(report.findings.every((f) => f.check !== 'misconception-coverage' || f.severity === 'warning')).toBe(true);
  });

  it('fails the same pack under --strict', () => {
    const pack = clone(goodPack());
    for (const item of pack.items) item.misconceptionTraps = [];
    expect(verifyPack(pack, { strict: true }).ok).toBe(false);
  });

  it('warns rather than errors when a generator is no longer registered', () => {
    // A retired generator makes old items unreproducible, but they are not
    // thereby wrong - so this must not block an otherwise healthy bank.
    const pack = clone(goodPack());
    for (const item of pack.items) item.provenance.sourceRef = 'ee2300.retired.generator';

    const report = verifyPack(pack);
    expect(report.findings.some((f) => f.check === 'regeneration' && f.severity === 'warning')).toBe(true);
    expect(report.ok).toBe(true);
  });
});

describe('licence quarantine', () => {
  it('refuses a personal-only item inside a redistributable pack', () => {
    // The structural guarantee behind the commercial path: textbook-derived
    // content cannot reach a shippable build even by mistake.
    const pack = clone(goodPack());
    pack.items[0]!.provenance.licenseTier = 'personal-only';

    // The per-item shape is fine; the violation is a cross-item rule, which is
    // exactly why parsePack carries checks the raw schema cannot express.
    expect(packSchema.safeParse(pack).success).toBe(true);
    const parsed = parsePack(pack);
    expect(parsed.ok).toBe(false);
    expect(parsed.issues.some((i) => i.message.includes('personal-only'))).toBe(true);
  });
});

describe('computeStats', () => {
  it('spreads each covered KC across at least two difficulty bands', () => {
    // Without spread the adaptive engine cannot bracket a learner: Fisher
    // information peaks where item difficulty meets ability, so a bank at a
    // single difficulty measures only learners already at that point.
    const stats = computeStats([goodPack(18)]);
    expect(stats.thinKcs).toEqual([]);
  });

  it('counts distinct misconceptions across the bank', () => {
    expect(computeStats([goodPack()]).misconceptionCount).toBeGreaterThan(8);
  });

  it('reports curriculum KCs that no item exercises', () => {
    // Uses a KC that will never exist rather than one that merely happens to be
    // uncovered today: the previous fixture named delta-wye and broke the
    // moment a generator was written for it, testing the bank's contents
    // instead of the function.
    const stats = computeStats([goodPack()]);
    const uncovered = uncoveredKcs(stats, ['ee2300.ohms-law', 'ee2300.never-authored']);
    expect(uncovered).toEqual(['ee2300.never-authored']);
  });

  it('attributes an item to every KC it references', () => {
    const generator = generatorById('ee2300.thevenin.resistance')!;
    expect(generator.kcRefs.length).toBeGreaterThan(1);
    const stats = computeStats([goodPack(2)]);
    const covered = new Set(stats.coverage.map((c) => c.kc));
    for (const ref of generator.kcRefs) expect(covered.has(ref.kc)).toBe(true);
  });
});

describe('symbolic answer keys', () => {
  /**
   * Symbolic items are the case where the rest of the gate goes quiet:
   * self-consistency grades the stored expression against itself and always
   * passes, and explanation-agreement reads numeric keys only. These tests pin
   * that the residual check covers the difference, because without it a
   * symbolic bank would be "verified" by two checks that cannot fail.
   */
  function symbolicPack(): Pack {
    const { pack, issues } = buildPack(
      GENERATORS.filter((g) => g.id.startsWith('math')),
      { packId: 'math-test', course: 'MATH2471', title: 'Math test bank', variantsPerGenerator: 3 },
    );
    expect(issues).toHaveLength(0);
    return pack;
  }

  const firstSymbolic = (pack: Pack): Item => {
    const item = pack.items.find((i) => i.answer.kind === 'symbolic');
    expect(item, 'expected at least one symbolic item').toBeDefined();
    return item!;
  };

  it('verifies every generated symbolic answer against its declared residual', () => {
    const pack = symbolicPack();
    const symbolic = pack.items.filter((i) => i.answer.kind === 'symbolic');
    expect(symbolic.length).toBeGreaterThan(5);

    const report = verifyPack(pack);
    const residualFindings = report.findings.filter((f) => f.check === 'symbolic-residual');
    expect(residualFindings).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('rejects a symbolic answer that no longer satisfies its residual', () => {
    const pack = clone(symbolicPack());
    const item = firstSymbolic(pack);
    if (item.answer.kind !== 'symbolic') throw new Error('unreachable');

    // Scale the whole derivative by two: still well-formed, still parses, still
    // grades itself correct — and wrong.
    item.answer.expression = `2*(${item.answer.expression})`;
    // Re-attribute to a hand author so the regeneration check stands aside:
    // that is also the realistic case, since a hand-written symbolic item has
    // no generator to regenerate from and the residual is its only gate.
    item.provenance = { ...item.provenance, producer: 'hand' };

    const report = verifyPack(pack);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.check === 'symbolic-residual' && f.itemId === item.id)).toBe(true);
  });

  it('shows that self-consistency alone cannot catch a wrong symbolic key', () => {
    // The point of the residual check, stated as a test: a corrupted symbolic
    // answer sails through the check that guards every numeric item.
    const pack = clone(symbolicPack());
    const item = firstSymbolic(pack);
    if (item.answer.kind !== 'symbolic') throw new Error('unreachable');
    item.answer.expression = `7*(${item.answer.expression}) + 3`;
    item.answer.residual = undefined;
    item.provenance = { ...item.provenance, producer: 'hand' };

    const report = verifyPack(pack);
    const onThisItem = report.findings.filter((f) => f.itemId === item.id && f.severity === 'error');
    expect(onThisItem).toEqual([]);
  });

  it('flags a symbolic item that declares no residual at all', () => {
    const pack = clone(symbolicPack());
    const item = firstSymbolic(pack);
    if (item.answer.kind !== 'symbolic') throw new Error('unreachable');
    item.answer.residual = undefined;
    item.provenance = { ...item.provenance, producer: 'hand' };

    const report = verifyPack(pack);
    expect(report.findings.some(
      (f) => f.check === 'symbolic-residual' && f.itemId === item.id && f.severity === 'warning',
    )).toBe(true);
    // A warning does not block on its own, but --strict is what the shared bank builds with.
    expect(verifyPack(pack, { strict: true }).ok).toBe(false);
  });
});
