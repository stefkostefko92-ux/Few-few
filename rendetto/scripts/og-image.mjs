// Renders public/img/og.png (1200 × 630) — the picture for link previews. Language-neutral on purpose: the brand
// and a real nested sheet with its router path, straight from the engine (base catalogue, no shop data).
// Run after changing the engine or the look: `node scripts/og-image.mjs` (needs the Playwright dev dependency).
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { baseCatalogData, registerCatalog } from '../engine/catalog.js';
import { buildModel } from '../engine/model.js';
import { nest } from '../engine/nest.js';
import { toGcode } from '../engine/cam.js';

const here = (f) => new URL(f, import.meta.url).pathname;
registerCatalog(baseCatalogData());

const model = buildModel({ type: 'kitchen', modules: 4, moduleWidth: 600 });
const nesting = nest(model);
const sheet = nesting.sheets[0];
const g = toGcode(model, sheet, {
  product: 'Rendetto',
  hash: '0'.repeat(64),
  owner: 'Rendetto',
  date: '2026-10-02',
  sheetCount: nesting.sheets.length,
});
const tools = new Map(g.tools.map((t) => [t.id, t]));
const cls = (t) => (!t || t.kind === 'drill' ? 'tdrill' : t.id === 'T4' ? 'tgroove' : 'tcontour');
const fy = (y) => sheet.h - y;
let paths = '';
let holes = '';
for (const m of g.moves) {
  const t = tools.get(m.tool);
  if (m.type === 'drill') {
    holes += `<circle cx="${m.at[0]}" cy="${fy(m.at[1])}" r="${Math.max((t?.d ?? 5) / 2, 5)}" class="hole ${cls(t)}"/>`;
  } else if (
    m.type !== 'rapid' &&
    m.from &&
    m.to &&
    t &&
    (m.from.X !== m.to.X || m.from.Y !== m.to.Y)
  ) {
    const r = m.center ? Math.hypot(m.from.X - m.center[0], m.from.Y - m.center[1]) : 0;
    const d =
      m.type === 'arc'
        ? `M${m.from.X} ${fy(m.from.Y)}A${r} ${r} 0 0 1 ${m.to.X} ${fy(m.to.Y)}`
        : `M${m.from.X} ${fy(m.from.Y)}L${m.to.X} ${fy(m.to.Y)}`;
    paths += `<path d="${d}" class="cut ${cls(t)}"/>`;
  }
}
const parts = sheet.placements
  .map((p) => {
    const size = Math.min(110, Math.max(44, Math.min(p.w, p.h) * 0.36));
    return `<rect x="${p.x}" y="${fy(p.y + p.h)}" width="${p.w}" height="${p.h}" class="part"/><text x="${p.x + 24}" y="${fy(p.y + p.h) + size + 12}" font-size="${size}" class="pid">${p.partId}</text>`;
  })
  .join('');
const svg = `<svg viewBox="-30 -30 ${sheet.w + 60} ${sheet.h + 60}" class="sheet-art"><rect x="0" y="0" width="${sheet.w}" height="${sheet.h}" class="board"/>${parts}<g class="paths">${paths}</g><g>${holes}</g></svg>`;

// setContent has no origin, so the fonts go in as data URIs
const css = ['base', 'controls', 'site']
  .map((name) => readFileSync(here(`../public/css/${name}.css`), 'utf8'))
  .join('\n')
  .replace(
    /url\('\/static\/fonts\/([\w-]+\.woff2)'\)/g,
    (_m, file) =>
      `url(data:font/woff2;base64,${readFileSync(here(`../public/fonts/${file}`)).toString('base64')})`,
  );
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
.card { display: grid; grid-template-columns: 430px 1fr; gap: 40px; align-items: center; height: 630px; padding: 0 56px; box-sizing: border-box; background: var(--paper); }
.word { display: flex; align-items: center; gap: 18px; font: 760 76px/1 var(--f-text); letter-spacing: -0.04em; font-variation-settings: 'SHRP' 100; color: var(--ink); }
.word svg { width: 74px; height: 74px; flex: none; }
.bed { padding: 20px; }
</style></head><body><div class="card"><div><div class="word"><svg viewBox="0 0 32 32"><rect class="mark-sheet" x="3" y="5" width="26" height="22" rx="1.5"/><path class="mark-path" d="M8 10h7v12M15 10h9v6h-9"/><circle class="mark-hole" cx="23" cy="21.5" r="1.8"/></svg>Rendetto</div></div><figure class="bed">${svg}</figure></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  colorScheme: 'light',
  reducedMotion: 'reduce',
});
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: here('../public/img/og.png') });
await browser.close();
console.log('public/img/og.png');
