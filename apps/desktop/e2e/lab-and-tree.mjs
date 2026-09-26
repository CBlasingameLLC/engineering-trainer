import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Circuit lab and skill tree.
 *
 * Drives the schematic editor the way a person does — click a part, click the
 * canvas, draw wires — and then checks that the solver produced the voltage the
 * drawing implies. That is the only way to test the step everything else rests
 * on: whether geometry the user drew becomes the circuit they meant.
 *
 *   pnpm --filter @et/desktop build
 *   pnpm --filter @et/desktop preview &
 *   node apps/desktop/e2e/lab-and-tree.mjs
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOT = process.env.E2E_SHOTS ?? resolve(HERE, 'screenshots');
const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:4173';
const CHROME = process.env.E2E_CHROME ?? undefined;
const GRID = 18;

mkdirSync(SHOT, { recursive: true });

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const fail = (message) => { console.error(`FAIL: ${message}`); process.exitCode = 1; };

/**
 * Wait for the app to finish booting before asking it anything.
 *
 * `networkidle` says the network went quiet, which happens long before
 * `boot()` has parsed the content bank and replayed the attempt log — around
 * 800 ms on this machine and growing with the bank. Probing the DOM at that
 * point is a race, and this driver lost it silently: the onboarding branch was
 * skipped because the prompt had not rendered yet, and the run then failed on
 * the *next* wait with a message about the dashboard, which is the wrong
 * place to look entirely.
 *
 * The other two drivers already waited rather than counted. This one counted.
 */
