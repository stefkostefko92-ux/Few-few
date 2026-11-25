// The public side in a real Chromium: the landing page, the prices, the privacy policy, the updates, the terms and
// the page to report illegal content, in Italian only (light and dark, desktop and phone, axe-core WCAG 2.1 AA, no
// horizontal scroll, no Cyrillic, every photo loaded), then an access request sent from the form and accepted by
// the MASTER — a new company and the invitation of its administrator — and a report of illegal content sent from
// the public form and decided by the MASTER in the console.
import { join } from 'node:path';
import { audit, fail, italianOnly, signIn } from './helpers.mjs';

const PAGES = [
  ['home', '/'],
  ['prezzi', '/prezzi'],
  ['segnalazioni', '/segnalazioni'],
  ['privacy', '/privacy'],
  ['novita', '/novita'],
  ['condizioni', '/condizioni'],
];

export async function checkSite(browser, { base, shots, email, password }) {
  for (const scheme of ['light', 'dark']) {
    for (const [device, viewport] of [
      ['desktop', { width: 1440, height: 900 }],
      ['phone', { width: 390, height: 844 }],
    ]) {
      const context = await browser.newContext({ colorScheme: scheme, viewport });
      const page = await context.newPage();
      page.on('pageerror', (error) => fail(`site ${scheme}: page error ${error.message}`));
      for (const [name, path] of PAGES) {
        const reply = await page.goto(base + path);
        if (reply?.status() !== 200) fail(`site ${path}: ${reply?.status()}`);
        // The photos below the first screen load lazily: load them all, and every one must decode
        // (a missing width of a srcset would leave a hole in the page).
        const broken = await page.evaluate(async () => {
          const images = [...document.images];
          for (const image of images) image.loading = 'eager';
          await Promise.all(images.map((image) => image.decode().catch(() => null)));
          return images
            .filter((image) => image.naturalWidth === 0)
            .map((image) => image.currentSrc || image.src);
        });
        if (broken.length) fail(`site ${scheme} ${device} ${name}: images not loaded ${broken}`);
        await audit(page, `site ${scheme} ${device} ${name}`);
        await italianOnly(page, `site ${scheme} ${device} ${name}`);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        );
        if (overflow) fail(`site ${scheme} ${device} ${name}: horizontal scroll`);
        await page.screenshot({
          path: join(shots, `site-${scheme}-${device}-${name}.png`),
          fullPage: true,
        });
      }
      await context.close();
    }
  }

  // A visitor asks for access; the MASTER sees the request, accepts it and gets the invitation link.
  const stamp = Date.now().toString(36);
  const visitor = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const form = await visitor.newPage();
  await form.goto(`${base}/#richiesta`);
  await form.fill('#r-name', 'Giulia Verdi');
  await form.fill('#r-company', `Ascensori Richiesta ${stamp}`);
  await form.fill('#r-email', `richiesta.${stamp}@rilievi.test`);
  await form.selectOption('#r-teamSize', 'S6_20');
  await form.locator('#r-privacy').evaluate((input) => input.click());
  await form.click('.request__form button[type=submit]');
  await form.waitForURL(/\/richiesta-inviata(#richiesta)?$/);
  await audit(form, 'site request sent');
  await italianOnly(form, 'site request sent');
  await visitor.close();

  const owner = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await owner.newPage();
  await signIn(page, base, email, password);
  await page.goto(`${base}/richieste`);
  await audit(page, 'requests list');
  const link = page.locator(`a.row-link[aria-label*="${stamp}"]`);
  if (!(await link.count())) fail('the new request is not in the list');
  await link.click();
  await audit(page, 'request');
  await page.click('form[action$="/accetta"] button[type=submit]');
  const invite = await page.inputValue('#link');
  if (!/\/invito\/[A-Za-z0-9_-]{30,}$/.test(invite)) fail('accepting gave no invitation link');

  // Someone reports a content from a phone; the MASTER — the person responsible for moderation — finds the
  // report in the console and decides it with the reasons.
  const segnalante = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const modulo = await segnalante.newPage();
  await modulo.goto(`${base}/segnalazioni`);
  await modulo.click('.segnala button[type=submit]');
  if (!(await modulo.locator('#segnala-errori').count())) fail('an empty report shows no errors');
  await audit(modulo, 'report with errors');
  await modulo.fill('#sg-dove', `${base}/schede/prova-${stamp} — la seconda foto del quadro`);
  await modulo.fill(
    '#sg-motivo',
    'La foto mostra una persona riconoscibile senza una base di legge.',
  );
  await modulo.fill('#sg-nome', 'Giulia Verdi');
  await modulo.fill('#sg-email', `segnala.${stamp}@rilievi.test`);
  await modulo.locator('#sg-buonaFede').evaluate((input) => input.click());
  await modulo.click('.segnala button[type=submit]');
  // The browser keeps the fragment of the form's action (#modulo) across the redirect.
  await modulo.waitForURL(/\/segnalazioni\/inviata\?rif=SG-[0-9A-Z]{8}(#modulo)?$/);
  const riferimento = new URL(modulo.url()).searchParams.get('rif');
  await audit(modulo, 'report sent');
  await italianOnly(modulo, 'report sent');
  await segnalante.close();

  await page.goto(`${base}/master/segnalazioni`);
  await audit(page, 'reports list');
  const voce = page.locator(`a:text-is("${riferimento}")`);
  if (!(await voce.count())) fail('the new report is not in the console');
  await voce.click();
  await audit(page, 'report');
  await page.locator('input[name=esito][value=NESSUNA_AZIONE]').evaluate((input) => input.click());
  await page.fill(
    '#dc-motivazione',
    'Il contenuto indicato non esiste nel portale: nessuna misura.',
  );
  await page.click('form[action$="/decisione"] button[type=submit]');
  await page.waitForURL(/\/master\/segnalazioni\/[a-z0-9]+$/);
  if (!(await page.locator('#h-presa').count())) fail('the decision was not recorded');
  await audit(page, 'report decided');
  await italianOnly(page, 'report decided');
  // The alarms page of the console (the webhook address is never shown).
  await page.goto(`${base}/master/allarmi`);
  await audit(page, 'alarms');
  await italianOnly(page, 'alarms');
  await owner.close();
}
