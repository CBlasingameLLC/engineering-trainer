import { chromium } from 'playwright';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * End-to-end exam mode.
 *
 * Proves the wiring that only a real sitting can prove: that a paper is
 * assembled from the exam's own scope and served in a fixed order, that it is
 * genuinely sealed — no explanation, no running score, no Continue button —
 * that handing in grades what was served rather than what was answered, and
 * that the report renders both scores and a per-unit breakdown.
 *
 * What it deliberately does *not* prove is the overtime arithmetic. Reaching
 * the bell means waiting out a seventy-five minute clock, and the alternative —
 * a shorter duration exposed only so a test can pass — would put a fiction in
 * the product to make the harness convenient. The two scores, the time
 * findings and the unreached-item accounting are pinned by unit tests against
 * `gradeExam`, which can set the clock to whatever it likes because it takes
 * the elapsed time as data.
 *
 *   pnpm --filter @et/desktop build
 *   pnpm --filter @et/desktop preview &
 *   node apps/desktop/e2e/exam-mode.mjs
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const SHOT = process.env.E2E_SHOTS ?? resolve(HERE, 'screenshots');
const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:4173';
const CHROME = process.env.E2E_CHROME ?? undefined;
const EXAM = process.env.E2E_EXAM ?? 'EE3300:exam-1';

mkdirSync(SHOT, { recursive: true });

const PACKS = resolve(REPO, 'content/packs/shared');
const byId = new Map();
for (const file of readdirSync(PACKS).filter((f) => f.endsWith('.json'))) {
  for (const item of JSON.parse(readFileSync(join(PACKS, file), 'utf8')).items) byId.set(item.id, item);
}

let failed = false;
const fail = (msg) => { console.error(`FAIL: ${msg}`); failed = true; };

async function fillTruthTable(page, rows) {
  for (const [index, value] of rows.entries()) {
    const cell = page.locator(`[data-testid="tt-cell-${index}"]`);
    await cell.click();
    if (value) await cell.click();
  }
}

/** Answer the item on screen from the bank's own key. Returns false if unhandled. */
async function answer(page, item) {
  const kind = item?.answer?.kind;
  if (kind === 'choice') {
    await page.locator('article button')
      .filter({ hasText: new RegExp(`^${item.answer.correctId.toUpperCase()}`) }).first().click();
  } else if (kind === 'numeric') {
    await page.locator('#answer').fill(String(item.answer.value));
  } else if (kind === 'symbolic' || kind === 'boolean') {
    await page.locator('#answer').fill(item.answer.expression);
  } else if (kind === 'complex') {
    const magnitude = Math.hypot(item.answer.real, item.answer.imag);
    const angle = (Math.atan2(item.answer.imag, item.answer.real) * 180) / Math.PI;
    await page.locator('#answer').fill(`${magnitude}∠${angle}`);
  } else if (kind === 'truth-table') {
    await fillTruthTable(page, item.answer.rows);
  } else if (kind === 'circuit') {
    await page.locator('button[data-circuit-input="netlist"]').click();
    await page.locator('#netlist').fill(item.answer.reference);
  } else {
    return false;
  }
  await page.getByRole('button', { name: 'Submit' }).click();
  return true;
}

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(BASE, { waitUntil: 'domcontentloaded' });

// Wait for boot, never for the network: the bank is parsed and the attempt log
// replayed several hundred milliseconds after the last request settles.
await page.locator('text=What have you already taken?')
  .or(page.locator('[data-testid="dashboard"]'))
  .first().waitFor({ timeout: 20000 });
if (await page.locator('text=What have you already taken?').count()) {
  // 'Start fresh' when nothing is ticked, 'Continue with N course(s)' otherwise.
  await page.getByRole('button', { name: /Continue with|Start fresh/ }).click();
}
await page.waitForSelector('[data-testid="dashboard"]', { timeout: 10000 });
console.log('[1] dashboard rendered');

const headline = (await page.locator('[data-testid="briefing-headline"]').innerText()).trim();
if (headline.length === 0) fail('the briefing produced no headline');
console.log(`[2] briefing: ${headline}`);

// --- Diagnostics -----------------------------------------------------------
await page.locator('[data-testid="nav-diagnostics"]').click();
await page.waitForSelector('[data-testid="triage"]', { timeout: 10000 });
const examRow = page.locator(`[data-testid="exam-${EXAM}"]`);
if ((await examRow.count()) === 0) fail(`no diagnostics row for ${EXAM}`);
// Rows only. A prefix match also catches each row's own launch button and
// would report twice the number of exams on offer.
const examRows = await page.locator('[data-testid^="exam-"]:not([data-testid$="-launch"])').count();
console.log(`[3] diagnostics offers ${examRows} exam(s) plus triage and placement`);
await page.screenshot({ path: `${SHOT}/30-diagnostics.png`, fullPage: true });

// --- Sit the paper ---------------------------------------------------------
await page.locator(`[data-testid="exam-${EXAM}-launch"]`).click();
await page.waitForSelector('[data-testid="session"][data-mode="exam"]', { timeout: 10000 });

