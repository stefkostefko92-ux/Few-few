// "Buono di lavoro" in a real browser (the owner, 12 November 2026): the button on the scheda opens the form
// with the N° buono, matricola, location and the works of the scheda as rows; "Aggiungi una sequenza" adds a
// row; a row is signed with the mouse (optional: the other rows stay unsigned); on the page of the sheet the
// bottom signatures are optional too, and the first one closes the data until it is removed. axe and the
// three-lines alignment on every page of it.
import { join } from 'node:path';
import { aligned, audit, fail, tick } from './helpers.mjs';

/** A signature drawn with the mouse on the visible pad — its own random curve. */
async function sign(page, pad) {
  const wave = 0.25 + Math.random() * 0.1;
  const jitter = () => (Math.random() - 0.5) * 0.06;
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
}

export async function checkBuoni(page, { base, shots, scheme, sheetUrl }) {
  const name = `${scheme} buono`;
  await page.goto(`${base}/buoni`);
  const group = await page
    .locator('#sidenav a[href="/buoni"]')
    .evaluate((a) => a.closest('ul')?.getAttribute('aria-labelledby') ?? '');
  if (group !== 'nav-documenti') fail(`${name}: "/buoni" is in "${group}"`);
  await audit(page, `${name} list`);

  // From the scheda: N° buono, matricola, location and the works as rows.
  await page.goto(sheetUrl);
  await page.click('a[href^="/buoni/nuovo?scheda="]');
  await page.waitForURL(/\/buoni\/nuovo\?scheda=/);
  if (!(await page.inputValue('#f-ubicazione'))) fail(`${name}: the location is not filled in`);
  const prima = await page.locator('[data-buono-riga]').count();
  await page.click('[data-buono-aggiungi]');
  if ((await page.locator('[data-buono-riga]').count()) !== prima + 1)
    fail(`${name}: "Aggiungi una sequenza" adds no row`);
  await page.fill('#f-seq-0-descrizione', 'Smontaggio del quadro esistente');
  await tick(page, 'seq-0-esito', 'ok');
  await page.fill('#f-seq-0-fornitore', 'Pelazza');
  await page.locator('#seq-0 .buono-firma > summary').click();
  await sign(page, page.locator('#seq-0 [data-firma-canvas]'));
  if (!/^\{"s":\[\[\d/.test(await page.inputValue('input[name="seq-0-firma"]')))
    fail(`${name}: the row signature is not recorded`);
  await page.fill('#f-geometra', 'Geom. E2E');
  await tick(page, 'pos', 'si');
  await tick(page, 'ctl-limitatore-esito', 'nonOk');
  await page.fill('#f-tecnici', 'Bianchi, Verdi');
  await audit(page, `${name} form`);
  await aligned(page, `${name} form`);
  await page.screenshot({ path: join(shots, `${scheme}-buono-form.png`), fullPage: true });
  await page.click('.actions button[type=submit]');
  await page.waitForURL(/\/buoni\/[a-z0-9]+$/);
  const url = page.url();
  if (!(await page.getByText('Smontaggio del quadro esistente').count()))
    fail(`${name}: the written row is not on the sheet`);
  if ((await page.locator('svg.buono-firma-mini').count()) !== 1)
    fail(`${name}: the row signature is not shown`);
  await audit(page, `${name} sheet`);

  // The signed row: read only, "Togli la firma" in the form.
  await page.goto(`${url}/modifica`);
  if (!(await page.locator('.buono-riga--firmata button[name="togli"]').count()))
    fail(`${name}: the signed row offers no "Togli la firma"`);
  await audit(page, `${name} edit`);

  // A bottom signature (the custodian): the data close until it is removed.
  await page.goto(url);
  await page.locator('#firme .buono-firma > summary').first().click();
  await sign(page, page.locator('#firme [data-firma-canvas]').first());
  await page.click('#firme button[type=submit]:not([name])');
  await page.waitForURL(`${url}#firme`);
  if (await page.locator(`a[href="${new URL(url).pathname}/modifica"]`).count())
    fail(`${name}: "Modifica" still offered with a bottom signature`);
  await audit(page, `${name} signed`);
  await page.screenshot({ path: join(shots, `${scheme}-buono.png`), fullPage: true });
  const pdf = await page.request.get(`${url}/pdf`);
  const bytes = await pdf.body();
  if (pdf.status() !== 200 || bytes.subarray(0, 5).toString() !== '%PDF-') fail(`${name}: PDF`);
  await page.click('#firme button[name="togli"]');
  await page.waitForURL(`${url}#firme`);
  if (!(await page.locator(`a[href="${new URL(url).pathname}/modifica"]`).count()))
    fail(`${name}: "Modifica" not back after removing the bottom signature`);
}
