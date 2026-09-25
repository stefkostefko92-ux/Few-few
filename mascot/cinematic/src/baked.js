// Non-blocking upgrade from the runtime-procedural desk textures (scene.js, always built first —
// instant, zero network) to the offline-baked hero-resolution WebP set (bake/index.mjs -> dist/tex/
// manifest.json), when one is present next to the page. Only main.js (the standalone showcase)
// calls this; embed.js (the 232px dashboard profile card) stays procedural on purpose — a tiny
// card is not worth the extra fetches, see mascot/CLAUDE.md cinematic/.
// Adapted from boy/src/baked.js: same "decode to ImageBitmap, configure, swap in" shape, trimmed
// to the two sets this scene actually needs.
import * as THREE from 'three';

async function decode(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return createImageBitmap(await res.blob(), { imageOrientation: 'flipY', colorSpaceConversion: 'none' });
}

function configure(bitmap, srgb, repeat, anisotropy) {
  const t = new THREE.Texture(bitmap);
  t.flipY = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

async function loadSet(base, name, def, maps, anisotropy) {
  const out = {};
  await Promise.all(maps.map(async ([key, mapName, srgb]) => {
    const bitmap = await decode(`${base}${def.files[mapName]}`).catch(() => null);
    if (bitmap) out[key] = configure(bitmap, srgb, def.repeat, anisotropy);
  }));
  return out;
}

// Swaps `materials.wood`/`materials.bookLeather`'s shared maps in place once the bake loads. Silent
// no-op (stays on the procedural fallback already showing) if dist/tex/ is not deployed alongside
// the page — e.g. opened as a bare src/ build, or the bake step was skipped (build.mjs).
export async function upgradeDeskTextures(materials, anisotropy = 8, base = 'tex/') {
  try {
    const manifest = await (await fetch(`${base}manifest.json`)).json();
    if (manifest.wood) {
      const w = await loadSet(base, 'wood', manifest.wood, [['map', 'albedo', true], ['normalMap', 'normal', false], ['roughnessMap', 'roughness', false]], anisotropy);
      if (w.map) materials.wood.map = w.map;
      if (w.normalMap) materials.wood.normalMap = w.normalMap;
      if (w.roughnessMap) materials.wood.roughnessMap = w.roughnessMap;
      materials.wood.needsUpdate = true;
    }
    if (manifest.leather) {
      const l = await loadSet(base, 'leather', manifest.leather, [['normalMap', 'normal', false], ['roughnessMap', 'roughness', false]], anisotropy);
      // `bookLeather` is a factory (materials.js createMaterials), not a single material — the
      // covers already built (desk.js) hold their own clones; patch every one that is live.
      for (const m of materials.bookLeatherInstances ?? []) {
        if (l.normalMap) m.normalMap = l.normalMap;
        if (l.roughnessMap) m.roughnessMap = l.roughnessMap;
        m.needsUpdate = true;
      }
    }
  } catch {
    // stays on the procedural fallback — never surfaces to the page
  }
}
