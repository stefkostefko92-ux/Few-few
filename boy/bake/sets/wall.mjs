// Castle ashlar, one tile = 4 m x 4 m, nine courses: pitch-faced limestone blocks with chipped
// arrises and chisel striations, recessed lime mortar, rain streaks, lichen and grime.
// Heights in metres, linear dry albedo; A channel of ORM marks where rain water runs.
import { fbm, perlin, ridged, hash2, smoothstep, clamp01, lerp } from '../field.mjs';

const ROWS = 9;
const COURSE = 1 / ROWS;

function layout(seed) {
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    const cuts = [0];
    let acc = 0;
    let i = 0;
    while (acc < 1) {
      acc += 0.12 + 0.15 * hash2(r, i++, seed);
      cuts.push(acc);
    }
    const scale = 1 / acc;
    rows.push({ cuts: cuts.map((c) => c * scale), shift: hash2(r, 99, seed) });
  }
  return rows;
}

export default {
  name: 'wall',
  size: 4096,
  tile: 4,
  seed: 33,
  aoRadii: [0.006, 0.025, 0.09],
  aoWeights: [0.3, 0.45, 0.25],

  setup(seed) {
    return { seed, rows: layout(seed) };
  },

  shade(ctx, u, v, o) {
    const s = ctx.seed;
    const wv = v + 0.0012 * fbm(u, v, 40, 2, s + 1);
    const rf = wv * ROWS;
    const r = ((Math.floor(rf) % ROWS) + ROWS) % ROWS;
    const row = ctx.rows[r];
    const us = (((u + row.shift + 0.0015 * fbm(u, v, 40, 2, s + 2)) % 1) + 1) % 1;
    let k = 1;
    while (k < row.cuts.length - 1 && row.cuts[k] < us) k++;
    const bid = r * 64 + k;
    const tint = hash2(bid, 1, s);
    const dx = Math.min(us - row.cuts[k - 1], row.cuts[k] - us) * 4;
    const inRow = rf - Math.floor(rf);
    const dy = Math.min(inRow, 1 - inRow) * COURSE * 4;
    const rk = 0.012;
    const edgeDist = -rk * Math.log(Math.exp(-dx / rk) + Math.exp(-dy / rk));
    const chip = 0.009 * fbm(u, v, 70, 4, s + 3) + 0.006 * (ridged(u, v, 30, 3, s + 4) - 0.5);
    const inside = edgeDist - 0.009 + chip;
    const x = clamp01(inside / 0.035);
    const shoulder = Math.sqrt(1 - (1 - x) * (1 - x));

    // Pitch-faced block: bulging centre, hewn lumps, directional chisel marks per block.
    // Tooling direction per block from four periodic orientations (keeps the tile seamless).
    const dir = Math.floor(hash2(bid, 2, s) * 4);
    const stroke =
      dir === 0 ? perlin(u * 40, v * 900, 40, 900, s + 5)
        : dir === 1 ? perlin(u * 900, v * 40, 900, 40, s + 5)
          : dir === 2 ? perlin((u + v) * 640, (u - v) * 30, 640, 30, s + 5)
            : perlin((u - v) * 640, (u + v) * 30, 640, 30, s + 5);
    const chisel = 0.0004 * stroke * (0.5 + 0.5 * fbm(u, v, 30, 2, s + 16));
    const bulge = 0.012 * Math.min(1, inside / 0.12);
    const hewn = 0.006 * fbm(u, v, 18, 4, s + 6);
    const pores = 0.0004 * fbm(u, v, 700, 2, s + 7);
    const blockH = (0.02 + bulge + hewn) * shoulder + (chisel + pores) * x;
    const mortarH = -0.012 + 0.002 * fbm(u, v, 300, 3, s + 8);
    const t = smoothstep(-0.002, 0.002, inside);
    o.h = lerp(mortarH, blockH, t);

    // Colour: warm grey limestone per block, darker rain streaks running down, lichen, soot.
    const base = 0.13 + 0.13 * tint;
    const hue = hash2(bid, 3, s) - 0.5;
    const mottled = Math.max(0.3, 1 + 0.28 * fbm(u, v, 24, 4, s + 9) + 0.08 * fbm(u, v, 260, 2, s + 10));
    const streak = smoothstep(0.1, 0.55, fbm(u, v, 22, 3, s + 11, 0.55, 2));
    const lichenMask = smoothstep(0.55, 0.75, fbm(u, v, 14, 5, s + 12)) * t;
    const lichen = lichenMask * (0.6 + 0.4 * perlin(u * 400, v * 400, 400, 400, s + 13));
    const grime = 0.2 * smoothstep(0.1, 0.6, fbm(u, v, 6, 3, s + 14));
    const dark = (1 - 0.45 * streak) * (1 - grime);
    let r0 = base * (1.03 + 0.12 * hue) * mottled * dark;
    let g0 = base * mottled * dark;
    let b0 = base * (0.9 - 0.1 * hue) * mottled * dark;
    r0 = lerp(r0, 0.3, lichen * 0.7);
    g0 = lerp(g0, 0.29, lichen * 0.7);
    b0 = lerp(b0, 0.17, lichen * 0.7);
    const mortar = 0.2 * (0.9 + 0.2 * fbm(u, v, 120, 2, s + 15)) * (1 - 0.3 * streak);
    o.r = lerp(mortar * 1.02, r0, t);
    o.g = lerp(mortar, g0, t);
    o.b = lerp(mortar * 0.92, b0, t);
    o.rough = lerp(0.95, clamp01(0.86 - 0.16 * streak + 0.06 * lichen), t);
    o.metal = 0;
    o.mask = streak;
  },

  finish(img, size, { depth }) {
    for (let i = 0; i < size * size; i++) {
      const d = clamp01(depth[i] / 0.008);
      const dirt = 1 - 0.35 * d;
      img.r[i] *= dirt;
      img.g[i] *= dirt;
      img.b[i] *= dirt;
    }
  },
};
