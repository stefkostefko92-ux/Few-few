// Renders public/img/og.png (1200 × 630) — the picture for link previews. Language-neutral on purpose: the logo
// (public/img/brand/logo-1200.webp, from scripts/brand.mjs) and the first still of the landing page's story
// (public/img/story/step-1-1120.webp, from scripts/landing-stills.ts) — the example kitchen as the editor draws it,
// in the same light studio panel as on the page.
// Written with a palette (scripts/png-palette.mjs): 250 KB of the browser's own PNG become about 120 KB, the same to the eye.
// Run after changing the logo or the stills: `npm run og:image` (needs the Playwright dev dependency).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ROOT } from '../src/paths.js';
import { encodePalettePng } from './png-palette.mjs';

const dataUri = (path: string, type: string) =>
  `data:${type};base64,${readFileSync(join(ROOT, path)).toString('base64')}`;
const logo = dataUri('public/img/brand/logo-1200.webp', 'image/webp');
const still = dataUri('public/img/story/step-1-1120.webp', 'image/webp');

// --paper and --studio: the page's paper (public/css/base.css) and the stage panel (public/css/site-story.css)
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #f6f7f1; }
.card { display: grid; grid-template-columns: 1fr 448px; gap: 48px; align-items: center; height: 630px; padding: 0 40px 0 64px; box-sizing: border-box; }
.logo { display: block; width: 100%; height: auto; }
.stage { height: 560px; border-radius: 26px; overflow: hidden; background: #eeeee9; box-shadow: inset 0 0 0 1px rgb(52 48 47 / 0.06); }
.stage img { display: block; width: 100%; height: 100%; object-fit: cover; }
</style></head><body><div class="card"><img class="logo" src="${logo}" alt="Korpora"><div class="stage"><img src="${still}" alt=""></div></div></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  await page.setContent(html, { waitUntil: 'load' });
  const shot = await page.screenshot();
  // the screenshot's pixels, as the page decodes them (no image library on the server side); the page code is a string,
  // as in landing-stills.ts: the scripts are typed for Node, without the DOM
  const rgba = await page.evaluate(`(async () => {
    const img = new Image();
    img.src = 'data:image/png;base64,${shot.toString('base64')}';
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let text = '';
    for (let i = 0; i < data.length; i += 0x8000) text += String.fromCharCode(...data.subarray(i, i + 0x8000));
    return btoa(text);
  })()`);
  writeFileSync(
    join(ROOT, 'public', 'img', 'og.png'),
    encodePalettePng(1200, 630, Buffer.from(String(rgba), 'base64')),
  );
} finally {
  await browser.close();
}
process.stdout.write('public/img/og.png\n');
