// The smoke test's survey sheets, what came with the sync with rilievi ae6329cb6 (as rilievi 988f3cf37 has it): the
// company's order of the sections, set on the company page from the keyboard (the focus stays on the arrow pressed), saved,
// followed by the form, the sheet's page and its print, then put back; the linked data in real time in both directions (a
// module fills the sheet, the sheet fills a module), the difference listed under the module's group; Pelazza's order
// carried over to MoviLift when the make changes, without the e-mail of the person writing; the panel order and the argano
// sheet asked in the print, one by one (2SG's not); the save asking to confirm the difference («Salva comunque» after
// «Salva»: Enter asks again, never confirms), the fields still following on the returned form; the sheet's banner; the
// PDFs of the open modules only (the other make's 404); an edit of another field saved without asking (remembered), a
// changed difference asked again. Returns the sheet saved with MoviLift's order (for the other company's check).
import assert from 'node:assert/strict';
import { step } from './smoke-kit.mjs';

const tick = (page, name, value) => page.click(`form[data-scheda-form] label:has(> input[name="${name}"][value="${value}"])`);
const order = (page) => page.locator('input[name="ordine"]').evaluateAll((els) => els.map((e) => e.value));
const titles = (page, selector) => page.$$eval(selector, (els) => els.map((e) => e.textContent.replace(/^\d+/, '').trim()));
const saved = /\/app\/rilievi\/[a-z0-9]{20,40}$/;

async function submitBack(page, press) {
  const answer = page.waitForResponse((r) => r.request().method() === 'POST' && Boolean(r.request().headers()['next-action']));
  await press();
  await answer;
  await page.waitForSelector('#confirm-summary');
}

/** The company page's «Ripristina l'ordine predefinito». */
async function resetOrder(BASE, page, hydrated) {
  // after a failed step the page may be a form that came back unsaved (it asks before leaving): leave it
  const leave = (d) => void d.accept();
  page.on('dialog', leave);
  try {
    await page.goto(`${BASE}/it/app/company`);
  } finally {
    page.off('dialog', leave);
  }
  await hydrated(page, 'button[name="ripristina"]');
  await page.click('button[name="ripristina"]');
  await page.waitForSelector('.rv-order-box .alert[role="status"]');
}

