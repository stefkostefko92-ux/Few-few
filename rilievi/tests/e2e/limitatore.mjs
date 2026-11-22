// The overspeed governor calculation in a real browser (the owner, 5 November 2026 — from the workbook
// Limitatore_velocita_EN81-20-2020.xlsx; 7 November — only the speed of the lift and the type of safety
// gear, and the result without long explanations; then the standard in force when the lift was installed
// and what else is changed): the button on the scheda, four fields (axe; aligned at
// 360 and 1280 px), the example of the sheet typed in and saved, the V1 to set, no horizontal scroll on a
// phone, the PDF. Then the page in the menu: the number of the lift leads straight to this calculation.
import { join } from 'node:path';
import { aligned, audit, fail } from './helpers.mjs';

export async function checkLimitatore(page, { shots, scheme, sheetUrl }) {
  const name = `${scheme} calcolo limitatore`;
  const { origin, pathname: sheetPath } = new URL(sheetUrl);
  await page.goto(sheetUrl);
  await page.click(`a[href="${sheetPath}/calcolo-limitatore"]`);
  await page.waitForURL(/\/calcolo-limitatore$/);
  const campi = await page.locator('form.form .input, form.form .select').count();
  if (campi !== 4) fail(`${name}: ${campi} fields instead of 4`);
  await audit(page, `${name} form`);
  const viewport = page.viewportSize();
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: viewport.height });
    await aligned(page, `${name} form @${width}px`);
  }
  await page.setViewportSize(viewport);
  await page.fill('#f-vn', '1,6');
  await page.selectOption('#f-tipo', 'progressivo');
  await page.selectOption('#f-norma', 'en81-20-2020');
  await page.selectOption('#f-intervento', 'limitatore');
  await page.click('form.form button[type=submit]');
  await page.waitForURL(/\/calcolo-limitatore#risultati$/);
  if (await page.locator('#error-summary').count()) fail(`${name}: the form was refused`);
  const esito = async (key) =>
    ((await page.textContent(`[data-esito="${key}"]`)) ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/\u2060/g, '')
      .trim();
  const attesi = {
    v1: 'da 1,84 a 2,15 m/s',
    limite: 'da 1,84 m/s (incluso) a 2,15625 m/s (escluso)',
    contatto: 'Prima di V1',
    applicata: 'UNI EN 81-20:2020 — UNI 10411-11:2024, punto 18',
  };
  for (const [key, atteso] of Object.entries(attesi)) {
    const valore = await esito(key);
    if (valore !== atteso) fail(`${name}: ${key} is "${valore}", not "${atteso}"`);
  }
  await audit(page, `${name} result`);
  await page.screenshot({ path: join(shots, `${scheme}-calcolo-limitatore.png`), fullPage: true });
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
  await page.click('main form[role=search] button');
  await page.waitForURL(new RegExp(`${sheetPath}/calcolo-limitatore$`));
}
