// Дялан камък за сградите на Магнат, една плочка = 1 единица (≈ ширината на къща). Производен
// на `wall` от boy: издути блокове с отчупени ръбове и следи от длето, вдлъбната варова фуга,
// следи от дъжд, лишеи и сажди. Редовете са по-малко (8), защото сградата е малка на екрана —
// фугите трябва да се четат, не да трептят. Височини в единици на плочката.
import { fbm, perlin, ridged, hash2, smoothstep, clamp01, lerp } from '../field.mjs';

const ROWS = 8;
const COURSE = 1 / ROWS;

function layout(seed) {
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    const cuts = [0];
    let acc = 0;
    let i = 0;
    while (acc < 1) {
      acc += 0.13 + 0.14 * hash2(r, i++, seed);
      cuts.push(acc);
    }
    const scale = 1 / acc;
    rows.push({ cuts: cuts.map((c) => c * scale), shift: hash2(r, 99, seed) });
  }
  return rows;
}

export default {
  name: 'stone',
  size: 1024,
  tile: 1,
  seed: 33,
  normalStrength: 1.1,
  aoRadii: [0.004, 0.015, 0.05],
  aoWeights: [0.3, 0.45, 0.25],

  setup(seed) {
    return { seed, rows: layout(seed) };
  },

  shade(ctx, u, v, o) {
    const s = ctx.seed;
    const wv = v + 0.003 * fbm(u, v, 20, 2, s + 1);
    const rf = wv * ROWS;
    const r = ((Math.floor(rf) % ROWS) + ROWS) % ROWS;
    const row = ctx.rows[r];
    const us = (((u + row.shift + 0.004 * fbm(u, v, 20, 2, s + 2)) % 1) + 1) % 1;
    let k = 1;
    while (k < row.cuts.length - 1 && row.cuts[k] < us) k++;
    const bid = r * 64 + k;
    const tint = hash2(bid, 1, s);
    const dx = Math.min(us - row.cuts[k - 1], row.cuts[k] - us);
    const inRow = rf - Math.floor(rf);
    const dy = Math.min(inRow, 1 - inRow) * COURSE;
    const rk = 0.006;
    const edgeDist = -rk * Math.log(Math.exp(-dx / rk) + Math.exp(-dy / rk));
    const chip = 0.004 * fbm(u, v, 40, 4, s + 3) + 0.003 * (ridged(u, v, 16, 3, s + 4) - 0.5);
    const inside = edgeDist - 0.006 + chip;
    const x = clamp01(inside / 0.02);
    const shoulder = Math.sqrt(1 - (1 - x) * (1 - x));

    // Дялан блок: издута среда, неравни бучки, насочени следи от длето за всеки блок.
    const dir = Math.floor(hash2(bid, 2, s) * 2);
    const stroke = dir === 0 ? perlin(u * 24, v * 300, 24, 300, s + 5) : perlin(u * 300, v * 24, 300, 24, s + 5);
    const chisel = 0.0003 * stroke;
    const bulge = 0.008 * Math.min(1, inside / 0.05);
    const hewn = 0.004 * fbm(u, v, 10, 4, s + 6);
    const blockH = (0.012 + bulge + hewn) * shoulder + chisel * x;
    const mortarH = -0.008 + 0.0015 * fbm(u, v, 120, 3, s + 8);
    const t = smoothstep(-0.0015, 0.0015, inside);
    o.h = lerp(mortarH, blockH, t);

    // Топъл сив варовик по блокове, тъмни дъждовни струи надолу, лишеи, сажди.
    const base = 0.16 + 0.14 * tint;
    const hue = hash2(bid, 3, s) - 0.5;
    const mottled = Math.max(0.3, 1 + 0.25 * fbm(u, v, 12, 4, s + 9) + 0.08 * fbm(u, v, 120, 2, s + 10));
    const streak = smoothstep(0.1, 0.55, fbm(u, v, 10, 3, s + 11, 0.55, 2));
    const lichen = smoothstep(0.58, 0.78, fbm(u, v, 7, 5, s + 12)) * t;
    const grime = 0.2 * smoothstep(0.1, 0.6, fbm(u, v, 3, 3, s + 14));
    const dark = (1 - 0.4 * streak) * (1 - grime);
    let r0 = base * (1.05 + 0.12 * hue) * mottled * dark;
    let g0 = base * mottled * dark;
    let b0 = base * (0.88 - 0.1 * hue) * mottled * dark;
    r0 = lerp(r0, 0.26, lichen * 0.6);
    g0 = lerp(g0, 0.27, lichen * 0.6);
    b0 = lerp(b0, 0.14, lichen * 0.6);
    const mortar = 0.22 * (0.9 + 0.2 * fbm(u, v, 60, 2, s + 15)) * (1 - 0.3 * streak);
    o.r = lerp(mortar * 1.02, r0, t);
    o.g = lerp(mortar, g0, t);
    o.b = lerp(mortar * 0.9, b0, t);
    o.rough = lerp(0.95, clamp01(0.86 - 0.14 * streak + 0.06 * lichen), t);
    o.metal = 0;
    o.mask = streak;
  },

  finish(img, size, { depth }) {
    for (let i = 0; i < size * size; i++) {
      const dirt = 1 - 0.35 * clamp01(depth[i] / 0.005);
      img.r[i] *= dirt;
      img.g[i] *= dirt;
      img.b[i] *= dirt;
    }
  },
};
