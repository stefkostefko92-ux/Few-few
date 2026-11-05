// The overspeed governor calculation in a real browser (the owner, 5 November 2026 — from the workbook
// Limitatore_velocita_EN81-20-2020.xlsx): the button on the scheda, the form in the sections of the sheet
// (axe; its rows aligned at 360 and 1280 px), the example of the sheet typed in and saved, the results row
// by row with the sheet's words and OK/NO, no horizontal scroll on a phone, the PDF. Then the page in the
// menu: the number of the lift leads straight to this calculation.
import { join } from 'node:path';
import { aligned, audit, fail } from './helpers.mjs';

const ESEMPIO = {
  vn: '1,6',
  v1: '2,1',
  vc: '1,9',
  forzaParacadute: '200',
  forzaLimitatore: '500',
  mbl: '25000',
  d: '8',
  dp: '240',
};

export async function checkLimitatore(page, { shots, scheme, sheetUrl }) {
  const name = `${scheme} calcolo limitatore`;
  const { origin, pathname: sheetPath } = new URL(sheetUrl);
  await page.goto(sheetUrl);
  await page.click(`a[href="${sheetPath}/calcolo-limitatore"]`);
  await page.waitForURL(/\/calcolo-limitatore$/);
  await audit(page, `${name} form`);
  const viewport = page.viewportSize();
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: viewport.height });
    await aligned(page, `${name} form @${width}px`);
  }
  await page.setViewportSize(viewport);
  for (const [key, value] of Object.entries(ESEMPIO)) await page.fill(`#f-${key}`, value);
  await page.selectOption('#f-tipo', 'progressivo');
  await page.click('form.form button[type=submit]');
  await page.waitForURL(/\/calcolo-limitatore#risultati$/);
  if (await page.locator('#error-summary').count()) fail(`${name}: the form was refused`);
  const sezioni = await page.locator('.argano__sezione').count();
  if (sezioni !== 4) fail(`${name}: ${sezioni} result sections instead of 4`);
  const riga = async (key) =>
    ((await page.textContent(`tr[data-riga="${key}"] td`)) ?? '').replace(/ /g, ' ').trim();
  const attesi = {
    sogliaMin: '1,84 m/s',
    sogliaMax: '2,15625 m/s',
    esitoV1: 'Entro i limiti',
    max2: '2,15 m/s',
    momento: 'Prima di V1',
    esitoContatto: 'Coerente con V1',
    forzaMinima: '400 N',
    mblMinimo: '4000 N',
    esitoRapporto: 'Sufficiente',
  };
  for (const [key, atteso] of Object.entries(attesi)) {
    const valore = await riga(key);
    if (valore !== atteso) fail(`${name}: ${key} is "${valore}", not "${atteso}"`);
  }
  if ((await page.locator('#risultati .esito--ok').count()) !== 5)
    fail(`${name}: not five checks marked OK`);
  await audit(page, `${name} results`);
  await page.locator('details.limitatore__riferimenti summary').click();
  await audit(page, `${name} references`);
  await page.screenshot({ path: join(shots, `${scheme}-calcolo-limitatore.png`), fullPage: true });
  // On a phone the result tables do not push the page sideways.
  await page.setViewportSize({ width: 320, height: viewport.height });
  const largo = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  if (largo) fail(`${name}: horizontal scroll at 320 px`);
  await page.setViewportSize(viewport);
  const pdf = await page.request.get(`${origin}${sheetPath}/calcolo-limitatore.pdf`);
  if (pdf.status() !== 200 || pdf.headers()['content-type'] !== 'application/pdf')
    fail(`${name}: the PDF answers ${pdf.status()}`);

  const head = (await page.textContent('.page-head__sub strong')).replace(/ /g, ' ');
  const numero = /N° impianto (\d+)/.exec(head)?.[1];
  if (!numero) return fail(`${name}: no lift number in the head (${head})`);
  await page.goto(`${origin}/calcolo-limitatore`);
  if (!(await page.locator('a[href="/calcolo-limitatore"][aria-current="page"]').count()))
    fail(`${name}: the page is not the current item of the menu`);
  await audit(page, `${name} list`);
  await page.fill('#f-cerca', numero);
  await page.click('form[role=search] button');
  await page.waitForURL(new RegExp(`${sheetPath}/calcolo-limitatore$`));
}
