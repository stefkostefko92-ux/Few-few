// Renders the link-preview picture public/img/og.png (1200 × 630) and public/img/apple-touch-icon.png
// (180 × 180) from the same drawing and type the pages use: the lift-shaft section (views/site/_shaft.ejs,
// styled by public/css/shaft.css) and Fira Sans Condensed from public/fonts (run `npm run build` first).
// Language-neutral on purpose: product name, maker and the drawing, white on black.
// Run after changing the drawing or the brand mark: `npm run brand:images` (needs the Playwright dev
// dependency and a Chromium it can launch).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Inline, not file:// — a page set with setContent() may not load local files.
const fontUrl = (file) =>
  `data:font/woff2;base64,${readFileSync(join(root, 'public', 'fonts', file)).toString('base64')}`;
const shaftCss = readFileSync(join(root, 'public', 'css', 'shaft.css'), 'utf8');
const shaft = await ejs.renderFile(join(root, 'views', 'site', '_shaft.ejs'), {
  markers: false,
  animate: false,
  t: (key) => key,
});
const mark = readFileSync(join(root, 'views', 'partials', 'brandmark.ejs'), 'utf8');

const page = (body, css) => `<!doctype html><html lang="it"><head><meta charset="utf-8"><style>
@font-face { font-family: 'Fira Sans Condensed'; font-weight: 600; src: url(${fontUrl('fira-sans-condensed-latin-600-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'Fira Sans'; font-weight: 400; src: url(${fontUrl('fira-sans-latin-400-normal.woff2')}) format('woff2'); }
:root { --bar: #000; --font-cond: 'Fira Sans Condensed', sans-serif; }
html, body { margin: 0; background: #000; color: #fff; overflow: hidden; }
${shaftCss}
.brand__mark rect, .brand__mark circle { fill: none; stroke: currentColor; }
${css}
</style></head><body>${body}</body></html>`;

const og = page(
  `<div class="card"><div class="text"><div class="name">${mark}<span>Rilievi Impianti</span></div><p class="by">Carbon Stealth VCC</p></div><div class="drawing">${shaft}</div></div>`,
  `body { width: 1200px; height: 630px; }
.card { display: grid; grid-template-columns: 1fr 360px; align-items: center; height: 630px; padding: 0 72px 0 80px; box-sizing: border-box; }
.name { display: flex; align-items: center; gap: 26px; font-family: 'Fira Sans Condensed'; font-weight: 600; font-size: 104px; line-height: 1; letter-spacing: -0.01em; }
.name .brand__mark { width: 92px; height: 70px; flex: none; }
.by { margin: 26px 0 0 118px; font-family: 'Fira Sans'; font-size: 34px; color: #b8b8b8; }
.drawing .shaft { height: 560px; }`,
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
