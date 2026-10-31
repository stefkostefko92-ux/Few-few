// The machine calculation of a scheda in a real browser (the owner, 31 October 2026 — from the RT-E MOD
// workbook): the button on the scheda, the form (axe), the first case of the workbook typed in and saved,
// the results by section with OK/NO, the PDF. axe on the form and on the results.
import { join } from 'node:path';
import { audit, fail } from './helpers.mjs';

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

export async function checkArgano(page, { shots, scheme, sheetUrl }) {
  const name = `${scheme} calcolo argano`;
  const sheetPath = new URL(sheetUrl).pathname;
  await page.goto(sheetUrl);
  await page.click(`a[href="${sheetPath}/calcolo-argano"]`);
  await page.waitForURL(/\/calcolo-argano$/);
  await audit(page, `${name} form`);
  for (const [key, value] of Object.entries(NUMERI)) await page.fill(`#f-${key}`, value);
  for (const [key, value] of Object.entries(SCELTE)) await page.selectOption(`#f-${key}`, value);
  await page.locator('#f-funiSostituzione').evaluate((input) => {
    if (!input.checked) input.click();
  });
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
}
