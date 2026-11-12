// Site photos from the owner's phone (installations on site) into ../img/cantiere/:
//   node scripts/photos.mjs <file>=<name> [<file>=<name> ...]
// Keeps only the photo of a phone screenshot (its longest run of rows that are not black), drops every metadata block
// (EXIF, GPS: sharp keeps none unless asked), evens out the levels a little (the shafts are dark),
// and writes <name>-480.webp, <name>-960.webp and <name>-960.jpg plus <name>.json ({ width, height }).
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './serve.mjs';

const OUT = path.resolve(ROOT, '..', 'img', 'cantiere');
const BAR = 14; // a row whose mean luminance is under this is part of a black bar
mkdirSync(OUT, { recursive: true });

async function contentRows(file) {
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  const mean = (y) => {
    let s = 0;
    for (let x = 0; x < info.width; x++) s += data[y * info.width + x];
    return s / info.width;
  };
  // The photo is the longest run of rows that are not black: a gallery screenshot also has the status
  // bar, the place and date, and a strip of other people's thumbnails, all of it left out.
  let best = [0, -1];
  let start = null;
  for (let y = 0; y <= info.height; y++) {
    const lit = y < info.height && mean(y) >= BAR;
    if (lit && start === null) start = y;
    if (!lit && start !== null) {
      if (y - 1 - start > best[1] - best[0]) best = [start, y - 1];
      start = null;
    }
  }
  const [top, bottom] = best;
  return { width: info.width, top: top + 2, height: bottom - top - 3 }; // 2 px in: no dark seam
}

for (const arg of process.argv.slice(2)) {
  const [file, name] = arg.split('=');
  if (!file || !name || !/^[a-z0-9-]+$/.test(name)) throw new Error(`expected <file>=<name>, got ${arg}`);
  const { width, top, height } = await contentRows(file);
  const photo = () => sharp(file).rotate().extract({ left: 0, top, width, height }).normalise({ lower: 0.5, upper: 99.5 });
  for (const w of [480, 960]) await photo().resize({ width: w }).webp({ quality: 80, effort: 6 }).toFile(path.join(OUT, `${name}-${w}.webp`));
  await photo().resize({ width: 960 }).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(OUT, `${name}-960.jpg`));
  writeFileSync(path.join(OUT, `${name}.json`), `${JSON.stringify({ width: 960, height: Math.round((height * 960) / width) })}\n`);
  process.stdout.write(`${name}: ${width}x${height} from row ${top}\n`);
}
