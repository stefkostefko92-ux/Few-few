// Quotes in a real browser (the owner, 12 November 2026 — point C1): off by default (no menu entry, no button
// on the scheda), the MASTER turns them on on the company page; a price list entry; the quote from the scheda
// with a line from the list, the live totals in the browser equal to the saved ones; the PDF; axe and the
// three-lines alignment on every page.
import { join } from 'node:path';
import { aligned, audit, fail } from './helpers.mjs';

export async function checkPreventivi(page, { base, shots, scheme, aziendaPath, sheetUrl }) {
  const name = `${scheme} preventivi`;
  const aziendaId = aziendaPath.split('/').pop();

  // Off by default: no button on the scheda; the MASTER turns them on (the dark run finds them on).
  await page.goto(`${base}${aziendaPath}`);
  await audit(page, `${name} company`);
  const acceso = () => page.getByText('Preventivi attivi per questa azienda.').count();
  if (!(await acceso())) {
    await page.goto(sheetUrl);
    if (await page.locator('a[href^="/preventivi/nuovo?scheda="]').count())
      fail(`${name}: the scheda offers a quote while quotes are off`);
    await page.goto(`${base}${aziendaPath}`);
    await page.click('form[action$="/preventivi"] button[type=submit]');
    await page.waitForURL(new RegExp(`${aziendaPath}(#h-preventivi)?$`));
    if (!(await acceso())) fail(`${name}: quotes not on after the switch`);
  }

  // A price list entry.
  await page.goto(`${base}/preventivi/listino?azienda=${aziendaId}`);
  await page.fill('#f-voce-codice', `E2E-${scheme}`);
  await page.fill('#f-voce-unita', 'pz');
  await page.fill('#f-voce-descrizione', 'Quadro di manovra E2E');
  await page.fill('#f-voce-prezzo', '1.000,00');
  await page.selectOption('#f-voce-iva', '22');
  await page.click('button:has-text("Aggiungi la voce")');
  await page.waitForURL(/\/preventivi\/listino\?azienda=/);
  if (!(await page.locator('td', { hasText: `E2E-${scheme}` }).count()))
    fail(`${name}: the entry is not listed`);
  await audit(page, `${name} list price`);
  await aligned(page, `${name} list price`);

  // From the scheda: the plant and the works; a line from the list; live totals.
  await page.goto(sheetUrl);
  await page.click('a[href^="/preventivi/nuovo?scheda="]');
  await page.waitForURL(/\/preventivi\/nuovo\?scheda=/);
  if (!(await page.inputValue('#f-impianto'))) fail(`${name}: the plant is not filled in`);
  await page.waitForSelector('[data-listino]:not([hidden])');
  await page.fill('#f-cliente', 'Condominio E2E');
  if (!(await page.inputValue('#f-oggetto'))) await page.fill('#f-oggetto', 'Lavori E2E');
  // The rows from the scheda have no price: write one, then add the list entry.
  const righe = page.locator('[data-preventivo-riga]');
  for (let i = 0; i < (await righe.count()); i += 1) {
    const riga = righe.nth(i);
    const descr = await riga.locator('[data-campo="descrizione"]').inputValue();
    if (descr) await riga.locator('[data-campo="prezzo"]').fill('100');
  }
  await page.fill('#f-listino', `E2E-${scheme} — Quadro di manovra E2E`);
  await page.click('[data-listino-aggiungi]');
  const live = (await page.textContent('[data-tot="totale"]')).trim();
  await audit(page, `${name} form`);
  await aligned(page, `${name} form`);
  await page.screenshot({ path: join(shots, `${scheme}-preventivo-form.png`), fullPage: true });
  await page.click('.actions button[type=submit]');
  await page.waitForURL(/\/preventivi\/[a-z0-9]+$/);
  const saved = (await page.locator('.preventivo-totali__totale dd').textContent())
    .replace(/\s+/g, ' ')
    .trim();
  if (saved !== live.replace(/\s+/g, ' ')) fail(`${name}: live total ${live} ≠ saved ${saved}`);
  await audit(page, `${name} page`);
  await page.screenshot({ path: join(shots, `${scheme}-preventivo.png`), fullPage: true });
  const pdf = await page.request.get(`${page.url()}/pdf`);
  if (pdf.status() !== 200 || pdf.headers()['content-type'] !== 'application/pdf')
    fail(`${name}: the PDF is ${pdf.status()}`);
  await page.goto(`${base}/preventivi`);
  await audit(page, `${name} list`);
}
