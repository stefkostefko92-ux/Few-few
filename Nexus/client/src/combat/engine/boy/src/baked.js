// Loads the offline-baked PBR sets (tex/manifest.json + WebP maps). Maps are decoded straight to
// ImageBitmaps, downscaled on the fly to the quality tier's texture budget, and flipped so the
// bakers' "+Y up the image" normals match three.js's tangent space. Without the files (a page
// opened from disk) every set falls back to flat 1x1 maps, so the scene still renders.
import * as THREE from 'three/webgpu';

const SETS = ['cobble', 'wall', 'metal', 'leather', 'fabric', 'wood', 'mail', 'drops'];
const FLAT_ALBEDO = { cobble: [30, 30, 29], wall: [52, 49, 44], wood: [40, 24, 13], leather: [26, 13, 7], fabric: [200, 200, 200], mail: [150, 150, 150], metal: [237, 237, 237], drops: [255, 255, 255] };
const TILE = { cobble: 4, wall: 4, metal: 0.6, leather: 0.3, fabric: 0.12, wood: 1, mail: 0.08, drops: 0.2 };

async function decode(url, maxSize) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const blob = await res.blob();
  const probe = await createImageBitmap(blob);
  const scale = Math.min(1, maxSize / Math.max(probe.width, probe.height));
  const opts = { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
  const w = Math.round(probe.width * scale);
  const h = Math.round(probe.height * scale);
  probe.close();
  return scale >= 1 ? createImageBitmap(blob, opts) : createImageBitmap(blob, { ...opts, resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
}

function configure(t, srgb, anisotropy) {
  t.flipY = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

const pixel = (rgba) => new THREE.DataTexture(new Uint8Array(rgba), 1, 1, THREE.RGBAFormat);

function flatSet(name, anisotropy) {
  return {
    tile: TILE[name],
    heightRange: 0,
    albedo: configure(pixel([...FLAT_ALBEDO[name], 255]), true, anisotropy),
    normal: configure(pixel([128, 128, 255, 128]), false, anisotropy),
    orm: configure(pixel([255, 204, 255, 0]), false, anisotropy),
  };
}

// sizes: { default: px, [set]: px } texture budget per set; onStep(k, n) reports progress.
export async function loadBakedSets(base, sizes, anisotropy, onStep) {
  let manifest;
  try {
    const res = await fetch(`${base}manifest.json`);
    if (!res.ok) throw new Error(`manifest: HTTP ${res.status}`);
    manifest = await res.json();
  } catch {
    return Object.fromEntries(SETS.map((n) => [n, flatSet(n, anisotropy)]));
  }
  const out = Object.fromEntries(SETS.map((n) => [n, flatSet(n, anisotropy)]));
  const jobs = SETS.filter((n) => manifest[n]).flatMap((n) => ['albedo', 'normal', 'orm'].map((map) => [n, map]));
  let done = 0;
  await Promise.all(
    jobs.map(async ([name, map]) => {
      const m = manifest[name];
      // A map that fails to load keeps its flat stand-in; the rest of the set still loads.
      const bitmap = await decode(`${base}${m.files[map]}`, sizes[name] ?? sizes.default).catch(() => null);
      if (bitmap) {
        out[name].tile = m.tile;
        out[name].heightRange = m.heightRange;
        out[name][map] = configure(new THREE.Texture(bitmap), map === 'albedo', anisotropy);
      }
      onStep?.(++done, jobs.length);
    }),
  );
  return out;
}