async function waitForBoot() {
  // `.or()` rather than a comma: the `text=` engine has no alternation, so a
  // comma-separated pair is read as one literal string and waits forever.
  await page
    .locator('text=What have you already taken?')
    .or(page.locator('[data-testid="dashboard"]'))
    .first()
    .waitFor({ state: 'visible', timeout: 20000 });
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await waitForBoot();

// --- Onboarding (fresh profile) --------------------------------------------
if (await page.locator('text=What have you already taken?').count() > 0) {
  const ee = page.locator('label', { hasText: 'EE2300' }).first();
  await ee.locator('input[type=checkbox]').check();
  await page.getByRole('button', { name: /Continue with/ }).click();
}
await page.waitForSelector('[data-testid="dashboard"]', { timeout: 10000 });
console.log('[1] dashboard rendered');

// --- Skill tree -------------------------------------------------------------
await page.locator('[data-testid="nav-skillTree"]').click();
await page.waitForSelector('[data-testid="skill-tree"]', { timeout: 10000 });

const nodes = await page.locator('[data-testid="skill-tree"] g[data-kc-id]').evaluateAll((els) =>
  els.map((e) => ({ kc: e.getAttribute('data-kc-id'), state: e.getAttribute('data-skill-state') })),
);
console.log(`[2] skill tree rendered with ${nodes.length} knowledge components`);

if (nodes.length < 30) fail(`expected the full graph on screen, saw ${nodes.length} nodes`);

const states = nodes.reduce((acc, n) => ({ ...acc, [n.state]: (acc[n.state] ?? 0) + 1 }), {});
console.log('    states:', Object.entries(states).map(([k, v]) => `${k}:${v}`).join(' '));

// Root KCs have no prerequisites, so something must always be startable. A tree
// where everything is locked is the failure mode that makes the board useless.
if ((states.available ?? 0) + (states.learning ?? 0) + (states.proficient ?? 0) + (states.mastered ?? 0) === 0) {
  fail('every knowledge component is locked; nothing can be started');
}

// A locked node must name what is blocking it, or "locked" is just a dead end.
const locked = nodes.find((n) => n.state === 'locked');
if (locked) {
  await page.locator(`g[data-kc-id="${locked.kc}"]`).click();
  await page.waitForSelector('text=Locked because', { timeout: 5000 });
  const blockers = await page.locator('section:has-text("Locked because") li').count();
  console.log(`    locked node "${locked.kc}" names ${blockers} blocking prerequisite(s)`);
  if (blockers === 0) fail('a locked node did not name any blocking prerequisite');
} else {
  console.log('    no locked nodes in this state (nothing to check)');
}
// The camera, not a scrollbar. Zooming must change the viewBox and fit must put
// it back; a tree that only scrolls cannot be zoomed out to show its shape.
const viewBoxOf = () => page.locator('[data-testid="skill-tree"]').getAttribute('viewBox');
const fitted = await viewBoxOf();
const box = await page.locator('[data-testid="skill-tree"]').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.wheel(0, -400);
await page.waitForFunction(
  (before) => document.querySelector('[data-testid="skill-tree"]')?.getAttribute('viewBox') !== before,
  fitted,
  { timeout: 3000 },
);
const zoomed = await viewBoxOf();
const widthOf = (vb) => Number(vb.split(/\s+/)[2]);
if (!(widthOf(zoomed) < widthOf(fitted))) fail(`wheel did not zoom in: ${fitted} -> ${zoomed}`);

await page.getByRole('button', { name: 'Fit to view' }).click();
await page.waitForFunction(
  (target) => document.querySelector('[data-testid="skill-tree"]')?.getAttribute('viewBox') === target,
  fitted,
  { timeout: 3000 },
);
console.log(`    camera: fit ${widthOf(fitted).toFixed(0)}w, zoomed ${widthOf(zoomed).toFixed(0)}w, fit restored`);

// No scrollbar anywhere in the chain that holds the tree: the whole point is
// that the graph is navigated rather than scrolled.
const scrollable = await page.evaluate(() => {
  let node = document.querySelector('[data-testid="skill-tree"]')?.parentElement;
  while (node && node !== document.body) {
    if (node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1) return node.className;
    node = node.parentElement;
  }
  return null;
});
if (scrollable !== null) fail(`the skill tree still scrolls (overflowing element: ${scrollable})`);

await page.screenshot({ path: `${SHOT}/06-skill-tree.png`, fullPage: true });

// --- Circuit lab ------------------------------------------------------------
await page.locator('[data-testid="nav-dashboard"]').click();
await page.waitForSelector('[data-testid="dashboard"]', { timeout: 10000 });
// Exact: the empty-state also offers "Open the circuit lab".
await page.locator('[data-testid="nav-circuitLab"]').click();
await page.waitForSelector('[data-testid="schematic-canvas"]', { timeout: 10000 });
console.log('[3] circuit lab rendered');

const canvas = page.locator('[data-testid="schematic-canvas"]');
const at = (x, y) => ({ position: { x: x * GRID, y: y * GRID } });

// `data-tool`, not the label: the palette buttons carry hotkey badges now, and
// a driver that matches rendered text reports a UI affordance as a regression.
const tool = (name) => page.locator(`button[data-tool="${name}"]`);

/** Place a part from the palette at a grid position. */
async function place(kind, x, y) {
  await tool(kind).click();
  await canvas.click(at(x, y));
}

/** Draw a polyline; clicking the final point twice ends it. */
async function wire(points) {
  await tool('wire').click();
  for (const [x, y] of points) await canvas.click(at(x, y));
  const [lx, ly] = points[points.length - 1];
  await canvas.click(at(lx, ly));
}

// A 1k/1k divider from the default 5 V source: v(mid) must be 2.5 V.
await place('vsource', 4, 8);   // pins (4,6) and (4,10)
await place('resistor', 12, 4);  // pins (12,2) and (12,6)
await place('resistor', 12, 12); // pins (12,10) and (12,14)

await wire([[4, 6], [4, 2], [12, 2]]);      // source + to R1 top
await wire([[12, 6], [12, 10]]);            // R1 bottom to R2 top
await wire([[12, 14], [12, 18], [4, 18], [4, 10]]); // R2 bottom back to source -

await tool('ground').click();
await canvas.click(at(4, 10));

await page.waitForTimeout(250);
const partCount = await page.locator('[data-testid="schematic-canvas"] g[data-component-id]').count();
console.log(`[4] drew ${partCount} parts and 3 wires`);
if (partCount !== 3) fail(`expected 3 parts on the canvas, found ${partCount}`);

const status = await page.locator('text=/\\d+ net\\(s\\)/').first().innerText();
console.log(`    ${status}`);

await page.screenshot({ path: `${SHOT}/07-circuit-lab.png`, fullPage: true });

// The operating point table must show the divider midpoint at half the supply.
const rows = await page.locator('section:has(h2:text("Operating point")) tbody tr').evaluateAll((els) =>
  els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
);
console.log('[5] operating point:', rows.join(' | ') || '(none)');

const voltages = rows
  .map((r) => /^v\((\S+)\)\s+([-\d.]+)\s*(\w*)V$/.exec(r))
  .filter(Boolean)
  .map((m) => ({ node: m[1], value: Number(m[2]) * (m[3] === 'm' ? 1e-3 : 1) }));

if (voltages.length === 0) {
  fail('the lab produced no node voltages from a complete drawing');
} else {
  const supply = voltages.find((v) => Math.abs(v.value - 5) < 0.01);
  const midpoint = voltages.find((v) => Math.abs(v.value - 2.5) < 0.01);
  if (!supply) fail(`no node at the 5 V supply rail; saw ${voltages.map((v) => v.value).join(', ')}`);
  if (!midpoint) fail(`divider midpoint is not 2.5 V; saw ${voltages.map((v) => v.value).join(', ')}`);
  if (supply && midpoint) {
    console.log(`    the drawing solves: rail ${supply.value} V, midpoint ${midpoint.value} V`);
  }
}

// The teaching output is the reason this solver exists; its absence is a bug.
// Matched on a test id rather than on section structure: the equations and the
// per-element stamps live in one section, and a structural selector counted
// both, reporting five "equations" for a two-node circuit.
const equations = await page.locator('[data-testid="node-equations"] li').allInnerTexts();
const stamps = await page.locator('[data-testid="element-stamps"] li').allInnerTexts();
console.log(`[6] ${equations.length} node equation(s), ${stamps.length} element stamp(s)`);
for (const equation of equations) console.log(`    ${equation}`);

// Two non-ground nodes means exactly two KCL equations.
if (equations.length !== 2) fail(`expected 2 node equations for this circuit, got ${equations.length}`);
if (!equations.every((e) => /^Node \S+:/.test(e) && /·v\(/.test(e))) {
  fail('a node equation did not reference any node voltage term');
}
if (stamps.length !== 3) fail(`expected one stamp per part, got ${stamps.length}`);

// --- editing gestures -------------------------------------------------------
// Everything below was impossible before: a placed part could not be moved, a
// drawn wire could not be selected, and there was no undo. The gestures are
// driven at known grid coordinates rather than at element bounding boxes,
// because a part's box includes its designator and value labels, so its centre
// sits in empty canvas to the right of the body.
await tool('select').click();

const canvasBox = await canvas.boundingBox();
const client = (gx, gy) => [canvasBox.x + gx * GRID, canvasBox.y + gy * GRID];
const clickGrid = async (gx, gy) => {
  const [x, y] = client(gx, gy);
  await page.mouse.click(x, y);
};
const transformOf = (id) => page.locator(`g[data-component-id="${id}"]`).getAttribute('transform');

// V1 was placed at grid (4, 8).
await clickGrid(4, 8);
const partId = await page
  .locator('[data-testid="schematic-canvas"] g[data-component-id][data-selected="true"]')
  .getAttribute('data-component-id');
if (!partId) fail('clicking a part did not select it');
const before = await transformOf(partId);

// Drag moves it.
const [fromX, fromY] = client(4, 8);
await page.mouse.move(fromX, fromY);
await page.mouse.down();
await page.mouse.move(fromX + 3 * GRID, fromY, { steps: 6 });
await page.mouse.up();
const after = await transformOf(partId);
if (after === before) fail(`dragging part ${partId} did not move it (still ${before})`);
console.log(`[7] drag moved ${partId}: ${before} -> ${after}`);

// Ctrl+Z puts it back, exactly.
await page.keyboard.press('Control+z');
await page.waitForFunction(
  ([id, target]) => document.querySelector(`g[data-component-id="${id}"]`)?.getAttribute('transform') === target,
  [partId, before],
  { timeout: 3000 },
);
console.log('    undo restored the original position');

// A hotkey arms a tool; Escape disarms it.
await page.keyboard.press('r');
if ((await page.locator('button[data-tool="resistor"]').getAttribute('data-active')) !== 'true') {
  fail('pressing R did not arm the resistor tool');
}
await page.keyboard.press('Escape');
if ((await page.locator('button[data-tool="select"]').getAttribute('data-active')) !== 'true') {
  fail('Escape did not return to the select tool');
}
console.log('    R armed the resistor tool, Escape returned to select');

// A wire is selectable and deletable, and undo brings it back. The middle wire
// runs (12,6) to (12,10), so (12,8) is on it and on nothing else.
const wiresBefore = await page.locator('[data-testid="schematic-canvas"] g[data-wire-id]').count();
await clickGrid(12, 8);
await page.keyboard.press('Delete');
const wiresAfter = await page.locator('[data-testid="schematic-canvas"] g[data-wire-id]').count();
if (wiresAfter !== wiresBefore - 1) fail(`deleting a wire left ${wiresAfter} of ${wiresBefore}`);
await page.keyboard.press('Control+z');
const wiresRestored = await page.locator('[data-testid="schematic-canvas"] g[data-wire-id]').count();
if (wiresRestored !== wiresBefore) fail(`undo left ${wiresRestored} wires, expected ${wiresBefore}`);
console.log(`[8] wire selected, deleted (${wiresBefore} -> ${wiresAfter}) and restored by undo`);

// Rubber band from empty canvas over everything selects all three parts.
const [bandX, bandY] = client(24, 2);
await page.mouse.move(bandX, bandY);
await page.mouse.down();
await page.mouse.move(canvasBox.x + 2, canvasBox.y + canvasBox.height - 2, { steps: 8 });
await page.mouse.up();
const selected = await page
  .locator('[data-testid="schematic-canvas"] g[data-component-id][data-selected="true"]')
  .count();
if (selected !== 3) fail(`rubber band selected ${selected} parts, expected 3`);
console.log(`[9] rubber band selected all ${selected} parts`);

await page.screenshot({ path: `${SHOT}/08-circuit-lab-editing.png`, fullPage: true });

// --- template library -------------------------------------------------------
// Every template is proved solvable by a unit test; this is the other claim —
// that choosing one puts a complete circuit on the canvas, ready to simulate,
// rather than a drawing you then have to finish.
const picker = page.locator('[data-testid="template-picker"]');
const offered = await picker.locator('option:not([value=""])').count();
if (offered < 12) fail(`template picker offers only ${offered} circuits`);

await picker.selectOption('sallen-key-lp');
// Waiting on "more parts than the three we drew" rather than on an exact
// count, so adding an element to a template is not a driver failure.
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid="schematic-canvas"] g[data-component-id]').length > 3,
  undefined,
  { timeout: 3000 },
);
const loadedParts = await page.locator('[data-testid="schematic-canvas"] g[data-component-id]').count();

