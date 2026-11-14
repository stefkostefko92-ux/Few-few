// Encodes the 16-bit masters of render.py (scripts/render/out/<shot>.png) for the landing page:
// public/img/site/<shot>-<width>.avif and .webp, one per width of the srcset. Single-channel images,
// so the files carry no colour at all. The widths must match the pictures of src/site/immagini.ts
// (the unit test checks that every file the page asks for exists).
//
//   npm run render:encode
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const masters = join(here, 'out');
const target = join(here, '..', '..', 'public', 'img', 'site');

const SHOTS = {
  vano: [640, 960, 1280, 1920, 2400],
  'vano-portrait': [480, 800, 1200],
  bottoniera: [640, 960, 1280, 1600],
  tablet: [640, 960, 1280, 1600],
};

mkdirSync(target, { recursive: true });
for (const file of readdirSync(target)) {
  if (/\.(avif|webp)$/.test(file)) rmSync(join(target, file));
}

let total = 0;
for (const [shot, widths] of Object.entries(SHOTS)) {
  const master = join(masters, `${shot}.png`);
  for (const width of widths) {
    const base = sharp(master).resize({ width, kernel: 'lanczos3' }).toColourspace('b-w');
    const avif = join(target, `${shot}-${width}.avif`);
    const webp = join(target, `${shot}-${width}.webp`);
    await base.clone().avif({ quality: 50, effort: 9 }).toFile(avif);
    await base.clone().webp({ quality: 72, effort: 6 }).toFile(webp);
    const sizes = [avif, webp].map((path) => statSync(path).size);
    total += sizes[0] + sizes[1];
    console.log(
      `${shot}-${width}: avif ${Math.round(sizes[0] / 1024)} KB, webp ${Math.round(sizes[1] / 1024)} KB`,
    );
  }
}
console.log(`total ${Math.round(total / 1024)} KB → ${target}`);
