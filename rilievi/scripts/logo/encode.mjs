// Encodes the master of logo.py (scripts/logo/out/marchio.png, grey + alpha) for the pages:
// public/img/brand/marchio-<height>.webp for the heights the bars and the footer ask for (1x, 2x, 3x of
// 36 and 48 CSS px — views/partials/brandmark.ejs) and the icons favicon-32.png / favicon-192.png
// (the plate centred on a transparent square). The unit test checks every file and its size.
//
//   npm run brand:logo
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const master = join(here, 'out', 'marchio.png');
const root = join(here, '..', '..', 'public', 'img');
const brand = join(root, 'brand');

/** The plate is 1.3 : 1. */
const widthOf = (height) => Math.round(height * 1.3);
const HEIGHTS = [36, 48, 72, 96, 108, 144];

mkdirSync(brand, { recursive: true });
for (const height of HEIGHTS) {
  const file = join(brand, `marchio-${height}.webp`);
  await sharp(master)
    .resize({ width: widthOf(height), height, fit: 'fill', kernel: 'lanczos3' })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(file);
  console.log(`brand/marchio-${height}.webp: ${Math.round(statSync(file).size / 1024)} KB`);
}
for (const size of [32, 192]) {
  const file = join(root, `favicon-${size}.png`);
  const plate = await sharp(master).resize({ width: size, kernel: 'lanczos3' }).png().toBuffer();
  const { height } = await sharp(plate).metadata();
  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: plate, top: Math.round((size - height) / 2), left: 0 }])
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log(`favicon-${size}.png: ${Math.round(statSync(file).size / 1024)} KB`);
}