// "connected" is the editor's own verdict on whether the drawing builds a
// netlist with nothing dangling — which is the whole value of a starting point.
const connected = await page.locator('text=connected').count();
if (connected === 0) {
  const issue = await page.locator('text=/issue\\(s\\)/').first().innerText().catch(() => '(no status)');
  fail(`the loaded template is not a complete circuit: ${issue}`);
}
console.log(`[10] ${offered} templates offered; Sallen-Key loaded ${loadedParts} parts, connected`);

await page.screenshot({ path: `${SHOT}/09-circuit-template.png`, fullPage: true });

// --- The term view ----------------------------------------------------------
// The claim being tested is the one the term exists to make: that the schedule
// and the mastery model are joined, so a prerequisite that has slipped is
// reported against the unit that is about to need it. Asserting the list is
// non-empty is not enough — a list of everything would also be non-empty — so
// each row must name a real KC and a real unit from the schedule.
await page.goto(BASE, { waitUntil: 'networkidle' });
await waitForBoot();
await page.locator('[data-testid="nav-term"]').click();
await page.waitForSelector('[data-testid="term-view"]', { timeout: 10000 });

const weekLabel = await page.locator('[data-testid="term-week"]').innerText();
if (!/Week \d+ of \d+|Not started yet|Term finished/.test(weekLabel)) {
  fail(`term position unreadable: ${weekLabel}`);
}

