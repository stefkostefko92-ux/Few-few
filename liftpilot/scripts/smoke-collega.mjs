// The smoke test's survey and installation (round 44): a survey sheet with its plate, load, stops, machine below and
// ropes → «Crea impianto» from its link panel (the new installation's form prefilled from it, marked «dal rilievo», the
// module to choose: none preselected, a save without it asks for it) → the installation's comparison with nothing saved
// yet: neutral, not green → a machine replacement whose calculator starts from the measured values (the load marked; a
// value typed over it is the user's) → saved with a load changed and the machine above → the installation's page: the
// four steps, its survey, the comparison saying the load is a planned modification and the machine's place a probable
// error → «Usa il valore del rilievo» opens the calculator with the measured place in, said on top → a second survey of
// the same matricola: the installation suggested with why, linked → the installation lists both → one unlinked from the
// installation's page → the start page: the figures (the differences' one opens its installations) and the recent
// surveys with their link; an old address of the installations' list.
import assert from 'node:assert/strict';
import { step } from './smoke-kit.mjs';

const tick = (page, name, value) => page.click(`form[data-scheda-form] label:has(> input[name="${name}"][value="${value}"])`);

/** A new survey sheet saved with these fields (#f-<key> → value; `checks`: name → value ticked); its address. */
async function newSheet({ BASE, page, hydrated }, fields, checks = {}) {
  await page.goto(`${BASE}/it/app/rilievi/nuovo`);
  await hydrated(page, 'form[data-scheda-form][data-live] button[type="submit"]');
  for (const [k, v] of Object.entries(fields)) await page.fill(`#f-${k}`, v);
  for (const [name, value] of Object.entries(checks)) await tick(page, name, value);
  await Promise.all([page.waitForURL(/\/app\/rilievi\/[a-z0-9]{20,40}$/), page.click('form[data-scheda-form] button[type="submit"]')]);
  return page.url().replace(/\?.*$/, '');
}

