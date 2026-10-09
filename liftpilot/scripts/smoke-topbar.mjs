// The smoke test's check of the application's header at desktop widths, in the three languages: the page never scrolls
// sideways and sign-out is always at hand — in the row with the sections, or in the menu that takes the row's place when
// the sections do not stand in it (an owner's 7, the platform's 8: src/app/shell.css, data-nav).
import assert from 'node:assert/strict';
import { step } from './smoke-kit.mjs';

/** The widths checked: from the phone menu's breakpoint to a wide laptop [px]. */
export const HEADER_WIDTHS = [900, 1024, 1100, 1180, 1280, 1366, 1440];

/** Where sign-out ends on the screen: the button shown in the row, else the one in the menu, opened [px]; null: none. */
async function signOutRight(page) {
  const inRow = await page.evaluate(() => {
    const d = globalThis.document, menu = globalThis.getComputedStyle(d.querySelector('.topbar .menu')).display !== 'none';
    const b = [...d.querySelectorAll('.topbar .bar-wide button[type="submit"]')].find((x) => x.getClientRects().length);
    return { menu, right: b ? b.getBoundingClientRect().right : null };
  });
  if (!inRow.menu) return inRow.right;
  await page.click('.topbar .menu > summary');
  const b = page.locator('.topbar .menu-panel button[type="submit"]');
  await b.waitFor({ state: 'visible' });
  const box = await b.boundingBox();
  await page.click('.topbar .menu > summary');
  return box ? box.x + box.width : null;
}

/** `url(locale)`: a page of the application in that language, signed in as `who`. The viewport is given back as it was. */
export async function headerFits({ page, url, who }) {
  step(`the header fits the window: ${who}, it/en/bg`);
  const size = page.viewportSize();
  try {
    for (const locale of ['it', 'en', 'bg']) {
      await page.goto(url(locale));
      await page.evaluate(() => globalThis.document.fonts.ready);
      for (const width of HEADER_WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const over = await page.evaluate(() => globalThis.document.documentElement.scrollWidth - globalThis.innerWidth);
        assert.ok(over <= 0, `${who}, ${locale}, ${width} px: the page scrolls sideways by ${over} px`);
        const right = await signOutRight(page);
        assert.ok(right !== null && right <= width, `${who}, ${locale}, ${width} px: sign-out off the window (${right})`);
      }
    }
  } finally {
    if (size) await page.setViewportSize(size);
  }
}
