// Игрално сукно (вълнен кепър), една плочка = една повторка в сцените. Производно на `fabric`
// от boy с по-едър тъкан (32 нишки срещу 16 синусоиди на старата карта — два пъти по-фино,
// без „лего пъпки“) и мъх по повърхността. Албедото е неутрален множител: цвета дава материалът.
import { fbm, perlin, clamp01 } from '../field.mjs';

const THREADS = 32;

export default {
  name: 'felt',
  size: 512,
  tile: 1,
  seed: 67,
  normalStrength: 0.9,
  aoRadii: [0.004, 0.02],
  aoWeights: [0.4, 0.3],

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
    // 2/2 кепър: основата минава над две вътъчни нишки, отместена с една на ред.
    const warpOnTop = ((ix + iy) & 3) < 2;
    const warp = Math.sin(Math.PI * fx) * (0.6 + 0.4 * Math.sin(Math.PI * (((iy + ix) & 1) + fy) * 0.5));
    const weft = Math.sin(Math.PI * fy) * (0.6 + 0.4 * Math.sin(Math.PI * (((ix + iy) & 1) + fx) * 0.5));
    const top = warpOnTop ? warp : weft;
    const fuzz = fbm(u, v, 256, 3, s + 1);
    const slub = 0.12 * perlin(u * 8, v * 2, 8, 2, s + 2);
    // Сукното е стригано: тъканта се вижда, но мъхът заглажда върховете.
    o.h = 0.0025 * clamp01(0.75 * top + slub) + 0.0022 * fuzz;
    const tone = 0.86 + 0.06 * fbm(u, v, 6, 3, s + 3) + 0.05 * fuzz;
    o.r = o.g = o.b = tone;
    o.rough = clamp01(0.9 + 0.08 * fuzz);
    o.metal = 0;
    o.mask = top;
  },
};
