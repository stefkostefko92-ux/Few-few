// Helpers for the small data textures generated at load time (noise, ripples, puddles).
import * as THREE from 'three';
import { clamp01 } from './noise.js';

export function dataTexture(data, w, h, srgb) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
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