const clock = page.locator('[data-testid="exam-clock"]');
if ((await clock.count()) !== 1) fail('the exam clock is missing');
const t0 = await clock.innerText();
await page.waitForTimeout(2200);
const t1 = await clock.innerText();
if (t0 === t1) fail(`the clock is not running (${t0} twice)`);
if ((await clock.getAttribute('data-expired')) !== 'false') fail('a fresh paper reports itself expired');
console.log(`[4] exam started, clock running ${t0.trim()} -> ${t1.trim()}`);
await page.screenshot({ path: `${SHOT}/31-exam-item.png`, fullPage: true });

const servedKcs = [];
const servedItems = [];
let answered = 0;
let leaked = 0;

while (answered < 8) {
  const article = page.locator('article[data-item-id]').first();
  if ((await article.count()) === 0) break;
  const itemId = await article.getAttribute('data-item-id');
  const kcId = await article.getAttribute('data-kc-id');
  servedItems.push(itemId);
  if (kcId) servedKcs.push(kcId);

  const item = byId.get(itemId);
  if (!item) { fail(`served item ${itemId} is not in the shared bank`); break; }
  if (!(await answer(page, item))) {
    fail(`no branch for item ${itemId} of answer kind "${item?.answer?.kind ?? 'unknown'}"`);
    break;
  }
  answered += 1;

  // Sealed: the next item must arrive with no explanation and no Continue.
  await page.waitForFunction(
    (previous) => {
      const el = document.querySelector('article[data-item-id]');
      return el !== null && el.getAttribute('data-item-id') !== previous;
    },
    itemId,
    { timeout: 10000 },
  );
  if (await page.locator('button:has-text("Continue")').count()) leaked += 1;
  if (await page.locator('text=/correct answer|Worked solution/i').count()) leaked += 1;
}

if (leaked > 0) fail(`a sealed paper showed feedback ${leaked} time(s)`);
if (new Set(servedItems).size !== servedItems.length) fail('the same item was served twice');
console.log(`[5] answered ${answered} items, no feedback leaked, ${new Set(servedKcs).size} distinct component(s) touched`);

// --- Hand in ---------------------------------------------------------------
await page.locator('[data-testid="hand-in"]').click();
await page.waitForSelector('[data-testid="exam-report"]', { timeout: 15000 });
console.log('[6] handed in, report rendered');

const scores = await page.locator('[data-testid^="exam-result-"] .tabular').allInnerTexts();
const percents = scores.map((s) => s.trim()).filter((s) => /^\d+%$/.test(s));
if (percents.length < 2) fail(`the report shows ${percents.length} score(s); both are required`);
console.log(`    scored at the bell ${percents[0]}, known overall ${percents[1]}`);

// Handing in early leaves the rest of the paper unreached, and unreached is
// worth zero: the bell score must reflect the whole paper, not just what was
// attempted. Answering correctly throughout and still scoring under 100% is
// the evidence that it does.
const atBell = Number.parseInt(percents[0] ?? '0', 10);
if (atBell >= 100) fail('handing in early scored 100% — unreached items were not counted');

const unitRows = await page.locator('[data-testid^="exam-result-"]').first().innerText();
for (const unit of ['Second-Order Circuits', 'Sinusoidal Steady State', 'The s-Domain']) {
  if (!unitRows.includes(unit)) fail(`the report never mentions "${unit}", which is in this exam's scope`);
}
// The scope entry that belongs to another course entirely. If the cross-course
// reference silently resolved to nothing, everything above still passes.
if (!unitRows.includes('Energy Storage and Transients')) {
  fail('the borrowed EE2300 unit is absent from the report — a cross-course scope resolved to nothing');
}
console.log('[7] per-unit breakdown names every unit in scope, the borrowed EE2300 one included');
await page.screenshot({ path: `${SHOT}/32-exam-report.png`, fullPage: true });

// --- Triage ----------------------------------------------------------------
await page.locator('[data-testid="nav-diagnostics"]').click();
await page.waitForSelector('[data-testid="triage-launch"]', { timeout: 10000 });
await page.locator('[data-testid="triage-launch"]').click();
await page.waitForSelector('[data-testid="session"][data-mode="triage"]', { timeout: 10000 });
if ((await page.locator('[data-testid="exam-clock"]').count()) !== 0) {
  fail('the triage run is timed; it is meant to be untimed');
}
const firstTriage = page.locator('article[data-item-id]').first();
const triageItem = byId.get(await firstTriage.getAttribute('data-item-id'));
if (triageItem && (await answer(page, triageItem))) {
  // Unsealed: triage explains as it goes, which is the whole difference.
  await page.waitForSelector('button:has-text("Continue")', { timeout: 8000 });
  console.log('[8] triage run is untimed and shows its working');
} else {
  fail('could not answer the first triage item');
}

if (errors.length > 0) {
  console.error(`\nConsole errors:\n${errors.map((e) => `  ${e}`).join('\n')}`);
  failed = true;
} else {
  console.log('\nNo console errors.');
}

await browser.close();
if (failed) process.exit(1);
console.log('exam mode OK');
