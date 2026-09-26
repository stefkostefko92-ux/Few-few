// Tileable noise for the texture baker: every field is periodic over the unit square (lattice
// coordinates wrap at the period before hashing), so the baked maps repeat without seams.

// Integer hash (lowbias32) of a lattice point and a seed, in [0, 1).
export function hash2(x, y, seed) {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const wrap = (i, p) => ((i % p) + p) % p;

// Gradient noise with integer periods px, py (lattice cells). Output roughly in [-1, 1].
export function perlin(x, y, px, py, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const g = (ix, iy, dx, dy) => {
    const a = hash2(wrap(ix, px), wrap(iy, py), seed) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const u = fade(xf);
  const v = fade(yf);
  const n0 = g(xi, yi, xf, yf) + (g(xi + 1, yi, xf - 1, yf) - g(xi, yi, xf, yf)) * u;
  const n1 = g(xi, yi + 1, xf, yf - 1) + (g(xi + 1, yi + 1, xf - 1, yf - 1) - g(xi, yi + 1, xf, yf - 1)) * u;
  return (n0 + (n1 - n0) * v) * 1.4142;
}

// Fractal sum over the unit square with base frequency f (x) and fy (y) cells per tile.
export function fbm(u, v, f, octaves, seed, gain = 0.5, fy = f) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = f;
  let fz = fy;
  for (let o = 0; o < octaves; o++) {
    sum += amp * perlin(u * fx, v * fz, fx, fz, seed + o * 1013);
    norm += amp;
    amp *= gain;
    fx *= 2;
    fz *= 2;
  }
  return sum / norm;
}

// Tileable Voronoi over nx x ny cells: distance to the nearest feature point (in cells), its id
// in [0, 1) and the offset to it.
export class Cells {
  constructor(nx, ny, seed, jitter = 0.9) {
    this.nx = nx;
    this.ny = ny;
    this.fx = new Float32Array(nx * ny);
    this.fy = new Float32Array(nx * ny);
    this.ids = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        this.fx[k] = 0.5 + jitter * (hash2(i, j, seed) - 0.5);
        this.fy[k] = 0.5 + jitter * (hash2(i, j, seed + 17) - 0.5);
        this.ids[k] = hash2(i, j, seed + 91);
      }
    }
    this.f1 = 0;
    this.f2 = 0;
    this.id = 0;
    this.dx = 0;
    this.dy = 0;
  }

  query(u, v) {
    const x = u * this.nx;
    const y = v * this.ny;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let b1 = 1e9;
    let b2 = 1e9;
    let id = 0;
    let ox = 0;
    let oy = 0;
    for (let j = -1; j <= 1; j++) {
      const wy = wrap(iy + j, this.ny);
      for (let i = -1; i <= 1; i++) {
        const k = wy * this.nx + wrap(ix + i, this.nx);
        const dx = ix + i + this.fx[k] - x;
        const dy = iy + j + this.fy[k] - y;
        const d = dx * dx + dy * dy;
        if (d < b1) {
          b2 = b1;
          b1 = d;
          id = this.ids[k];
          ox = dx;
          oy = dy;
        } else if (d < b2) b2 = d;
      }
    }
    this.f1 = Math.sqrt(b1);
    this.f2 = Math.sqrt(b2);
    this.id = id;
    this.dx = ox;
    this.dy = oy;
    return this;
  }
}

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const lerp = (a, b, t) => a + (b - a) * t;
