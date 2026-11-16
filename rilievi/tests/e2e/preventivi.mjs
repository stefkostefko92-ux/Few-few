// Quotes in a real browser (the owner, 12 November 2026 — point C1): off by default (no menu entry, no button
// on the scheda), the MASTER turns them on on the company page; the price list in the settings — an entry and a
// sheet pasted at once (the owner, 13 November 2026); the quote from the scheda
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

  // Before any price list entry the search in the list stays hidden: the rows still fill the section
  // (they once collapsed beside its title — the owner, 13 November 2026).
  await page.goto(`${base}/preventivi/listino?azienda=${aziendaId}`);
  if (!(await page.locator('td', { hasText: /^E2E-/ }).count())) {
    await page.goto(`${base}/preventivi/nuovo`);
    if (await page.locator('#f-azienda').count()) await page.selectOption('#f-azienda', aziendaId);
    await page.waitForLoadState('networkidle');
    if (!(await page.locator('[data-listino]').isHidden()))
      fail(`${name}: the price-list search shows with an empty list`);
    // …and the form says so, with the way to the place where the list is filled (the settings).
    if (!(await page.locator('[data-listino-vuoto]').isVisible()))
      fail(`${name}: nothing says that the price list is empty`);
    const gestione = await page.getAttribute('[data-listino-gestione]', 'href');
    if (gestione !== `/impostazioni/listino?azienda=${aziendaId}`)
      fail(`${name}: the empty price list leads to ${gestione}`);
    const larghezza = await page.evaluate(
      () =>
        document.querySelector('[data-righe]').getBoundingClientRect().width /
        document.querySelector('#righe').getBoundingClientRect().width,
    );
    if (larghezza < 0.8)
      fail(`${name}: the rows take ${Math.round(larghezza * 100)} % of the section`);
    await aligned(page, `${name} form, empty price list`);
  }

  // The price list is a section of the settings (the owner, 13 November 2026 — "направи го от impostazioni"):
  // a card on the settings page, an entry added there, a sheet pasted at once — looked at first, then written.
  await page.goto(`${base}/impostazioni?azienda=${aziendaId}`);
  await page.click('a.impostazioni-carta[href^="/impostazioni/listino"]');
  await page.waitForURL(/\/impostazioni\/listino\?azienda=/);
  // With rows in the list the two tools are folded (the list comes first): opened as a person would.
  const apri = async (selector) => {
    const strumento = page.locator(selector);
    if (!(await strumento.evaluate((el) => el.open))) await strumento.locator('> summary').click();
  };
  await apri('details.listino-strumento:has(#f-voce-codice)');
  await page.fill('#f-voce-codice', `E2E-${scheme}`);
  await page.fill('#f-voce-unita', 'pz');
  await page.fill('#f-voce-descrizione', 'Quadro di manovra E2E');
  await page.fill('#f-voce-prezzo', '1.000,00');
  await page.selectOption('#f-voce-iva', '22');
  await page.click('button:has-text("Aggiungi la voce")');
  await page.waitForURL(/\/impostazioni\/listino\?azienda=/);
  if (!(await page.locator('td', { hasText: `E2E-${scheme}` }).count()))
    fail(`${name}: the entry is not listed`);
  await audit(page, `${name} list price`);
  await aligned(page, `${name} list price`);

  await apri('#importa');
  await page.fill(
    '#f-importa-testo',
    `Codice\tDescrizione\tUM\tPrezzo €\nIMP-${scheme}-1\tFune 10 mm\tm\t3,20\nIMP-${scheme}-2\tManodopera\th\t€ 48,50\n`,
  );
  await page.click('#importa form > .toolbar button[type=submit]');
  await page.waitForSelector('.listino-anteprima');
  const piano = (await page.textContent('.listino-anteprima ul')).replace(/\s+/g, ' ');
  if (!/Voci nuove: 2/.test(piano))
    fail(`${name}: the preview of the pasted sheet says «${piano}»`);
  if ((await page.locator('td', { hasText: `IMP-${scheme}-1` }).count()) !== 1)
    fail(`${name}: the pasted rows are written before the confirmation, or not shown`);
  await audit(page, `${name} list price, preview`);
  await aligned(page, `${name} list price, preview`);
  await page.screenshot({ path: join(shots, `${scheme}-listino-anteprima.png`), fullPage: true });
  // Enter in a field of the form only checks again — it never confirms.
  await page.focus('#f-importa-unita');
  await Promise.all([page.waitForLoadState('load'), page.keyboard.press('Enter')]);
  await page.waitForSelector('.listino-anteprima');
  if (new URL(page.url()).pathname !== '/preventivi/listino/importa')
    fail(`${name}: Enter in the pasted sheet's form confirmed it`);
  if ((await page.locator('td', { hasText: `IMP-${scheme}-1` }).count()) !== 1)
    fail(`${name}: Enter in the pasted sheet's form wrote the rows`);
  await page.click('.listino-anteprima button[name=conferma]');
  await page.waitForURL(/\/impostazioni\/listino\?azienda=/);
  if (!(await page.locator('td', { hasText: `IMP-${scheme}-2` }).count()))
    fail(`${name}: the pasted rows are not in the list`);
  // A row that cannot be read stops the whole sheet and is named by its number.
  await apri('#importa');
  await page.fill('#f-importa-testo', `X-${scheme};Senza prezzo;pz;gratis`);
  await page.click('#importa form > .toolbar button[type=submit]');
  await page.waitForSelector('#importa .errors');
  if (!/Riga 1/.test(await page.textContent('#importa .errors')))
    fail(`${name}: the wrong row of the pasted sheet is not named`);
  await audit(page, `${name} list price, errors`);
  const csv = await page.request.get(`${base}/preventivi/listino.csv?azienda=${aziendaId}`);
  if (csv.status() !== 200 || !(await csv.text()).includes(`"IMP-${scheme}-1"`))
    fail(`${name}: the price list for Excel is ${csv.status()}`);
  await page.goto(`${base}/impostazioni/listino?azienda=${aziendaId}`);
  await audit(page, `${name} list price, folded`);
  await aligned(page, `${name} list price, folded`);
  await page.screenshot({ path: join(shots, `${scheme}-listino.png`), fullPage: true });

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
