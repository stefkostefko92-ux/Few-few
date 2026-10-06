// The brand images, all from one source: brand/korpora-logo.png — the owner's logo, a transparent PNG (the wordmark
// with its emblem, the K in the ring, on the left). Renders:
//   public/img/brand/logo-<width>.webp  the logo in the widths of the page headers' and footers' srcset, and a large
//                                       one for the link preview (og-image.ts) and the brochure
//   public/img/brand/logo.png           the logo as PNG, for JSON-LD
//   public/img/favicon.ico              the emblem at 16, 32, 48 and 192 px (Google Search wants one over 48 px)
//   public/img/apple-touch-icon.png     180 px on an opaque tile (iOS rounds the corners and wants no transparency)
//   public/img/icon-<size>.png          192 and 512 px for the web manifest, on the same tile
// Run after changing the logo: `node scripts/brand.mjs` (needs the Playwright dev dependency).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const SOURCE = `data:image/png;base64,${readFileSync(here('../brand/korpora-logo.png')).toString('base64')}`;
// the emblem in the source's pixels: the ring with the K, up to where the K's leg meets the "o"
const EMBLEM = { x: 40, y: 10, w: 698, h: 714 };
// the dark theme's paper (public/css/base.css): the logo was drawn on a dark ground, its glow reads there
const TILE = '#2a2c2f';
const WIDTHS = [160, 320, 480, 1200];
const JSONLD_WIDTH = 640;

// Runs in the page: the source trimmed to what it draws, scaled down in halves (one big step aliases the thin
// lines of the drawing around the emblem), encoded as WebP or PNG.
const RENDER = async ({ source, emblem, tile, widths, jsonldWidth }) => {
  const img = new Image();
  img.src = source;
  await img.decode();
  const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const full = canvas(img.width, img.height);
  full.getContext('2d').drawImage(img, 0, 0);
  // the box of everything visible, with a little room for the glow
  const { data } = full.getContext('2d').getImageData(0, 0, img.width, img.height);
  let x0 = img.width,
    y0 = img.height,
    x1 = 0,
    y1 = 0;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (data[(y * img.width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  const pad = 6;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(img.width - 1, x1 + pad);
  y1 = Math.min(img.height - 1, y1 + pad);
  const crop = (x, y, w, h) => {
    const c = canvas(w, h);
    c.getContext('2d').drawImage(full, x, y, w, h, 0, 0, w, h);
    return c;
  };
  const scaled = (src, w, h) => {
    let cur = src;
    while (cur.width / 2 >= w) {
      const next = canvas(Math.round(cur.width / 2), Math.round(cur.height / 2));
      const ctx = next.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(cur, 0, 0, next.width, next.height);
      cur = next;
    }
    const out = canvas(w, h);
    const ctx = out.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, w, h);
    return out;
  };
  const b64 = (c, type, quality) => c.toDataURL(type, quality).split(',')[1];

  const logo = crop(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  const ratio = logo.width / logo.height;
  const files = {};
  for (const w of widths)
    files[`brand/logo-${w}.webp`] = b64(scaled(logo, w, Math.round(w / ratio)), 'image/webp', 0.9);
  files['brand/logo.png'] = b64(
    scaled(logo, jsonldWidth, Math.round(jsonldWidth / ratio)),
    'image/png',
  );

  // the emblem, centred on a square
  const side = Math.max(emblem.w, emblem.h);
  const square = canvas(side, side);
  square
    .getContext('2d')
    .drawImage(
      full,
      emblem.x,
      emblem.y,
      emblem.w,
      emblem.h,
      (side - emblem.w) / 2,
      (side - emblem.h) / 2,
      emblem.w,
      emblem.h,
    );
  const icon = (size, inset = 0, ground = null) => {
    const c = canvas(size, size);
    const ctx = c.getContext('2d');
    if (ground) {
      ctx.fillStyle = ground;
      ctx.fillRect(0, 0, size, size);
    }
    ctx.drawImage(scaled(square, size - inset * 2, size - inset * 2), inset, inset);
    return b64(c, 'image/png');
  };
  const ico = [16, 32, 48, 192].map((size) => ({ size, png: icon(size) }));
  files['apple-touch-icon.png'] = icon(180, 12, tile);
  for (const size of [192, 512])
    files[`icon-${size}.png`] = icon(size, Math.round(size * 0.08), tile);
  return { files, ico, size: [logo.width, logo.height] };
};

/** ICO with PNG-compressed entries (supported since Windows Vista and by every browser and crawler). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = header.length + dir.length;
  images.forEach(({ size, png }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...images.map((image) => image.png)]);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><title>brand</title>');
  const out = await page.evaluate(RENDER, {
    source: SOURCE,
    emblem: EMBLEM,
    tile: TILE,
    widths: WIDTHS,
    jsonldWidth: JSONLD_WIDTH,
  });
  mkdirSync(here('../public/img/brand'), { recursive: true });
  for (const [name, data] of Object.entries(out.files)) {
    writeFileSync(here(`../public/img/${name}`), Buffer.from(data, 'base64'));
    console.log(`public/img/${name}`);
  }
  writeFileSync(
    here('../public/img/favicon.ico'),
    ico(out.ico.map(({ size, png }) => ({ size, png: Buffer.from(png, 'base64') }))),
  );
  console.log('public/img/favicon.ico (16, 32, 48, 192)');
  console.log(`logo trimmed to ${out.size.join(' × ')} px`);
} finally {
  await browser.close();
}
