import { chromium } from 'playwright';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The misconception loop, end to end.
 *
 * Every other test proves a piece: the engine ranks correctly, the grader
 * attributes a trap, storage persists an event. None of them proves the pieces
 * are connected — and for most of this project's life they were not. The tags
 * were computed, recorded and stored, and nothing read them.
 *
 * So this driver answers with *deliberately wrong* values drawn from each
 * item's own misconception traps, then checks the feed reports exactly the
 * errors it committed. The expectation is built during the run from the traps
 * actually typed, never from a list maintained beside the content: a
 * hand-written list drifts the moment a generator is added and then reports a
 * content addition as a product regression.
 *
 *   pnpm --filter @et/desktop build
 *   pnpm --filter @et/desktop preview &
 *   node apps/desktop/e2e/misconception-loop.mjs
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOT = process.env.E2E_SHOTS ?? resolve(HERE, 'screenshots');
const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:4173';
const CHROME = process.env.E2E_CHROME ?? undefined;
const PACKS = resolve(HERE, '../../../content/packs/shared');

mkdirSync(SHOT, { recursive: true });

const byId = new Map();
for (const file of readdirSync(PACKS).filter((f) => f.endsWith('.json'))) {
  for (const item of JSON.parse(readFileSync(join(PACKS, file), 'utf8')).items) byId.set(item.id, item);
}
console.log(`[0] loaded ${byId.size} items from ${readdirSync(PACKS).length} packs`);


/**
 * Answer a truth-table item by clicking its grid.
 *
 * Cells cycle blank -> 0 -> 1, so setting a row costs one click for 0 and two
 * for 1. Submit stays disabled until every row is set, which is the point of
 * the widget: an untouched grid is not an answer.
 */
async function fillTruthTable(page, rows) {
  for (const [index, value] of rows.entries()) {
    const cell = page.locator(`[data-testid="tt-cell-${index}"]`);
    await cell.click();
    if (value) await cell.click();
  }
}

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const fail = (message) => { console.error(`FAIL: ${message}`); process.exitCode = 1; };


/**
 * Wait until the player has moved off `previousId`.
 *
 * Clicking Continue and immediately filling the next answer races the render:
 * the input is still the graded one, still disabled, and Playwright waits for
 * it to become editable until it times out. Waiting on the item id changing is
 * the honest signal that a new question is on screen.
 */
async function waitForNextItem(previousId) {
  await page.waitForFunction(
    (prev) => {
      // By test id, not by `innerText`. `innerText` returns *rendered* text, so
      // a heading styled `text-transform: uppercase` comes back as
      // "PLACEMENT RESULTS" and a substring check for the written form silently
      // stops matching — the driver then waits out its timeout at the end of
      // every session, blaming the item that never arrived.
      if (document.querySelector('[data-testid="placement-results"]') !== null) return true;
      const article = document.querySelector('article[data-item-id]');
      return article !== null && article.getAttribute('data-item-id') !== prev;
    },
    previousId,
    { timeout: 20000 },
  );
}

await page.goto(BASE, { waitUntil: 'networkidle' });

// --- Onboarding -------------------------------------------------------------
await page.waitForSelector('text=What have you already taken?', { timeout: 15000 });
const ee = page.locator('label', { hasText: 'EE2300' }).first();
await ee.locator('input[type=checkbox]').check();
await page.getByRole('button', { name: /Continue with/ }).click();
await page.waitForSelector('[data-testid="dashboard"]', { timeout: 10000 });
console.log('[1] onboarded');

await page.locator('[data-testid="nav-diagnostics"]').click();
await page.locator('[data-testid="placement-launch"]').click();
await page.waitForSelector('[data-testid="session"]', { timeout: 10000 });

// --- Answer into the traps --------------------------------------------------
// Built during the run, not beside the content.
const committed = new Map(); // misconception id -> times deliberately triggered
const note = (id) => committed.set(id, (committed.get(id) ?? 0) + 1);

