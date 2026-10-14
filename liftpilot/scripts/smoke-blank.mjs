// The smoke test's new projects, which start empty: the calculator (no type of intervention and nothing filled in, what
// is missing listed with the type first, its draft kept with its type, resumed after a reload and discarded, an example
// only on request), a machine room survey typed measure by measure, and the one form of a whole project with its
// project data entered (the carried-over ones stay, the rest is typed; a draft taken up again after a reload).
import assert from 'node:assert/strict';
import { step } from './smoke-kit.mjs';

const choose = (page, id) => page.click(`label:has(> #${id})`);

/** A new calculation: empty, the type of intervention asked first; its draft (with the type) kept and discarded; then
 *  the example asked for, which brings its type. */
export async function blankCalc({ page, hydrated, example }) {
  step('calculation: a new one starts empty, the type of intervention first; its draft kept, resumed and discarded');
  await hydrated(page, '#Q');
  assert.equal((await page.textContent('main h1'))?.trim(), 'Calcolo argano');
  assert.equal(await page.inputValue('#Q'), '', 'no example value');
  assert.equal(await page.locator('.summary .missing').count(), 1, 'what is still to enter');
  assert.equal(await page.locator('input[name="intervento"]:checked').count(), 0, 'no type chosen');
  assert.equal((await page.textContent('.summary .missing-list li:first-child'))?.trim(), 'Tipo di intervento', 'the type first');
  assert.equal(await page.locator('.verdict .big').count(), 0, 'nothing worked out');
  // «Solo argano»: the ropes still to answer, right after the type's place in the list
  await page.click('label.intervento-tipo[data-tipo="SOLO_ARGANO"]');
  assert.equal((await page.textContent('.summary .missing-list li:first-child'))?.trim(), 'Funi sostituite', 'the ropes to answer');
  await page.click('.parti-sino li[data-part="ropes"] button:has-text("No")');
  assert.notEqual((await page.textContent('.summary .missing-list li:first-child'))?.trim(), 'Funi sostituite', 'answered');
  await page.fill('#Q', '630');
  await page.waitForSelector('.savebar .draft-bar:has-text("Bozza salvata")', { timeout: 15000 });
  await page.reload();
  await hydrated(page, '#Q');
  assert.equal(await page.inputValue('#Q'), '630', 'the draft taken up again');
  assert.ok(await page.isChecked('input[name="intervento"][value="SOLO_ARGANO"]'), 'with its type');
  assert.equal(await page.locator('.parti-sino li[data-part="ropes"].da').count(), 0, 'and the ropes answered');
  await page.waitForSelector('.savebar .draft-bar:has-text("Bozza ripresa")');
  await page.click('.savebar .draft-bar button:has-text("Scarta la bozza")');
  await page.click('.savebar .draft-bar button:has-text("Sì, scarta")');
  await page.waitForSelector('.savebar .draft-bar', { state: 'detached', timeout: 15000 });
  await hydrated(page, '#Q');
  assert.equal(await page.inputValue('#Q'), '', 'discarded: empty again');
  assert.equal(await page.locator('input[name="intervento"]:checked').count(), 0, 'and no type');
  await page.click(`.controls button:has-text("Esempio ${example}")`);
  await page.waitForSelector('.verdict .big');
  assert.equal(await page.locator('input[name="intervento"]:checked').count(), 1, 'the example brings its type');
}

/** A new survey of the machine room: every measure typed (the higher room, the existing drops as measured). */
export async function blankSurvey({ page, hydrated }) {
  await hydrated(page, '#bk-room-W');
  assert.equal(await page.inputValue('#bk-room-H'), '', 'no example room');
  assert.equal(await page.locator('main .missing').count(), 1, 'the measures to enter');
  const typed = { 'room-W': 3000, 'room-D': 3000, 'room-shaftX': 500, 'room-shaftY': 500, 'room-H': 2700, 'room-slab': 250, 'room-doorAt': 300, 'room-doorW': 800,
    'room-doorH': 2000, 'room-panelAt': 1900, 'room-panelW': 800, 'room-panelD': 300, 'room-panelH': 1800, 'shaft-W': 1600, 'shaft-D': 1750, 'shaft-wall': 200,
    'car-x': 800, 'car-y': 575, 'cw-x': 800, 'cw-y': 1175 };
  for (const [k, v] of Object.entries(typed)) await page.fill(`#bk-${k}`, String(v));
  await page.selectOption('#bk-room-doorWall', 'front');
  await page.selectOption('#bk-room-panelWall', 'rear');
  await page.waitForSelector('main .missing', { state: 'detached' });
}

/**
 * The one form's project data still to enter, typed: the shaft (unless carried over), one entrance with a telescopic
 * door, the walls, the floors with their rises, pit and headroom; with `draft`, the form reloaded half way through
 * takes its draft up again. Then the software works everything out.
 */
export async function projectData({ page, hydrated, shaft = true, bottom = null, draft = false }) {
  await hydrated(page, '#bk-entrances');
  assert.equal(await page.locator('.lift-main .missing').count(), 1, 'what is still to enter');
  assert.equal(await page.locator('.lift-facts').count(), 0, 'nothing worked out');
  if (shaft) {
    await page.fill('#bk-W', '1600');
    await page.fill('#bk-D', '1750');
  }
  await choose(page, 'bk-entrances');
  if (draft) {
    step('the one form: its draft taken up again after a reload');
    await page.waitForSelector('.lift-work .draft-bar:has-text("Bozza salvata")', { timeout: 15000 });
    await page.reload();
    await hydrated(page, '#bk-door');
    await page.waitForSelector('.lift-work .draft-bar:has-text("Bozza ripresa")');
    if (shaft) assert.equal(await page.inputValue('#bk-W'), '1600', 'the shaft kept');
    assert.ok(await page.isChecked('#bk-entrances'), 'the entrance kept');
  }
  await choose(page, 'bk-door');
  await page.fill('#bk-doorWidth', '800');
  await page.fill('#bk-doorHeight', '2000');
  if (shaft) {
    await choose(page, 'bk-cw');
    await page.fill('#bk-wall', '200');
  }
  await page.selectOption('#bk-access', 'dm236_existing');
  await page.fill('#bk-pit', '1400');
  await page.fill('#bk-headroom', '3700');
  await page.fill('#bk-floors', '5');
  await page.press('#bk-floors', 'Enter');
  for (let i = 0; i < 4; i++) await page.fill(`#bk-rise-${i}`, '3000');
  await page.check('#bk-main');
  if (bottom) await page.selectOption('#bottom-scheme', bottom);
  await page.waitForSelector('.lift-facts .lift-verdict', { timeout: 60000 });
  assert.equal(await page.locator('.lift-main .missing').count(), 0, 'nothing left to enter');
}
