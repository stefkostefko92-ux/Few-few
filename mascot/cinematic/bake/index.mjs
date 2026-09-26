// Offline texture baker for the desk set: runs the SAME procedural generators as the runtime
// fallback (../src/desk-textures.js) at hero resolution and writes tileable WebP maps + a manifest
// into dist/tex/ — adapted from boy/bake/index.mjs (same idea: bake once at build time instead of
// paying the cost every page load), trimmed down: no multi-core worker pool (these generators are
// cheap JS loops, not GPU-shaded fragments — a 1536px wood bake takes low single-digit seconds on
// one core, not worth the pool's complexity for two texture sets).
// Usage: node bake/index.mjs [--size=1536] [--out=dist/tex]
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { woodTextures, leatherTextures } from '../src/desk-textures.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const outDir = args.out ? String(args.out) : join(here, '..', 'dist', 'tex');
const woodSize = args.size ? Number(args.size) : 1536;
const leatherSize = Math.max(256, Math.round(woodSize / 2));
const log = (s) => process.stdout.write(`${s}\n`);

// A THREE.DataTexture's `.image` is a plain `{ data, width, height }` — no GPU/DOM needed to read
// the raw RGBA bytes back out, which is what lets this run as a bare Node script.
async function encode(dataTex, file, opts) {
  const { data, width, height } = dataTex.image;
  await sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 } })
    .webp({ effort: 4, quality: 90, ...opts })
    .toFile(join(outDir, file));
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const manifest = {};
  const t0 = Date.now();

  const wood = woodTextures(woodSize);
  manifest.wood = { size: woodSize, repeat: [1, 1], files: { albedo: 'wood_albedo.webp', normal: 'wood_normal.webp', roughness: 'wood_roughness.webp' } };
  await encode(wood.albedoMap, manifest.wood.files.albedo, { quality: 92 });
  await encode(wood.normalMap, manifest.wood.files.normal, { quality: 90 });
  await encode(wood.roughnessMap, manifest.wood.files.roughness, { quality: 85 });
  log(`  wood ${woodSize}px in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const t1 = Date.now();
  const leather = leatherTextures(leatherSize);
  manifest.leather = { size: leatherSize, repeat: [1, 1], files: { normal: 'leather_normal.webp', roughness: 'leather_roughness.webp' } };
  await encode(leather.normalMap, manifest.leather.files.normal, { quality: 90 });
  await encode(leather.roughnessMap, manifest.leather.files.roughness, { quality: 85 });
  log(`  leather ${leatherSize}px in ${((Date.now() - t1) / 1000).toFixed(1)}s`);

  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  log(`✓ bake: ${Object.keys(manifest).length} sets in ${outDir}`);
}

main().catch((err) => {
  process.stderr.write(`bake failed: ${err?.stack ?? err}\n`);
  process.exit(1);
});
