// The public side in a real Chromium: the landing page and the privacy policy, in Italian only (light
// and dark, desktop and phone, axe-core WCAG 2.1 AA, no horizontal scroll, no Cyrillic, every photo
// loaded), then an access request sent from the form and accepted by the MASTER: a new company and the
// invitation of its administrator.
import { join } from 'node:path';
import { audit, fail, italianOnly, signIn } from './helpers.mjs';

const PAGES = [
  ['home', '/'],
  ['privacy', '/privacy'],
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
  await owner.close();
}
