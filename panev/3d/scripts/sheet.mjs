// Contact sheets of the renders: every part in catalogue order (catalogo-3d.webp) and every
// assembly (montaggi-3d.webp), each thumbnail labelled with its code.
//   node scripts/sheet.mjs [--dir=renders] [--cols=8] [--thumb=400x300]
import sharp from 'sharp';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './serve.mjs';
import { CATALOG } from '../src/catalog.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const dir = path.resolve(ROOT, args.dir || 'renders');
const [TW, TH] = String(args.thumb || '400x300').split('x').map(Number);
const LABEL = 40;
const PAD = 24;
const HEAD = 84;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function sheet(files, title, outName, cols) {
  const rows = Math.ceil(files.length / cols);
  const width = PAD * 2 + cols * TW;
  const height = HEAD + PAD + rows * (TH + LABEL);
  const tiles = await Promise.all(
    files.map(async (f, i) => {
      const x = PAD + (i % cols) * TW;
      const y = HEAD + Math.floor(i / cols) * (TH + LABEL);
      const thumb = await sharp(path.join(dir, f)).resize(TW, TH, { fit: 'cover' }).toBuffer();
      const code = path.basename(f, '.webp').split('+').map((id) => CATALOG.find((c) => c.id === id)?.code ?? id).join(' + ');
      const label = Buffer.from(`<svg width="${TW}" height="${LABEL}" xmlns="http://www.w3.org/2000/svg"><text x="${TW / 2}" y="26" text-anchor="middle" font-family="DejaVu Sans" font-size="19" font-weight="bold" fill="#162862">${esc(code)}</text></svg>`);
      return [
        { input: thumb, left: x, top: y },
        { input: label, left: x, top: y + TH },
      ];
    }),
  );
  const head = Buffer.from(`<svg width="${width}" height="${HEAD}" xmlns="http://www.w3.org/2000/svg"><text x="${PAD}" y="54" font-family="DejaVu Sans" font-size="34" font-weight="bold" fill="#162862">${esc(title)}</text></svg>`);
  await sharp({ create: { width, height, channels: 3, background: '#f4f6f9' } })
    .composite([{ input: head, left: 0, top: 0 }, ...tiles.flat()])
    .webp({ quality: 86, effort: 6 })
    .toFile(path.join(dir, outName));
  process.stdout.write(`${outName}: ${files.length} renders, ${width}x${height}\n`);
}

const all = readdirSync(dir).filter((f) => f.endsWith('.webp') && !f.endsWith('-3d.webp'));
const parts = CATALOG.map((i) => `${i.id}.webp`).filter((f) => existsSync(path.join(dir, f)));
const pairs = all.filter((f) => f.includes('+')).sort((a, b) => CATALOG.findIndex((i) => a.startsWith(`${i.id}+`)) - CATALOG.findIndex((i) => b.startsWith(`${i.id}+`)));
const cols = Number(args.cols || 8);
if (parts.length) await sheet(parts, 'Panev Ascensori · Catalogo staffe 2026 in 3D', 'catalogo-3d.webp', cols);
if (pairs.length) await sheet(pairs, 'Panev Ascensori · Abbinamenti a catalogo in 3D', 'montaggi-3d.webp', Math.min(cols, 5));
