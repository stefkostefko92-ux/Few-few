// Déjà — живият фон и стъклото: движение САМО когато е позволено.
// (1) нормално мрежата се движи; (2) prefers-reduced-motion → статика;
// (3) „Жив фон“ изключен → статика; (4) фонът е aria-hidden и не хваща кликове;
// (5) стъклото реално размазва фона (backdrop-filter).

import { launchWithExtension, makeChecker } from './lib.mjs';

const { check, finish } = makeChecker();

async function scenario({ reducedMotion, ambient }) {
  const { context, extId } = await launchWithExtension({ reducedMotion });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`chrome-extension://${extId}/options.html`);
  await page.evaluate((on) => chrome.storage.local.set({ settings: { ambientMotion: on } }), ambient);
  await page.goto(`chrome-extension://${extId}/welcome.html`);
  await page.waitForSelector('canvas.nebula');
  await page.waitForTimeout(600);
  const grab = () => page.evaluate(() => document.querySelector('canvas.nebula').toDataURL());
  const a = await grab();
  await page.waitForTimeout(700);
  const b = await grab();
  const info = await page.evaluate(() => {
    const c = document.querySelector('canvas.nebula');
    const li = document.querySelector('.welcome .points li');
    const cs = getComputedStyle(c);
    return {
      hidden: c.getAttribute('aria-hidden') === 'true',
      inert: cs.pointerEvents === 'none',
      glass: getComputedStyle(li).backdropFilter,
    };
  });
  await context.close();
  return { moving: a !== b, ...info };
}

const normal = await scenario({ reducedMotion: 'no-preference', ambient: true });
check('нормално: мрежата се движи', normal.moving);
check('фонът е aria-hidden и не хваща кликове', normal.hidden && normal.inert);
check('стъклото размазва фона (backdrop-filter: blur)', /blur\(/.test(normal.glass));

const reduced = await scenario({ reducedMotion: 'reduce', ambient: true });
check('prefers-reduced-motion: статичен кадър', !reduced.moving);

const off = await scenario({ reducedMotion: 'no-preference', ambient: false });
check('„Жив фон“ изключен: статичен кадър (WCAG 2.2.2)', !off.moving);

finish();
