// The stop sign "Avviso di fermo impianto" in a real browser (the owner, 30 October 2026): the side bar
// with the Master group apart from Amministrazione, the company data and the sign template chosen in the
// company settings (a wrong email is refused and the typed values come back), a new sign — refused without
// the text, then saved, its PDF (A4 landscape for the yellow-and-black template), changed, listed and
// deleted. axe on every page of it.
import { join } from 'node:path';
import { audit, fail } from './helpers.mjs';

/** Every image of the page loaded (the lazy ones too): no broken template thumbnail. */
async function imagesLoaded(page, selector, name) {
  const broken = await page.locator(selector).evaluateAll(async (images) => {
    for (const img of images) img.loading = 'eager';
    await Promise.all(images.map((img) => (img.complete ? null : img.decode().catch(() => null))));
    return images.filter((img) => img.naturalWidth === 0).length;
  });
  if (broken) fail(`${name}: ${broken} template thumbnail(s) not loaded`);
}

export async function checkCartelli(page, { base, shots, scheme, aziendaPath }) {
  const aziendaId = aziendaPath.split('/').pop();
  const name = `${scheme} cartello`;

  await page.goto(`${base}/cartelli`);
  const groupOf = (href) =>
    page
      .locator(`#sidenav a[href="${href}"]`)
      .evaluate((a) => a.closest('ul')?.getAttribute('aria-labelledby') ?? '');
  for (const [href, group] of [
    ['/aziende', 'nav-master'],
    ['/richieste', 'nav-master'],
    ['/utenti', 'nav-amministrazione'],
    ['/impostazioni', 'nav-amministrazione'],
    ['/cartelli', 'nav-assistenza'],
  ]) {
    const found = await groupOf(href);
    if (found !== group) fail(`${name}: ${href} is in "${found}", not "${group}"`);
  }

  // The company data: a wrong email is refused and what was typed comes back.
  const settings = `${base}/impostazioni?azienda=${aziendaId}`;
  await page.goto(settings);
  await page.fill('#d-ragioneSociale', 'Ascensori E2E S.r.l.');
  await page.fill('#d-email', 'non-una-email');
  await page.click('form[action="/impostazioni/dati"] button[type=submit]');
  await page.waitForSelector('#err-d-email');
  if ((await page.inputValue('#d-ragioneSociale')) !== 'Ascensori E2E S.r.l.')
    fail(`${name}: the typed company name did not come back after the error`);
  await audit(page, `${name} settings error`);
  for (const [key, value] of [
    ['indirizzo', 'Via Roma 12'],
    ['cap', '20121'],
    ['citta', 'Milano'],
    ['provincia', 'MI'],
    ['telefono', '02 1234567'],
    ['email', 'info@ascensori-e2e.example'],
    ['partitaIva', '01234567890'],
    ['sito', 'www.ascensori-e2e.example'],
  ])
    await page.fill(`#d-${key}`, value);
  await page.click('form[action="/impostazioni/dati"] button[type=submit]');
  await page.waitForURL(/\/impostazioni\?azienda=/);
  if (!(await page.locator('.flash').count()))
    fail(`${name}: no confirmation for the company data`);
  if ((await page.inputValue('#d-citta')) !== 'Milano') fail(`${name}: the company data not saved`);

  // The template: the yellow-and-black one, with every thumbnail loaded.
  await imagesLoaded(page, '.modelli__img', name);
  await page.locator('input[name=modello][value=giallo-nero]').evaluate((input) => input.click());
  await page.click('form[action="/impostazioni/cartello"] button[type=submit]');
  await page.waitForURL(/\/impostazioni\?azienda=/);
  const inUso = await page
    .locator('.modelli__item', { has: page.locator('.stato') })
    .locator('input')
    .getAttribute('value');
  if (inUso !== 'giallo-nero') fail(`${name}: the template in use is ${inUso}, not giallo-nero`);

  // A new sign: refused without the text, then saved.
  await page.goto(`${base}/cartelli/nuovo`);
  await page.selectOption('#f-azienda', aziendaId);
  await page.fill('#f-indirizzo', 'Via Monte Santo 8');
  await page.click('form.form button[type=submit]');
  await page.waitForSelector('#err-testo');
  if ((await page.inputValue('#f-indirizzo')) !== 'Via Monte Santo 8')
    fail(`${name}: the address did not come back after the error`);
  await audit(page, `${name} errors`);
  await page.fill('#f-citta', 'Milano');
  await page.fill('#f-ubicazione', 'Scala B');
  await page.fill(
    '#f-testo',
    "Si comunica che dal giorno 3/11 l'impianto è fermo per lavori di ammodernamento.",
  );
  await page.click('form.form button[type=submit]');
  await page.waitForURL(/\/cartelli\/[a-z0-9]+$/);
  const url = page.url();
  await imagesLoaded(page, '.cartello__anteprima', name);
  await audit(page, name);
  await page.screenshot({ path: join(shots, `${scheme}-cartello.png`), fullPage: true });

  const pdf = await page.request.get(`${url}/pdf`);
  const bytes = await pdf.body();
  if (pdf.status() !== 200 || pdf.headers()['content-type'] !== 'application/pdf')
    fail(`${name}: PDF answered ${pdf.status()} ${pdf.headers()['content-type']}`);
  else if (bytes.subarray(0, 5).toString() !== '%PDF-') fail(`${name}: the PDF is not a PDF`);
  else if (!bytes.includes('/MediaBox [0 0 841.89 595.28]'))
    fail(`${name}: the yellow-and-black sign is not on A4 landscape`);

  await page.goto(`${url}/modifica`);
  await page.fill('#f-ubicazione', 'Scala C');
  await page.click('form.form button[type=submit]');
  await page.waitForURL(url);
  if (!(await page.textContent('.cartello')).includes('Scala C'))
    fail(`${name}: the change was not saved`);

  await page.goto(`${base}/cartelli?azienda=${aziendaId}`);
  if (!(await page.locator(`a[href="${new URL(url).pathname}"]`).count()))
    fail(`${name}: the sign is not in the list`);
  await audit(page, `${scheme} cartelli`);
  await page.screenshot({ path: join(shots, `${scheme}-cartelli.png`), fullPage: true });

  await page.goto(url);
  await page.click('.danger-zone summary');
  await page.click('form[action$="/elimina"] button[type=submit]');
  await page.waitForURL(/\/cartelli$/);
  const gone = await page.request.get(url);
  if (gone.status() !== 404) fail(`${name}: the deleted sign answers ${gone.status()}`);
}