const scheduled = await page
  .locator('[data-testid="live-units"] [data-testid="study-unit"], [data-testid="upcoming-units"] [data-testid="study-unit"]')
  .evaluateAll((els) => els.map((e) => ({
    course: e.getAttribute('data-course'),
    unit: e.getAttribute('data-unit'),
    kcs: (e.getAttribute('data-kcs') ?? '').split(' ').filter(Boolean),
    disabled: e.hasAttribute('disabled'),
  })));
if (scheduled.length === 0) fail('the term schedules nothing at all');
console.log(`[11] term view: ${weekLabel}, ${scheduled.length} unit(s) scheduled`);
console.log(`    ${scheduled.map((u) => `${u.course} ${u.unit}`).join(' | ')}`);

// The button advertises what it will draw from, so the two must agree. An
// enabled button with nothing behind it is the defect this assertion exists
// for: `startKcs` returns silently when the unit's KCs turn up no items, so
// such a button looks live, does nothing, and explains nothing.
for (const unit of scheduled) {
  if (unit.disabled && unit.kcs.length > 0) {
    fail(`${unit.course} ${unit.unit} is disabled but claims ${unit.kcs.length} servable KC(s)`);
  }
  if (!unit.disabled && unit.kcs.length === 0) {
    fail(`${unit.course} ${unit.unit} offers a live button with no servable KCs behind it`);
  }
}
const unauthored = scheduled.filter((u) => u.disabled);
if (unauthored.length > 0) {
  // Disabled is not enough on its own — the row has to say which of the two
  // empty cases it is, or the learner is told "no" without being told why.
  for (const unit of unauthored) {
    const reason = await page
      .locator(`[data-testid="study-unit"][data-course="${unit.course}"][data-unit="${unit.unit}"]`)
      .first()
      .getAttribute('title');
    if (!reason) fail(`${unit.course} ${unit.unit} is disabled with no reason given`);
  }
  console.log(`    ${unauthored.length} scheduled unit(s) not yet authored, each explained: `
    + unauthored.map((u) => `${u.course} ${u.unit}`).join(', '));
}

