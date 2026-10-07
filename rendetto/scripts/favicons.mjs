// Renders the raster icons from public/img/favicon.svg. Google Search takes BMP, GIF, ICO, PNG, JPEG, PPM and
// TIFF favicons — not SVG — so the SVG alone shows a blank globe in the results; it recommends one larger than
// 48x48 px, hence the 192 px entry in the ICO (browsers pick the 16 and 32 px ones). iOS wants a 180 px PNG on
// an opaque background, the web manifest 192 and 512 px. Run after changing favicon.svg:
// `node scripts/favicons.mjs` (needs the Playwright dev dependency).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const svg = readFileSync(here('../public/img/favicon.svg'), 'utf8');
// --paper of the light theme (public/css/base.css): the opaque icons sit on the same paper as the site
const PAPER = '#f6f7f1';

/** One PNG of the SVG at `size` px; `inset` leaves a margin of paper around it (iOS and launchers crop corners). */
async function render(page, size, { paper = false, inset = 0 } = {}) {
  const box = size - inset * 2;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${paper ? PAPER : 'transparent'}">${svg.replace('<svg ', `<svg width="${box}" height="${box}" `)}</body>`,
  );
  return page.screenshot({ type: 'png', omitBackground: !paper });
}

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
const page = await browser.newPage({ deviceScaleFactor: 1 });
const entries = [];
for (const size of [16, 32, 48, 192]) entries.push({ size, png: await render(page, size) });
writeFileSync(here('../public/img/favicon.ico'), ico(entries));
writeFileSync(
  here('../public/img/apple-touch-icon.png'),
  await render(page, 180, { paper: true, inset: 18 }),
);
for (const size of [192, 512]) {
  writeFileSync(
    here(`../public/img/icon-${size}.png`),
    await render(page, size, { paper: true, inset: Math.round(size * 0.1) }),
  );
}
await browser.close();
console.log(
  'favicon.ico (16, 32, 48, 192), apple-touch-icon.png (180), icon-192.png, icon-512.png',
);
