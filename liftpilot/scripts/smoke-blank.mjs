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
  await page.click('.parti-sino li[data-part="ropes"] label:has-text("No")');
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

/** Values as a user types them for each field the list of what is missing names (the examples'). */
const TYPED = {
  Q: 630, P: 700, k: 0.5, v: 1, H: 18, o_D: 560, o_beta: 95, o_gamma: 35, o_i: 45, o_etaD: 0.6, o_nm: 1430, o_Pn: 7.5, o_Jm: 0.25, o_Js: 3.2, o_brakeSets: 1,
  o_brakeNm: 80, o_mass: 600, o_n: 4, o_d: 11, o_Fmin: 57.47, o_qf: 0.4065, n_D: 560, n_beta: 90, n_gamma: 35, n_i: 43, n_etaD: 0.7, n_nm: 1450, n_Pn: 7.5,
  n_Jm: 0.08, n_Js: 2.5, n_brakeSets: 2, n_brakeNm: 60, n_mass: 450, n_n: 4, n_d: 10, n_Fmin: 47.5, n_qf: 0.336,
};
const PICKED = { o_groove: 'UU', n_groove: 'UU', o_poles: '4', n_poles: '4', layout: 'top', r: '1' };

/** The form filled with exactly what the list of what is missing names, field by field, until the verdict shows. The
 *  list follows the values a moment later (useDeferredValue): a choice just made may still be named, and is made again. */
async function fillMissing(page) {
  await page.waitForTimeout(400);
  for (let round = 0; round < 8 && !(await page.locator('.summary .verdict .big').count()); round++) {
    const ids = await page.$$eval('.summary .missing-list a', (as) => as.map((a) => (a.getAttribute('href') ?? '').slice(1)));
    for (const id of ids) {
      if (id in PICKED) await page.selectOption(`#${id}`, PICKED[id]);
      else if (id in TYPED) await page.fill(`#${id}`, String(TYPED[id]));
      else throw new Error(`missing «${id}»: no value to type`);
    }
    await page.waitForTimeout(400);
  }
  await page.waitForSelector('.summary .verdict .big');
}

/**
 * Round 46 (the demo's bug): a blank «Calcolo argano» typed field by field, never an example — an «Ammodernamento» with
 * the machine above on a direct pull 1:1, whose hidden fields (rinvio, Hv, pulleys) stopped the save —, saved; then a
 * new calculation from it with «Argano: No», whose machine is the existing one, saved too.
 */
export async function blankSaves({ BASE, page, hydrated, stamp }) {
  step('calculation typed from blank, no example: «In alto, tiro diretto» 1:1 saves (round 46)');
  await page.goto(`${BASE}/it/app/projects/new`);
  await page.fill('input[name="name"]', `Vuoto ${stamp}`);
  await page.fill('input[name="city"]', 'Bergamo');
  await Promise.all([page.waitForURL(/\/projects\/[a-z0-9]+\/calc$/), page.click('main form button[type="submit"]')]);
  await hydrated(page, '#Q');
  await page.click('label.intervento-tipo[data-tipo="AMMODERNAMENTO"]');
  // the machine «Sì» (the type's default) and the control panel replaced, nothing else
  while (await page.locator('.parti-sino li.da').count()) {
    const part = await page.getAttribute('.parti-sino li.da', 'data-part');
    await page.click(`.parti-sino li[data-part="${part}"] label:has-text("${part === 'controller' ? 'Sì' : 'No'}")`);
  }
  await page.selectOption('#layout', 'top');
  await page.selectOption('#r', '1');
  await fillMissing(page);
  for (const id of ['dx', 'h', 'Hv', 'Dp', 'Jp']) assert.ok(await page.isHidden(`#${id}`), `${id}: not shown at the top, 1:1`);
  await page.waitForSelector('.savebar button.primary:not([disabled])', { timeout: 15000 });
  assert.equal(await page.locator('.savebar .note.bad').count(), 0, 'nothing named to correct');
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+$/, { timeout: 30000 }), page.click('.savebar button.primary')]);

  step('«Argano: No» from it: the machine kept is the existing one, saved (round 46)');
  await Promise.all([page.waitForURL(/\/calc\?from=/), page.click('.page-head a[href*="/calc?from="]')]);
  await hydrated(page, '#Q');
  await page.click('.parti-sino li[data-part="machine"] label:has-text("No")');
  await page.waitForSelector('.calc .inputs summary:has-text("Argano esistente (resta)")');
  assert.equal(await page.inputValue('#n_D'), String(TYPED.o_D), 'the existing sheave in the machine kept');
  assert.equal(await page.inputValue('#n_i'), String(TYPED.o_i), 'its ratio');
  await fillMissing(page);
  await page.waitForSelector('.savebar button.primary:not([disabled])', { timeout: 15000 });
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+$/, { timeout: 30000 }), page.click('.savebar button.primary')]);
  assert.match(await page.textContent('main'), /Argano esistente \(resta\)/, 'verified as it is');
}
