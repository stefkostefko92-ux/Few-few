// The smoke test's survey sheets (Rilievi, round 41, synced with rilievi ae6329cb6), in the browser as a technician would
// use them: the menu item, a new sheet that opens on «Impianto» (the sheet's head and plate), its conditional fields in a
// chain (doors → «Pattino retrattile da cambiare», «Accessi 1 / 2»; locks and suspensions to change → their numbers),
// the text «Ubicazione cassettina», three stops with their old push-button panels' measurements, three suppliers' modules
// (Pelazza's order, the argano data sheet, 2SG's sheet) filled from the survey and following it while it is typed;
// saved; found again by its matricola with the live search; its PDF and the modules' PDFs (the other make's 404); the A4
// print page with the new head (the address under the title, the work order, the plate without the address); a field
// refused with its error and the input kept; two windows saving the same sheet (the second sees the conflict, keeps its
// input, saves knowingly, the notice focused); leaving a form with unsaved changes through the app's links, «Esci» or the
// top bar's search asks first; the page after a save opens at its top; the whole row of the list opens the sheet; the
// tab named after the sheet; the activity log; to the trash and back. The linked data, the confirmation, MoviLift, the
// modules in the print and the company's order of the sections are smoke-rilievi-sync.mjs. Returns the sheet's address
// for the isolation check.
import assert from 'node:assert/strict';
import { step } from './smoke-kit.mjs';

/** Ticks a box of the form through its label (the input itself is drawn by the label's square). */
const tick = (page, name, value) => page.click(`form[data-scheda-form] label:has(> input[name="${name}"][value="${value}"])`);

async function pdfOf(page, url, name) {
  const res = await page.request.get(url);
  assert.equal(res.status(), 200, `${name}: ${res.status()}`);
  assert.equal(res.headers()['content-type'], 'application/pdf', name);
  assert.equal((await res.body()).subarray(0, 5).toString('latin1'), '%PDF-', name);
  return res.headers()['content-disposition'] ?? '';
}