export async function collegaFlow({ BASE, page, hydrated, stamp }) {
  const digits = String(Date.now()).slice(-8), matricola = `0${digits}`, numero = `9${digits.slice(-5)}`, indirizzo = `Via Collega ${stamp} 3, Milano`;

  step('survey and installation: a survey, «Crea impianto» from its panel, prefilled from it');
  const sheetUrl = await newSheet({ BASE, page, hydrated },
    { numeroImpianto: numero, matricola, indirizzo, portataKg: '630', fermate: '5', funiNumero: '4', funiDiametroMm: '10' }, { ubicazioneMacchina: 'BASSO' });
  const panel = page.locator('#collegamento');
  assert.match(await panel.textContent(), /non è collegato a un impianto/, 'a new survey belongs to no installation');
  // the panel is the page's, not the sheet's: never inside its sections
  assert.equal(await page.locator('form[data-scheda-form] #collegamento, .rv-sheet #collegamento').count(), 0, 'the panel outside the sheet');
  await Promise.all([page.waitForURL(/\/app\/projects\/new\?rilievo=/), panel.locator('a:has-text("Crea impianto")').click()]);
  await hydrated(page, 'main form button[type="submit"]');
  assert.equal(await page.inputValue('input[name="name"]'), indirizzo, 'the name from the survey');
  assert.equal(await page.inputValue('input[name="plantNumber"]'), matricola, 'the «Numero di matricola» from the survey');
  assert.ok(await page.locator('main form .badge.rilievo').count() >= 2, 'marked «dal rilievo»');
  assert.equal(await page.locator('input[name="kind"]:checked').count(), 0, 'the module asked: none preselected');
  await page.click('main form button[type="submit"]');
  await page.waitForSelector('#kind-choose.alert');
  assert.match(new URL(page.url()).pathname, /\/projects\/new$/, 'nothing created without the module');
  await page.click('label.app-module:has(input[name="kind"][value="REPLACEMENT"])');
  await Promise.all([page.waitForURL(/\/projects\/[a-z0-9]+\/calc$/), page.click('main form button[type="submit"]')]);
  const projectUrl = page.url().replace(/\/calc$/, '');

  step('survey and installation: before any calculation the comparison has nothing to compare — not green');
  await page.goto(projectUrl);
  const summary = page.locator('#confronto .panel-head .status-pill');
  assert.match(await summary.textContent(), /niente da confrontare/, 'said so');
  assert.doesNotMatch((await summary.getAttribute('class')) ?? '', /\bok\b/, 'not the green «all good»');
  await page.goto(`${projectUrl}/calc`);

  step('survey and installation: the calculator starts from the measured values; a value typed is the user\'s');
  await hydrated(page, '#Q');
  assert.match(await page.textContent('.lk-avviso'), /parte dal rilievo/, 'the survey it starts from, said on top');
  assert.equal(await page.inputValue('#Q'), '630', 'the load from the survey');
  assert.equal(await page.locator('label[for="Q"] .badge.rilievo').count(), 1, 'the load marked «dal rilievo»');
  await page.fill('#Q', '480');
  await page.waitForSelector('label[for="Q"] .badge.rilievo', { state: 'detached' });
  // the example fills what the survey does not say (the machine above, its ropes Ø 11); the load typed over it again
  await page.click('.controls button:has-text("Esempio C")');
  await page.waitForSelector('.verdict .big');
  await page.fill('#Q', '480');
  await page.waitForSelector('.savebar button.primary:not([disabled])');
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+$/, { timeout: 30000 }), page.click('.savebar button.primary')]);

  step('survey and installation: the steps, the survey and the comparison on the installation\'s page');
  await page.goto(projectUrl);
  assert.equal(await page.locator('.lk-steps > li').count(), 4, 'four steps');
  assert.equal(await page.locator('#rilievi .lk-rilievi-list > li').count(), 1, 'its survey');
  const row = (p) => page.locator(`#confronto tr[data-param="${p}"]`);
  assert.match((await row('Q').getAttribute('class')) ?? '', /\blk-mod\b/, 'the load: a planned modification');
  assert.match(await row('Q').textContent(), /collaudo/, 'the acceptance test told');
  assert.match((await row('posizione').getAttribute('class')) ?? '', /\blk-diff\b/, 'the machine\'s place: a probable error');
  assert.match((await row('funiNumero').getAttribute('class')) ?? '', /\blk-ok\b/, 'the ropes\' number: the same');
  assert.match((await row('funiDiametro').getAttribute('class')) ?? '', /\blk-diff\b/, 'the ropes\' Ø: 10 measured, 11 calculated');

  step('survey and installation: «Usa il valore del rilievo» opens the calculator with it, nothing saved');
  await Promise.all([page.waitForURL(/\/calc\?usa=posizione$/), row('posizione').locator('a.lk-usa').click()]);
  await hydrated(page, '#Q');
  assert.match(await page.textContent('.lk-avviso .alert'), /Inserito il valore del rilievo per «[^»]+»: in basso/, 'what was put in');
  assert.equal(await page.inputValue('#layout'), 'bottom', 'the machine below');
  assert.equal(await page.inputValue('#Q'), '480', 'the rest as saved');

  step('survey and installation: a second survey of the same matricola — the installation suggested, linked, then unlinked');
  const second = await newSheet({ BASE, page, hydrated }, { matricola, indirizzo: `Via Collega ${stamp} 3, Milano`, portataKg: '480' });
  const offer = page.locator('#collegamento .lk-offer', { hasText: indirizzo });
  assert.equal(await offer.count(), 1, 'the installation suggested');
  assert.match(await offer.locator('.lk-reasons').textContent(), /stessa matricola/, 'why');
  await Promise.all([page.waitForURL(/\?lk=linked/), offer.locator('button[type="submit"]').click()]);
  assert.equal((await page.textContent('#collegamento .alert-ok'))?.trim(), 'Rilievo collegato all’impianto.');
  assert.equal((await page.textContent('#collegamento .lk-impianto-link'))?.trim(), indirizzo);
  await page.goto(projectUrl);
  assert.equal(await page.locator('#rilievi .lk-rilievi-list > li').count(), 2, 'both surveys');
  const secondId = second.split('/').pop();
  await Promise.all([page.waitForURL(/\?lk=unlinked/),
    page.locator(`#rilievi li:has(a[href$="/rilievi/${secondId}"]) button[type="submit"]`).click()]);
  assert.equal(await page.locator('#rilievi .lk-rilievi-list > li').count(), 1, 'one left');
  assert.equal(await page.locator(`#rilievi a[href$="/rilievi/${sheetUrl.split('/').pop()}"]`).count(), 1, 'the first one');

  step('survey and installation: the start page — figures, recent surveys with their link; the old list address');
  await page.goto(`${BASE}/it/app`);
  assert.equal((await page.textContent('h1'))?.trim(), 'Rilievi');
  assert.equal(await page.locator('.lk-kpis .kpi-value').count(), 3, 'three figures');
  // the differences' figure opens its installations: this one among them (the machine's place differs)
  await Promise.all([page.waitForURL(/\/app\/impianti\?stato=differenze$/), page.click('.lk-kpis a.dash-kpi-diff')]);
  assert.match(await page.textContent('.dash-q'), /con differenze/, 'the filter said on top');
  assert.ok(await page.locator('.dash-row', { hasText: indirizzo }).count() === 1, 'the installation with differences listed');
  await page.goto(`${BASE}/it/app`);
  const recent = (id) => page.locator(`.lk-recent-table tr:has(a[href$="/rilievi/${id}"])`);
  assert.match(await recent(secondId).textContent(), /non collegato/, 'the second one, not linked');
  assert.equal(await recent(sheetUrl.split('/').pop()).locator('.lk-impianto-link').count(), 1, 'the first one, with its installation');
  await page.goto(`${BASE}/it/app?q=${encodeURIComponent(`Collega ${stamp}`)}`);
  assert.equal(new URL(page.url()).pathname, '/it/app/impianti', 'the old address of the list');
  assert.equal(await page.locator('.dash-row').count(), 1, 'its search kept');
}
