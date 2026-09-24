import { describe, expect, it } from 'vitest';
import { packSchema, parsePack, type Item, type Pack } from '@et/content-schema';
import { GENERATORS, buildPack, generatorById, sci } from '@et/generators';
import { readNumbers, verifyPack } from '../src/verify.js';
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

/**
 * The SI prefix rule, pinned.
 *
 * `extractNumbers` reads presentation back as data, which is what keeps
 * explanation-agreement independent of the generator's own arithmetic. The
 * hazard is that a leading prefix letter is not evidence of a prefix: `mol`,
 * `m/s` and `kg` all start with one. Reading those as prefixed divides a molar
 * quantity by a thousand and multiplies a mass by a thousand, so a correct
 * worked solution is reported as disagreeing with its own correct answer key.
 */
describe('SI prefix recovery', () => {
  const cases: [string, number][] = [
    // Prefixed: the magnitude lives in the prefix and must be folded in.
    ['4.7\\,\\mathrm{k\\Omega}', 4700],
    ['20\\,\\mathrm{ms}', 0.02],
    ['1.5\\,\\mathrm{\\mu F}', 1.5e-6],
    ['3\\,\\mathrm{mH}', 3e-3],
    ['2\\,\\mathrm{M\\Omega}', 2e6],
    ['8\\,\\mathrm{kHz}', 8000],
    ['5\\,\\mathrm{kVA}', 5000],
    ['12\\,\\mathrm{kJ}', 12000],
    // Not prefixed: the leading letter belongs to the unit.
    ['340\\,\\mathrm{m/s}', 340],
    ['0.5\\,\\mathrm{mol}', 0.5],
    ['2.5\\,\\mathrm{kg}', 2.5],
    ['1500\\,\\mathrm{K}', 1500],
    ['90\\,\\mathrm{dB}', 90],
    ['377\\,\\mathrm{rad/s}', 377],
    ['12\\,\\mathrm{V}', 12],
    ['60\\,\\mathrm{Hz}', 60],
    ['250\\,\\mathrm{VAR}', 250],
  ];

  for (const [rendered, expected] of cases) {
    it(`reads ${rendered} as ${expected}`, () => {
      expect(readNumbers(rendered)).toContain(expected);
    });
  }
});

/**
 * A unit's exponent is part of the unit, not a result the solution stated.
 *
 * The bare form was already excluded. The braced form is how a negative
 * exponent has to be written, and it was not: `\mathrm{cm^{-2}}` contributed a
 * bare -2 to the list of numbers the worked solution was claimed to end on.
 * That can only ever make explanation-agreement pass when it should have
 * failed, which is the quiet direction for a gate to be wrong in.
 */
describe('unit exponents are not results', () => {
  const notNumbers: [string, number][] = [
    ['0.5\\,\\mathrm{cm^{-2}}', -2],
    ['2.5\\,\\mathrm{cm^{2}}', 2],
    ['1.4\\,\\mathrm{m^2}', 2],
    ['9\\,\\mathrm{m^3}', 3],
    ['3\\,\\mathrm{s^{-1}}', -1],
  ];

  for (const [rendered, exponent] of notNumbers) {
    it(`does not read ${exponent} out of ${rendered}`, () => {
      expect(readNumbers(rendered)).not.toContain(exponent);
    });
  }

  it('still reads the quantity itself', () => {
    expect(readNumbers('0.5\\,\\mathrm{cm^{-2}}')).toEqual([0.5]);
    expect(readNumbers('1.4\\,\\mathrm{m^2}')).toEqual([1.4]);
  });
});

/**
 * Lengths in EE 4392 are stored in the unit the course writes them in, so the
 * prefix has to stay out of the `\mathrm` group.
 *
 * `\mathrm{\mu m}` is a correct prefixed metre and folding it to 4e-7 is the
 * rule working. It is still wrong for an item whose answer is stored as 0.477
 * micrometres, because explanation-agreement would then compare 0.477 against
 * 4.77e-7 and report a worked solution that is in fact right. Writing the
 * prefix as its own group renders identically and leaves the number bare.
 */
describe('course-unit lengths stay unfolded', () => {
  it('folds a prefixed metre written the schematic way', () => {
    expect(readNumbers('0.477\\,\\mathrm{\\mu m}')[0]).toBeCloseTo(4.77e-7, 12);
  });

  it('leaves micrometres bare when the prefix sits outside the group', () => {
    expect(readNumbers('0.477\\,\\mu\\mathrm{m}')).toContain(0.477);
  });

  it('leaves nanometres bare when the prefix is braced', () => {
    expect(readNumbers('310\\,\\mathrm{{n}m}')).toContain(310);
  });

  it('leaves every braced prefix bare, which is the one spelling generators use', () => {
    // `unfoldedUnit` emits this form for all three. Millimetres is the case
    // that shipped broken: `\mathrm{mm}` folds a 353 mm fringe to 0.3534, and
    // the optics generator stored the answer in millimetres.
    expect(readNumbers('0.477\\,\\mathrm{{\\mu}m}')).toEqual([0.477]);
    expect(readNumbers('353.4\\,\\mathrm{{m}m}')).toEqual([353.4]);
    expect(readNumbers('633\\,\\mathrm{{n}m}')).toEqual([633]);
    // and the unbraced forms still fold, which is correct for a schematic
    expect(readNumbers('353.4\\,\\mathrm{mm}')[0]).toBeCloseTo(0.3534, 10);
  });

  it('leaves compound process units alone', () => {
    expect(readNumbers('0.344\\,\\mu\\mathrm{m^2/hr}')).toContain(0.344);
    expect(readNumbers('23\\,\\mathrm{mJ/cm^2}')).toContain(23);
    expect(readNumbers('6\\,\\mathrm{mW/cm^2}')).toContain(6);
  });
});

