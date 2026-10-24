// Data textures read by shaders: shared noise, rain-ripple impacts and the puddle layout.
import * as THREE from 'three';
import { Noise2, rng, clamp01, smooth } from './noise.js';
import { dataTexture, grayToRGBA } from './texture-util.js';

// Shared shader noise: four independent tileable fBm fields (R 4, G 8, B 16 cells, A 6 cells).
export function noiseTexture(size = 256) {
  const nz = [new Noise2(101), new Noise2(202), new Noise2(303), new Noise2(404)];
  const A = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = (y * size + x) * 4;
      A[i] = nz[0].fbm(u * 4, v * 4, 4, 5) * 255;
      A[i + 1] = nz[1].fbm(u * 8, v * 8, 8, 4) * 255;
      A[i + 2] = nz[2].fbm(u * 16, v * 16, 16, 3) * 255;
      A[i + 3] = nz[3].fbm(u * 6, v * 6, 6, 4) * 255;
    }
  }
  return dataTexture(A, size, size, false);
}

// Rain ripples on standing water: per texel the offset to the nearest impact site (RG),
// its random phase (B) and a coverage mask (A). Sites are spaced so rings never overlap.
export function rippleTexture(size = 256) {
  const rand = rng(8080);
  const R = 0.12;
  const sites = [];
  for (let k = 0; k < 4000 && sites.length < 26; k++) {
    const x = rand();
    const y = rand();
    let ok = true;
    for (const s of sites) {
      let dx = Math.abs(s.x - x);
      let dy = Math.abs(s.y - y);
      dx = Math.min(dx, 1 - dx);
      dy = Math.min(dy, 1 - dy);
      if (dx * dx + dy * dy < 4 * R * R) {
        ok = false;
        break;
      }
    }
    if (ok) sites.push({ x, y, t: rand() });
  }
  const A = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = (px + 0.5) / size;
      const v = (py + 0.5) / size;
      let best = null;
      let bd = 1e9;
      let bx = 0;
      let by = 0;
      for (const s of sites) {
        let dx = u - s.x;
        let dy = v - s.y;
        dx -= Math.round(dx);
        dy -= Math.round(dy);
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = s;
          bx = dx;
          by = dy;
        }
      }
      const i = (py * size + px) * 4;
      const inside = Math.sqrt(bd) < R;
      A[i] = (THREE.MathUtils.clamp(bx / R, -1, 1) * 0.5 + 0.5) * 255;
      A[i + 1] = (THREE.MathUtils.clamp(by / R, -1, 1) * 0.5 + 0.5) * 255;
      A[i + 2] = best.t * 255;
      A[i + 3] = inside ? 255 : 0;
    }
  }
  const t = dataTexture(A, size, size, false);
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
}

// Where water pools on the 44 m courtyard floor (world-space, not tiled).
export function puddleTexture(size = 512, extent = 44) {
  const nz = new Noise2(55);
  const nz2 = new Noise2(56);
  const G = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wx = (x / size - 0.5) * extent;
      const wz = (y / size - 0.5) * extent;
      const n = nz.fbm(wx * 0.16 + 40, wz * 0.16 + 40, 256, 4) + 0.35 * nz2.fbm(wx * 0.7 + 90, wz * 0.7 + 90, 256, 3);
      const m = smooth(0.84, 0.97, n);
      const centre = 1 - smooth(2.2, 4.2, Math.hypot(wx - 0.6, wz - 1.4));
      const lane = (1 - smooth(0.6, 1.4, Math.abs(wx + 3 + Math.sin(wz * 0.35) * 1.5))) * 0.8 * smooth(0.55, 0.8, n);
      G[y * size + x] = clamp01(Math.max(m, centre * 0.95, lane));
    }
  }
  const t = dataTexture(grayToRGBA(G), size, size, false);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
