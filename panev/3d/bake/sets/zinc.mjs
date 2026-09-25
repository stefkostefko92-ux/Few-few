// Electro-galvanised hot-rolled plate, one tile = 80 mm: long low waves from the rolling mill, a
// fine orange peel from the plating, sparse pits in the base steel, cloudy roughness and a faint
// blue/yellow play of the passivation. Heights in millimetres; colour and roughness are factors
// applied to the material's own values at runtime.
import { fbm, perlin, Cells, smoothstep } from '../noise.mjs';

export default {
  name: 'zinc',
  width: 1024,
  height: 1024,
  tile: [80, 80],
  seed: 7,
  normalStrength: 1,
  aoRadii: [0.25, 1],
  aoWeights: [0.3, 0.2],

  setup(seed) {
    return { seed, pits: new Cells(110, 110, seed + 5) };
  },

  shade(ctx, u, v, o) {
    const s = ctx.seed;
    const waves = 0.05 * fbm(u, v, 3, 3, s + 1);
    const peel = 0.003 * fbm(u, v, 40, 3, s + 2);
    const grain = 0.0008 * perlin(u * 320, v * 320, 320, 320, s + 3);
    const p = ctx.pits.query(u, v);
    const pit = p.id > 0.985 ? smoothstep(0.28, 0.04, p.f1) : 0;
    o.h = waves + peel + grain - 0.006 * pit;
    const cloud = fbm(u, v, 5, 4, s + 4);
    const tint = fbm(u, v, 2, 3, s + 6);
    const lum = 1 + 0.03 * cloud - 0.08 * pit;
    o.r = lum * (1 - 0.014 * tint);
    o.g = lum * (1 - 0.003 * tint);
    o.b = lum * (1 + 0.016 * tint);
    const fine = perlin(u * 160, v * 160, 160, 160, s + 7);
    o.rough = Math.min(2, Math.max(0.3, 1 + 0.17 * cloud + 0.07 * fine + 0.25 * pit));
    o.metal = 1;
  },
};
