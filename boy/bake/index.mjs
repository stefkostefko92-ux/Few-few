// Offline texture baker: shades every procedural material at 2-4K on all cores, derives normals,
// cavity AO and curvature, then writes tileable WebP maps + tex/manifest.json into dist/.
// Usage: node bake/index.mjs [--only=cobble,wall] [--size=1024] [--force] [--out=dist/tex]
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { allocate, shadeAll } from './pool.mjs';
import { normals, cavity, curvature, packAlbedo, packNormalHeight, packORM } from './maps.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const outDir = args.out ? String(args.out) : join(here, '..', 'dist', 'tex');
const only = args.only ? String(args.only).split(',') : null;
const log = (s) => process.stdout.write(`${s}\n`);

// The cache key covers every texture baker source file, so any generator change re-bakes
// (the motion-capture converter lives here too but does not touch the textures).
function sourceHash() {
  const h = createHash('sha256');
  for (const dir of [here, join(here, 'sets')]) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.mjs') && n !== 'mocap.mjs').sort()) h.update(readFileSync(join(dir, f)));
  }
  return h.digest('hex').slice(0, 16);
}

async function encode(pixels, size, channels, file, opts) {
  await sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength), { raw: { width: size, height: size, channels } })
    .webp({ effort: 5, smartSubsample: true, ...opts })
    .toFile(join(outDir, file));
}

async function bakeSet(url, set, size, seed) {
  const t0 = Date.now();
  const { img, shared } = allocate(size);
  await shadeAll(url, size, seed, shared);
  const mpp = set.tile / size;
  set.relief?.(img, size, mpp);
  const n = normals(img.h, size, mpp, set.normalStrength ?? 1);
  const { ao, depth } = cavity(img.h, size, mpp, set.aoRadii, set.aoWeights);
  const curv = curvature(img.h, size, Math.max(2, Math.round(0.004 / mpp)));
  img.ao = ao;
  set.finish?.(img, size, { depth, curv, mpp });
  const nh = packNormalHeight(n, img.h, size);
  const files = { albedo: `${set.name}_albedo.webp`, normal: `${set.name}_normal.webp`, orm: `${set.name}_orm.webp` };
  await encode(packAlbedo(img, size), size, 3, files.albedo, { quality: 90 });
  await encode(nh.data, size, 4, files.normal, { quality: 90, alphaQuality: 90 });
  await encode(packORM(img, size), size, 4, files.orm, { quality: 88, alphaQuality: 85 });
  log(`  ${set.name} ${size}px in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return { size, tile: set.tile, heightRange: nh.heightRange, files };
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const manifestPath = join(outDir, 'manifest.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  const hash = sourceHash();
  const setsDir = join(here, 'sets');
  const names = readdirSync(setsDir).filter((f) => f.endsWith('.mjs')).sort();
  for (const f of names) {
    const url = pathToFileURL(join(setsDir, f)).href;
    const set = (await import(url)).default;
    if (only && !only.includes(set.name)) continue;
    const size = args.size ? Number(args.size) : set.size;
    const key = `${hash}:${size}`;
    const have = manifest[set.name];
    const intact = have && Object.values(have.files).every((file) => existsSync(join(outDir, file)));
    if (!args.force && have?.key === key && intact) continue;
    manifest[set.name] = { key, ...(await bakeSet(url, set, size, set.seed ?? 1)) };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
  }
  log(`✓ bake: ${Object.keys(manifest).length} texture sets in ${outDir}`);
}

main().catch((err) => {
  process.stderr.write(`bake failed: ${err?.stack ?? err}\n`);
  process.exit(1);
});
