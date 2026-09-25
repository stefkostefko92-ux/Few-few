// Loads the offline-baked PBR sets (tex/manifest.json + WebP maps): albedo, tangent-space normal
// and ORM (ambient occlusion, roughness factor ×0.5, metalness). A missing file (page opened
// from disk, bake not run) falls back to a flat 1x1 stand-in so the scene still renders.
import * as THREE from 'three/webgpu';

const SETS = ['zinc', 'edge'];

function configure(t, srgb) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

const pixel = (rgba) => new THREE.DataTexture(new Uint8Array(rgba), 1, 1, THREE.RGBAFormat);
const flatSet = () => ({
  tile: 100,
  albedo: configure(pixel([255, 255, 255, 255]), true),
  normal: configure(pixel([128, 128, 255, 255]), false),
  orm: configure(pixel([255, 128, 255, 255]), false),
});

async function bitmap(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return createImageBitmap(await res.blob(), { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
}

export async function loadSets(base) {
  const out = Object.fromEntries(SETS.map((n) => [n, flatSet()]));
  let manifest;
  try {
    const res = await fetch(`${base}manifest.json`);
    if (!res.ok) return out;
    manifest = await res.json();
  } catch {
    return out;
  }
  await Promise.all(
    SETS.filter((n) => manifest[n]).flatMap((n) =>
      ['albedo', 'normal', 'orm'].map(async (map) => {
        const img = await bitmap(`${base}${manifest[n].files[map]}`).catch(() => null);
        if (!img) return;
        const tex = new THREE.Texture(img);
        tex.flipY = false;
        out[n][map] = configure(tex, map === 'albedo');
        out[n].tile = manifest[n].tile;
      }),
    ),
  );
  return out;
}
