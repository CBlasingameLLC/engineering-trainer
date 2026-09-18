import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Theme and fullscreen.
 *
 * A dark mode is either right or obviously broken, and the broken version is
 * broken in a way unit tests cannot see: the class is applied, the store holds
 * the right value, and half the text is invisible because one utility never got
 * a dark variant. So this driver reads *computed* colours out of the running
 * page and asserts on contrast, not on class names.
 *
 *   pnpm --filter @et/desktop build
 *   pnpm --filter @et/desktop preview &
 *   pnpm --filter @et/desktop e2e:theme
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOT = process.env.E2E_SHOTS ?? resolve(HERE, 'screenshots');
const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:4173';
const CHROME = process.env.E2E_CHROME ?? undefined;

mkdirSync(SHOT, { recursive: true });

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const fail = (message) => { console.error(`FAIL: ${message}`); process.exitCode = 1; };

/** Relative luminance, for a contrast check that does not care about hue. */
const luminance = (rgb) => {
  const [r, g, b] = rgb.match(/\d+/g).slice(0, 3).map(Number).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
await page.goto(BASE, { waitUntil: 'networkidle' });

if (await page.locator('text=What have you already taken?').count()) {
  await page.locator('label', { hasText: 'EE2300' }).first().locator('input[type=checkbox]').check();
  await page.getByRole('button', { name: /Continue with/ }).click();
}
await page.waitForSelector('text=Engineering Trainer', { timeout: 10000 });
console.log('[1] dashboard rendered');

// --- The control cycles through all three states ----------------------------
const toggle = page.locator('[data-testid="theme-toggle"]');
const seen = [await toggle.getAttribute('data-theme')];
for (let i = 0; i < 3; i++) {
  await toggle.click();
  seen.push(await toggle.getAttribute('data-theme'));
}
console.log(`[2] theme cycle: ${seen.join(' -> ')}`);
if (new Set(seen).size !== 3) fail(`expected three distinct themes, saw ${[...new Set(seen)].join(', ')}`);
if (seen[0] !== seen[3]) fail('the cycle does not return to where it started');

// --- Dark actually applies --------------------------------------------------
await page.evaluate(() => { localStorage.setItem('et.theme', 'dark'); });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('text=Engineering Trainer', { timeout: 10000 });

const applied = await page.evaluate(() => ({
  klass: document.documentElement.classList.contains('dark'),
  scheme: document.documentElement.style.colorScheme,
  body: getComputedStyle(document.body).backgroundColor,
}));
console.log(`[3] dark survived reload: class=${applied.klass} color-scheme=${applied.scheme} body=${applied.body}`);
if (!applied.klass) fail('the dark class was not restored from the stored preference');
if (applied.scheme !== 'dark') fail('color-scheme was not set, so native scrollbars stay light');
if (luminance(applied.body) > 0.2) fail(`body background is not dark in dark mode (${applied.body})`);

// --- Nothing is invisible ---------------------------------------------------
// The failure this catches: a utility that got a dark variant for its
// background but not its text, or vice versa, leaving a region unreadable.
const probeContrast = () => page.evaluate(() => {
  const lum = (rgb) => {
    const parts = rgb.match(/\d+/g);
    if (!parts) return null;
    const [r, g, b] = parts.slice(0, 3).map(Number).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const backdrop = (el) => {
    for (let node = el; node; node = node.parentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && !bg.startsWith('rgba(0, 0, 0, 0)')) return bg;
    }
    return 'rgb(255, 255, 255)';
  };
  const bad = [];
  for (const el of document.querySelectorAll('p, span, h1, h2, h3, button, a, td, th, li')) {
    const text = (el.textContent ?? '').trim();
    if (!text || el.children.length > 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.3) continue;
    const fg = lum(cs.color);
    const bg = lum(backdrop(el));
    if (fg === null || bg === null) continue;
    const [hi, lo] = [fg, bg].sort((a, b) => b - a);
    const ratio = (hi + 0.05) / (lo + 0.05);
    if (ratio < 2) bad.push({ text: text.slice(0, 40), color: cs.color, bg: backdrop(el), ratio: Number(ratio.toFixed(2)) });
  }
  return bad;
});

// Walk every route a learner can reach from the dashboard. A single-page check
// would have missed exactly the case this is for: one route whose utilities
// never got a dark variant.
const routes = [
  ['dashboard', null],
  ['skill tree', 'Skill tree'],
  ['circuit lab', 'Circuit lab'],
  ['recurring errors', 'Recurring errors'],
  ['credentials', 'Credentials'],
];

let totalBad = 0;
for (const [label, nav] of routes) {
  if (nav) {
    await page.getByRole('button', { name: nav, exact: true }).first().click();
    await page.waitForTimeout(400);
  }
  const bad = await probeContrast();
  totalBad += bad.length;
  console.log(`    ${label}: ${bad.length} element(s) below 2:1`);
  for (const item of bad.slice(0, 3)) {
    console.error(`      "${item.text}" ${item.color} on ${item.bg} = ${item.ratio}:1`);
  }
  if (label === 'dashboard') await page.screenshot({ path: `${SHOT}/20-dark-dashboard.png` });
  if (label === 'recurring errors') await page.screenshot({ path: `${SHOT}/22-dark-misconceptions.png` });
  if (nav) {
    await page.getByRole('button', { name: /Back to dashboard|Go to dashboard|Dashboard/ }).first().click().catch(() => {});
    await page.waitForTimeout(300);
    if (!(await page.locator('[data-testid="nav-misconceptions"]').count())) {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForSelector('text=Engineering Trainer', { timeout: 10000 });
    }
  }
}
console.log(`[4] text contrast across ${routes.length} routes: ${totalBad} element(s) below 2:1`);
if (totalBad > 0) fail(`${totalBad} element(s) are effectively invisible in dark mode`);

// --- Fullscreen control -----------------------------------------------------
const fs = page.locator('[data-testid="fullscreen-toggle"]');
if ((await fs.count()) !== 1) fail('the fullscreen control is missing');
console.log(`[5] fullscreen control present, state=${await fs.getAttribute('data-fullscreen')}`);

// Light mode must still be intact.
await page.evaluate(() => { localStorage.setItem('et.theme', 'light'); });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('text=Engineering Trainer', { timeout: 10000 });
const lightBody = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
console.log(`[6] light mode body=${lightBody}`);
if (luminance(lightBody) < 0.5) fail(`light mode is not light (${lightBody})`);
await page.screenshot({ path: `${SHOT}/21-light-dashboard.png` });

if (errors.length > 0) {
  console.error(`\n${errors.length} console error(s):`);
  for (const e of errors.slice(0, 5)) console.error(`  ${e}`);
  process.exitCode = 1;
}

await browser.close();
console.log(process.exitCode ? '\nFAILED' : '\ntheme and fullscreen OK');
