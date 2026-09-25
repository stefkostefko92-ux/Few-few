// Deterministic randomness and tileable noise for procedural textures.
// Copied from boy/src/noise.js (Carbon Stealth internal reference build) — generic math, no
// domain-specific content, adapted only in this header comment. Products share no code at
// runtime; this file is a vendored copy, not an import across products.

export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Periodic value noise: the lattice wraps every `period` cells so a texture tiles seamlessly.
export class Noise2 {
  constructor(seed) {
    const rand = rng(seed);
    this.perm = new Uint16Array(512);
    this.vals = new Float32Array(256);
    const p = new Uint16Array(256);
    for (let i = 0; i < 256; i++) {
      p[i] = i;
      this.vals[i] = rand();
    }
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  value(x, y, period) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % period) + period) % period;
    const y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const P = this.perm;
    const V = this.vals;
    const a = V[P[P[x0 & 255] + (y0 & 255)]];
    const b = V[P[P[x1 & 255] + (y0 & 255)]];
    const c = V[P[P[x0 & 255] + (y1 & 255)]];
    const d = V[P[P[x1 & 255] + (y1 & 255)]];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  // Fractal sum normalised to [0,1]; period doubles with frequency to keep tiling.
  fbm(x, y, period, octaves = 4, gain = 0.5) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += this.value(x * f, y * f, period * f) * amp;
      norm += amp;
      amp *= gain;
      f *= 2;
    }
    return sum / norm;
  }
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const mix = (a, b, t) => a + (b - a) * t;
