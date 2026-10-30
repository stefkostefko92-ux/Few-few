// Renders the link-preview picture public/img/og.png (1200 × 630) and public/img/apple-touch-icon.png
// (180 × 180) from what the landing shows: the render of the shaft of its first screen
// (public/img/site, `npm run render:encode`), the brand mark and Fira Sans Condensed from public/fonts
// (run `npm run build` first). Language-neutral on purpose: product name and maker over the photo.
// Run after changing the hero render or the brand mark: `npm run brand:images` (needs the Playwright
// dev dependency and a Chromium it can launch).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Inline, not file:// — a page set with setContent() may not load local files.
const fontUrl = (file) =>
  `data:font/woff2;base64,${readFileSync(join(root, 'public', 'fonts', file)).toString('base64')}`;
const photo = `data:image/webp;base64,${readFileSync(join(root, 'public', 'img', 'site', 'vano-1280.webp')).toString('base64')}`;
const mark = readFileSync(join(root, 'views', 'partials', 'brandmark.ejs'), 'utf8');

const page = (body, css) => `<!doctype html><html lang="it"><head><meta charset="utf-8"><style>
@font-face { font-family: 'Fira Sans Condensed'; font-weight: 600; src: url(${fontUrl('fira-sans-condensed-latin-600-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'Fira Sans'; font-weight: 400; src: url(${fontUrl('fira-sans-latin-400-normal.woff2')}) format('woff2'); }
:root { --font-cond: 'Fira Sans Condensed', sans-serif; }
html, body { margin: 0; background: #000; color: #fff; overflow: hidden; }
.brand__mark rect, .brand__mark circle { fill: none; stroke: currentColor; }
${css}
</style></head><body>${body}</body></html>`;

const og = page(
  `<div class="card"><img class="photo" src="${photo}" alt=""><div class="text"><div class="name">${mark}<span>Rilievi Impianti</span></div><p class="by">Carbon Stealth VCC</p></div></div>`,
  `body { width: 1200px; height: 630px; }
.card { position: relative; display: flex; align-items: flex-end; height: 630px; padding: 0 80px 76px; box-sizing: border-box; }
.photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 40%; }
.card::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to top, rgb(0 0 0 / 0.9) 0%, rgb(0 0 0 / 0.55) 48%, rgb(0 0 0 / 0.1) 100%); }
.text { position: relative; z-index: 1; }
.name { display: flex; align-items: center; gap: 26px; font-family: 'Fira Sans Condensed'; font-weight: 600; font-size: 104px; line-height: 1; letter-spacing: -0.01em; }
.name .brand__mark { width: 92px; height: 70px; flex: none; }
.by { margin: 22px 0 0 118px; font-family: 'Fira Sans'; font-size: 34px; color: #d0d0d0; }`,
);

const icon = page(
  `<div class="icon">${mark}</div>`,
  `body { width: 180px; height: 180px; }
.icon { display: flex; align-items: center; justify-content: center; width: 180px; height: 180px; }
.icon .brand__mark { width: 128px; height: 98px; }`,
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