const readinessRows = await page
  .locator('[data-testid="readiness-list"] li[data-kc-id]')
  .evaluateAll((els) => els.map((e) => e.getAttribute('data-kc-id')));
const clear = await page.locator('[data-testid="readiness-clear"]').count();
if (readinessRows.length === 0 && clear === 0) {
  fail('readiness section rendered neither a list nor an explanation of why it is empty');
}
console.log(`[12] readiness: ${readinessRows.length > 0 ? readinessRows.join(', ') : 'nothing flagged (explained)'}`);

// A course on the term with no knowledge map must be said out loud rather than
// quietly omitted, since the alternative is a term view disagreeing with the
// term. EE4392 is exactly that case in the shipped schedule.
const unmapped = await page.locator('[data-testid="courses-without-graph"]').count();
if (unmapped > 0) {
  console.log(`    ${(await page.locator('[data-testid="courses-without-graph"]').innerText()).trim()}`);
}

// "Study this" must actually start a session scoped to that unit, not a
// whole-course one — the point of the button is the scoping.
// Take the first unit that can actually serve something. Taking scheduled[0]
// blindly would hang the run the moment a not-yet-authored unit sorted first,
// and would report that as a product failure rather than as a test that picked
// the wrong row.
const firstUnit = scheduled.find((u) => !u.disabled);
if (!firstUnit) fail('no scheduled unit can serve an item');
await page
  .locator(`[data-testid="study-unit"][data-course="${firstUnit.course}"][data-unit="${firstUnit.unit}"]`)
  .first()
  .click();
await page.waitForSelector('[data-item-id]', { timeout: 10000 });

// The scoping is the point of the button, so check that rather than checking
// that anything at all was served. The expected KCs come off the button itself
// — the same value the click acts on — rather than from a list maintained
// beside the schedule, which is the pair that always drifts.
const servedKc = await page.locator('article[data-item-id]').first().getAttribute('data-kc-id');
if (!servedKc) fail('a unit session served an item with no KC attribution');
else if (!firstUnit.kcs.includes(servedKc)) {
  fail(`unit session for ${firstUnit.course} ${firstUnit.unit} served ${servedKc}, which is not one of its ${firstUnit.kcs.length} KCs`);
}
console.log(`[13] "Study this" on ${firstUnit.course} ${firstUnit.unit} served ${servedKc} (1 of ${firstUnit.kcs.length} in the unit)`);

await page.screenshot({ path: `${SHOT}/10-term.png`, fullPage: true });

console.log(errors.length === 0 ? '\nNo console errors.' : `\nConsole errors:\n${errors.join('\n')}`);
await browser.close();
if (errors.length > 0) process.exitCode = 1;
process.exit(process.exitCode ?? 0);