/**
 * Scientific notation, which is the one place an exponent *is* the number.
 *
 * A doping concentration is written `5 \times 10^{20}` and neither half of
 * that is the stated result, so a worked solution ending on 5e20 used to agree
 * with nothing at all. EE 4392's diffusion and implantation items are written
 * entirely in these quantities.
 */
describe('scientific notation folds to one value', () => {
  const cases: [string, number][] = [
    ['5 \\times 10^{20}\\,\\mathrm{cm^{-3}}', 5e20],
    ['1.4\\times 10^{-4}\\,\\mathrm{cm^2/s}', 1.4e-4],
    ['$N_0 = 2.5 \\times 10^{18}$', 2.5e18],
    ['3 \\cdot 10^{15}', 3e15],
    ['-2 \\times 10^{3}', -2000],
    ['8.617 \\times 10^{-5}\\,\\mathrm{eV/K}', 8.617e-5],
  ];

  for (const [rendered, expected] of cases) {
    it(`reads ${rendered} as ${expected}`, () => {
      expect(readNumbers(rendered)).toContain(expected);
    });
  }

  it('round-trips everything sci() emits, on both sides of its boundary', () => {
    // `sci` is what stops JavaScript's own formatter putting `1.25e-8` into
    // the middle of a LaTeX expression. Read back, that string is the two
    // numbers 1.25 and -8, so a correct worked solution disagrees with a
    // correct answer key — which is how three EE 3300 items failed the gate.
    // Three significant figures is the contract, so every value here carries
    // at most three; rounding is pinned separately below.
    for (const value of [1.25e-8, 5e20, 2.5e-4, 0.0472, 137, 1e4, -3.3e-12]) {
      const read = readNumbers(sci(value));
      expect(read).toHaveLength(1);
      expect(read[0]!).toBeCloseTo(value, Math.abs(value) < 1 ? 20 : 0);
    }
  });

  it('keeps readable magnitudes in plain decimal and pushes the rest to powers of ten', () => {
    // The boundary is where a person would switch notation, not where the
    // language does.
    expect(sci(0.0472)).toBe('0.0472');
    expect(sci(137)).toBe('137');
    expect(sci(1e4)).toBe('1 \\times 10^{4}');
    expect(sci(0.00099)).toContain('\\times 10^{-4}');
    expect(sci(0)).toBe('0');
    expect(sci(2.5e-4, 'cm^{-3}')).toContain('\\mathrm{cm^{-3}}');
    // The branch is chosen on the value, the digits are cut afterwards, so a
    // number just under the boundary rounds up through it and still prints as
    // a decimal. Harmless at three significant figures, and worth pinning so a
    // future reader does not take it for a bug.
    expect(sci(9999)).toBe('10000');
  });

  it('leaves neither the mantissa nor the exponent loose', () => {
    // Both halves would be spurious, and a spurious number can only ever make
    // explanation-agreement pass when it should have failed.
    expect(readNumbers('5 \\times 10^{20}')).toEqual([5e20]);
  });
});

/**
 * Exponents and subscripts of any length, which is what finally settled this.
 *
 * Three successive lookbehinds each fixed the case in front of them and missed
 * the next: `(?<!\^)` misses `^{2}`, adding `(?<!\^\{)` lets `^{-2}` restart on
 * the digit, and adding `(?<!\^\{-)` still misses `^{18}`. No fixed number of
 * them covers an arbitrary exponent, so the spans are stripped instead.
 */
describe('exponents and subscripts of any length are not results', () => {
  const cases: [string, number[]][] = [
    ['1.4\\,\\mathrm{m^2}', [1.4]],
    ['0.5\\,\\mathrm{cm^{-2}}', [0.5]],
    ['7\\,\\mathrm{cm^{-12}}', [7]],
    ['4\\,\\mathrm{s^{-1}}', [4]],
    ['$N_0 = 9$', [9]],
    ['$R_{p} = 120\\,\\mathrm{{n}m}$', [120]],
    ['$x_{j}^{2} = 6$', [6]],
  ];

  for (const [rendered, expected] of cases) {
    it(`reads ${rendered} as exactly ${JSON.stringify(expected)}`, () => {
      expect(readNumbers(rendered)).toEqual(expected);
    });
  }
});