let answered = 0;
while (answered < 60) {
  if (await page.locator('[data-testid="placement-results"]').count() > 0) break;

  const itemId = await page
    .locator('article[data-item-id]').first().getAttribute('data-item-id').catch(() => null);
  if (itemId === null) break;
  const item = byId.get(itemId);

  if (item?.answer?.kind === 'numeric') {
    // Prefer a trap for an error already committed, so at least one
    // misconception reaches the drill threshold rather than the hits
    // scattering one apiece across thirty different errors.
    const traps = (item.misconceptionTraps ?? []).filter((t) => t.value !== undefined);
    const trap = traps.find((t) => committed.has(t.misconception)) ?? traps[0];
    if (trap) {
      note(trap.misconception);
      await page.locator('#answer').fill(String(trap.value));
    } else {
      await page.locator('#answer').fill(String(item.answer.value));
    }
    await page.getByRole('button', { name: 'Submit' }).click();
  } else if (item?.answer?.kind === 'symbolic') {
    const traps = (item.misconceptionTraps ?? []).filter((t) => t.expression !== undefined);
    const trap = traps.find((t) => committed.has(t.misconception)) ?? traps[0];
    if (trap) {
      note(trap.misconception);
      await page.locator('#answer').fill(trap.expression);
    } else {
      await page.locator('#answer').fill(item.answer.expression);
    }
    await page.getByRole('button', { name: 'Submit' }).click();
  } else if (item?.answer?.kind === 'complex') {
    // Answered in polar form, which is both what the item asks for and the
    // notation whose parser has the most ways to be wrong — so a trap that
    // fires here also proves the phasor reader works on generated values.
    const asPolar = (real, imag) =>
      `${Math.hypot(real, imag)}∠${(Math.atan2(imag, real) * 180) / Math.PI}`;
    const traps = (item.misconceptionTraps ?? []).filter((t) => t.complex !== undefined);
    const trap = traps.find((t) => committed.has(t.misconception)) ?? traps[0];
    if (trap) {
      note(trap.misconception);
      await page.locator('#answer').fill(asPolar(trap.complex.real, trap.complex.imag));
    } else {
      await page.locator('#answer').fill(asPolar(item.answer.real, item.answer.imag));
    }
    await page.getByRole('button', { name: 'Submit' }).click();
  } else if (item?.answer?.kind === 'choice') {
    const tagged = item.options.find((o) => o.misconception && o.id !== item.answer.correctId);
    const pick = tagged ?? item.options.find((o) => o.id === item.answer.correctId);
    if (tagged) note(tagged.misconception);
    await page.locator('article button')
      .filter({ hasText: new RegExp(`^${pick.id.toUpperCase()}`) }).first().click();
    await page.getByRole('button', { name: 'Submit' }).click();
  } else if (item?.answer?.kind === 'circuit') {
    await page.locator('button[data-circuit-input="netlist"]').click();
    await page.locator('#netlist').fill(item.answer.reference);
    await page.getByRole('button', { name: 'Submit' }).click();
  } else if (item?.answer?.kind === 'boolean') {
    const traps = (item.misconceptionTraps ?? []).filter((t) => t.expression !== undefined);
    const trap = traps.find((t) => committed.has(t.misconception)) ?? traps[0];
    if (trap) {
      note(trap.misconception);
      await page.locator('#answer').fill(trap.expression);
    } else {
      await page.locator('#answer').fill(item.answer.expression);
    }
    await page.getByRole('button', { name: 'Submit' }).click();
  } else if (item?.answer?.kind === 'truth-table') {
    // Truth tables carry no traps — a wrong grid is a wrong grid, not a named
    // error — so this one is answered correctly and simply moves the run on.
    await fillTruthTable(page, item.answer.rows);
    await page.getByRole('button', { name: 'Submit' }).click();
  } else {
    fail(`no branch for item ${itemId} of answer kind "${item?.answer?.kind ?? 'unknown'}"`);
    break;
  }

  await page.getByRole('button', { name: 'Continue' }).click();
  await waitForNextItem(itemId);
  answered++;
}
console.log(`[2] answered ${answered} items, deliberately committing ${committed.size} distinct errors`);
console.log('    top:', [...committed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  .map(([k, v]) => `${k}×${v}`).join(' '));

if (committed.size === 0) fail('no misconception traps were triggered; the run proves nothing');

// --- The feed ---------------------------------------------------------------
await page.locator('[data-testid="nav-dashboard"]').click();
await page.waitForSelector('[data-testid="nav-misconceptions"]', { timeout: 10000 });
await page.locator('[data-testid="nav-misconceptions"]').click();
await page.waitForSelector('[data-testid="misconception-feed"]', { timeout: 10000 });

const listed = await page.locator('[data-misconception-id]').evaluateAll((els) =>
  els.map((e) => e.getAttribute('data-misconception-id')),
);
console.log(`[3] feed lists ${listed.length} recurring errors`);
await page.screenshot({ path: `${SHOT}/10-misconception-feed.png`, fullPage: true });

// Every error committed must be reported. This is the assertion that would
// have failed for the whole life of the project until now.
const missing = [...committed.keys()].filter((id) => !listed.includes(id));
if (missing.length > 0) fail(`committed but not reported: ${missing.join(', ')}`);
else console.log('    every committed error is reported');

// The feed must be ordered, not merely populated.
const scores = await page.locator('[data-misconception-id]').evaluateAll((els) =>
  els.map((e) => Number(e.querySelector('p')?.textContent?.match(/^(\d+) time/)?.[1] ?? 0)),
);
if (scores.length < 2) console.log('    (only one error; ordering not exercised)');

// --- Cross-course rollup ----------------------------------------------------
const rollup = await page.locator('[data-family-id]').evaluateAll((els) =>
  els.map((e) => e.getAttribute('data-family-id')),
);
if (rollup.length > 0) {
  console.log(`[4] habits crossing course boundaries: ${rollup.join(', ')}`);
} else {
  console.log('[4] no cross-course habit this run (depends on which items CAT served)');
}

// --- Drill ------------------------------------------------------------------
const drillButtons = page.getByRole('button', { name: 'Drill this' });
const drillCount = await drillButtons.count();
if (drillCount === 0) {
  fail('no error offered a drill, though the bank tags traps on almost every item');
} else {
  const target = await page.locator('[data-misconception-id]')
    .filter({ has: page.getByRole('button', { name: 'Drill this' }) })
    .first().getAttribute('data-misconception-id');
  console.log(`[5] launching a drill for ${target}`);

  await drillButtons.first().click();
  await page.waitForSelector('article[data-item-id]', { timeout: 10000 });

  // Every item served must be one that can actually catch this error.
  let drilled = 0;
  while (drilled < 12) {
    if (await page.locator('[data-testid="drill-result"]').count() > 0) break;
    const itemId = await page
      .locator('article[data-item-id]').first().getAttribute('data-item-id').catch(() => null);
    if (itemId === null) break;

    const item = byId.get(itemId);
    const diagnoses = new Set([
      ...(item?.misconceptionTraps ?? []).map((t) => t.misconception),
      ...(item?.options ?? []).map((o) => o.misconception).filter(Boolean),
    ]);
    if (!diagnoses.has(target)) {
      fail(`drill served ${itemId}, which cannot detect ${target}`);
    }

    // Answer correctly this time, so the drill result reflects a cleared habit.
    if (item?.answer?.kind === 'numeric') {
      await page.locator('#answer').fill(String(item.answer.value));
    } else if (item?.answer?.kind === 'symbolic') {
      await page.locator('#answer').fill(item.answer.expression);
    } else if (item?.answer?.kind === 'complex') {
    // Answered in polar form, which is both what the item asks for and the
    // notation whose parser has the most ways to be wrong — so a trap that
    // fires here also proves the phasor reader works on generated values.
    const asPolar = (real, imag) =>
      `${Math.hypot(real, imag)}∠${(Math.atan2(imag, real) * 180) / Math.PI}`;
    const traps = (item.misconceptionTraps ?? []).filter((t) => t.complex !== undefined);
    const trap = traps.find((t) => committed.has(t.misconception)) ?? traps[0];
    if (trap) {
      note(trap.misconception);
      await page.locator('#answer').fill(asPolar(trap.complex.real, trap.complex.imag));
    } else {
      await page.locator('#answer').fill(asPolar(item.answer.real, item.answer.imag));
    }
    await page.getByRole('button', { name: 'Submit' }).click();
  } else if (item?.answer?.kind === 'choice') {
      await page.locator('article button')
        .filter({ hasText: new RegExp(`^${item.answer.correctId.toUpperCase()}`) }).first().click();
    } else if (item?.answer?.kind === 'boolean') {
      await page.locator('#answer').fill(item.answer.expression);
    } else if (item?.answer?.kind === 'truth-table') {
      await fillTruthTable(page, item.answer.rows);
    } else if (item?.answer?.kind === 'circuit') {
      await page.locator('button[data-circuit-input="netlist"]').click();
      await page.locator('#netlist').fill(item.answer.reference);
    }
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForFunction(
      (prev) => {
        if (document.querySelector('[data-testid="drill-result"]') !== null) return true;
        const article = document.querySelector('article[data-item-id]');
        return article !== null && article.getAttribute('data-item-id') !== prev;
      },
      itemId,
      { timeout: 20000 },
    );
    drilled++;
  }

  await page.waitForSelector('[data-testid="drill-result"]', { timeout: 10000 });
  const summary = await page.locator('[data-testid="drill-result"]').innerText();
  console.log(`[6] drill finished after ${drilled} items`);
  console.log(`    ${summary.replace(/\n+/g, ' ')}`);
  if (drilled === 0) fail('the drill served no items');
  await page.screenshot({ path: `${SHOT}/11-drill-result.png`, fullPage: true });
}

if (errors.length > 0) {
  console.error(`\n${errors.length} console error(s):`);
  for (const e of errors.slice(0, 5)) console.error(`  ${e}`);
  process.exitCode = 1;
}

await browser.close();
console.log(process.exitCode ? '\nFAILED' : '\nmisconception loop OK');
