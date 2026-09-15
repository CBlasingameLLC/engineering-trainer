#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { KcGraph } from '@et/domain';
import { loadCurriculum, parsePackDocument, toGraphInput, type Pack } from '@et/content-schema';
import { GENERATORS, buildPack } from '@et/generators';
import { verifyPack, type VerifyReport } from './verify.js';
import { computeStats, uncoveredKcs } from './stats.js';

/**
 * Content pipeline CLI.
 *
 * Every authoring route - generators, scheduled Claude Routines, LLM batches,
 * hand-written items, book imports - passes through these same commands, which
 * is what stops five producers needing five different quality standards.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const CURRICULUM_DIR = join(ROOT, 'content/curriculum');
const SHARED_PACKS = join(ROOT, 'content/packs/shared');
const PERSONAL_PACKS = join(ROOT, 'content/packs/personal');
const INBOX = join(ROOT, 'content/inbox');

// Built at runtime rather than written as a literal escape, so the source stays
// free of control characters.
const CSI = `${String.fromCharCode(27)}[`;
const useColour = process.stdout.isTTY === true && process.env['NO_COLOR'] === undefined;
const paint = (code: string, s: string): string => (useColour ? `${CSI}${code}m${s}${CSI}0m` : s);
const ok = (s: string): string => paint('32', s);
const bad = (s: string): string => paint('31', s);
const warn = (s: string): string => paint('33', s);
const dim = (s: string): string => paint('2', s);

function readDocuments(dir: string): { source: string; text: string }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.json'))
    .map((f) => ({ source: f, text: readFileSync(join(dir, f), 'utf8') }));
}

function loadGraph(): { graph: KcGraph; issues: string[] } {
  const { courses, issues } = loadCurriculum(readDocuments(CURRICULUM_DIR));
  const messages = issues.map((i) => `${i.source} ${i.path}: ${i.message}`);
  if (messages.length > 0) return { graph: new KcGraph([], []), issues: messages };

  const { kcs, edges } = toGraphInput(courses);
  try {
    return { graph: new KcGraph(kcs, edges), issues: [] };
  } catch (error) {
    // A prerequisite cycle surfaces here, and names the loop.
    return { graph: new KcGraph([], []), issues: [(error as Error).message] };
  }
}

function loadPacks(dirs: string[]): { packs: Pack[]; issues: string[] } {
  const packs: Pack[] = [];
  const issues: string[] = [];
  for (const dir of dirs) {
    for (const doc of readDocuments(dir)) {
      const result = parsePackDocument(doc.text, doc.source);
      if (result.pack) packs.push(result.pack);
      issues.push(...result.issues.map((i) => `${i.source} ${i.path}: ${i.message}`));
    }
  }
  return { packs, issues };
}

// ---------------------------------------------------------------------------

function cmdValidate(): number {
  console.log('Validating curriculum and packs\n');

  const { graph, issues: graphIssues } = loadGraph();
  if (graphIssues.length > 0) {
    console.log(bad(`  curriculum: ${graphIssues.length} issue(s)`));
    for (const issue of graphIssues) console.log(`    ${issue}`);
    return 1;
  }
  console.log(ok(`  curriculum: ${graph.size} knowledge components, acyclic`));

  const depth = Math.max(...graph.layers().values()) + 1;
  console.log(dim(`    ${graph.roots().length} root KC(s), ${depth} prerequisite layers`));

  const { packs, issues: packIssues } = loadPacks([SHARED_PACKS, PERSONAL_PACKS]);
  if (packIssues.length > 0) {
    console.log(bad(`\n  packs: ${packIssues.length} issue(s)`));
    for (const issue of packIssues) console.log(`    ${issue}`);
    return 1;
  }
  const itemCount = packs.reduce((s, p) => s + p.items.length, 0);
  console.log(ok(`\n  packs: ${packs.length} pack(s), ${itemCount} item(s), schema valid`));
  return 0;
}

function reportVerify(report: VerifyReport, strict: boolean): void {
  const errors = report.findings.filter((f) => f.severity === 'error');
  const warnings = report.findings.filter((f) => f.severity === 'warning');

  const header = `  ${report.packId}: ${report.passed}/${report.itemsChecked} items verified`;
  console.log(report.ok ? ok(header) : bad(header));

  for (const finding of errors.slice(0, 20)) {
    console.log(`    ${bad('error')} ${finding.itemId} [${finding.check}] ${finding.message}`);
  }
  if (errors.length > 20) console.log(dim(`    ... and ${errors.length - 20} more error(s)`));

  const shown = strict ? warnings : warnings.slice(0, 5);
  for (const finding of shown) {
    console.log(`    ${warn('warn ')} ${finding.itemId} [${finding.check}] ${finding.message}`);
  }
  if (!strict && warnings.length > 5) console.log(dim(`    ... and ${warnings.length - 5} more warning(s)`));
}

function cmdVerify(args: string[]): number {
  const strict = args.includes('--strict');
  console.log(`Verifying packs${strict ? ' (strict)' : ''}\n`);

  const { graph, issues: graphIssues } = loadGraph();
  if (graphIssues.length > 0) {
    console.log(bad('  curriculum failed to load; run `pack validate` first'));
    return 1;
  }
  const knownKcs = new Set(graph.kcs.keys());

  const { packs, issues } = loadPacks([SHARED_PACKS, PERSONAL_PACKS]);
  if (issues.length > 0) {
    console.log(bad('  packs failed schema validation; run `pack validate` first'));
    return 1;
  }
  if (packs.length === 0) {
    console.log(warn('  no packs found; run `pack build` first'));
    return 0;
  }

  let failed = 0;
  for (const pack of packs) {
    const report = verifyPack(pack, { knownKcs, strict });
    reportVerify(report, strict);
    if (!report.ok) failed++;
  }

  console.log();
  if (failed > 0) {
    console.log(bad(`${failed} pack(s) failed verification. Nothing enters the bank until they pass.`));
    return 1;
  }
  console.log(ok('All packs verified.'));
  return 0;
}

function cmdStats(): number {
  const { graph } = loadGraph();
  const { packs } = loadPacks([SHARED_PACKS, PERSONAL_PACKS]);
  if (packs.length === 0) {
    console.log(warn('No packs found; run `pack build` first.'));
    return 0;
  }

  const stats = computeStats(packs);
  console.log('Bank coverage\n');
  console.log(`  items            ${stats.itemCount}`);
  console.log(`  knowledge comps  ${stats.kcCount} covered of ${graph.size} defined`);
  console.log(`  misconceptions   ${stats.misconceptionCount} distinct`);
  console.log(`  item types       ${Object.entries(stats.byType).map(([t, n]) => `${t}:${n}`).join('  ')}`);
  console.log(`\n  ${'knowledge component'.padEnd(38)}intro basic  core   adv  total`);

  for (const row of stats.coverage) {
    const cells = [row.byBand.intro, row.byBand.basic, row.byBand.core, row.byBand.advanced]
      .map((n) => (n === 0 ? dim('    .') : String(n).padStart(5)))
      .join(' ');
    console.log(`  ${row.kc.padEnd(38)}${cells}${String(row.total).padStart(7)}`);
  }

  const uncovered = uncoveredKcs(stats, [...graph.kcs.keys()]);
  if (uncovered.length > 0) {
    console.log(warn(`\n  ${uncovered.length} KC(s) with no items at all:`));
    for (const kc of uncovered) console.log(`    ${kc}`);
  }
  if (stats.thinKcs.length > 0) {
    console.log(warn(`\n  ${stats.thinKcs.length} KC(s) too thin to bracket a learner's ability:`));
    for (const kc of stats.thinKcs) console.log(`    ${kc}`);
  }
  return 0;
}

function cmdBuild(args: string[]): number {
  const variants = Number(args.find((a) => a.startsWith('--variants='))?.split('=')[1] ?? 12);
  console.log(`Building packs from ${GENERATORS.length} generators (${variants} variants each)\n`);

  const { pack, issues } = buildPack(GENERATORS, {
    packId: 'ee2300-core-v1',
    course: 'EE2300',
    title: 'Circuits I generated core bank',
    variantsPerGenerator: variants,
  });

  if (issues.length > 0) {
    console.log(bad(`  ${issues.length} generated item(s) failed schema validation:`));
    for (const issue of issues.slice(0, 10)) {
      console.log(`    ${issue.itemId} ${issue.path}: ${issue.message}`);
    }
    return 1;
  }

  mkdirSync(SHARED_PACKS, { recursive: true });
  const target = join(SHARED_PACKS, `${pack.packId}.json`);
  writeFileSync(target, `${JSON.stringify(pack, null, 2)}\n`);
  console.log(ok(`  wrote ${pack.items.length} items to content/packs/shared/${basename(target)}`));
  return 0;
}

/**
 * Move verified packs out of the inbox.
 *
 * The inbox is the unverified drop zone a Claude Routine or LLM batch writes
 * into. Nothing leaves it without passing verification, which is the mechanism
 * that lets generated content be accepted without being trusted.
 */
