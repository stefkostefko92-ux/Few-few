#!/usr/bin/env node
// Офлайн изпичане на фотореалистичните рендери на предметите: за всеки slug от
// public/assets/items3d/catalog.json (+ няколко общи отвари/камъни) → public/assets/items/<slug>.webp
// (512×512, прозрачен фон) + manifest.json (slug → файл, хеш на съдържанието).
//
//   npm run bake:items                      # всички
//   npm run bake:items -- --only iron_sword,silver_ring --out /tmp/preview
//   npm run bake:items -- --jobs 4 --quality 80
//
// Как: vite dev сървър сервира bake.html (същият three/webgpu генератор като прегледа), headless
// Chromium (playwright-core, SwiftShader — без GPU) рисува HDR кадър 1024px със сенки + IBL,
// страницата прави bloom/сянка/ACES и връща WebP. Детерминирано: seed по slug, фиксирана
// среда/камера; същият вход → същите байтове (манифестът пази sha256 на файла).
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : def; };
const outDir = path.resolve(arg('out', path.join(root, 'public/assets/items')));
const only = arg('only', '') ? new Set(arg('only', '').split(',')) : null;
const jobs = Math.max(1, Number(arg('jobs', '3')));
const quality = Number(arg('quality', '80')) / 100;
const port = Number(arg('port', '5199'));

const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/items3d/catalog.json'), 'utf8'));
let slugs = catalog.map((e) => e.slug);
const extra = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/items3d/extras.json'), 'utf8')).map((e) => e.slug);
slugs = [...slugs, ...extra];
if (only) slugs = slugs.filter((s) => only.has(s));
fs.mkdirSync(outDir, { recursive: true });

const server = await createServer({ root, server: { port, strictPort: true }, logLevel: 'error', clearScreen: false });
await server.listen();
const exe = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});

const results = new Map();
const failed = [];
let next = 0;
const started = Date.now();

async function worker(id) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => process.stderr.write(`[w${id}] ${e.message.slice(0, 300)}\n`));
  await page.goto(`http://localhost:${port}/bake.html`);
  await page.waitForFunction(() => window.__bake, null, { timeout: 120000 });
  while (next < slugs.length) {
    const slug = slugs[next++];
    try {
      const r = await page.evaluate(([s, q]) => window.__bake.render(s, q), [slug, quality]);
      if (!r) { failed.push([slug, 'няма геометрия']); continue; }
      const buf = Buffer.from(r.webp, 'base64');
      fs.writeFileSync(path.join(outDir, `${slug}.webp`), buf);
      results.set(slug, { file: `${slug}.webp`, hash: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12), bytes: buf.length });
    } catch (e) {
      failed.push([slug, String(e.message).slice(0, 200)]);
    }
    const done = results.size + failed.length;
    if (done % 10 === 0) process.stdout.write(`${done}/${slugs.length}  ${((Date.now() - started) / 1000).toFixed(0)}s\n`);
  }
  await page.close();
}

await Promise.all(Array.from({ length: jobs }, (_, i) => worker(i)));
await browser.close();
await server.close();

const manifestPath = path.join(outDir, 'manifest.json');
const prev = fs.existsSync(manifestPath) && only ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')).items : {};
const items = { ...prev };
for (const s of slugs) if (results.has(s)) items[s] = { file: results.get(s).file, hash: results.get(s).hash };
// Псевдоними „категория-тир" → представителен предмет (за места без slug: награди, рецепти…).
const RANK = { legendary: 4, epic: 3, rare: 2, uncommon: 1, common: 0 };
const aliases = {};
const byKey = new Map();
for (const e of catalog) {
  if (!items[e.slug]) continue;
  const base = e.category === 'weapon' ? (e.icon || e.sub_type || 'sword') : e.category;
  const t = Math.min(10, Math.max(1, e.tier || 1));
  for (const key of [`${base}-t${t}`]) {
    const cur = byKey.get(key);
    if (!cur || RANK[e.rarity] > RANK[cur.rarity] || (RANK[e.rarity] === RANK[cur.rarity] && e.slug < cur.slug)) byKey.set(key, e);
  }
}
for (const [k, e] of byKey) aliases[k] = e.slug;
for (const base of new Set([...byKey.keys()].map((k) => k.replace(/-t\d+$/, '')))) {
  const mid = [3, 4, 2, 5, 1, 6, 7, 8, 9, 10].map((t) => aliases[`${base}-t${t}`]).find(Boolean);
  if (mid) aliases[base] = mid;
}
const sorted = Object.fromEntries(Object.entries(items).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(manifestPath, JSON.stringify({ version: 1, size: 512, format: 'webp', items: sorted, aliases: Object.fromEntries(Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b))) }, null, 1) + '\n');

const total = [...results.values()].reduce((s, r) => s + r.bytes, 0);
process.stdout.write(`готово: ${results.size} рендера, ср. ${(total / Math.max(1, results.size) / 1024).toFixed(1)} KB, ${failed.length} пропуснати, ${((Date.now() - started) / 1000).toFixed(0)}s\n`);
for (const [s, why] of failed) process.stdout.write(`  ! ${s}: ${why}\n`);
