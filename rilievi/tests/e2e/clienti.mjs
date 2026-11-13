// The customers registry in a real browser (the owner, 13 November 2026: a page of customers for every company,
// so that they are not typed again in every quote). After the quotes flow (quotes are on): a profile is
// created and shown; wrong data comes back; the quote form offers the registry — choosing a customer writes
// the data and remembers the profile, another name by hand lets the profile go, Enter in the search never
// saves the quote; the saved quote leads to the profile and the profile lists the quote; the customer typed
// by hand in a quote goes into the registry with one button. axe and the three-lines alignment on every
// page, the list and the profile also at phone width.
import { join } from 'node:path';
import { aligned, audit, fail } from './helpers.mjs';

export async function checkClienti(page, { base, shots, scheme, aziendaPath }) {
  const name = `${scheme} clienti`;
  const aziendaId = aziendaPath.split('/').pop();
  const nome = `Condominio Registro ${scheme} ${Date.now() % 100000}`;
  const indirizzo = 'Via Roma 12, 20121 Milano (MI)';

  await page.goto(`${base}/clienti?azienda=${aziendaId}`);
  await audit(page, `${name} list`);
  await aligned(page, `${name} list`);

  // Wrong data comes back with what was typed and says which field is wrong.
  await page.click('.toolbar a[href^="/clienti/nuovo"]');
  await page.waitForURL(/\/clienti\/nuovo/);
  await page.selectOption('#f-azienda', aziendaId);
  await page.fill('#f-nome', nome);
  await page.fill('#f-telefono', 'chiamami');
  await page.click('.actions button[type=submit]');
  await page.waitForSelector('#error-summary');
  if ((await page.inputValue('#f-telefono')) !== 'chiamami')
    fail(`${name}: the typed phone did not come back`);
  if (!(await page.locator('#err-telefono').count())) fail(`${name}: the phone error is missing`);
  await audit(page, `${name} form with an error`);
  await aligned(page, `${name} form with an error`);

  await page.fill('#f-indirizzo', indirizzo);
  await page.fill('#f-piva', 'it 0123 4567 890');
  await page.fill('#f-email', 'Amministratore@Example.it');
  await page.fill('#f-telefono', '+39 02 1234567');
  await page.fill('#f-referente', 'Geom. Luca Bianchi');
  await page.fill('#f-note', 'Citofono 14\nPortineria solo la mattina');
  await aligned(page, `${name} form`);
  await page.screenshot({ path: join(shots, `${scheme}-cliente-form.png`), fullPage: true });
  await page.click('.actions button[type=submit]');
  await page.waitForURL(/\/clienti\/[a-z0-9]+$/);
  const profilo = page.url();
  const clienteId = profilo.split('/').pop();
  const testo = (await page.textContent('main')).replace(/\s+/g, ' ');
  for (const atteso of [
    nome,
    indirizzo,
    'IT01234567890',
    'amministratore@example.it',
    '+39 02 1234567',
  ])
    if (!testo.includes(atteso)) fail(`${name}: the profile does not show «${atteso}»`);
  await audit(page, `${name} profile`);
  await aligned(page, `${name} profile`);
  await page.screenshot({ path: join(shots, `${scheme}-cliente.png`), fullPage: true });

  // The profile starts a quote that already names the customer.
  await page.click('a[href^="/preventivi/nuovo?cliente="]');
  await page.waitForURL(/\/preventivi\/nuovo\?cliente=/);
  if ((await page.inputValue('#f-cliente')) !== nome)
    fail(`${name}: the quote from the profile does not name the customer`);
  if ((await page.inputValue('[data-cliente-id]')) !== clienteId)
    fail(`${name}: the quote from the profile does not remember the profile`);

  // The quote form offers the registry of the chosen company.
  await page.goto(`${base}/preventivi/nuovo?azienda=${aziendaId}`);
  await page.waitForSelector('[data-clienti]:not([hidden])');
  const scelto = () => page.inputValue('[data-cliente-id]');
  const stato = async () => (await page.textContent('[data-clienti-stato]')).trim();
  // Enter on a name that is not in the registry: nothing is chosen, nothing is saved.
  await page.fill('#f-registro-clienti', 'Nessuno con questo nome');
  await page.press('#f-registro-clienti', 'Enter');
  if (!/\/preventivi\/nuovo\?azienda=/.test(page.url()))
    fail(`${name}: Enter in the customers search left the form`);
  if ((await scelto()) !== '' || !(await stato()).startsWith('Cliente non riconosciuto'))
    fail(`${name}: an unknown name was taken as a customer`);
  // A line of the list is the name, the address and the VAT number.
  await page.fill('#f-registro-clienti', `${nome} — ${indirizzo} — IT01234567890`);
  await page.click('[data-clienti-usa]');
  if ((await scelto()) !== clienteId) fail(`${name}: the chosen customer is not remembered`);
  const scritti = await Promise.all(
    ['#f-cliente', '#f-clienteIndirizzo', '#f-clientePiva', '#f-clienteEmail'].map((s) =>
      page.inputValue(s),
    ),
  );
  if (
    scritti.join('|') !== [nome, indirizzo, 'IT01234567890', 'amministratore@example.it'].join('|')
  )
    fail(`${name}: the customer's data are not written in the quote: ${scritti.join('|')}`);
  // Another name by hand: the quote is no longer for that profile — and it is said.
  await page.fill('#f-cliente', 'Un altro condominio');
  await page.press('#f-cliente', 'Tab');
  if ((await scelto()) !== '' || !(await stato()).includes(nome))
    fail(`${name}: another name kept the link to the profile`);
  // The name alone is enough when one customer has it.
  await page.fill('#f-registro-clienti', nome);
  await page.press('#f-registro-clienti', 'Enter');
  if ((await scelto()) !== clienteId) fail(`${name}: the customer was not chosen by name`);
  await audit(page, `${name} quote form`);
  await aligned(page, `${name} quote form`);
  await page.screenshot({ path: join(shots, `${scheme}-preventivo-cliente.png`), fullPage: true });

  await page.fill('#f-oggetto', 'Manutenzione E2E per un cliente del registro');
  const riga = page.locator('[data-preventivo-riga]').first();
  await riga.locator('[data-campo="descrizione"]').fill('Manodopera');
  await riga.locator('[data-campo="quantita"]').fill('2');
  await riga.locator('[data-campo="prezzo"]').fill('45');
  await page.click('.actions button[type=submit]');
  await page.waitForURL(/\/preventivi\/[a-z0-9]+$/);
  const preventivo = page.url().split('/').pop();
  if (!(await page.locator(`a[href="/clienti/${clienteId}"]`).count()))
    fail(`${name}: the quote does not lead to the customer's profile`);
  if (await page.locator('form[action$="/cliente"]').count())
    fail(`${name}: a quote of a registered customer still offers to add the customer`);
  await audit(page, `${name} quote of a registered customer`);
  await page.goto(profilo);
  if (!(await page.locator(`a[href="/preventivi/${preventivo}"]`).count()))
    fail(`${name}: the profile does not list the customer's quote`);

  // A customer typed by hand in a quote goes into the registry with one button.
  await page.goto(`${base}/preventivi/nuovo?azienda=${aziendaId}`);
  const aMano = `Cliente a mano ${scheme} ${Date.now() % 100000}`;
  await page.fill('#f-cliente', aMano);
  await page.fill('#f-clienteEmail', 'a.mano@example.it');
  await page.fill('#f-oggetto', 'Preventivo E2E scritto a mano');
  const prima = page.locator('[data-preventivo-riga]').first();
  await prima.locator('[data-campo="descrizione"]').fill('Sopralluogo');
  await prima.locator('[data-campo="quantita"]').fill('1');
  await prima.locator('[data-campo="prezzo"]').fill('80');
  await page.click('.actions button[type=submit]');
  await page.waitForURL(/\/preventivi\/[a-z0-9]+$/);
  await page.click('form[action$="/cliente"] button[type=submit]');
  await page.waitForSelector('.preventivo-cliente-registro a[href^="/clienti/"]');
  await page.click('.preventivo-cliente-registro a[href^="/clienti/"]');
  await page.waitForURL(/\/clienti\/[a-z0-9]+$/);
  if ((await page.textContent('h1')).trim() !== aMano)
    fail(`${name}: the customer of the quote is not in the registry`);

  // The list finds a customer by a part of the profile; list and profile at phone width.
  await page.goto(`${base}/clienti?azienda=${aziendaId}&q=${encodeURIComponent('luca bianchi')}`);
  if (!(await page.locator(`a[href="/clienti/${clienteId}"]`).count()))
    fail(`${name}: the search by contact person does not find the customer`);
  await page.screenshot({ path: join(shots, `${scheme}-clienti.png`), fullPage: true });
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: viewport.height });
  await audit(page, `${name} list, phone`);
  await aligned(page, `${name} list, phone`);
  await page.goto(profilo);
  await aligned(page, `${name} profile, phone`);
  await page.screenshot({ path: join(shots, `${scheme}-cliente-telefono.png`), fullPage: true });
  await page.goto(`${profilo}/modifica`);
  await aligned(page, `${name} form, phone`);
  await page.setViewportSize(viewport);
}