function cmdImport(args: string[]): number {
  const toPersonal = args.includes('--personal');
  const destination = toPersonal ? PERSONAL_PACKS : SHARED_PACKS;

  const documents = readDocuments(INBOX);
  if (documents.length === 0) {
    console.log('Inbox is empty.');
    return 0;
  }

  const { graph } = loadGraph();
  const knownKcs = new Set(graph.kcs.keys());
  console.log(`Importing ${documents.length} document(s) from content/inbox\n`);

  let imported = 0;
  let rejected = 0;

  for (const doc of documents) {
    const parsed = parsePackDocument(doc.text, doc.source);
    if (!parsed.pack) {
      console.log(bad(`  ${doc.source}: schema invalid`));
      for (const issue of parsed.issues.slice(0, 5)) console.log(`    ${issue.path}: ${issue.message}`);
      rejected++;
      continue;
    }

    const report = verifyPack(parsed.pack, { knownKcs });
    if (!report.ok) {
      console.log(bad(`  ${doc.source}: verification failed`));
      reportVerify(report, false);
      rejected++;
      continue;
    }

    // Personal-only content must never land in the shared, committed directory.
    if (parsed.pack.provenance.licenseTier === 'personal-only' && !toPersonal) {
      console.log(bad(`  ${doc.source}: personal-only content requires --personal`));
      rejected++;
      continue;
    }

    mkdirSync(destination, { recursive: true });
    renameSync(join(INBOX, doc.source), join(destination, doc.source));
    console.log(ok(`  ${doc.source}: ${report.passed} item(s) imported`));
    imported++;
  }

  console.log(`\n${imported} imported, ${rejected} rejected.`);
  return rejected > 0 ? 1 : 0;
}

// ---------------------------------------------------------------------------

const USAGE = [
  '',
  'pack - content pipeline for the engineering trainer',
  '',
  '  validate             schema, KC references, and prerequisite-cycle checks',
  '  verify [--strict]    independently confirm every stated answer',
  '  stats                bank coverage by knowledge component and difficulty',
  '  build [--variants=N] regenerate the core bank from the generators',
  '  import [--personal]  move verified packs out of content/inbox',
  '',
].join('\n');

const [command, ...args] = process.argv.slice(2);
const commands: Record<string, (a: string[]) => number> = {
  validate: cmdValidate,
  verify: cmdVerify,
  stats: cmdStats,
  build: cmdBuild,
  import: cmdImport,
};

const handler = command ? commands[command] : undefined;
if (!handler) {
  console.log(USAGE);
  process.exit(command ? 1 : 0);
}
process.exit(handler(args));
