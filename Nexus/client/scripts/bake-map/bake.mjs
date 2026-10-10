/* Печене на картата и кадрите на регионите (офлайн, повторяемо, seed = world.js).
 *   npm run bake:map                 — всичко
 *   node scripts/bake-map/bake.mjs --map | --regions | --only=slug,slug | --draft
 * Изход: public/assets/map/world*.webp, public/assets/regions/<slug>.webp,
 *        src/data/worldPins.ts (позиции на пиновете, проектирани от камерата).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from './host.mjs';
import { REGIONS } from './world.js';
import { contactSheet } from './contact.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const MAP = path.join(root, 'public/assets/map');
const REG = path.join(root, 'public/assets/regions');
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const draft = has('--draft');
const doMap = has('--map') || (!has('--regions') && !only.length);
const doReg = has('--regions') || only.length > 0 || (!has('--map'));
const SPP_MAP = draft ? 1 : 3, SPP_REG = draft ? 1 : 3;
const MAX = 250 * 1024;

fs.mkdirSync(MAP, { recursive: true });
fs.mkdirSync(REG, { recursive: true });
const { page, close } = await openPage({ log: false });
await page.evaluate(async () => { window.bk = new Baker(); await bk.loadShaders(); bk.bakeWorld(3072); });
const save = (f, b64) => { fs.writeFileSync(f, Buffer.from(b64, 'base64')); return fs.statSync(f).size; };

if (doMap) {
  const W = draft ? 1280 : 3840, H = W * 9 / 16;
  console.log('карта', W, 'x', H);
  const r = await page.evaluate((j) => bk.job(j), {
    kind: 'map', w: W, h: H, samples: SPP_MAP, quality: 1, tile: 96,
    encode: [
      { name: 'world.webp', format: 'image/webp', quality: 0.84 },
      { name: 'world-1920.webp', format: 'image/webp', quality: 0.84, scale: 0.5 },
      { name: 'world-960.webp', format: 'image/webp', quality: 0.82, scale: 0.25 },
    ],
  });
  for (const f of r.files) console.log(' ', f.name, save(path.join(MAP, f.name), f.b64), 'B');
  const pins = Object.fromEntries(r.pins.map((p) => [p.slug, [+p.uv[0].toFixed(4), +p.uv[1].toFixed(4)]]));
  fs.mkdirSync(path.join(root, 'src/data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/data/worldPins.ts'),
    `/* Генерирано от scripts/bake-map (npm run bake:map) — не редактирай на ръка.\n * Позиции на пиновете (0..1 върху world.webp), проектирани от камерата на рендера. */\nexport const WORLD_PINS: Record<string, [number, number]> = ${JSON.stringify(pins, null, 2)};\n`);
}

if (doReg) {
  const list = only.length ? only : REGIONS.map((r) => r.slug);
  const files = [];
  for (const slug of list) {
    const t0 = Date.now();
    const r = await page.evaluate((j) => bk.job(j), {
      kind: 'region', slug, w: 1600, h: 900, samples: SPP_REG, quality: 1, tile: 96,
      encode: [0.82, 0.74, 0.66, 0.58, 0.5].map((q) => ({ name: `${slug}.webp@${q}`, format: 'image/webp', quality: q })),
    });
    const pick = r.files.find((f) => Buffer.from(f.b64, 'base64').length <= MAX) || r.files[r.files.length - 1];
    const size = save(path.join(REG, `${slug}.webp`), pick.b64);
    files.push(path.join(REG, `${slug}.webp`));
    console.log(slug, size, 'B', pick.name, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  if (!only.length && process.env.CONTACT) await contactSheet(files, process.env.CONTACT, 3, 640);
}
await close();
