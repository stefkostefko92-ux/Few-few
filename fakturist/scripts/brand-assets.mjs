// Иконите и логото от assets/logo-source.webp (логото от собственика, 13.11.2026; прозрачен фон).
//   node scripts/brand-assets.mjs   → public/img/brand/
// Марката (лявата част) — за иконите на приложението; цялото лого — светъл и тъмен вариант за хедъра.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'assets', 'logo-source.webp');
const out = join(root, 'public', 'img', 'brand');
mkdirSync(out, { recursive: true });

/** Тъмносиньото от логото (≈ #0c1929) → светло за тъмната тема; тюркоазът остава. */
const LIGHT_INK = [232, 238, 245];
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

const trimmed = await sharp(source).trim({ threshold: 1 }).png().toBuffer();
// Марката свършва преди буквите: първата празна колона след x ≈ 300 (при 2000 px ширина — 461).
const { data, info } = await sharp(trimmed)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
let markEnd = 0;
for (let x = Math.round(info.width * 0.15); x < info.width; x++) {
  let empty = true;
  for (let y = 0; y < info.height && empty; y++)
    if (data[(y * info.width + x) * 4 + 3] > 40) empty = false;
  if (empty) {
    markEnd = x;
    break;
  }
}
// Две стъпки: в sharp `trim` минава преди `extract` в една и съща верига.
const markArea = await sharp(trimmed)
  .extract({ left: 0, top: 0, width: markEnd, height: info.height })
  .png()
  .toBuffer();
const mark = await sharp(markArea).trim({ threshold: 1 }).png().toBuffer();

/** Тъмен вариант: всеки „тъмносин“ пиксел (не тюркоазен) става светъл, алфата остава. */
async function recolor(buffer) {
  const img = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
    const teal = g - r > 70 && b - r > 60;
    if (!teal) [px[i], px[i + 1], px[i + 2]] = LIGHT_INK;
  }
  return sharp(px, { raw: img.info }).png().toBuffer();
}

async function logo(buffer, name) {
  const height = 128;
  const resized = sharp(buffer).resize({ height });
  await resized
    .clone()
    .webp({ quality: 92, alphaQuality: 100 })
    .toFile(join(out, `${name}.webp`));
  await resized
    .clone()
    .png({ compressionLevel: 9 })
    .toFile(join(out, `${name}.png`));
}
await logo(trimmed, 'logo');
await logo(await recolor(trimmed), 'logo-dark');

/** Марката в квадрат size × size: `scale` — дял на по-дългата ѝ страна; фон и закръгляне по избор. */
async function icon(size, scale, { radius = 0, background = WHITE } = {}) {
  const inner = Math.round(size * scale);
  const glyph = await sharp(mark).resize({ width: inner, height: inner, fit: 'inside' }).toBuffer();
  const base = sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  });
  const layers = [];
  if (background) {
    const r = Math.round(size * radius);
    layers.push({
      input: Buffer.from(
        `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="rgb(${background.r},${background.g},${background.b})"/></svg>`,
      ),
    });
  }
  layers.push({ input: glyph, gravity: 'center' });
  return base.composite(layers).png({ compressionLevel: 9 }).toBuffer();
}

const files = {
  // „any“ — бял закръглен квадрат: марката се вижда и върху тъмна лента на задачите.
  'icon-192.png': await icon(192, 0.7, { radius: 0.22 }),
  'icon-512.png': await icon(512, 0.7, { radius: 0.22 }),
  // maskable — целият квадрат е фон, марката е в безопасния кръг (радиус 40 %).
  'maskable-192.png': await icon(192, 0.54),
  'maskable-512.png': await icon(512, 0.54),
  // iOS закръгля сам и не приема прозрачност.
  'apple-touch-icon.png': await icon(180, 0.66),
  'favicon-32.png': await icon(32, 0.8, { radius: 0.2 }),
  'favicon-48.png': await icon(48, 0.8, { radius: 0.2 }),
};
for (const [name, buffer] of Object.entries(files)) writeFileSync(join(out, name), buffer);

// favicon.ico с PNG вътре (16, 32, 48) — за браузъри и инструменти, които искат /favicon.ico.
const icoSizes = [16, 32, 48];
const pngs = await Promise.all(icoSizes.map((s) => icon(s, 0.82, { radius: 0.2 })));
const header = Buffer.alloc(6 + 16 * pngs.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngs.length, 4);
let offset = header.length;
pngs.forEach((png, i) => {
  const at = 6 + 16 * i;
  header.writeUInt8(icoSizes[i] % 256, at);
  header.writeUInt8(icoSizes[i] % 256, at + 1);
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(png.length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += png.length;
});
writeFileSync(join(root, 'public', 'favicon.ico'), Buffer.concat([header, ...pngs]));
console.log(
  `лого ${info.width}×${info.height}, марка до x=${markEnd} → public/img/brand/ + public/favicon.ico`,
);
