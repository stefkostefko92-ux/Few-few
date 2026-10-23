// The smoke test's survey sheets, what came with the sync with rilievi 988f3cf37 (round 49; rilievi's own browser checks
// tests/e2e/mastech.mjs, porte.mjs and tempo-reale.mjs, as LiftPilot shows them): a Mastech panel asks for its model first
// and each model opens its own order, filled from the sheet and from the order of the make chosen before, its rows named;
// a hydraulic lift has «Centralina» in place of «Argano» and «Limitatore» (make and model with either answer, the A3
// amendment with «No», the flexible hose with the amendment), the pit tie rods in place of the counterweight's, and the
// form's index shows only the sections shown; the end of the form chooses the print — «Cavi» left out, the panel order in;
// saved: the sheet without «Argano», the NG120 order's PDF (QI Touch's and Pelazza's 404), the print with «Centralina» and
// the order, without «Cavi». Then MoviLift: not the e-mail of the person writing; the company emptied in the order stays
// empty when the sheet opens again and its data change; the photocell's voltage (a field the blank form does not have)
// saved.
import assert from 'node:assert/strict';
import { step } from './smoke-kit.mjs';

const tick = (page, name, value) => page.click(`form[data-scheda-form] label:has(> input[name="${name}"][value="${value}"])`);
const shown = (page, selector) => page.locator(selector).first().isVisible();
const titles = (page, selector) => page.$$eval(selector, (els) => els.map((e) => e.textContent.replace(/^\d+/, '').trim()));
const saved = /\/app\/rilievi\/[a-z0-9]{20,40}$/;

/** «Salva scheda»; when the sheet and its modules say different things, «Salva comunque» (smoke-rilievi-sync.mjs checks
 *  that question). Returns the saved sheet's address. */
async function save(page) {
  await page.click('form[data-scheda-form] .savebar button[type="submit"]:not([name])');
  await Promise.race([page.waitForURL(saved), page.waitForSelector('#confirm-summary')]);
  if (!saved.test(page.url())) await Promise.all([page.waitForURL(saved), page.click('form[data-scheda-form] button[name="conferma"]')]);
  await page.waitForSelector('.rv-flash');
  return page.url().replace(/\?.*$/, '');
}

/** The ids of the form's sections on the screen, in order, and those of the index's lines (the index is outside the form). */
const visibleSections = (page) => page.$$eval('form[data-scheda-form] > fieldset.rv-section[id^="s-"]',
  (els) => els.filter((e) => e.id !== 's-riepilogo' && globalThis.getComputedStyle(e).display !== 'none').map((e) => e.id.slice(2)));
const visibleIndex = (page) => page.$$eval('.rv-index li', (els) => els.filter((e) => globalThis.getComputedStyle(e).display !== 'none')
  .map((e) => e.querySelector('a')?.hash.slice(3)));

