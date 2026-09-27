// The Panev Ascensori logo on the site, made from the master the owner supplied
// (../img/brand/panev-ascensori-logo.webp, transparent): cut to the drawing, then
//   ../img/panev-logo.png              640 px wide: the Organization logo of the JSON-LD (Google
//                                      wants 112 px at least each way) and the older browsers' image;
//   ../img/panev-logo[-360|-180].webp  the header, the footer and the 3D pages (srcset);
//   ../img/og-panev.jpg                the pages' share image (1200 x 630): the logo on a white card
//                                      over the catalogue's navy, like the catalogue's cover.
// The catalogue PDF takes the master itself (pdf/logo.py). Run: npm run logo.
import sharp from 'sharp';
import path from 'node:path';
import { ROOT } from './serve.mjs';

const SITE = path.resolve(ROOT, '..');
const MASTER = path.join(SITE, 'img', 'brand', 'panev-ascensori-logo.webp');
const IMG = path.join(SITE, 'img');

// The drawing's box: every pixel more than 3% opaque (the glow fades out into the background).
async function drawingBox(file) {
  const { data, info } = await sharp(file).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  let [left, top, right, bottom] = [info.width, info.height, -1, -1];
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[y * info.width + x] > 8) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < 0) throw new Error(`${MASTER}: no drawing`);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

const box = await drawingBox(MASTER);
const logo = () => sharp(MASTER).extract(box);
const written = [];
await logo().resize({ width: 640 }).png({ compressionLevel: 9 }).toFile(path.join(IMG, 'panev-logo.png'));
written.push('panev-logo.png');
for (const [width, name] of [[640, 'panev-logo.webp'], [360, 'panev-logo-360.webp'], [180, 'panev-logo-180.webp']]) {
  await logo().resize({ width }).webp({ quality: 88, alphaQuality: 100, effort: 6 }).toFile(path.join(IMG, name));
  written.push(name);
}

// Share image: the cover's diagonal navy (#1d3271 top right to #101d49 bottom left), a white card
// with a soft shadow, the logo 820 px wide in it.
const [W, H] = [1200, 630];
const card = { width: 960, height: 300, radius: 28 };
card.left = (W - card.width) / 2;
card.top = (H - card.height) / 2;
const backdrop = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="navy" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1d3271"/><stop offset="0.55" stop-color="#162862"/><stop offset="1" stop-color="#101d49"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-20%" width="120%" height="150%"><feGaussianBlur stdDeviation="18"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#navy)"/>
  <rect x="${card.left}" y="${card.top + 14}" width="${card.width}" height="${card.height}" rx="${card.radius}" fill="#090f27" fill-opacity="0.45" filter="url(#shadow)"/>
  <rect x="${card.left}" y="${card.top}" width="${card.width}" height="${card.height}" rx="${card.radius}" fill="#fff"/>
</svg>`;
const mark = await logo().resize({ width: 820 }).png().toBuffer();
const { height: markHeight } = await sharp(mark).metadata();
await sharp(Buffer.from(backdrop))
  .composite([{ input: mark, left: (W - 820) / 2, top: Math.round((H - markHeight) / 2) }])
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile(path.join(IMG, 'og-panev.jpg'));
written.push('og-panev.jpg');

process.stdout.write(`logo ${box.width} x ${box.height} from the master; img/: ${written.join(', ')}\n`);
