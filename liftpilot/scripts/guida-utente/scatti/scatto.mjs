// Taking one screenshot of the guide: the screen settled, every secret masked, the region chosen (the PDF fits each
// picture whole into the text width and 150 mm of height).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DESKTOP, MASK, OUT, skipped, taken, want } from './ambiente.mjs';

async function settle(page) {
  // sections that fade in as they come into view: the whole page scrolled once, then back to the top
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
    const h = globalThis.document.documentElement.scrollHeight;
    for (let y = 0; y < h; y += 500) { globalThis.scrollTo(0, y); await wait(40); }
    globalThis.scrollTo(0, 0);
    await wait(150);
  });
  await page.evaluate(() => globalThis.document.fonts.ready);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.evaluate(() => new Promise((r) => globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(r))));
}

/** Every password field's value and every temporary password or one-time link on the screen replaced by bullets in the DOM;
 *  the function returned gives them back (a form filled for real goes on from there). */
async function mask(page) {
  await page.evaluate((bullets) => {
    const doc = globalThis.document, undo = [];
    const setter = Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement.prototype, 'value').set;
    for (const el of doc.querySelectorAll('input[type="password"]')) {
      if (!el.value) continue;
      const was = el.value;
      setter.call(el, bullets);
      undo.push(() => { setter.call(el, was); el.dispatchEvent(new globalThis.Event('input', { bubbles: true })); });
    }
    for (const el of doc.querySelectorAll('.secret, [data-secret]')) {
      const was = el.textContent;
      el.textContent = bullets;
      undo.push(() => { el.textContent = was; });
    }
    globalThis.__unmask = () => undo.forEach((f) => f());
  }, MASK);
  return () => page.evaluate(() => globalThis.__unmask?.());
}

/** The box of an element in document coordinates. */
const boxOf = (loc) => loc.first().evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + globalThis.scrollX, y: r.top + globalThis.scrollY, width: r.width, height: r.height };
});

/** A clip around boxes (document coordinates), `pad` around, inside the page. */
async function clipAround(page, boxes, pad) {
  const pageW = await page.evaluate(() => globalThis.document.documentElement.clientWidth);
  const pageH = await page.evaluate(() => globalThis.document.documentElement.scrollHeight);
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad), y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const x1 = Math.min(pageW, Math.max(...boxes.map((b) => b.x + b.width)) + pad), y1 = Math.min(pageH, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
  return { x: Math.floor(x0), y: Math.floor(y0), width: Math.ceil(x1 - x0), height: Math.ceil(y1 - y0) };
}

/**
 * One screenshot, when a chapter asks for this id: `target` is a page (the window, or `opts.clip` / `opts.clipFn`) or a
 * locator (its region, `opts.pad` around; `opts.also` more locators the region has to hold). `opts.tall` makes the
 * window very tall for the shot, so that the Progetto's form (its own scroll inside a window-high column) shows all of
 * itself; `opts.keepBar` keeps the sticky save bar a region would otherwise hide.
 */
export async function shot(id, target, opts = {}) {
  if (!want(id)) return false;
  const page = typeof target.screenshot === 'function' && typeof target.locator === 'function' && !('first' in target) ? target : target.page();
  const inApp = /\/it\/app/.test(page.url());
  if (opts.tall) await page.setViewportSize({ width: DESKTOP.width, height: opts.tall === true ? 6000 : opts.tall });
  try {
    await settle(page);
    const restore = await mask(page);
    // a region of the page (not the window as it is): the sticky save bar, which would lie over its bottom, put aside
    const region = Boolean(opts.clip || opts.clipFn) || 'first' in target;
    if (region && !opts.keepBar) await page.addStyleTag({ content: '.savebar { display: none !important; }' }).then((h) => h.evaluate((el) => el.setAttribute('data-shot-style', '1')));
    try {
      let clip = opts.clipFn ? await opts.clipFn() : opts.clip;
      if (!clip && 'first' in target) clip = await clipAround(page, [await boxOf(target), ...(await Promise.all((opts.also ?? []).map((l) => boxOf(l))))], opts.pad ?? 12);
      // a region below the window of the workspace: the window made as tall as the region, so that the sidebar (100 % of
      // the window) runs down along it; the public pages keep their own height
      const grow = !opts.tall && clip && clip.y + clip.height > DESKTOP.height && inApp;
      if (grow) { await page.setViewportSize({ width: DESKTOP.width, height: Math.ceil(clip.y + clip.height) }); await settle(page); }
      const file = join(OUT, `${id}.png`);
      let buf;
      try { buf = await page.screenshot({ clip, fullPage: Boolean(clip) && !grow, animations: 'disabled', caret: 'hide', timeout: 180000 }); }
      finally { if (grow) await page.setViewportSize(DESKTOP); }
      writeFileSync(file, buf);
      taken.set(id, file);
      skipped.delete(id);
    } finally {
      await restore();
      await page.evaluate(() => globalThis.document.querySelectorAll('style[data-shot-style]').forEach((e) => e.remove()));
    }
  } finally {
    if (opts.tall) await page.setViewportSize(DESKTOP);
  }
  return true;
}

/** The clip of the page's content width (the sidebar's column left out) across the height of some elements. */
export async function wideClip(page, locs, pad = 14, x = 290, width = 1150) {
  const boxes = await Promise.all(locs.map((l) => boxOf(l)));
  const y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad), y1 = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
  return { x, y: Math.floor(y0), width, height: Math.ceil(y1 - y0) };
}

/** The region of the page from the top of `a` to the bottom of `b`, across the page's width. */
export async function between(page, a, b, pad = 24) {
  const [ba, bb] = await Promise.all([boxOf(page.locator(a)), boxOf(page.locator(b))]);
  const pageW = await page.evaluate(() => globalThis.document.documentElement.clientWidth);
  const y = Math.max(0, Math.floor(ba.y - pad));
  return { x: 0, y, width: pageW, height: Math.ceil(bb.y + bb.height + pad - y) };
}
