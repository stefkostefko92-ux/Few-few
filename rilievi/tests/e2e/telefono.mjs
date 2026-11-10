// The portal on a phone (390 px, touch, then the narrowest 320 px, and a tablet's 810 px for sideways
// scroll): the side bar from ☰ (interventi.mjs)
// and the pages a technician opens on site — no horizontal scroll, every row of fields on one line,
// every control keeps its name (axe), a full-page screenshot each. Then the camera button of a section
// (the owner, 10 November 2026: "dammi la possibilità di fare la foto istantanea"): it opens the camera
// (`capture`) and the photo goes up at once.
import { join } from 'node:path';
import sharp from 'sharp';
import { aligned, audit, fail, signIn } from './helpers.mjs';
import { checkPhoneMenu } from './interventi.mjs';

export async function checkPhone(browser, { base, shots, scheme, email, password, sheetUrl }) {
  const phone = await browser.newContext({
    colorScheme: scheme,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await phone.newPage();
  await signIn(mobile, base, email, password);
  await checkPhoneMenu(mobile, { base, scheme });
  for (const [name, path] of [
    ['list', '/schede?q=verdi'],
    // Every sheet: a matricola is free text up to 40 characters and must wrap in its cell.
    ['all', '/schede'],
    ['sheet', new URL(sheetUrl).pathname],
    ['interventi', '/interventi'],
    ['intervento', '/interventi/nuovo'],
    ['cartelli', '/cartelli'],
    ['cartello', '/cartelli/nuovo'],
    ['nuova', '/schede/nuova'],
    ['calcolo-argano', `${new URL(sheetUrl).pathname}/calcolo-argano`],
    ['calcoli', '/calcolo-argano?q=verdi'],
    ['calcolo-libero', '/calcolo-argano/nuovo'],
    ['utenti', '/utenti'],
    ['account', '/account'],
  ]) {
    await mobile.goto(base + path);
    for (const width of [390, 320]) {
      await mobile.setViewportSize({ width, height: 844 });
      // Not `innerWidth`: on a phone the layout viewport grows with what overflows it.
      const overflow = await mobile.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      if (overflow) fail(`${scheme} mobile ${name} @${width}px: horizontal scroll`);
      await aligned(mobile, `${scheme} mobile ${name} @${width}px`);
    }
    // A tablet held upright (810 px): the tables are not yet cards there — a long email must wrap.
    await mobile.setViewportSize({ width: 810, height: 1080 });
    if (
      await mobile.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
    )
      fail(`${scheme} tablet ${name} @810px: horizontal scroll`);
    await mobile.setViewportSize({ width: 390, height: 844 });
    // The phone layout hides labels behind icons: check that every control keeps its name.
    await audit(mobile, `${scheme} mobile ${name}`);
    await mobile.screenshot({
      path: join(shots, `${scheme}-mobile-${name}.png`),
      fullPage: true,
    });
  }
  // A fresh page of the touch context: setViewportSize above drops the emulated coarse pointer of `mobile`.
  const cam = await phone.newPage();
  await cam.goto(sheetUrl);
  const block = cam.locator('[data-allegati="cavi"]');
  const button = block.locator('.allegati__scatta');
  if (!(await button.isVisible())) {
    const why = await cam.evaluate(() => ({
      url: location.pathname,
      blocks: document.querySelectorAll('[data-allegati="cavi"]').length,
      buttons: document.querySelectorAll('.allegati__scatta').length,
      coarse: matchMedia('(any-pointer: coarse)').matches,
    }));
    return fail(`${scheme} mobile: no camera button on a touch screen ${JSON.stringify(why)}`);
  }
  const camera = block.locator('input[data-scatta]');
  if ((await camera.getAttribute('capture')) !== 'environment')
    fail(`${scheme} mobile: the camera button does not open the camera`);
  const shot = join(shots, `${scheme}-scatto-e2e.jpg`);
  await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#406080' } })
    .jpeg()
    .toFile(shot);
  const tiles = '[data-galleria="cavi"] [data-allegato]';
  const before = await cam.locator(tiles).count();
  await camera.setInputFiles(shot);
  try {
    await cam.waitForFunction(
      ([selector, n]) => document.querySelectorAll(selector).length === n + 1,
      [tiles, before],
      { timeout: 30_000 },
    );
  } catch {
    fail(`${scheme} mobile: the photo taken did not go up by itself`);
  }
  await cam.screenshot({ path: join(shots, `${scheme}-mobile-scatta.png`) });
  await phone.close();
}