export async function rilieviFlow({ BASE, page, hydrated }) {
  const digits = String(Date.now()).slice(-9), numero = `7${digits.slice(-5)}`, matricola = `0${digits}`;

  step('Rilievi: the sidebar item, a new sheet with a chain of conditions, 3 stops measured, three modules');
  await page.goto(`${BASE}/it/app/rilievi`);
  assert.equal(await page.locator('.ws-nav a[href$="/app"][aria-current="true"]').count(), 1, 'Rilievi (the home) marked in the sidebar');
  await page.click('main a[href$="/app/rilievi/nuovo"]');
  await page.waitForURL(/\/app\/rilievi\/nuovo$/);
  await hydrated(page, 'form[data-scheda-form][data-live] button[type="submit"]');
  assert.match(await page.inputValue('#f-data'), /^\d{4}-\d{2}-\d{2}$/, 'today by default');
  assert.equal((await page.textContent('#s-impianto > legend'))?.replace(/^\d+/, ''), 'Impianto', 'section 1 is «Impianto»');
  for (const id of ['#f-data', '#f-indirizzo', '#f-buonoLavoro', '#f-matricola', '#f-numeroImpianto', '#f-portataKg', '#f-fermate', '#f-marca']) {
    assert.equal(await page.locator(`#s-impianto ${id}`).count(), 1, `${id} in «Impianto» (the head and the plate)`);
  }
  for (const id of ['#f-operatoreMarca', '#f-pattinoRetrattile', '#f-doppioAccesso', '#f-serratureNumero', '#f-sospensioniNumero', '#f-misure', '#f-oq', '#f-om', '#f-pa', '#f-sg']) {
    assert.equal(await page.isVisible(id), false, `${id} hidden at first`);
  }
  await page.fill('#f-numeroImpianto', numero);
  await page.fill('#f-matricola', matricola);
  await page.fill('#f-indirizzo', 'Via Giuseppe Verdi 14, Milano');
  await page.fill('#f-buonoLavoro', 'BL-2026/77');
  await page.fill('#f-portataKg', '630');
  await page.fill('#f-fermate', '3');
  await page.fill('#f-ubicazioneCassettina', 'Piano -1, vano contatori');
  await tick(page, 'tipoPorte', 'MANUALI');
  await page.waitForSelector('#f-pattinoRetrattile', { state: 'visible' });
  assert.equal(await page.isVisible('#f-operatoreMarca'), false, 'no operator with manual doors');
  assert.deepEqual(await page.$$eval('#f-doppioAccesso label', (ls) => ls.map((l) => l.textContent.trim())), ['1', '2'], '«Accessi»: 1 / 2');
  await tick(page, 'pattinoRetrattile', 'si');
  await tick(page, 'doppioAccesso', 'si');
  await tick(page, 'tipoPorte', 'AUTOMATICHE');
  await page.waitForSelector('#f-operatoreMarca', { state: 'visible' });
  await page.fill('#f-operatoreMarca', 'Wittur');
  await tick(page, 'serrature', 'si');
  await page.waitForSelector('#f-serratureNumero', { state: 'visible' });
  await page.fill('#f-serratureNumero', '4');
  await tick(page, 'bottoniereMisure', 'si');
  await page.waitForSelector('#f-misure', { state: 'visible' });
  assert.equal(await page.locator('fieldset[data-misura]:visible').count(), 3, 'a row per stop');
  await page.fill('#f-mb-1-piano', 'T');
  await page.fill('#f-mb-2-lunghezzaMm', '320,5');
  await tick(page, 'mb-3-display', 'si');
  await tick(page, 'quadroMarca', 'PELAZZA');
  await tick(page, 'quadroOrdine', 'si');
  await page.waitForSelector('#f-oq', { state: 'visible' });
  assert.equal(await page.isVisible('#f-om'), false, 'MoviLift closed with Pelazza');
  assert.equal(await page.inputValue('#f-oq-nFermate'), '3', 'Pelazza: the stops from the survey');
  assert.equal(await page.inputValue('#f-oq-nAccessi'), '2', 'Pelazza: the accesses from «Accessi»');
  assert.ok(await page.isChecked('#f-oq-porteManuali') && await page.isChecked('#f-oq-porteAutomatiche'), 'Pelazza: the doors ticked');
  assert.match(await page.inputValue('#f-oq-rifImpianto'), new RegExp(`N° ${numero} — Matr\\. ${matricola}`), 'Pelazza: the reference');
  assert.notEqual(await page.inputValue('#f-oq-cliente'), '', 'Pelazza: the company');
  await tick(page, 'arganoPreventivo', 'si');
  await page.waitForSelector('#f-pa', { state: 'visible' });
  assert.equal(await page.inputValue('#f-pa-portata'), '630', 'the argano sheet: the load');
  assert.equal(await page.inputValue('#f-pa-matricola'), matricola, 'the argano sheet: the matricola');
  await tick(page, 'sospensioni', 'si');
  await page.waitForSelector('#f-sospensioniNumero', { state: 'visible' });
  await page.waitForSelector('#f-sg', { state: 'visible' });
  await page.fill('#f-sospensioniNumero', '2');
  assert.ok(await page.isChecked('#f-sg-automatico'), '2SG: the automatic doors from the survey');
  assert.equal(await page.locator('form[data-scheda-form] .rv-mdiff:visible').count(), 0, 'nothing disagrees');
  assert.equal(await page.isVisible('.rv-dirty'), true, 'unsaved changes said');
  await Promise.all([page.waitForURL(/\/app\/rilievi\/[a-z0-9]{20,40}$/), page.click('form[data-scheda-form] button[type="submit"]')]);
  const sheetUrl = page.url().replace(/\?.*$/, '');
  const id = sheetUrl.split('/').pop();
  await page.waitForSelector('.rv-flash');
  assert.equal((await page.textContent('.rv-flash'))?.trim(), 'Scheda salvata.');
  assert.equal((await page.textContent('h1'))?.trim(), `Impianto n° ${numero}`);
  assert.deepEqual(await page.locator('.rv-plate .rv-plate-big').allTextContents(), [matricola, numero], 'the plate: the matricola, then the number');
  assert.equal(await page.locator('.rv-mtable tbody tr').count(), 3, 'the measurements per stop');
  assert.ok((await page.textContent('#s-tipologia'))?.includes('Pattino retrattile'), 'the chain stored');
  assert.ok((await page.textContent('#s-ubicazione'))?.includes('Piano -1, vano contatori'), 'the box\'s place as text');
  for (const path of ['ordine-quadro', 'dati-argano', 'sospensioni-2sg']) assert.equal(await page.locator(`a[href="/api/rilievi/${id}/${path}"]`).count(), 1, `link to ${path}`);
  assert.equal(await page.locator('.rv-diffnote').count(), 0, 'no data that disagree');

  step('Rilievi: found by its matricola (live search), its PDF and the open modules\' (the others 404), the print page with the new head');
  await page.goto(`${BASE}/it/app/rilievi`);
  await hydrated(page, '#q');
  await page.fill('#q', matricola);
  await page.waitForURL((u) => u.searchParams.get('q') === matricola);
  await page.waitForSelector(`#results a[href$="/app/rilievi/${id}"]`);
  assert.equal(await page.locator('#results tbody tr').count(), 1, 'one sheet found');
  assert.equal((await page.textContent('#results tbody tr mark'))?.trim(), matricola, 'the matricola marked');
  assert.match((await page.textContent('#search-status')) ?? '', /^1 scheda per «/);
  // the whole row opens the sheet (a click on its address, not on the number)
  const cell = await page.locator('#results tbody tr td:nth-child(3)').boundingBox();
  await Promise.all([page.waitForURL(new RegExp(`/app/rilievi/${id}$`)), page.mouse.click(cell.x + cell.width / 2, cell.y + 8)]);
  assert.equal(await page.title(), `Impianto n° ${numero} · LiftPilot`, 'the tab named after the sheet');
  assert.match(await pdfOf(page, `${BASE}/api/rilievi/${id}/pdf`, 'sheet PDF'), new RegExp(`^attachment; filename="scheda-${numero}-\\d{4}-\\d{2}-\\d{2}\\.pdf"$`));
  assert.match(await pdfOf(page, `${BASE}/api/rilievi/${id}/ordine-quadro`, 'Pelazza PDF'), new RegExp(`ordine-quadro-${numero}-`));
  assert.match(await pdfOf(page, `${BASE}/api/rilievi/${id}/dati-argano?inline=1`, 'argano sheet PDF'), /^inline; /);
  assert.match(await pdfOf(page, `${BASE}/api/rilievi/${id}/sospensioni-2sg`, '2SG PDF'), new RegExp(`sospensioni-2sg-${numero}-`));
  for (const path of ['ordine-quadro-movilift', 'preventivo-argano']) assert.equal((await page.request.get(`${BASE}/api/rilievi/${id}/${path}`)).status(), 404, `${path}: not open`);
  await page.goto(`${sheetUrl}/stampa`);
  await page.waitForSelector('.rv-paper');
  assert.equal(await page.title(), `Impianto n° ${numero} · LiftPilot`, 'the print named after the sheet («Salva come PDF»)');
  assert.equal((await page.textContent('.rv-paper-address'))?.trim(), 'Via Giuseppe Verdi 14, Milano', 'the print: the address under the title');
  assert.equal(await page.textContent('.rv-paper-buono strong'), 'BL-2026/77', 'the print: the work order');
  assert.equal(await page.locator('.rv-paper .rv-plate-address').count(), 0, 'the print: the plate without the address');
  assert.equal(await page.locator('.rv-paper-sec h2', { hasText: /^Impianto$/ }).count(), 0, 'the print: «Impianto» is the head, not a section');
  assert.equal(await page.locator('.rv-paper .rv-ptable tbody tr').count(), 3, 'the print: the stops');
  assert.ok((await page.textContent('.rv-paper-by'))?.startsWith('Compilata da'), 'the print: who filled it in');
  assert.equal(await page.textContent('.rv-paper-foot span[lang="en"]'), 'Created and Designed by Carbon Stealth VCC', 'the print: the credit marked as English');
  assert.equal(await page.locator('.rv-paper .rv-opt.on').filter({ hasText: 'Automatiche' }).count(), 1, 'the print: the boxes');
  assert.ok(!(await page.textContent('.rv-paper'))?.includes('Modulo d\'ordine quadri'), 'no module in the print unless asked');

  step('Rilievi: a refused field keeps the input; a save over a newer version is a conflict, then saved knowingly');
  await page.goto(`${sheetUrl}/modifica`);
  await hydrated(page, 'form[data-scheda-form][data-live] button[type="submit"]');
  await page.fill('#f-portataKg', '63O');
  await page.click('form[data-scheda-form] button[type="submit"]');
  await page.waitForSelector('#error-summary a[href="#f-portataKg"]');
  assert.equal(await page.inputValue('#f-portataKg'), '63O', 'the input kept');
  assert.equal(await page.evaluate(() => globalThis.document.activeElement?.id), 'error-summary', 'the summary focused');
  await page.fill('#f-portataKg', '630');
  // unsaved changes: the breadcrumb asks before leaving (the browser's own question), «Annulla», «Esci» and the top
  // bar's search too; staying keeps the input (and the session)
  const asked = [];
  const onDialog = (d) => { asked.push(d.type()); void d.dismiss(); };
  page.on('dialog', onDialog);
  await page.click('main nav.crumbs-nav a[href$="/app/rilievi"]');
  await page.click('form[data-scheda-form] .savebar a');
  await page.click('.ws-logout button[type="submit"]');
  await page.fill('#ws-q', matricola);
  await page.press('#ws-q', 'Enter');
  await page.waitForTimeout(500);
  page.off('dialog', onDialog);
  assert.deepEqual(asked, ['beforeunload', 'beforeunload', 'beforeunload', 'beforeunload'], 'leaving with unsaved changes asks first');
  assert.ok(page.url().endsWith('/modifica') && (await page.inputValue('#f-portataKg')) === '630', 'stayed, the input kept');
  assert.equal((await page.request.get(`${sheetUrl}/modifica`, { maxRedirects: 0 })).status(), 200, 'still signed in');
  // a second window of the same person (a new context with the session's cookie: newPage() pages own their context)
  const second = await page.context().browser().newContext({ viewport: { width: 1360, height: 900 } });
  await second.addCookies(await page.context().cookies());
  const other = await second.newPage();
  await other.goto(`${sheetUrl}/modifica`);
  await hydrated(other, 'form[data-scheda-form][data-live] button[type="submit"]');
  await other.fill('#f-marca', 'Schindler');
  await Promise.all([other.waitForURL(/\/app\/rilievi\/[a-z0-9]+$/), other.click('form[data-scheda-form] button[type="submit"]')]);
  await second.close();
  await page.fill('#f-marca', 'Otis');
  await page.click('form[data-scheda-form] button[type="submit"]');
  await page.waitForSelector('.rv-conflict');
  assert.equal(await page.inputValue('#f-marca'), 'Otis', 'the conflict keeps the input');
  assert.equal(await page.evaluate(() => globalThis.document.activeElement?.classList.contains('rv-conflict')), true, 'the notice focused (in view)');
  // saved knowingly from the bottom of the form: the sheet opens at its top, its notice in view
  await page.evaluate(() => globalThis.scrollTo(0, globalThis.document.body.scrollHeight));
  await Promise.all([page.waitForURL(/\/app\/rilievi\/[a-z0-9]+$/), page.click('form[data-scheda-form] button[type="submit"]')]);
  await page.waitForSelector('.rv-flash');
  assert.equal(await page.evaluate(() => globalThis.scrollY), 0, 'the saved sheet opens at its top');
  assert.ok((await page.textContent('.rv-plate-specs'))?.includes('Otis'), 'saved knowingly');

  step('Rilievi: the activity log, to the trash and back');
  await page.goto(`${BASE}/it/app/audit`);
  assert.ok(await page.locator(`main a[href$="/app/rilievi/${id}"]`).count() >= 1, 'the sheet in the activity log');
  await page.goto(sheetUrl);
  await page.click(`main a[href$="/app/rilievi/${id}/elimina"]`);
  await page.waitForURL(/\/elimina$/);
  await hydrated(page, 'main form button[type="submit"]');
  await Promise.all([page.waitForURL(/\/app\/rilievi$/), page.click('main form button[type="submit"]')]);
  assert.equal((await page.textContent('.rv-flash'))?.trim(), 'Scheda spostata nel cestino.');
  await page.goto(`${BASE}/it/app/rilievi?q=${matricola}`);
  assert.equal(await page.locator('#results tbody tr').count(), 0, 'not in the list any more');
  await page.goto(`${BASE}/it/app/rilievi/cestino`);
  const row = page.locator(`#results tr:has(a[href$="/app/rilievi/${id}"])`);
  assert.equal(await row.count(), 1, 'in the trash');
  await hydrated(page, `#results tr:has(a[href$="/app/rilievi/${id}"]) form button`);
  await Promise.all([page.waitForURL(new RegExp(`/app/rilievi/${id}$`)), row.locator('form button').click()]);
  assert.equal((await page.textContent('.rv-flash'))?.trim(), 'Scheda ripristinata.');
  return { sheetUrl, id };
}