export async function rilieviSync({ BASE, page, hydrated }) {
  const matricola = `9${String(Date.now()).slice(-8)}`;

  step('Rilievi: the company\'s order of the sections, moved from the keyboard and saved');
  await page.goto(`${BASE}/it/app/company`);
  await hydrated(page, 'button[name="salva"]');
  const before = await order(page);
  assert.equal(before.at(-1), 'note', 'the default order ends with «Note e lavori»');
  assert.deepEqual(before.slice(3, 6), ['argano', 'centralina', 'funi'], '«Centralina» after «Argano» in the default order');
  assert.equal(await page.locator('.rv-order-item.pinned').textContent().then((s) => s?.includes('Impianto')), true, '«Impianto» fixed on top');
  await page.focus('button[name="sposta"][value="note:su"]');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => [...globalThis.document.querySelectorAll('input[name="ordine"]')].map((e) => e.value).at(-1) === 'allarme');
  assert.equal(await page.evaluate(() => globalThis.document.activeElement?.getAttribute('value')), 'note:su', 'the focus stays on the arrow pressed');
  assert.equal(await page.isVisible('.rv-order-dirty'), true, 'moved, not saved yet');
  assert.equal((await page.textContent('.rv-order-dirty'))?.trim(), '«Note e lavori» ora è la 11ª sezione. Modifiche non salvate',
    'the status line says where the section is now');
  await page.focus('button[name="salva"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.rv-order-box .alert[role="status"]');
  assert.equal((await page.textContent('.rv-order-box .alert[role="status"]'))?.trim(), 'Ordine delle sezioni salvato.');
  await page.waitForFunction(() => globalThis.document.activeElement?.getAttribute('name') === 'salva');

  try {
    step('Rilievi: the form in that order; the linked data both ways, a difference listed; Pelazza → MoviLift');
    await page.goto(`${BASE}/it/app/rilievi/nuovo`);
    await hydrated(page, 'form[data-scheda-form][data-live] button[type="submit"]');
    const legends = await titles(page, 'form[data-scheda-form] > fieldset.rv-section > legend');
    assert.equal(legends[0], 'Impianto', '«Impianto» first');
    assert.deepEqual(legends.slice(-3), ['Note e lavori', 'Allarme e telesoccorso', 'Stampa e PDF'], 'the company\'s order, then the print\'s tick');
    await page.fill('#f-matricola', matricola);
    await page.fill('#f-indirizzo', 'Via Roma 1, Monza');
    await tick(page, 'arganoPreventivo', 'si');
    await page.waitForSelector('#f-pa', { state: 'visible' });
    await page.fill('#f-pa-funiN', '4');
    assert.equal(await page.inputValue('#f-funiNumero'), '4', 'the argano sheet fills the sheet');
    await page.fill('#f-fermate', '5');
    assert.equal(await page.inputValue('#f-pa-piani'), '5', 'the sheet fills the argano sheet');
    await page.fill('#f-pa-piani', '6');
    assert.deepEqual(await page.locator('#f-pa .rv-mdiff:visible li').allTextContents(), ['Fermate — Scheda: 5 · Dati argano: 6'], 'the difference under the group');
    assert.equal(await page.inputValue('#f-fermate'), '5', 'typed by the person: never overwritten');
    await tick(page, 'quadroMarca', 'PELAZZA');
    await tick(page, 'quadroOrdine', 'si');
    await page.waitForSelector('#f-oq', { state: 'visible' });
    await page.fill('#f-oq-velocita', '1,6');
    await tick(page, 'quadroMarca', 'MOVILIFT');
    await page.waitForSelector('#f-om', { state: 'visible' });
    assert.equal(await page.isVisible('#f-oq'), false, 'Pelazza closed with MoviLift');
    // MoviLift's radio groups with a hidden name («Fornitura»): the page does not scroll sideways
    assert.equal(await page.evaluate(() => {
      const root = globalThis.document.documentElement;
      return root.scrollWidth <= root.clientWidth;
    }), true, 'MoviLift open: no sideways scroll');
    assert.equal(await page.inputValue('#f-om-velocita'), '1,6', 'the order carries over to MoviLift');
    assert.notEqual(await page.inputValue('#f-om-ragioneSociale'), '', 'MoviLift: the company');
    assert.equal(await page.inputValue('#f-om-email'), '', 'MoviLift: not the e-mail of the person writing (rilievi 988f3cf37)');
    assert.equal(await page.isChecked('input[name="om-ingressi"][value="unico"]'), true, 'MoviLift: the blank form\'s own answer');
    // the modules in the print are chosen one by one: the panel order and the argano sheet, not 2SG's
    await tick(page, 'riepilogoOrdini', 'ordineQuadro');
    await tick(page, 'riepilogoOrdini', 'preventivoArgano');

    step('Rilievi: the save asks to confirm the difference; Enter asks again; «Salva comunque» saves');
    await submitBack(page, () => page.click('form[data-scheda-form] .savebar button[type="submit"]'));
    assert.equal((await page.textContent('#confirm-summary h2'))?.trim(), 'Un dato non coincide tra scheda e ordini');
    // MoviLift's order is open now: its stops (following the sheet) are a third place
    const fermate = 'Fermate — Scheda: 5 · Ordine quadro: 5 · Dati argano: 6';
    assert.deepEqual(await page.locator('#confirm-summary li').allTextContents(), [fermate]);
    assert.equal(await page.evaluate(() => globalThis.document.activeElement?.id), 'confirm-summary', 'the list focused');
    assert.deepEqual(await page.locator('form[data-scheda-form] button[type="submit"]').allTextContents(), ['Salva scheda', 'Salva comunque'], '«Salva comunque» after «Salva»');
    assert.equal(await page.isVisible('form[data-scheda-form] .rv-dirty'), true, 'nothing saved yet: the form says so (and asks before leaving)');
    await submitBack(page, async () => {
      await page.focus('#f-matricola');
      await page.keyboard.press('Enter');
    });
    assert.ok(page.url().endsWith('/rilievi/nuovo'), 'Enter never confirms');
    // the returned form keeps the sheet's field following the module
    await page.fill('#f-pa-funiN', '5');
    assert.equal(await page.inputValue('#f-funiNumero'), '5', 'still following after the form came back');
    await Promise.all([page.waitForURL(saved), page.click('form[data-scheda-form] button[name="conferma"]')]);
    const sheetUrl = page.url().replace(/\?.*$/, '');
    const id = sheetUrl.split('/').pop();
    await page.waitForSelector('.rv-flash');
    assert.deepEqual(await page.locator('.rv-diffnote li').allTextContents(), [fermate], 'the sheet\'s banner');
    const shown = await titles(page, '.rv-sec-title');
    assert.ok(shown.indexOf('Note e lavori') < shown.indexOf('Allarme e telesoccorso'), 'the sheet in the company\'s order');
    for (const [path, status] of [['pdf', 200], ['ordine-quadro-movilift', 200], ['dati-argano', 200], ['ordine-quadro', 404], ['sospensioni-2sg', 404]]) {
      assert.equal((await page.request.get(`${BASE}/api/rilievi/${id}/${path}`)).status(), status, `${path}: ${status}`);
    }
    await page.goto(`${sheetUrl}/stampa`);
    await page.waitForSelector('.rv-paper');
    const printed = await titles(page, '.rv-paper-sec h2');
    assert.ok(printed.includes('Modulo ordine quadro (Scelta v2.6) · MoviLift') && printed.includes('Modulo rilievi dati argani'), 'the modules in the print, asked');
    assert.ok(!printed.some((title) => title.includes('2SG')), '2SG\'s sheet not asked (nor open)');
    assert.ok(printed.indexOf('Note e lavori') < printed.indexOf('Allarme e telesoccorso'), 'the print in the company\'s order');

    step('Rilievi: an edit of another field saves without asking (remembered); a changed difference asks again');
    await page.goto(`${sheetUrl}/modifica`);
    await hydrated(page, 'form[data-scheda-form][data-live] button[type="submit"]');
    await page.fill('#f-marca', 'Kone');
    await Promise.all([page.waitForURL(saved), page.click('form[data-scheda-form] .savebar button[type="submit"]')]);
    await page.waitForSelector('.rv-flash');
    await page.goto(`${sheetUrl}/modifica`);
    await hydrated(page, 'form[data-scheda-form][data-live] button[type="submit"]');
    await page.fill('#f-pa-piani', '7');
    await submitBack(page, () => page.click('form[data-scheda-form] .savebar button[type="submit"]'));
    assert.deepEqual(await page.locator('#confirm-summary li').allTextContents(), ['Fermate — Scheda: 5 · Ordine quadro: 5 · Dati argano: 7'], 'asked again');
    await Promise.all([page.waitForURL(saved), page.click('form[data-scheda-form] button[name="conferma"]')]);
    await page.waitForSelector('.rv-flash');
    return { id };
  } finally {
    step('Rilievi: the default order back');
    await resetOrder(BASE, page, hydrated);
    assert.deepEqual(await order(page), before, 'the default order');
  }
}
