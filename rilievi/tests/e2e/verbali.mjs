// "Verbale di chiusura cantiere" in a real browser (the owner, 5 November 2026): the button on the scheda
// opens the form with only the address, the N° buono and today's date filled in; people write the rows,
// choose "Certificato" SÌ/NO where the sheet has it and "Verbale positivo"; "Firma e conferma" shows the
// final report read-only with its fingerprint and two pads under it (the technician and the supervisor);
// once signed: no "Modifica", the seal verified, two PDFs — the company copy and the installer copy. axe
// on every page of it.
import { join } from 'node:path';
import { audit, fail, tick } from './helpers.mjs';

/** A signature drawn with the mouse — its own random curve (strokes never repeat across documents). */
async function sign(page, index) {
  const wave = 0.3 - index * 0.12 - Math.random() * 0.05;
  const jitter = () => (Math.random() - 0.5) * 0.06;
  const pad = page.locator('[data-firma-canvas]').nth(index);
  await pad.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = await pad.boundingBox();
  await page.mouse.move(box.x + box.width * (0.1 + jitter()), box.y + box.height * 0.6);
  await page.mouse.down();
  for (let s = 1; s <= 16; s += 1)
    await page.mouse.move(
      box.x + box.width * (0.1 + s * 0.045),
      box.y + box.height * (0.6 - wave * Math.sin(s / 2) + jitter()),
    );
  await page.mouse.up();
  const value = await page.locator('[data-firma-input]').nth(index).inputValue();
  if (!/^\{"s":\[\[\d/.test(value)) fail(`verbale: signature ${index} not recorded`);
}

export async function checkVerbali(page, { base, shots, scheme, sheetUrl }) {
  const name = `${scheme} verbale`;
  await page.goto(`${base}/verbali`);
  const group = await page
    .locator('#sidenav a[href="/verbali"]')
    .evaluate((a) => a.closest('ul')?.getAttribute('aria-labelledby') ?? '');
  if (group !== 'nav-assistenza') fail(`${name}: "/verbali" is in "${group}"`);
  await audit(page, `${name} list`);

  // From the scheda: only the address, the N° buono and today's date.
  await page.goto(sheetUrl);
  await page.click('a[href^="/verbali/nuovo?scheda="]');
  await page.waitForURL(/\/verbali\/nuovo\?scheda=/);
  const oggi = await page.inputValue('#f-data');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(oggi)) fail(`${name}: no date of today (${oggi})`);
  if (!(await page.inputValue('#f-indirizzo'))) fail(`${name}: the address is not filled in`);
  for (const key of ['t-quadro', 't-cavi', 't-imbotti'])
    if (await page.inputValue(`#f-${key}`)) fail(`${name}: ${key} filled from the scheda`);
  if (await page.locator('input[type=radio]:checked').count())
    fail(`${name}: a choice already made for people`);
  await page.fill('#f-buono', 'BL E2E 118');
  await page.fill('#f-t-quadro', 'Quadro di manovra nuovo installato');
  await tick(page, 'c-quadro', 'si');
  await tick(page, 'c-funi', 'no');
  await page.fill('#f-t-serrature', 'Serrature regolate ai piani 0–5');
  await tick(page, 'c-serrature', 'si');
  await page.fill('#f-t-varieLocale', 'Pulizia del locale.\nSmaltimento del vecchio quadro.');
  await page.fill('#f-t-imbotti', 'Verniciati al piano terra');
  await tick(page, 'positivo', 'si');
  // A second touch on a chosen SÌ/NO clears it (data-clearable) — chosen again after.
  await page.locator('label:has(input[name="c-funi"][value="no"])').click();
  if (await page.locator('input[name="c-funi"]:checked').count())
    fail(`${name}: the "Certificato" choice does not clear`);
  await tick(page, 'c-funi', 'no');
  if (await page.locator('[data-firma-canvas]').count())
    fail(`${name}: the draft form offers a signature pad`);
  await audit(page, `${name} form`);
  await page.screenshot({ path: join(shots, `${scheme}-verbale-form.png`), fullPage: true });
  await page.click('.actions button[type=submit]');
  await page.waitForURL(/\/verbali\/[a-z0-9]+$/);
  const url = page.url();
  if ((await page.locator('.verbale-foglio__tab').count()) !== 4)
    fail(`${name}: the report does not show its four sections`);
  if (!(await page.getByText('Quadro di manovra nuovo installato').count()))
    fail(`${name}: the written row is not on the report`);
  await audit(page, `${name} draft`);

  await page.click('.intervento-conferma a[href$="/firma"]');
  await page.waitForURL(`${url}/firma`);
  const impronta = (await page.locator('.intervento-impronta .impronta').textContent())?.trim();
  if (!/^([0-9A-F]{4} ){15}[0-9A-F]{4}$/.test(impronta ?? ''))
    fail(`${name}: no fingerprint on the signing page (${impronta})`);
  await sign(page, 0);
  await sign(page, 1);
  await page.fill('#f-firmaTecnicoNome', 'Mario Rossi');
  await page.fill('#f-firmaSupervisoreNome', 'Anna Bianchi');
  await audit(page, `${name} firma`);
  await page.screenshot({ path: join(shots, `${scheme}-verbale-firma.png`), fullPage: true });
  await page.click('.intervento-firma .actions button[type=submit]');
  await page.waitForURL(url);
  if ((await page.locator('.foglio__firma path').count()) !== 2)
    fail(`${name}: the report does not show both signatures`);
  const stampata = (await page.locator('.foglio__impronta .impronta').textContent())?.trim();
  if (stampata !== impronta) fail(`${name}: the report shows another fingerprint (${stampata})`);
  if (await page.locator('a[href$="/modifica"]').count())
    fail(`${name}: "Modifica" still offered after the confirmation`);
  for (const copia of ['azienda', 'installatore']) {
    if (!(await page.locator(`a[href="${new URL(url).pathname}/pdf/${copia}"]`).count()))
      fail(`${name}: no link to the ${copia} copy`);
    const pdf = await page.request.get(`${url}/pdf/${copia}`);
    const bytes = await pdf.body();
    if (pdf.status() !== 200 || bytes.subarray(0, 5).toString() !== '%PDF-')
      fail(`${name}: PDF copia ${copia}`);
  }
  await audit(page, `${name} confirmed`);
  await page.screenshot({ path: join(shots, `${scheme}-verbale.png`), fullPage: true });
  await checkPdfInApp(page, { name, url });
}

/** The home-screen app on iOS, emulated: navigator.standalone on, the share sheet recorded. */
const comeApp = () => {
  Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true });
  window.__condiviso = null;
  Navigator.prototype.canShare = () => true;
  Navigator.prototype.share = async (data) => {
    const file = data.files[0];
    window.__condiviso = { name: file.name, type: file.type, size: file.size };
  };
};

