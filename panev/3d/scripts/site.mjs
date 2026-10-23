// Publishes the 3D catalogue into the Panev site (run after `npm run build`, see `npm run site`):
//   ../3d-viewer/  the bundle and the baked textures next to it (the site's 3D pages load them);
//   ../img/3d/     every assembly render, and the parts the site shows, as responsive images:
//                  <slug>-480.webp, <slug>-960.webp and <slug>-960.jpg for older browsers;
//   ../img/og-3d.jpg  the share image of the 3D pages (1200 x 630).
// The pages themselves come from the site generator (panev/site/build.mjs).
import sharp from 'sharp';
import { cpSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './serve.mjs';

const SITE = path.resolve(ROOT, '..');
const VIEWER = path.join(SITE, '3d-viewer');
const IMAGES = path.join(SITE, 'img', '3d');
// Parts shown on their own on the site (the home page's SG family card).
const PARTS = ['SG-80-190'];
// Renders shown wide (the home page's 3D poster) get a 1600 px WebP as well.
const LARGE = ['SU-220-160+SG-80-150'];
// Cuts of a render, [left, top, width, height] in its pixels: the home page's hero shows the tall
// door assembly closer, at 4:5; the SX render made for catalogue p. 06 is cut to 4:3 like the rest.
const CUTS = [
  { id: 'A-65-170-7+B-65-320', name: 'a-65-170-7_b-65-320-hero', box: [360, 55, 880, 1100] },
  { id: 'A-65-170-7+B-65-320-SX', dir: 'catalogo', name: 'a-65-170-7_b-65-320-sx', box: [0, 38, 1600, 1200] },
];
const OG = 'A-65-170-7+B-65-320';
const WIDTHS = [480, 960];

// A render's name on the site: lower case, "+" (a space in query strings) spelled "_".
const slug = (id) => id.toLowerCase().replace('+', '_');

// The lossless PNG from the last batch render when there is one, else the committed WebP.
function source(id, dir = '') {
  const png = path.join(ROOT, 'dist', dir ? `renders-${dir}` : 'renders', `${id}.png`);
  return existsSync(png) ? png : path.join(ROOT, 'renders', dir, `${id}.webp`);
}

let files = 0;
async function publish(input, name, widths) {
  const out = path.join(IMAGES, name);
  for (const w of widths) {
    await input().resize({ width: w }).webp({ quality: 82, effort: 6 }).toFile(`${out}-${w}.webp`);
  }
  await input().resize({ width: 960 }).jpeg({ quality: 82, mozjpeg: true }).toFile(`${out}-960.jpg`);
  files += widths.length + 1;
}

rmSync(VIEWER, { recursive: true, force: true });
mkdirSync(VIEWER, { recursive: true });
copyFileSync(path.join(ROOT, 'dist', 'staffe-3d.js'), path.join(VIEWER, 'staffe-3d.js'));
cpSync(path.join(ROOT, 'dist', 'tex'), path.join(VIEWER, 'tex'), { recursive: true });

const assemblies = readdirSync(path.join(ROOT, 'renders'))
  .filter((f) => f.endsWith('.webp') && f.includes('+'))
  .map((f) => f.slice(0, -'.webp'.length));
const ids = [...assemblies, ...PARTS];
rmSync(IMAGES, { recursive: true, force: true });
mkdirSync(IMAGES, { recursive: true });
for (const id of ids) {
  await publish(() => sharp(source(id)), slug(id), LARGE.includes(id) ? [...WIDTHS, 1600] : WIDTHS);
}
for (const { id, dir, name, box: [left, top, width, height] } of CUTS) {
  await publish(() => sharp(source(id, dir)).extract({ left, top, width, height }), name, WIDTHS);
}

// Share image at the 1.91:1 of og:image: the whole height of the part, the studio carried on
// sideways by repeating its edge columns (the backdrop only changes from top to bottom).
const OG_BAND = [55, 1155];
const { width } = await sharp(source(OG)).metadata();
const bandHeight = OG_BAND[1] - OG_BAND[0];
const side = Math.round((bandHeight * (1200 / 630) - width) / 2);
const band = await sharp(source(OG))
  .extract({ left: 0, top: OG_BAND[0], width, height: bandHeight })
  .extend({ left: side, right: side, extendWith: 'copy' })
  .toBuffer();
await sharp(band).resize({ width: 1200, height: 630 }).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(SITE, 'img', 'og-3d.jpg'));

process.stdout.write(`3d-viewer/ (bundle + textures), img/3d/ ${ids.length + CUTS.length} images in ${files} files, img/og-3d.jpg\n`);
