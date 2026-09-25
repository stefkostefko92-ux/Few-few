// Heavy wool twill, one tile = 0.12 m (about 150 threads): over-under weave with fuzzy fibres.
// Albedo is a neutral multiplier; capes take their colour from the heraldry maps.
import { fbm, perlin, clamp01 } from '../field.mjs';

const THREADS = 152;

export default {
  name: 'fabric',
  size: 1024,
  tile: 0.12,
  seed: 61,
  aoRadii: [0.0003, 0.0015],
  aoWeights: [0.6, 0.4],

  setup(seed) {
    return { seed };
  },

  shade(ctx, u, v, o) {
    const s = ctx.seed;
    const x = u * THREADS;
    const y = v * THREADS;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    // 2/2 twill: warp floats over two wefts, shifted one thread per row.
    const warpOnTop = ((ix + iy) & 3) < 2;
    const warp = Math.sin(Math.PI * fx) * (0.6 + 0.4 * Math.sin(Math.PI * (((iy + ix) & 1) + fy) * 0.5));
    const weft = Math.sin(Math.PI * fy) * (0.6 + 0.4 * Math.sin(Math.PI * (((ix + iy) & 1) + fx) * 0.5));
    const top = warpOnTop ? warp : weft;
    const fuzz = fbm(u, v, 600, 2, s + 1);
    const slub = 0.15 * perlin(u * 40, v * 3, 40, 3, s + 2);
    o.h = 0.00022 * clamp01(top + slub) + 0.00003 * fuzz;
    const tone = 0.78 + 0.1 * fbm(u, v, 20, 3, s + 3) + 0.06 * fuzz;
    o.r = o.g = o.b = tone;
    o.rough = clamp01(0.88 + 0.08 * fuzz);
    o.metal = 0;
    o.mask = top;
  },
};
