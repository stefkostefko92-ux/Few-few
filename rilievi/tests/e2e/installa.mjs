// The app on the home screen (owner, 4 November 2026: "add to home screen for PC, iOS and Android … a
// schermo intero"). In a real Chromium: Chrome itself says the portal is installable (no installability
// errors, the manifest parsed with its icons), the service worker runs and keeps nothing, a page opened
// offline says so instead of the browser's error, and "Installa l'app" shows the steps of this device.
import { join } from 'node:path';
import { audit, fail, signIn } from './helpers.mjs';

/**
 * In a context of its own: Playwright sees what a service worker fetches (and takes it offline) only
 * with this flag, read when the worker attaches — the rest of the run keeps the default.
 */
export async function checkInstallableApp(browser, { base, shots, scheme, email, password }) {
  const flag = process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS;
  process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
  const context = await browser.newContext({ colorScheme: scheme });
  try {
    await installable(context, { base, shots, scheme, email, password });
  } finally {
    await context.close();
    if (flag === undefined) delete process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS;
    else process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = flag;
  }
}

async function installable(context, { base, shots, scheme, email, password }) {
  const page = await context.newPage();
  page.on('pageerror', (error) => fail(`${scheme} app: page error ${error.message}`));
  await signIn(page, base, email, password);
  await page.goto(`${base}/schede`);
  const worker = await page.evaluate(() =>
    navigator.serviceWorker.ready.then((registration) => registration.active?.scriptURL ?? ''),
  );
  if (!worker.endsWith('/sw.js')) fail(`${scheme} app: no service worker (${worker})`);
  // A reload is served under the worker: Chrome then judges the page as installed apps see it.
  await page.reload();
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  for (const error of installabilityErrors)
    fail(
      `${scheme} app: not installable — ${error.errorId} ${JSON.stringify(error.errorArguments)}`,
    );
  const { errors, data } = await cdp.send('Page.getAppManifest');
  for (const error of errors) fail(`${scheme} app: manifest — ${error.message}`);
  const manifest = JSON.parse(data || '{}');
  if (manifest.display !== 'fullscreen') fail(`${scheme} app: display is ${manifest.display}`);
  for (const icon of manifest.icons ?? []) {
    const size = await page.evaluate(
      (src) =>
        new Promise((resolve) => {
          const image = new Image();
          image.onload = () => resolve(`${image.naturalWidth}x${image.naturalHeight}`);
          image.onerror = () => resolve('error');
          image.src = src;
        }),
      icon.src,
    );
    if (size !== icon.sizes) fail(`${scheme} app: icon ${icon.src} is ${size}, not ${icon.sizes}`);
  }
  if ((await page.locator('.sidenav a[href="/app"]').count()) !== 1)
    fail(`${scheme} app: no "Installa l'app" in the menu`);

  // Offline: the worker answers the page with its own notice (and nothing from the portal).
  await context.setOffline(true);
  try {
    await page.goto(`${base}/schede/nuova`);
    const title = await page.textContent('h1');
    if (title?.trim() !== 'Nessuna connessione') fail(`${scheme} app: offline page is "${title}"`);
    await audit(page, `${scheme} app offline`);
  } finally {
    await context.setOffline(false);
  }
  await page.goto(`${base}/schede/nuova`);
  if ((await page.textContent('h1'))?.trim() === 'Nessuna connessione')
    fail(`${scheme} app: still offline once the network is back`);

  // "Installa l'app": on a computer the computer's steps are open, the others closed.
  await page.goto(`${base}/app`);
  await audit(page, `${scheme} app install`);
  const open = await page.$$eval('details[data-os]', (all) =>
    all.filter((d) => d.open).map((d) => d.dataset.os),
  );
  if (open.join() !== 'pc') fail(`${scheme} app: open steps on a computer are [${open}]`);
  if (await page.locator('[data-installa-installata]').isVisible())
    fail(`${scheme} app: says installed in a browser tab`);
  await page.screenshot({ path: join(shots, `${scheme}-installa.png`), fullPage: true });
}

/** The phone (Android user agent): its steps open, the page fits 360 px without sideways scroll. */
export async function checkInstallPhone(browser, { base, shots, scheme }) {
  const context = await browser.newContext({
    colorScheme: scheme,
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  const page = await context.newPage();
  await page.goto(`${base}/accesso`);
  if ((await page.locator('a[href="/app"]').count()) !== 1)
    fail(`${scheme} app: no "Installa l'app" link on the sign-in page`);
  await page.click('a[href="/app"]');
  await page.waitForURL(/\/app$/);
  const open = await page.$$eval('details[data-os]', (all) =>
    all.filter((d) => d.open).map((d) => d.dataset.os),
  );
  if (open.join() !== 'android') fail(`${scheme} app: open steps on Android are [${open}]`);
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  if (sideways) fail(`${scheme} app: "Installa l'app" scrolls sideways at 360 px`);
  if (await page.locator('[data-installa-ios]').isVisible())
    fail(`${scheme} app: the iPhone note shows on Android`);
  await audit(page, `${scheme} app install phone`);
  await page.screenshot({ path: join(shots, `${scheme}-installa-telefono.png`), fullPage: true });
  await context.close();
  await checkInstallOther(browser, { base, shots, scheme });
}

/**
 * iPhone and Samsung Internet (the owner, 5 November 2026): no install button where it cannot work — iOS
 * has no install call, and what Samsung Internet installs Android marks as "non sicura". The button was
 * hidden only by the `hidden` attribute, which `display: grid` overrode, so it showed everywhere.
 */
async function checkInstallOther(browser, { base, shots, scheme }) {
  const devices = {
    iphone:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    samsung:
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  };
  for (const [name, userAgent] of Object.entries(devices)) {
    const context = await browser.newContext({
      colorScheme: scheme,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent,
    });
    const page = await context.newPage();
    await page.goto(`${base}/app`);
    await page.waitForTimeout(500);
    if (await page.locator('[data-installa-pronta]').isVisible())
      fail(`${scheme} app (${name}): an install button that cannot install`);
    const note = name === 'iphone' ? '[data-installa-ios]' : '[data-installa-samsung]';
    const other = name === 'iphone' ? '[data-installa-samsung]' : '[data-installa-ios]';
    if (!(await page.locator(note).isVisible())) fail(`${scheme} app (${name}): no note for it`);
    if (await page.locator(other).isVisible())
      fail(`${scheme} app (${name}): the other note shows`);
    if (name === 'samsung' && !(await page.locator('a[href^="intent://"]').isVisible()))
      fail(`${scheme} app (samsung): no "Apri in Chrome"`);
    await audit(page, `${scheme} app install ${name}`);
    await page.screenshot({ path: join(shots, `${scheme}-installa-${name}.png`), fullPage: true });
    await context.close();
  }
}
