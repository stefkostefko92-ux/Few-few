// Тайлируеми скаларни полета за процедурните PBR карти (стомана, кожа, дърво, плат, ризница).
// Всичко е периодично (wrap по решетката), детерминирано по seed — една и съща карта при всяко
// изпичане. Нула DOM: работи и под `node --test`.
import { mulberry32 } from '../rng';

export type Field = Float32Array;

const smooth = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

function lattice(seed: number, px: number, py: number): Float32Array {
  const r = mulberry32(seed);
  const a = new Float32Array(px * py);
  for (let i = 0; i < a.length; i++) a[i] = r();
  return a;
}

/** Стойностен шум с период (px,py) клетки върху единичния тор; (u,v) ∈ [0,1). */
function valueNoise(lat: Float32Array, px: number, py: number, u: number, v: number): number {
  const x = u * px;
  const y = v * py;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const ix0 = ((x0 % px) + px) % px;
  const iy0 = ((y0 % py) + py) % py;
  const ix1 = (ix0 + 1) % px;
  const iy1 = (iy0 + 1) % py;
  const a = lat[iy0 * px + ix0];
  const b = lat[iy0 * px + ix1];
  const c = lat[iy1 * px + ix0];
  const d = lat[iy1 * px + ix1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** fBm върху size×size поле; (fx,fy) = базови периоди (стегнат към оста = „влакно"). */
export function fbm(size: number, seed: number, fx: number, fy: number, octaves = 4, gain = 0.5): Field {
  const out = new Float32Array(size * size);
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const px = Math.round(fx * 2 ** o);
    const py = Math.round(fy * 2 ** o);
    const lat = lattice(seed + o * 101, px, py);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) out[j * size + i] += amp * valueNoise(lat, px, py, i / size, j / size);
    }
    norm += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

/** Worley F1/F2−F1 (пори на кожа, камъчета): връща [f1, edge] полета. */
export function worley(size: number, seed: number, cells: number): { f1: Field; edge: Field } {
  const r = mulberry32(seed);
  const pts = new Float32Array(cells * cells * 2);
  for (let i = 0; i < cells * cells; i++) { pts[i * 2] = r(); pts[i * 2 + 1] = r(); }
  const f1 = new Float32Array(size * size);
  const edge = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i / size) * cells;
      const y = (j / size) * cells;
      const cx = Math.floor(x);
      const cy = Math.floor(y);
      let d1 = 9;
      let d2 = 9;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const gx = cx + dx;
          const gy = cy + dy;
          const k = (((gy % cells) + cells) % cells) * cells + (((gx % cells) + cells) % cells);
          const ex = gx + pts[k * 2] - x;
          const ey = gy + pts[k * 2 + 1] - y;
          const d = Math.hypot(ex, ey);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
      }
      f1[j * size + i] = Math.min(1, d1);
      edge[j * size + i] = Math.min(1, (d2 - d1) * 2);
    }
  }
  return { f1, edge };
}

/** Дълги тънки драскотини (wrap), натрупани във поле [0..1]. */
export function scratches(size: number, seed: number, count: number, dirBias = 0.15): Field {
  const r = mulberry32(seed);
  const out = new Float32Array(size * size);
  for (let n = 0; n < count; n++) {
    const x0 = r() * size;
    const y0 = r() * size;
    const ang = (r() - 0.5) * dirBias * Math.PI * 2 + (r() < 0.25 ? Math.PI / 2 : 0);
    const len = 10 + r() * size * 0.12;
    const str = 0.25 + r() * 0.75;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    for (let t = 0; t < len; t++) {
      const x = Math.round(x0 + dx * t);
      const y = Math.round(y0 + dy * t);
      const fade = Math.sin((t / len) * Math.PI);
      const idx = ((((y % size) + size) % size) * size) + (((x % size) + size) % size);
      out[idx] = Math.min(1, out[idx] + str * fade);
    }
  }
  return out;
}

/** Нормална карта (tangent, +Y нагоре по реда) от поле за височина; височината отива в A. */
export function normalFromHeight(h: Field, size: number, strength: number): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const at = (x: number, y: number): number => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      px[o] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      px[o + 1] = Math.round((-dy * inv * 0.5 + 0.5) * 255);
      px[o + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      px[o + 3] = Math.round(Math.min(1, Math.max(0, h[y * size + x])) * 255);
    }
  }
  return px;
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