export async function rilieviSync2({ BASE, page, hydrated }) {
  const digits = String(Date.now()).slice(-7), numero = `6${digits.slice(-5)}`, matricola = `5${digits}`;

  step('Rilievi 988f3cf37: a Mastech panel asks its model, each model its own order filled from the sheet');
  await page.goto(`${BASE}/it/app/rilievi/nuovo`);
  await hydrated(page, 'form[data-scheda-form][data-live] button[type="submit"]');
  await page.fill('#f-numeroImpianto', numero);
  await page.fill('#f-matricola', matricola);
  await page.fill('#f-indirizzo', 'Via Dante 3, Bergamo');
  await page.fill('#f-portataKg', '630');
  await page.fill('#f-fermate', '6');
  await tick(page, 'tipoImpianto', 'ELETTRICO');
  await tick(page, 'tipoPorte', 'AUTOMATICHE');
  await tick(page, 'doppioAccesso', 'si');
  // Pelazza's order first: its speed carries over to the model chosen later
  await tick(page, 'quadroMarca', 'PELAZZA');
  await tick(page, 'quadroOrdine', 'si');
  await page.waitForSelector('#f-oq', { state: 'visible' });
  await page.fill('#f-oq-velocita', '1,6');
  await tick(page, 'quadroMarca', 'MASTECH');
  await page.waitForSelector('#f-quadroModello', { state: 'visible' });
  assert.equal(await shown(page, '#f-oq') || await shown(page, '#f-mn') || await shown(page, '#f-mq'), false, 'no order before the model');
  await tick(page, 'quadroModello', 'NG120');
  await page.waitForSelector('#f-mn', { state: 'visible' });
  assert.equal(await shown(page, '#f-mq'), false, 'not QI Touch\'s order with NG120');
  assert.equal(await page.inputValue('#f-mn-nFermate'), '6', 'NG120: the stops of the sheet');
  assert.equal(await page.inputValue('#f-mn-velocita'), '1,6', 'NG120: the speed of the order chosen before');
  assert.notEqual(await page.inputValue('#f-mn-cliente'), '', 'NG120: the company');
  assert.ok(await page.isChecked('#f-mn-op1Automatico'), 'NG120: the automatic doors of the sheet');
  assert.equal(await page.locator('#f-mn .rv-mrowtitle', { hasText: 'Norme di riferimento' }).count(), 1, 'NG120: its rows named');
  await tick(page, 'quadroModello', 'QI_TOUCH');
  await page.waitForSelector('#f-mq', { state: 'visible' });
  assert.equal(await shown(page, '#f-mn'), false, 'not NG120\'s order with QI Touch');
  for (const [id, value] of [['#f-mq-numeroFermate', '6'], ['#f-mq-portataNominale', '630'], ['#f-mq-numeroAccessi', '2'], ['#f-mq-tipoImpianto', 'Elettrico']]) {
    assert.equal(await page.inputValue(id), value, `QI Touch: ${id}`);
  }
  await tick(page, 'quadroModello', 'NG120');
  await page.waitForSelector('#f-mn', { state: 'visible' });

  step('Rilievi 988f3cf37: a hydraulic lift — «Centralina» in place of «Argano» and «Limitatore»; the print chosen');
  await tick(page, 'tipoImpianto', 'IDRAULICO');
  await page.waitForSelector('#s-centralina', { state: 'visible' });
  assert.deepEqual(await page.$$eval('input[name="tipoImpianto"]:checked', (els) => els.map((e) => e.value)), ['IDRAULICO'], 'one kind of lift');
  const sections = await visibleSections(page);
  assert.deepEqual(sections, ['impianto', 'ubicazione', 'tipologia', 'quadro', 'centralina', 'funi', 'cavi', 'serrature', 'allarme', 'note'],
    'no «Argano» nor «Limitatore» for a hydraulic lift');
  assert.deepEqual(await visibleIndex(page), sections, 'the index: the sections shown');
  assert.equal(await shown(page, '#f-tirantiFossaNumero') && !(await shown(page, '#f-tirantiContrappesoNumero')), true, 'the pit tie rods, not the counterweight\'s');
  assert.equal(await shown(page, '#f-centralinaMarca'), false, 'make and model with the answer');
  await tick(page, 'centralinaDaFare', 'si');
  await page.waitForSelector('#f-centralinaMarca', { state: 'visible' });
  assert.equal(await shown(page, '#f-emendamentoA3'), false, 'no A3 amendment for a new unit');
  await tick(page, 'centralinaDaFare', 'no');
  await page.waitForSelector('#f-emendamentoA3', { state: 'visible' });
  await page.fill('#f-centralinaMarca', 'GMV 3010');
  assert.equal(await shown(page, '#f-tuboFlessibile'), false, 'the hose with the amendment');
  await tick(page, 'emendamentoA3', 'si');
  await tick(page, 'tuboFlessibile', 'si');
  await page.waitForSelector('#f-tuboFlessibileLunghezzaM', { state: 'visible' });
  await page.fill('#f-tuboFlessibileDiametroMm', '25');
  await page.fill('#f-tuboFlessibileLunghezzaM', '3,5');
  await page.fill('#f-centralinaNote', 'Perdita alla valvola');
  await page.fill('#f-tirantiFossaNumero', '2');
  // the print: every section ticked at first (a hidden one's tick hidden with it), «Cavi» left out; the panel order in
  assert.equal(await page.$$eval('#f-stampa input[name="stampa"]:not(:checked)', (els) => els.length), 0, 'every section in the print at first');
  assert.equal(await shown(page, '#f-stampa label:has(> input[value="argano"])'), false, 'the hidden section\'s tick hidden');
  await tick(page, 'stampa', 'cavi');
  await tick(page, 'riepilogoOrdini', 'ordineQuadro');
  const sheetUrl = await save(page);
  const id = sheetUrl.split('/').pop();
  assert.ok((await page.textContent('#s-centralina'))?.includes('GMV 3010'), 'the sheet: «Centralina»');
  assert.equal(await page.locator('#s-argano, #s-limitatore').count(), 0, 'the sheet: no «Argano» nor «Limitatore»');
  for (const [path, status] of [['ordine-quadro-mastech-ng120', 200], ['ordine-quadro-mastech-qi-touch', 404], ['ordine-quadro', 404], ['dati-argano', 404]]) {
    const res = await page.request.get(`${BASE}/api/rilievi/${id}/${path}`);
    assert.equal(res.status(), status, `${path}: ${status}`);
    if (status === 200) assert.match(res.headers()['content-disposition'] ?? '', new RegExp(`ordine-quadro-mastech-ng120-${numero}-`), 'NG120: its file name');
  }
  await page.goto(`${sheetUrl}/stampa`);
  await page.waitForSelector('.rv-paper');
  const printed = await titles(page, '.rv-paper-sec h2');
  assert.ok(printed.includes('Centralina') && !printed.includes('Cavi') && !printed.includes('Argano'), `the print: the sections chosen (${printed.join(' | ')})`);
  assert.ok(printed.some((title) => title.includes('NG120') && title.includes('Mastech')), 'the print: the NG120 order, asked');

  step('Rilievi 988f3cf37: MoviLift — no e-mail of the person writing, an emptied field stays empty, the photocell\'s voltage');
  const numero2 = `${numero}1`;
  await page.goto(`${BASE}/it/app/rilievi/nuovo`);
  await hydrated(page, 'form[data-scheda-form][data-live] button[type="submit"]');
  await page.fill('#f-numeroImpianto', numero2);
  await tick(page, 'quadroMarca', 'MOVILIFT');
  await tick(page, 'quadroOrdine', 'si');
  await page.waitForSelector('#f-om', { state: 'visible' });
  assert.equal(await page.inputValue('#f-om-email'), '', 'not the e-mail of the person writing');
  assert.notEqual(await page.inputValue('#f-om-ragioneSociale'), '', 'the company');
  await page.fill('#f-om-ragioneSociale', '');
  await tick(page, 'om-fotocellula', 'si');
  await page.fill('#f-om-fotocellulaV', '24');
  const movilift = await save(page);
  await page.goto(`${movilift}/modifica`);
  await hydrated(page, 'form[data-scheda-form][data-live] button[type="submit"]');
  await page.fill('#f-numeroImpianto', `${numero2}2`);
  assert.equal(await page.inputValue('#f-om-ragioneSociale'), '', 'the emptied company does not come back');
  assert.equal(await page.inputValue('#f-om-riferimento'), `N° ${numero2}`, 'the saved reference does not follow the sheet');
  assert.equal(await page.inputValue('#f-om-fotocellulaV'), '24', 'the photocell\'s voltage saved');
  // nothing to save: leave the edited form (it asks before leaving)
  const leave = (d) => void d.accept();
  page.on('dialog', leave);
  try {
    await page.goto(movilift);
  } finally {
    page.off('dialog', leave);
  }
  return { id };
}
