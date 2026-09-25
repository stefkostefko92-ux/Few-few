// Courtyard cobbles, one tile = 4 m: water-worn field stones (mostly grey granite, some basalt and
// warm stone) proud of gritty mud joints with sand, pebbles and patchy moss. Heights are metres;
// albedo is linear and dry — the ground shader adds rain wetness (darker, glossier, puddles).
import { Cells, fbm, perlin, hash2, smoothstep, clamp01, lerp } from '../field.mjs';

const N = 24;
const CELL = 4 / N;

export default {
  name: 'cobble',
  size: 4096,
  tile: 4,
  seed: 7,
  aoRadii: [0.004, 0.018, 0.06],
  aoWeights: [0.3, 0.45, 0.25],

  setup(seed) {
    return {
      seed,
      stones: new Cells(N, N, seed, 0.95, true, 0.07),
      grit: new Cells(260, 260, seed + 5, 0.95),
      pits: new Cells(700, 700, seed + 9, 0.9),
    };
  },

  shade(ctx, u, v, o) {
    const s = ctx.seed;
    const wu = u + 0.004 * fbm(u, v, 9, 3, s + 1);
    const wv = v + 0.004 * fbm(u + 0.37, v + 0.11, 9, 3, s + 2);
    const c = ctx.stones.query(wu, wv);
    const k = hash2(c.cx, c.cy, s + 3);
    const joint = 0.001 + 0.006 * clamp01(0.5 + fbm(u, v, 5, 2, s + 18));
    const inside = c.round * CELL - joint + 0.0025 * fbm(u, v, 120, 3, s + 4);
    const radius = 0.03 + 0.015 * k;
    const x = clamp01(inside / radius);
    const shoulder = Math.sqrt(1 - (1 - x) * (1 - x));
    const r = Math.hypot(c.px, c.py) * CELL;
    const dome = clamp01(1 - (r / (0.62 * CELL)) ** 2);
    const tilt = (c.px * (hash2(c.cx, c.cy, s + 6) - 0.5) + c.py * (hash2(c.cx, c.cy, s + 7) - 0.5)) * CELL * 0.04;
    const lumps = 0.002 * fbm(u, v, 48, 3, s + 8);
    const grain = 0.0003 * fbm(u, v, 900, 3, s + 10);
    const p = ctx.pits.query(u, v);
    const pit = p.id > 0.85 ? -0.0008 * smoothstep(0.35, 0.05, p.f1) : 0;
    const top = 0.014 + 0.008 * hash2(c.cx, c.cy, s + 11);
    const stoneH = (top + 0.007 * dome + tilt + lumps) * shoulder + (grain + pit) * x;

    const g = ctx.grit.query(u, v);
    const pebble = g.id > 0.55 ? 0.0028 * Math.sqrt(clamp01(1 - (g.f1 / 0.4) ** 2)) : 0;
    const jointH = -0.002 + 0.0015 * fbm(u, v, 260, 3, s + 12) + pebble;
    const t = smoothstep(-0.0015, 0.0015, inside);
    o.h = lerp(jointH, stoneH, t);

    // Stone palette: grey granite with feldspar/biotite speckle, blue-black basalt, warm sandstone.
    const type = c.id;
    const tone = 1 + 0.12 * fbm(u, v, 30, 3, s + 13) + 0.06 * fbm(u, v, 200, 2, s + 19);
    let r0;
    let g0;
    let b0;
    if (type < 0.68) {
      const sp = perlin(u * 2400, v * 2400, 2400, 2400, s + 14);
      const base = (0.15 + 0.07 * k) * (sp > 0.62 ? 1.35 : sp < -0.65 ? 0.55 : 1);
      const warm = (hash2(c.cx, c.cy, s + 20) - 0.5) * 0.06;
      r0 = base * (1 + warm);
      g0 = base;
      b0 = base * (1.02 - warm);
    } else if (type < 0.88) {
      const base = 0.062 + 0.025 * k;
      r0 = base;
      g0 = base * 1.02;
      b0 = base * 1.08;
    } else {
      const base = 0.17 + 0.04 * k;
      r0 = base * 1.12;
      g0 = base * 0.97;
      b0 = base * 0.78;
    }
    const grime = smoothstep(0.012, 0.0, inside) * 0.45 + 0.12 * smoothstep(0.2, 0.6, fbm(u, v, 40, 3, s + 22));
    r0 *= tone * (1 - grime);
    g0 *= tone * (1 - grime);
    b0 *= tone * (1 - grime * 1.1);

    const moss = smoothstep(0.35, 0.6, fbm(u, v, 6, 4, s + 15)) * (1 - t);
    const mud = 0.045 + 0.022 * fbm(u, v, 90, 2, s + 16);
    const sand = perlin(u * 1600, v * 1600, 1600, 1600, s + 21) > 0.72 ? 0.025 : 0;
    const peb = pebble > 0 ? 0.09 + 0.08 * g.id : 0;
    const jr = peb || lerp(mud * 1.15 + sand, 0.03, moss);
    const jg = peb || lerp(mud + sand * 0.95, 0.05, moss);
    const jb = peb || lerp(mud * 0.8 + sand * 0.8, 0.018, moss);
    o.r = lerp(jr, r0, t);
    o.g = lerp(jg, g0, t);
    o.b = lerp(jb, b0, t);

    const polish = dome * x * 0.2;
    const stoneRough = clamp01(0.72 + 0.08 * fbm(u, v, 300, 2, s + 17) - polish);
    o.rough = lerp(lerp(0.93, 0.85, moss), stoneRough, t);
    o.metal = 0;
    o.mask = 1 - t;
  },

  // Dirt settles in crevices; water collects in joints and hollows (mask -> puddle potential).
  finish(img, size, { depth }) {
    for (let i = 0; i < size * size; i++) {
      const d = clamp01(depth[i] / 0.005);
      const dirt = 1 - 0.3 * d;
      img.r[i] *= dirt;
      img.g[i] *= dirt;
      img.b[i] *= dirt * 0.97;
      img.mask[i] = Math.max(img.mask[i], d);
    }
  },
};
