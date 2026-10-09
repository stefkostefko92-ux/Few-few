// Loads the offline-baked PBR sets (tex/manifest.json + WebP maps): albedo, tangent-space normal
// and ORM (ambient occlusion, roughness factor ×0.5, and a free channel the zinc uses for its
// passivation film's thickness). A missing file (page opened
// from disk, bake not run) falls back to a flat 1x1 stand-in so the scene still renders.
import * as THREE from 'three/webgpu';


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

// The manifest is fetched once per page; null when it is missing.
let manifestOnce = null;
const manifestAt = (base) =>
  (manifestOnce ??= fetch(`${base}manifest.json`)
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null));

// `names`: the sets to load now. The bright finish needs zinc and edge at boot; the hot-dip grains
// load when that finish is first chosen.
export async function loadSets(base, names = ['zinc', 'edge']) {
  const out = Object.fromEntries(names.map((n) => [n, flatSet()]));
  const manifest = await manifestAt(base);
  if (!manifest) return out;
  await Promise.all(
    names.filter((n) => manifest[n]).flatMap((n) =>
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
