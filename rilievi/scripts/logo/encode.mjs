// Encodes the owner's two logos (1 November 2026 — "use them as the logo where they fit best; they must be
// legible and well visible") for the pages. The originals stay as they came, in scripts/logo/originals:
//
//   mark.png — the hexagon with "RI" and the shaft behind it. Where the logo has to be small: the black
//     bars of the portal and of the landing (views/partials/brandmark.ejs, 44 CSS px high — 1x, 2x, 3x),
//     the tab icons favicon-32.png / favicon-192.png (centred on a transparent square), the home-screen
//     icon (scripts/brand-images.mjs) and the icons of the installed app (icon-*.png, below).
//   logo.png — the mark with "RILIEVI IMPIANTI" and "PIATTAFORMA TECNICA ASCENSORI". Only where it is
//     shown large enough for the last line to be read (views/partials/logo.ejs: sign-in, the first screen
//     and the footer of the landing, the link preview): one WebP per width in WIDTHS, for `srcset`.
//
// Both are trimmed to what is drawn (the transparent margin would only shrink the logo on the page).
// Small sizes get a light sharpening: the details of the shaft blur into grey otherwise. The unit test
// (tests/marchio.test.ts) checks every file the partials ask for, its size and its transparency.
//
//   npm run brand:logo        # then npm run brand:images for og.png and apple-touch-icon.png
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const originals = join(here, 'originals');
const root = join(here, '..', '..', 'public', 'img');
const brand = join(root, 'brand');

/** The bar height of the mark in CSS px (brandmark.ejs) and its densities. */
const MARK_HEIGHT = 44;
const MARK_DENSITIES = [1, 2, 3];
/** The widths of the full logo (logo.ejs `srcset`): 1x and 2x of the places that show it, 3x of the largest. */
const WIDTHS = [360, 520, 720, 900, 1320];

const trimmed = async (file) => {
  const { data } = await sharp(join(originals, file))
    .ensureAlpha()
    .trim({ threshold: 10 })
    .png()
    .toBuffer({ resolveWithObject: true });
  return data;
};

const report = (file) =>
  console.log(`${file.slice(root.length + 1)}: ${Math.round(statSync(file).size / 1024)} KB`);

const webp = (image, file) =>
  image
    .webp({ quality: 88, alphaQuality: 100, effort: 6 })
    .toFile(file)
    .then(() => report(file));

const mark = await trimmed('mark.png');
const logo = await trimmed('logo.png');

// public/img/brand holds only what this script writes: the old files go first.
mkdirSync(brand, { recursive: true });
for (const name of readdirSync(brand)) rmSync(join(brand, name));

for (const density of MARK_DENSITIES) {
  const height = MARK_HEIGHT * density;
  const image = sharp(mark).resize({ height, kernel: 'lanczos3' });
  await webp(
    density === 1 ? image.sharpen({ sigma: 0.6 }) : image,
    join(brand, `marchio-${height}.webp`),
  );
}

for (const width of WIDTHS) {
  const image = sharp(logo).resize({ width, kernel: 'lanczos3' });
  await webp(
    width < 600 ? image.sharpen({ sigma: 0.5 }) : image,
    join(brand, `logo-${width}.webp`),
  );
}

for (const size of [32, 192]) {
  const file = join(root, `favicon-${size}.png`);
  const resized = sharp(mark).resize({ height: size, kernel: 'lanczos3' });
  const icon = await (size < 64 ? resized.sharpen({ sigma: 0.6 }) : resized).png().toBuffer();
  const { width } = await sharp(icon).metadata();
  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: icon, top: 0, left: Math.round((size - width) / 2) }])
    .png({ compressionLevel: 9, palette: true, quality: 95, dither: 0.5 })
    .toFile(file);
  report(file);
}

// The icons of the installed app (src/pwa/manifest.ts — owner, 4 November 2026: "add to home screen …
// raggiungibile facilmente e a schermo intero"): the mark on black, like the iPhone icon. "any" — the mark
// fills the square as in apple-touch-icon.png; "maskable" — the mark inside the circle of 80 % of the side
// that Android keeps whatever shape it cuts (circle, squircle, drop), the rest black.
for (const [name, size, share] of [
  ['icon-192', 192, 0.86],
  ['icon-512', 512, 0.86],
  ['icon-maskable-192', 192, 0.64],
  ['icon-maskable-512', 512, 0.64],
]) {
  const file = join(root, `${name}.png`);
  const icon = await sharp(mark)
    .resize({ height: Math.round(size * share), kernel: 'lanczos3' })
    .png()
    .toBuffer();
  const { width, height } = await sharp(icon).metadata();
  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  })
    .composite([
      { input: icon, top: Math.round((size - height) / 2), left: Math.round((size - width) / 2) },
    ])
    .flatten({ background: '#000000' })
    .png({ compressionLevel: 9 })
    .toFile(file);
  report(file);
}
