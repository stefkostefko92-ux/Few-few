// Renders the link-preview picture public/img/og.png (1200 × 630) and public/img/apple-touch-icon.png
// (180 × 180) from what the landing shows: the render of the shaft of its first screen
// (public/img/site, `npm run render:encode`), the owner's logos (public/img/brand, `npm run brand:logo` —
// the full logo on the preview, the hexagon mark on the home-screen icon) and Fira Sans from public/fonts
// (run `npm run build` first). The full logo carries the product name; under it, the maker. Run after
// changing the hero render or the logos:
// `npm run brand:images` (needs the Playwright dev dependency and a Chromium it can launch).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Inline, not file:// — a page set with setContent() may not load local files.
const fontUrl = (file) =>
  `data:font/woff2;base64,${readFileSync(join(root, 'public', 'fonts', file)).toString('base64')}`;
const photo = `data:image/webp;base64,${readFileSync(join(root, 'public', 'img', 'site', 'vano-1280.webp')).toString('base64')}`;
const brandUrl = (file) =>
  `data:image/webp;base64,${readFileSync(join(root, 'public', 'img', 'brand', file)).toString('base64')}`;
const logo = `<img class="logo" src="${brandUrl('logo-900.webp')}" alt="">`;
// The square tab icon (the mark centred on transparency) is the largest copy of the mark: 192 px high.
const mark = `<img class="mark" src="data:image/png;base64,${readFileSync(join(root, 'public', 'img', 'favicon-192.png')).toString('base64')}" alt="">`;

const page = (body, css) => `<!doctype html><html lang="it"><head><meta charset="utf-8"><style>
@font-face { font-family: 'Fira Sans'; font-weight: 400; src: url(${fontUrl('fira-sans-latin-400-normal.woff2')}) format('woff2'); }
html, body { margin: 0; background: #000; color: #fff; overflow: hidden; }
${css}
</style></head><body>${body}</body></html>`;

const og = page(
  `<div class="card"><img class="photo" src="${photo}" alt=""><div class="text">${logo}<p class="by">Carbon Stealth VCC</p></div></div>`,
  `body { width: 1200px; height: 630px; }
.card { position: relative; display: flex; align-items: flex-end; height: 630px; padding: 0 80px 76px; box-sizing: border-box; }
.photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 40%; }
.card::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to top, rgb(0 0 0 / 0.9) 0%, rgb(0 0 0 / 0.55) 48%, rgb(0 0 0 / 0.1) 100%); }
.text { position: relative; z-index: 1; }
.logo { display: block; width: 760px; height: auto; filter: drop-shadow(0 0 24px rgb(0 0 0 / 0.85)); }
.by { margin: 18px 0 0 4px; font-family: 'Fira Sans'; font-size: 32px; color: #d0d0d0; }`,
);

const icon = page(
  `<div class="icon">${mark}</div>`,
  `body { width: 180px; height: 180px; }
.icon { display: flex; align-items: center; justify-content: center; width: 180px; height: 180px; }
.icon .mark { width: 156px; height: 156px; }`,
);

const browser = await chromium.launch();
try {
  for (const [html, size, file] of [
    [og, { width: 1200, height: 630 }, 'og.png'],
    [icon, { width: 180, height: 180 }, 'apple-touch-icon.png'],
  ]) {
    const tab = await browser.newPage({ viewport: size, reducedMotion: 'reduce' });
    await tab.setContent(html, { waitUntil: 'load' });
    await tab.evaluate(() => document.fonts.ready);
    await tab.screenshot({ path: join(root, 'public', 'img', file) });
    await tab.close();
    process.stdout.write(`public/img/${file}\n`);
  }
} finally {
  await browser.close();
}
