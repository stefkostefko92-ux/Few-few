// Tileable noise fields for the texture baker. Every function is periodic over the unit square so
// baked maps tile without seams: lattice coordinates wrap at the period before hashing.

// Integer hash (lowbias32) of a 2D lattice point and a seed, returned in [0, 1).
export function hash2(x, y, seed) {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Per-seed permutation + unit gradient tables, built once and cached.
const tables = new Map();
function table(seed) {
  let t = tables.get(seed);
  if (t) return t;
  const perm = new Uint16Array(512);
  const p = new Uint16Array(256);
  const gx = new Float32Array(256);
  const gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    p[i] = i;
    const a = hash2(i, 7, seed) * Math.PI * 2;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(hash2(i, 3, seed) * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  t = { perm, gx, gy };
  tables.set(seed, t);
  return t;
}

// Gradient (Perlin) noise with integer periods px, py in lattice cells. Output roughly [-1, 1].
export function perlin(x, y, px, py, seed) {
  const T = table(seed);
  const P = T.perm;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const x0 = ((xi % px) + px) % px;
  const y0 = ((yi % py) + py) % py;
  const x1 = x0 + 1 === px ? 0 : x0 + 1;
  const y1 = y0 + 1 === py ? 0 : y0 + 1;
  const a = P[P[x0 & 255] + (y0 & 255)];
  const b = P[P[x1 & 255] + (y0 & 255)];
  const c = P[P[x0 & 255] + (y1 & 255)];
  const d = P[P[x1 & 255] + (y1 & 255)];
  const GX = T.gx;
  const GY = T.gy;
  const n00 = GX[a] * xf + GY[a] * yf;
  const n10 = GX[b] * (xf - 1) + GY[b] * yf;
  const n01 = GX[c] * xf + GY[c] * (yf - 1);
  const n11 = GX[d] * (xf - 1) + GY[d] * (yf - 1);
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const nx0 = n00 + (n10 - n00) * u;
  const nx1 = n01 + (n11 - n01) * u;
  return (nx0 + (nx1 - nx0) * v) * 1.4142;
}

// Fractal sum over the unit square (u, v in [0,1)), base frequency f cells per tile, in [-1, 1].
// An optional fy stretches the noise (fy != f) for streaks and grain.
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

// Ridged fractal (sharp creases, cracks, veins) in [0, 1].
export function ridged(u, v, f, octaves, seed, gain = 0.55) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = f;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(perlin(u * fx, v * fx, fx, fx, seed + o * 733));
    sum += amp * n * n;
    norm += amp;
    amp *= gain;
    fx *= 2;
  }
  return sum / norm;
}

// Tileable Voronoi over an nx x ny grid. f1 = distance to the nearest feature point; with
// `edges` also the exact distance to the nearest cell border (Quilez). Units are cells.
export class Cells {
  constructor(nx, ny, seed, jitter = 0.85, edges = false, roundK = 0) {
    this.nx = nx;
    this.ny = ny;
    this.edges = edges;
    this.roundK = roundK;
    this.round = 0;
    const n = nx * ny;
    this.fx = new Float32Array(n);
    this.fy = new Float32Array(n);
    this.ids = new Float32Array(n);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        this.fx[k] = 0.5 + jitter * (hash2(i, j, seed) - 0.5);
        this.fy[k] = 0.5 + jitter * (hash2(i, j, seed + 17) - 0.5);
        this.ids[k] = hash2(i, j, seed + 91);
      }
    }
    this.f1 = 0;
    this.edge = 0;
    this.id = 0;
    this.cx = 0;
    this.cy = 0;
    this.px = 0;
    this.py = 0;
  }

  query(u, v) {
    const nx = this.nx;
    const ny = this.ny;
    const x = u * nx;
    const y = v * ny;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let best = 1e9;
    let mx = 0;
    let my = 0;
    let bi = 0;
    let bj = 0;
    for (let j = -1; j <= 1; j++) {
      const gy = iy + j;
      const wy = ((gy % ny) + ny) % ny;
      for (let i = -1; i <= 1; i++) {
        const gx = ix + i;
        const k = wy * nx + (((gx % nx) + nx) % nx);
        const dx = gx + this.fx[k] - x;
        const dy = gy + this.fy[k] - y;
        const d = dx * dx + dy * dy;
        if (d < best) {
          best = d;
          mx = dx;
          my = dy;
          bi = gx;
          bj = gy;
        }
      }
    }
    if (this.edges) {
      // edge = exact border distance; round = smooth minimum over borders, so polygon corners
      // become rounded like water-worn stones (radius ~ roundK cells).
      const rk = this.roundK;
      let edge = 1e9;
      let acc = 0;
      for (let j = -2; j <= 2; j++) {
        const gy = bj + j;
        const wy = ((gy % ny) + ny) % ny;
        for (let i = -2; i <= 2; i++) {
          if (i === 0 && j === 0) continue;
          const gx = bi + i;
          const k = wy * nx + (((gx % nx) + nx) % nx);
          const dx = gx + this.fx[k] - x;
          const dy = gy + this.fy[k] - y;
          const ex = dx - mx;
          const ey = dy - my;
          const len = Math.sqrt(ex * ex + ey * ey);
          const d = ((mx + dx) * ex + (my + dy) * ey) / (2 * len);
          if (d < edge) edge = d;
          if (rk > 0) acc += Math.exp(-d / rk);
        }
      }
      this.edge = edge;
      this.round = rk > 0 ? -rk * Math.log(acc) : edge;
    }
    const wbx = ((bi % nx) + nx) % nx;
    const wby = ((bj % ny) + ny) % ny;
    this.f1 = Math.sqrt(best);
    this.id = this.ids[wby * nx + wbx];
    this.cx = wbx;
    this.cy = wby;
    this.px = -mx;
    this.py = -my;
    return this;
  }
}

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const lerp = (a, b, t) => a + (b - a) * t;
