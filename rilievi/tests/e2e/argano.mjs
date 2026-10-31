// The machine calculation of a scheda in a real browser (the owner, 31 October 2026 — from the RT-E MOD
// workbook): the button on the scheda, the form (axe; its rows aligned at 360, 768 and 1280 px), the
// first case of the workbook typed in and saved, the results by section with OK/NO, the PDF. axe on the
// form and on the results. Then the page in the menu: the number of the lift leads straight to this
// calculation, and a lift without a scheda gets its own calculation — saved, drawn, deleted.
import { join } from 'node:path';
import { aligned, audit, fail } from './helpers.mjs';

const NUMERI = {
  portata: '480',
  massaCabina: '600',
  massaContrappeso: '840',
  velocita: '1',
  corsa: '20',
  giriMotore: '1400',
  rapportoB: '50',
  diametroPuleggia: '500',
  angoloGola: '40',
  angoloAvvolgimento: '180',
  funiNumero: '4',
};

const SCELTE = {
  sospensione: '1:1',
  macchina: 'alto',
  azionamento: '2V',
  rapportoA: '1',
  gola: 'cuneo',
  fune: 'telcal-10-114',
  compensazione: 'nessuna',
};

async function fillCase(page) {
  for (const [key, value] of Object.entries(NUMERI)) await page.fill(`#f-${key}`, value);
  for (const [key, value] of Object.entries(SCELTE)) await page.selectOption(`#f-${key}`, value);
  await page.locator('#f-funiSostituzione').evaluate((input) => {
    if (!input.checked) input.click();
  });
}

export async function checkArgano(page, { shots, scheme, sheetUrl, aziendaId }) {
  const name = `${scheme} calcolo argano`;
  const sheetPath = new URL(sheetUrl).pathname;
  await page.goto(sheetUrl);
  await page.click(`a[href="${sheetPath}/calcolo-argano"]`);
  await page.waitForURL(/\/calcolo-argano$/);
  await audit(page, `${name} form`);
  // The form on a phone, a tablet and a desktop: every row of fields on one line.
  const viewport = page.viewportSize();
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: viewport.height });
    await aligned(page, `${name} form @${width}px`);
  }
  await page.setViewportSize(viewport);
  await fillCase(page);
  await page.click('form.form button[type=submit]');
  await page.waitForURL(/\/calcolo-argano#risultati$/);
  if (await page.locator('#error-summary').count()) fail(`${name}: the form was refused`);
  const sezioni = await page.locator('.argano__sezione').count();
  if (sezioni !== 5) fail(`${name}: ${sezioni} result sections instead of 5`);
  const testo = await page.textContent('#risultati');
  // The first case of the workbook: 0,733 m/s from 1400 rpm, 1:50, Ø 500; traction 2,223 ≤ 2,286.
  for (const atteso of ['0,733 m/s', '2,223', '2,286', 'Aderenza verificata nei due casi'])
    if (!testo.includes(atteso)) fail(`${name}: "${atteso}" missing from the results`);
  await audit(page, `${name} results`);
  await page.screenshot({ path: join(shots, `${scheme}-calcolo-argano.png`), fullPage: true });
  const pdf = await page.request.get(`${new URL(sheetUrl).origin}${sheetPath}/calcolo-argano.pdf`);
  if (pdf.status() !== 200 || pdf.headers()['content-type'] !== 'application/pdf')
    fail(`${name}: the PDF answers ${pdf.status()}`);
  await checkMenuPage(page, { name, sheetPath, aziendaId, origin: new URL(sheetUrl).origin });
}

async function checkMenuPage(page, { name, sheetPath, aziendaId, origin }) {
  const head = (await page.textContent('.page-head__sub strong')).replace(/\u00a0/g, ' ');
  const numero = /N° impianto (\d+)/.exec(head)?.[1];
  if (!numero) return fail(`${name}: no lift number in the head (${head})`);
  await page.goto(`${origin}/calcolo-argano`);
  if (!(await page.locator('a[href="/calcolo-argano"][aria-current="page"]').count()))
    fail(`${name}: the calculation page is not the current item of the menu`);
  await audit(page, `${name} list`);
  await page.fill('#f-cerca', numero);
  await page.click('form[role=search] button');
  await page.waitForURL(new RegExp(`${sheetPath}/calcolo-argano$`));

  await page.goto(`${origin}/calcolo-argano/nuovo`);
  if (await page.locator('#f-azienda').count()) await page.selectOption('#f-azienda', aziendaId);
  const matricola = `09${String(Date.now()).slice(-7)}`;
  await page.fill('#f-indirizzo', 'Via Senza Scheda 1, 20121 Milano (MI)');
  await page.fill('#f-matricola', matricola);
  await fillCase(page);
  await audit(page, `${name} without scheda form`);
  const viewport = page.viewportSize();
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: viewport.height });
    await aligned(page, `${name} without scheda form @${width}px`);
  }
  await page.setViewportSize(viewport);
  await page.click('form.form button[type=submit]');
  await page.waitForURL(/\/calcolo-argano\/[a-z0-9]+#risultati$/);
  if (await page.locator('#error-summary').count())
    fail(`${name}: the free calculation was refused`);
  const sezioni = await page.locator('.argano__sezione').count();
  if (sezioni !== 5) fail(`${name}: ${sezioni} result sections without a scheda instead of 5`);
  const pagina = new URL(page.url()).pathname;
  const pdf = await page.request.get(`${origin}${pagina}/pdf`);
  if (pdf.status() !== 200) fail(`${name}: the PDF without a scheda answers ${pdf.status()}`);

  await page.goto(`${origin}/calcolo-argano?q=${matricola}`);
  if (!(await page.locator(`#h-liberi ~ ul a[href="${pagina}"]`).count()))
    fail(`${name}: the search does not find the calculation without a scheda`);
  await audit(page, `${name} search`);
  await page.goto(`${origin}${pagina}`);
  await page.locator('details.danger-zone summary').click();
  await page.click('details.danger-zone button[type=submit]');
  await page.waitForURL(/\/calcolo-argano$/);
  if ((await page.request.get(`${origin}${pagina}`)).status() !== 404)
    fail(`${name}: the deleted calculation is still there`);
}
