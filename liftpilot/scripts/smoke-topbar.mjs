// The smoke test's check of the application's workspace shell (src/components/AppShell.tsx, src/app/shell.css), in the
// three languages, from a phone to a wide laptop: the page never scrolls sideways; no section's name is cut in the
// sidebar (the long Bulgarian ones wrap); sign-out is always at hand — in the sidebar beside the page from 1024 px,
// else in the drawer the top bar's button opens, which Esc closes with the focus back on the button; the current
// section is marked (aria-current) and the search of the installations is there.
import assert from 'node:assert/strict';
import { step } from './smoke-kit.mjs';

/** The widths checked: a phone, a tablet, the sidebar's breakpoint and laptops [px]. */
export const HEADER_WIDTHS = [390, 768, 1024, 1100, 1280, 1366, 1440];
const HEIGHT = 900;

/** Sign-out's box on the screen (the drawer opened first when the sidebar is one), and whether it was a drawer. */
async function signOut(page) {
  const drawer = await page.locator('.ws-menu').isVisible();
  if (drawer) {
    await page.click('.ws-menu');
    // the drawer slides in: wait until it stands on the screen
    await page.waitForFunction(() => {
      const s = globalThis.document.querySelector('.ws-sidebar.open');
      return !!s && s.getBoundingClientRect().left >= -1;
    });
  }
  const b = page.locator('.ws-sidebar .ws-logout button[type="submit"]');
  await b.waitFor({ state: 'visible' });
  return { box: await b.boundingBox(), drawer };
}

/** `url(locale)`: a page of the application in that language, signed in as `who`. The viewport is given back as it was. */
export async function headerFits({ page, url, who }) {
  step(`the workspace fits the window: ${who}, it/en/bg`);
  const size = page.viewportSize();
  try {
    for (const locale of ['it', 'en', 'bg']) {
      await page.goto(url(locale));
      await page.evaluate(() => globalThis.document.fonts.ready);
      assert.equal(await page.locator('.ws-nav a[aria-current="page"]').count(), 1, `${who}, ${locale}: the current section marked`);
      for (const width of HEADER_WIDTHS) {
        await page.setViewportSize({ width, height: HEIGHT });
        const at = `${who}, ${locale}, ${width} px`;
        const over = await page.evaluate(() => globalThis.document.documentElement.scrollWidth - globalThis.innerWidth);
        assert.ok(over <= 0, `${at}: the page scrolls sideways by ${over} px`);
        assert.equal(await page.locator('.ws-search input[name="q"]:visible, .ws-search-narrow > summary:visible').count(), 1, `${at}: the search`);
        const { box, drawer } = await signOut(page);
        assert.ok(box && box.x >= 0 && box.x + box.width <= width && box.y + box.height <= HEIGHT, `${at}: sign-out off the window (${JSON.stringify(box)})`);
        const cut = await page.evaluate(() => [...globalThis.document.querySelectorAll('.ws-nav a')]
          .filter((a) => a.scrollWidth > a.clientWidth + 1).map((a) => a.textContent));
        assert.deepEqual(cut, [], `${at}: section names cut in the sidebar`);
        if (drawer) {
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => !globalThis.document.querySelector('.ws-sidebar.open'));
          assert.equal(await page.evaluate(() => globalThis.document.activeElement?.id), 'ws-menu', `${at}: Esc gives the focus back to the menu button`);
        }
      }
    }
  } finally {
    if (size) await page.setViewportSize(size);
  }
}
