// Renders public/img/og.png (1200 × 630) — the picture for link previews. Language-neutral on purpose: the brand
// mark (views/partials/mark.ejs) and the nested sheet with its router path from the landing page
// (src/services/landing-assets.ts — the same example project as the landing page and the brochure), straight
// from the engine. The shop catalogue is used when data/catalog.json is there, as on the server.
// Run after changing the engine or the look: `npm run og:image` (needs the Playwright dev dependency).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ROOT } from '../src/paths.js';
import { loadEngine } from '../src/services/engine.js';
import { landingAssets } from '../src/services/landing-assets.js';

await loadEngine(join(ROOT, 'data', 'catalog.json'));
const svg = landingAssets().sheet.svg;
const mark = readFileSync(join(ROOT, 'views', 'partials', 'mark.ejs'), 'utf8').trim();

// setContent has no origin, so the fonts go in as data URIs
const css = ['base', 'controls', 'site']
  .map((name) => readFileSync(join(ROOT, 'public', 'css', `${name}.css`), 'utf8'))
  .join('\n')
  .replace(
    /url\('\/static\/fonts\/([\w-]+\.woff2)'\)/g,
    (_m, file: string) =>
      `url(data:font/woff2;base64,${readFileSync(join(ROOT, 'public', 'fonts', file)).toString('base64')})`,
  );
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
.card { display: grid; grid-template-columns: 430px 1fr; gap: 40px; align-items: center; height: 630px; padding: 0 56px; box-sizing: border-box; background: var(--paper); }
.word { display: flex; align-items: center; gap: 18px; font: 760 76px/1 var(--f-text); letter-spacing: -0.04em; font-variation-settings: 'SHRP' 100; color: var(--ink); }
.word svg { width: 74px; height: 74px; flex: none; }
.bed { padding: 20px; }
</style></head><body><div class="card"><div><div class="word">${mark}Korpora</div></div><figure class="bed">${svg}</figure></div></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  await page.setContent(html, { waitUntil: 'load' });
  // the fonts are data URIs: wait until the page has laid them out before the screenshot
  await page.evaluate('document.fonts.ready.then(() => true)');
  await page.screenshot({ path: join(ROOT, 'public', 'img', 'og.png') });
} finally {
  await browser.close();
}
process.stdout.write('public/img/og.png\n');
