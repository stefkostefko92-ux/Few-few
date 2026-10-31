// The intervention form in a real browser (the owner, 30 October 2026): the side bar with its groups, a
// new "Modulo di pronto intervento" filled and ticked like the paper pad and saved as a draft (no
// signature there), then "Firma e conferma": the final sheet read-only with its fingerprint, two
// signatures drawn with the mouse under it — then no "Modifica" any more, the seal verified, only the PDF
// and the email. On a phone the bar opens from ☰ over the page and Esc closes it, focus back on ☰. axe on
// every page of it.
import { join } from 'node:path';
import { audit, fail, tick } from './helpers.mjs';

/**
 * A signature drawn with the mouse in the pad — centred on screen, clear of the sticky save bar. Each pad
 * gets its own curve: the same strokes in both pads are refused (the customer did not sign).
 */
async function sign(page, index) {
  // Randomness on every point too: a signature already on another sheet (an earlier run on the same
  // database) is refused, and the pad keeps whole units — a small random wave alone repeats soon.
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
  if (!/^\{"s":\[\[\d/.test(value)) fail(`intervento: signature ${index} not recorded`);
}

export async function checkInterventi(page, { base, shots, scheme, aziendaName }) {
  // The bar: four groups for the MASTER (Master apart from the company's Amministrazione), the current
  // page marked.
  await page.goto(`${base}/interventi`);
  const groups = await page.locator('.sidenav__group').allTextContents();
  if (groups.join('|') !== 'Rilievi|Assistenza elevatori|Amministrazione|Master')
    fail(`${scheme}: side bar groups ${groups.join('|')}`);
  if (!(await page.locator('.sidenav a[aria-current="page"][href="/interventi"]').count()))
    fail(`${scheme}: "Interventi" not marked in the bar`);
  await audit(page, `${scheme} interventi`);

  await page.goto(`${base}/interventi/nuovo`);
  const azienda = page.locator('#f-azienda');
  if (await azienda.count()) await azienda.selectOption({ label: aziendaName });
  await page.fill('#f-indirizzo', 'Via Roma 12');
  await page.fill('#f-citta', 'Milano');
  await page.fill('#f-matricola', 'MI 4521');
  await tick(page, 'turno', 'MATTINA');
  for (const key of ['01', '05', '84', '97']) await tick(page, `v-${key}`, 'si');
  await page.fill('#f-q-05', '2');
  await page.fill('#f-q-84', 'piano 3');
  await tick(page, 'c-84', 'P');
  await page.fill('#f-altro', 'Sostituito pulsante di piano.');
  await tick(page, 'prove', 'si');
  await page.fill('#f-oreTecnico', '1,5');
  await page.fill('#f-oreTotali', '3');
  if (await page.locator('[data-firma-canvas]').count())
    fail(`${scheme}: the draft form offers a signature pad`);
  await audit(page, `${scheme} intervento form`);
  await page.screenshot({ path: join(shots, `${scheme}-intervento-form.png`), fullPage: true });
  await page.click('.actions button[type=submit]');
  await page.waitForURL(/\/interventi\/[a-z0-9]+$/);
  const url = page.url();
  if (!(await page.locator('.foglio li.is-on').count()))
    fail(`${scheme}: no ticked item on the sheet`);
  await audit(page, `${scheme} intervento draft`);

  // "Firma e conferma": the sheet read-only, its fingerprint, the two pads under it.
  await page.click('.intervento-conferma a[href$="/firma"]');
  await page.waitForURL(`${url}/firma`);
  const impronta = (await page.locator('.intervento-impronta .impronta').textContent())?.trim();
  if (!/^([0-9A-F]{4} ){15}[0-9A-F]{4}$/.test(impronta ?? ''))
    fail(`${scheme}: no fingerprint on the signing page (${impronta})`);
  if (!(await page.locator('.foglio li.is-on').count()))
    fail(`${scheme}: the signing page does not show the sheet`);
  if ((await page.inputValue('#f-firmaTecnicoNome')) === '')
    fail(`${scheme}: the technician's name is not filled in`);
  await sign(page, 0);
  await sign(page, 1);
  // "Cancella" empties a pad; the signature is drawn again.
  await page.locator('[data-firma-clear]').first().click();
  if (await page.locator('[data-firma-input]').first().inputValue())
    fail(`${scheme}: "Cancella" left the signature`);
  await sign(page, 0);
  await page.fill('#f-firmaTecnicoNome', 'Mario Rossi');
  await page.fill('#f-firmaClienteNome', 'Anna Bianchi');
  await audit(page, `${scheme} intervento firma`);
  await page.screenshot({ path: join(shots, `${scheme}-intervento-firma.png`), fullPage: true });
  await page.click('.intervento-firma .actions button[type=submit]');
  await page.waitForURL(url);
  if ((await page.locator('.foglio__firma path').count()) !== 2)
    fail(`${scheme}: the sheet does not show both signatures`);
  const stampata = (await page.locator('.foglio__impronta .impronta').textContent())?.trim();
  if (stampata !== impronta) fail(`${scheme}: the sheet shows another fingerprint (${stampata})`);
  if (await page.locator(`a[href$="/modifica"]`).count())
    fail(`${scheme}: "Modifica" still offered after the confirmation`);
  if (!(await page.locator('.intervento-email').isVisible()))
    fail(`${scheme}: no email form on the confirmed sheet`);
  const pdf = await page.request.get(`${url}/pdf`);
  const bytes = await pdf.body();
  if (pdf.status() !== 200 || bytes.subarray(0, 5).toString() !== '%PDF-')
    fail(`${scheme}: intervention PDF`);
  const edit = await page.request.get(`${url}/modifica`, { maxRedirects: 0 });
  if (edit.status() !== 303)
    fail(`${scheme}: the confirmed sheet opens for editing (${edit.status()})`);
  await audit(page, `${scheme} intervento confirmed`);
  await page.screenshot({ path: join(shots, `${scheme}-intervento.png`), fullPage: true });
}

/** On a phone: ☰ opens the bar over the page, Esc closes it and gives focus back to ☰. */
export async function checkPhoneMenu(mobile, { base, scheme }) {
  await mobile.goto(`${base}/interventi`);
  const bar = mobile.locator('#sidenav');
  if (await bar.isVisible()) fail(`${scheme} mobile: the side bar is open before ☰`);
  await mobile.click('[data-nav-open]');
  await mobile.waitForTimeout(250);
  if (!(await bar.isVisible())) fail(`${scheme} mobile: ☰ does not open the side bar`);
  if ((await mobile.getAttribute('[data-nav-open]', 'aria-expanded')) !== 'true')
    fail(`${scheme} mobile: ☰ does not say it is open`);
  await audit(mobile, `${scheme} mobile menu`);
  await mobile.keyboard.press('Escape');
  await mobile.waitForTimeout(250);
  if (await bar.isVisible()) fail(`${scheme} mobile: Esc does not close the side bar`);
  const focused = await mobile.evaluate(() =>
    document.activeElement?.hasAttribute('data-nav-open'),
  );
  if (!focused) fail(`${scheme} mobile: focus not back on ☰ after Esc`);
}
