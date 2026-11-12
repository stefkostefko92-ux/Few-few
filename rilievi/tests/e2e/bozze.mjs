// A form sent without network is kept on the device (the owner, 12 November 2026 — point C3), in a real
// Chromium with the service worker: a new stop sign sent offline gives "Salvato su questo dispositivo"; with
// the network back every page lists it with "Invia ora", which saves it on the portal and empties the list.
import { audit, fail } from './helpers.mjs';

export async function checkBozze(page, context, { base, scheme }) {
  const name = `${scheme} bozze`;
  await page.goto(`${base}/cartelli/nuovo`);
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))))
    await page.reload();
  // The page has told the worker who has the form open (kept on the device).
  const segnato = await page
    .waitForFunction(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open('rilievi-bozze', 1);
          req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('autori')) return resolve(false);
            const get = db.transaction('autori').objectStore('autori').get('/cartelli');
            get.onsuccess = () => resolve(Boolean(get.result));
            get.onerror = () => resolve(false);
          };
          req.onerror = () => resolve(false);
        }),
      null,
      { timeout: 5000 },
    )
    .then(() => true)
    .catch(() => false);
  if (!segnato) fail(`${name}: the form's account is not on the device`);
  const azienda = page.locator('#f-azienda');
  if (await azienda.count()) {
    const value = await azienda.locator('option:not([value=""])').first().getAttribute('value');
    await azienda.selectOption(value);
  }
  const testo = `Avviso salvato senza rete ${scheme} ${Date.now()}`;
  await page.fill('#f-indirizzo', 'Via della Rete 1');
  await page.fill('#f-citta', 'Milano');
  await page.fill('#f-testo', testo);

  await context.setOffline(true);
  try {
    await page.click('form.form button[type=submit]');
    await page.waitForSelector('h1');
    const title = (await page.textContent('h1'))?.trim();
    if (title !== 'Salvato su questo dispositivo')
      fail(`${name}: offline sending gives "${title}"`);
    await audit(page, `${name} saved offline`);
  } finally {
    await context.setOffline(false);
  }

  await page.goto(`${base}/schede`);
  const box = page.locator('.bozze');
  await box.waitFor({ timeout: 5000 }).catch(() => fail(`${name}: no list of unsent forms`));
  if (!(await box.getByText('Cartello fermo impianto — nuovo').count()))
    fail(`${name}: the unsent sign is not listed`);
  await audit(page, `${name} list`);
  await box.getByRole('button', { name: 'Invia ora' }).first().click();
  await page.waitForURL(/\/cartelli\/[a-z0-9]+$/, { timeout: 15000 });
  if (!(await page.getByText(testo).count())) fail(`${name}: the sign sent later lacks its text`);
  await page.goto(`${base}/schede`);
  await page.waitForTimeout(800);
  if (await page.locator('.bozze').count()) fail(`${name}: the sent form is still listed`);
}
