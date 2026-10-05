// Offline texture baker: shades each procedural set on all cores, derives normals and cavity AO,
// then writes WebP maps + tex/manifest.json into dist/. Usage: node bake/index.mjs [--force]
// [--only=zinc] [--out=dist/tex]. Sets whose sources did not change are skipped.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { allocate, shadeAll } from './pool.mjs';
import { normals, cavity, packAlbedo, packNormal, packORM } from './maps.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const outDir = args.out ? String(args.out) : join(here, '..', 'dist', 'tex');
const only = args.only ? String(args.only).split(',') : null;
const log = (s) => process.stdout.write(`${s}\n`);
const NEAR = Number(args.near ?? 60);

function sourceHash() {
  const h = createHash('sha256');
  for (const dir of [here, join(here, 'sets')]) for (const f of readdirSync(dir).filter((n) => n.endsWith('.mjs')).sort()) h.update(readFileSync(join(dir, f)));
  return h.digest('hex').slice(0, 16);
}

// Albedo is lossy. A face set's normal and ORM maps (`exact: true`) carry slopes of a few 8-bit
// levels that plain lossy WebP flattened into blocks, so they go near-lossless; the edge set's
// strong striations survive lossy WebP at a tenth of the size.
const encode = (pixels, w, h, file, exact = false) =>
  sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength), { raw: { width: w, height: h, channels: 3 } })
    .webp(exact ? { nearLossless: true, quality: NEAR, effort: 6 } : { quality: 92, effort: 5 })
    .toFile(join(outDir, file));

async function bakeSet(url, set) {
  const t0 = Date.now();
  const { width: w, height: h } = set;
  const { img, shared } = allocate(w, h);
  await shadeAll(url, w, h, set.seed, shared);
  const px = [set.tile[0] / w, set.tile[1] / h];
  const n = w * h;
  const ao = cavity(img.h, w, h, px, set.aoRadii, set.aoWeights);
  const files = { albedo: `${set.name}_albedo.webp`, normal: `${set.name}_normal.webp`, orm: `${set.name}_orm.webp` };
  await encode(packAlbedo(img, n), w, h, files.albedo);
  await encode(packNormal(normals(img.h, w, h, px, set.normalStrength), n), w, h, files.normal, set.exact);
  await encode(packORM(img, ao, n), w, h, files.orm, set.exact);
  log(`  ${set.name} ${w}x${h} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return { tile: set.tile, files };
}

mkdirSync(outDir, { recursive: true });
const manifestPath = join(outDir, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const hash = sourceHash();
for (const f of readdirSync(join(here, 'sets')).filter((n) => n.endsWith('.mjs')).sort()) {
  const url = pathToFileURL(join(here, 'sets', f)).href;
  const set = (await import(url)).default;
  if (only && !only.includes(set.name)) continue;
  const have = manifest[set.name];
  const intact = have && Object.values(have.files).every((file) => existsSync(join(outDir, file)));
  if (!args.force && have?.key === hash && intact) continue;
  manifest[set.name] = { key: hash, ...(await bakeSet(url, set)) };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
}
log(`✓ bake: ${Object.keys(manifest).length} texture sets in ${outDir}`);
