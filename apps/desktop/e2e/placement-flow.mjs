import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * End-to-end placement flow.
 *
 * Drives the real app in a real browser against the real item bank, answering
 * from the bank's own answer keys so the result is meaningful rather than
 * random. Deliberately misses one cluster of topics and then asserts the gap
 * report localises the weakness to exactly those - which is the product claim,
 * and the only way to check it is to actually play a session.
 *
 *   pnpm --filter @et/desktop build
 *   pnpm --filter @et/desktop preview &
 *   node apps/desktop/e2e/placement-flow.mjs
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const SHOT = process.env.E2E_SHOTS ?? resolve(HERE, 'screenshots');
const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:4173';
const CHROME = process.env.E2E_CHROME ?? undefined;

mkdirSync(SHOT, { recursive: true });

// The generated bank is the source of truth for correct answers, so the driver
// can answer honestly rather than guessing — which is what makes the placement
// result meaningful instead of random.
const pack = JSON.parse(
  readFileSync(resolve(REPO, 'content/packs/shared/ee2300-core-v1.json'), 'utf8'),
);
const byId = new Map(pack.items.map((i) => [i.id, i]));

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(BASE, { waitUntil: 'networkidle' });

// --- Onboarding ------------------------------------------------------------
await page.waitForSelector('text=What have you already taken?', { timeout: 15000 });
console.log('[1] onboarding rendered');

// Mark EE2300 complete with an A, finished a year ago — the decay scenario.
const ee = page.locator('label', { hasText: 'EE2300' }).first();
await ee.locator('input[type=checkbox]').check();
const card = page.locator('.card', { hasText: 'EE2300' }).first();
await card.locator('select').first().selectOption('A');
await card.locator('select').nth(1).selectOption('2025 Fall');
console.log('[2] EE2300 marked: grade A, finished 2025 Fall');

await page.screenshot({ path: `${SHOT}/01-onboarding.png`, fullPage: true });
await page.getByRole('button', { name: /Continue with/ }).click();

// --- Dashboard -------------------------------------------------------------
await page.waitForSelector('text=Start with a placement exam', { timeout: 10000 });
console.log('[3] dashboard rendered (no data yet)');
await page.screenshot({ path: `${SHOT}/02-dashboard-empty.png`, fullPage: true });

await page.getByRole('button', { name: 'Begin placement' }).click();
await page.waitForSelector('text=Placement', { timeout: 10000 });
console.log('[4] placement session started');

// --- Placement -------------------------------------------------------------
// Answer honestly but imperfectly: correct on everything except op-amps and
// transients, so the report has a real shape to show rather than a flat score.
const WEAK = ['op-amp', 'capacitor', 'RLC', 'charges through'];
let answered = 0;
let deliberatelyWrong = 0;
let unmatched = 0;
let firstShot = true;

while (answered < 60) {
  const done = await page.locator('text=Placement results').count();
  if (done > 0) break;

  // The rendered stem is rewritten by KaTeX, so identify the item by the id
  // the player exposes rather than by scraping text.
  const itemId = await page.locator('article[data-item-id]').first().getAttribute('data-item-id').catch(() => null);
  if (itemId === null) break;
  const item = byId.get(itemId);
  if (!item) { unmatched++; }

  const shouldMiss = item ? WEAK.some((w) => item.stem.includes(w)) : false;
  if (shouldMiss) deliberatelyWrong++;

  if (item?.answer?.kind === 'choice') {
    const options = item.options.map((o) => o.id);
    const pickId = shouldMiss
      ? (options.find((o) => o !== item.answer.correctId) ?? item.answer.correctId)
      : item.answer.correctId;
    await page.locator(`article button`).filter({ hasText: new RegExp(`^${pickId.toUpperCase()}`) }).first().click();
    await page.getByRole('button', { name: 'Submit' }).click();
  } else if (item?.answer?.kind === 'numeric') {
    const value = shouldMiss ? item.answer.value * 1.8 : item.answer.value;
    await page.locator('#answer').fill(String(value));
    await page.getByRole('button', { name: 'Submit' }).click();
  } else {
    // Unidentified item: answer something so the session can proceed.
    const hasInput = (await page.locator('#answer').count()) > 0;
    if (hasInput) { await page.locator('#answer').fill('1'); await page.getByRole('button', { name: 'Submit' }).click(); }
    else { await page.locator('article button').first().click(); await page.getByRole('button', { name: 'Submit' }).click(); }
  }

  await page.waitForSelector('button:has-text("Continue")', { timeout: 8000 });
  if (firstShot) {
    await page.screenshot({ path: `${SHOT}/03-session-feedback.png`, fullPage: true });
    firstShot = false;
  }
  await page.getByRole('button', { name: 'Continue' }).click();
  answered++;
  await page.waitForTimeout(60);
}

console.log(`[5] answered ${answered} items (${deliberatelyWrong} deliberately missed, ${unmatched} unidentified)`);
if (unmatched > 0) { console.error(`FAIL: ${unmatched} items could not be matched to the bank`); process.exitCode = 1; }

// --- Report ----------------------------------------------------------------
await page.waitForSelector('text=Placement results', { timeout: 15000 });
const summary = await page.locator('header + div').first().innerText();
console.log('[6] gap report rendered');
console.log('    tallies:', summary.replace(/\n/g, ' '));

const inferredCount = await page.locator('text=Inferred, not tested').count();
console.log('    inferred section present:', inferredCount > 0);
if (inferredCount > 0) {
  const inferred = await page.locator('h2:has-text("Inferred, not tested") + p + ul li').count();
  console.log('    inferred KCs listed:', inferred);
}
// The product claim: the report should localise the weakness to the topics
// actually missed, and not scatter gaps across untouched material.
// Target the title span specifically: `font-medium` alone also matches the
// "overall N%" figure in the same row.
const gapTitles = await page
  .locator('section:has(h2:text("Start here")) li span.font-medium.text-slate-900')
  .allInnerTexts();
const expectedWeak = /op-amp|amplifier|Capacitor|RLC|step response|Summing|Cascaded/i;
const onTarget = gapTitles.filter((t) => expectedWeak.test(t)).length;
console.log(`    gaps: ${gapTitles.join(' | ')}`);
console.log(`    localisation: ${onTarget}/${gapTitles.length} gaps fall in the missed topics`);
if (gapTitles.length > 0 && onTarget < gapTitles.length) {
  console.error('FAIL: gaps were reported outside the deliberately-missed topics');
  process.exitCode = 1;
}
await page.screenshot({ path: `${SHOT}/04-report.png`, fullPage: true });

await page.getByRole('button', { name: 'Go to dashboard' }).click();
await page.waitForSelector('text=By competency', { timeout: 10000 });
console.log('[7] dashboard with data rendered');
const comp = await page.locator('section:has(h2:text("By competency")) li').allInnerTexts();
console.log('    competency axis:', comp.map((c) => c.split('\n').slice(0, 2).join(' ')).join(' | '));
await page.screenshot({ path: `${SHOT}/05-dashboard-data.png`, fullPage: true });

// --- Persistence -----------------------------------------------------------
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('text=By competency', { timeout: 10000 });
console.log('[8] state survived a reload (rebuilt from the attempt log)');

console.log(errors.length === 0 ? '\nNo console errors.' : `\nConsole errors:\n${errors.join('\n')}`);
await browser.close();
if (errors.length > 0) process.exitCode = 1;
process.exit(process.exitCode ?? 0);
