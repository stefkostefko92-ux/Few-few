// Poster frames of the installation videos for the site (../img/video/), from clean renders of the films (no captions):
//   node scripts/video-posters.mjs <frame.png>=<name> [<frame.png>=<name> ...]
// The frames come from `py run.py` (3d/video, 1920 × 1080; the guide film with VIDEO_FILM=guida); renders are not in
// git, so the paths are given here. Writes, all 16:9 except the share image:
//   <name>-480.webp, -960.webp, -1600.webp and -960.jpg — the <picture> on the pages (templates/videos.mjs);
//   <name>-1280.jpg — the thumbnail for Google (VideoObject.thumbnailUrl: one stable address, no ?v=);
//   <name>-og.jpg — 1200 × 630, the image for social shares (og:image), cropped to the middle.
// No metadata is kept (sharp drops EXIF unless asked).
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './serve.mjs';

const OUT = path.resolve(ROOT, '..', 'img', 'video');
mkdirSync(OUT, { recursive: true });

const jobs = process.argv.slice(2).map((arg) => {
  const at = arg.lastIndexOf('=');
  if (at < 1) throw new Error(`expected <frame.png>=<name>, got ${arg}`);
  return { file: arg.slice(0, at), name: arg.slice(at + 1) };
});
if (!jobs.length) throw new Error('usage: node scripts/video-posters.mjs <frame.png>=<name> ...');

for (const { file, name } of jobs) {
  const src = sharp(file).removeAlpha();
  const meta = await src.metadata();
  if (Math.abs(meta.width / meta.height - 16 / 9) > 0.01) throw new Error(`${file}: not 16:9 (${meta.width} × ${meta.height})`);
  const out = (suffix) => path.join(OUT, `${name}-${suffix}`);
  for (const w of [480, 960, 1600]) {
    await src.clone().resize(w, Math.round((w * 9) / 16)).webp({ quality: 80, effort: 6 }).toFile(out(`${w}.webp`));
  }
  await src.clone().resize(960, 540).jpeg({ quality: 82, mozjpeg: true }).toFile(out('960.jpg'));
  await src.clone().resize(1280, 720).jpeg({ quality: 84, mozjpeg: true }).toFile(out('1280.jpg'));
  await src.clone().resize(1200, 630, { fit: 'cover', position: 'centre' }).jpeg({ quality: 84, mozjpeg: true }).toFile(out('og.jpg'));
  process.stdout.write(`${name}: 480/960/1600 webp, 960/1280 jpg, og 1200 × 630\n`);
}
