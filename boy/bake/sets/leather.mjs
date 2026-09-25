// Oiled vegetable-tanned leather, one tile = 0.3 m: pebbled grain, flex creases, scuffed wear.
import { Cells, fbm, ridged, smoothstep, clamp01, lerp } from '../field.mjs';

export default {
  name: 'leather',
  size: 2048,
  tile: 0.3,
  seed: 51,
  aoRadii: [0.0004, 0.002],
  aoWeights: [0.5, 0.5],

  setup(seed) {
    return { seed, grain: new Cells(150, 150, seed, 0.95) };
  },

  shade(ctx, u, v, o) {
    const s = ctx.seed;
    const g = ctx.grain.query(u + 0.002 * fbm(u, v, 20, 2, s + 1), v);
    const pebble = 0.00012 * Math.sqrt(clamp01(1 - (g.f1 / 0.75) ** 2));
    const crease = ridged(u, v, 6, 4, s + 2);
    const folds = 0.0003 * fbm(u, v, 4, 3, s + 3);
    o.h = pebble + folds - 0.00022 * smoothstep(0.55, 0.9, crease);
    const wear = smoothstep(0.1, 0.6, fbm(u, v, 5, 4, s + 4));
    const tone = 0.85 + 0.25 * fbm(u, v, 30, 3, s + 5);
    o.r = lerp(0.07, 0.13, wear) * tone;
    o.g = lerp(0.035, 0.07, wear) * tone;
    o.b = lerp(0.018, 0.035, wear) * tone;
    o.rough = clamp01(lerp(0.66, 0.5, wear) + 0.08 * fbm(u, v, 200, 2, s + 6) + 0.1 * smoothstep(0.55, 0.9, crease));
    o.metal = 0;
    o.mask = wear;
  },
};
