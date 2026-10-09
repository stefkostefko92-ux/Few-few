// Deterministic randomness and tileable noise for procedural textures.

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

// Tileable Worley noise over an n x n grid of jittered feature points.
export class Voronoi {
  constructor(n, seed, jitter = 0.75) {
    const rand = rng(seed);
    this.n = n;
    this.px = new Float32Array(n * n);
    this.py = new Float32Array(n * n);
    this.id = new Float32Array(n * n);
    const lo = (1 - jitter) / 2;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        this.px[k] = i + lo + jitter * rand();
        this.py[k] = j + lo + jitter * rand();
        this.id[k] = rand();
      }
    }
    this.f1 = 0;
    this.f2 = 0;
    this.cell = 0;
    this.cx = 0;
    this.cy = 0;
  }

  // u,v in [0,1). Results land in f1, f2 (cell units), cell (random id), cx/cy (feature point).
  query(u, v) {
    const n = this.n;
    const x = u * n;
    const y = v * n;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let f1 = 1e9;
    let f2 = 1e9;
    let best = 0;
    let bx = 0;
    let by = 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const gx = ix + di;
        const gy = iy + dj;
        const wx = ((gx % n) + n) % n;
        const wy = ((gy % n) + n) % n;
        const k = wy * n + wx;
        const fx = this.px[k] + (gx - wx);
        const fy = this.py[k] + (gy - wy);
        const dx = fx - x;
        const dy = fy - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          best = k;
          bx = dx;
          by = dy;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
    this.f1 = f1;
    this.f2 = f2;
    this.cell = this.id[best];
    this.cx = bx;
    this.cy = by;
  }
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const mix = (a, b, t) => a + (b - a) * t;