/**
 * The app on the iPhone home screen cannot close a PDF (WebKit bug 290847): there a PDF link hands the
 * file to the share sheet and the app stays on its page (public/js/pdf-app.js). Emulated in Chromium:
 * navigator.standalone on, the share sheet recorded instead of shown.
 */
async function checkPdfInApp(page, { name, url }) {
  const app = await page.context().newPage();
  await app.addInitScript(comeApp);
  await app.goto(url);
  await app.locator('a[data-pdf][href$="/pdf/installatore"]').click();
  await app.waitForFunction(() => window.__condiviso !== null, null, { timeout: 15000 });
  const condiviso = await app.evaluate(() => window.__condiviso);
  if (condiviso.type !== 'application/pdf' || condiviso.size < 1000)
    fail(`${name}: the app shares ${JSON.stringify(condiviso)}, not the PDF`);
  if (!/copia-installatore\.pdf$/.test(condiviso.name))
    fail(`${name}: shared file named ${condiviso.name}`);
  if (app.url() !== url) fail(`${name}: the app left the page for the PDF (${app.url()})`);
  await app.close();
  await checkRefusedPdfInApp(page, { name, url });
}

/**
 * A PDF the server refuses with a redirect and a one-time message (a blocked seal: 303 back to the sheet,
 * the flash in its cookie): the app lands on the sheet WITH the message — a fetch that followed the
 * redirect itself would draw the sheet unseen and eat the message first. The refusal is staged by a route,
 * in a context of its own with the same session: no other tab to read the message, and no service worker
 * between the navigation and the route (Chromium lets a worker registered earlier bypass it).
 */
async function checkRefusedPdfInApp(page, { name, url }) {
  const context = await page
    .context()
    .browser()
    .newContext({ storageState: await page.context().storageState(), serviceWorkers: 'block' });
  const app = await context.newPage();
  await app.addInitScript(comeApp);
  await app.goto(url);
  await app.route('**/pdf/azienda', (route) =>
    route.fulfill({ status: 303, headers: { location: url } }),
  );
  await context.addCookies([
    {
      name: 'rilievi_flash',
      value: encodeURIComponent(
        JSON.stringify({ kind: 'error', key: 'verbali.sigillo.bloccato', params: {} }),
      ),
      url: new URL(url).origin,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await app.locator('a[data-pdf][href$="/pdf/azienda"]').click();
  const avvisato = await app
    .locator('.flash--error')
    .waitFor({ timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  if (!avvisato) fail(`${name}: the app lost the message of the refused PDF`);
  else if (app.url() !== url) fail(`${name}: the refused PDF led to ${app.url()}`);
  await context.close();
}
