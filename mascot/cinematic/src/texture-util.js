// Helpers shared by the procedural texture generators. Vendored copy of boy/src/texture-util.js
// (generic three.js DataTexture plumbing, no domain content) — products share no code at runtime.
import * as THREE from 'three';
import { clamp01 } from './noise.js';

let maxAniso = 8;
export function setMaxAnisotropy(v) {
  maxAniso = Math.max(1, Math.min(16, v));
}

export function dataTexture(data, w, h, srgb) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = maxAniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

export function heightToNormal(H, w, h, strength) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const yu = ((y + 1) % h) * w;
    const yd = ((y - 1 + h) % h) * w;
    for (let x = 0; x < w; x++) {
      const xr = (x + 1) % w;
      const xl = (x - 1 + w) % w;
      const dx = (H[y * w + xr] - H[y * w + xl]) * strength;
      const dy = (H[yu + x] - H[yd + x]) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * w + x) * 4;
      out[i] = (-dx * inv * 0.5 + 0.5) * 255;
      out[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      out[i + 2] = (inv * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

export function grayToRGBA(G) {
  const out = new Uint8Array(G.length * 4);
  for (let i = 0; i < G.length; i++) {
    const v = clamp01(G[i]) * 255;
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}
