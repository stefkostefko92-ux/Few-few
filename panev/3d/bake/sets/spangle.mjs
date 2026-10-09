// Hot-dip zinc, one tile = 120 mm: the coat freezes in grains of about 3 mm, each a barely tilted
// facet with its own sheen and roughness and a feathered (dendritic) texture along one of four
// directions (u, v and the two diagonals, so the tile still repeats), fine grooves where grains
// meet, a bumpier and thicker coat than electro-zinc and broad matte mottling. No passivation
// film. Heights in millimetres; colour and roughness are factors on the material's own values.
import { fbm, perlin, Cells, smoothstep } from '../noise.mjs';

const frac = (x) => x - Math.floor(x);

export default {
  name: 'spangle',
  width: 1024,
  height: 1024,
  tile: [120, 120],
  seed: 23,
  normalStrength: 1,
  exact: true,
  aoRadii: [0.3, 1.5],
  aoWeights: [0.3, 0.2],

  setup(seed) {
    return { seed, grains: new Cells(40, 40, seed + 1, 0.95) };
  },

  shade(ctx, u, v, o) {
    const s = ctx.seed;
    const g = ctx.grains.query(u, v);
    const id = g.id;
    const cell = 120 / 40;
    // The grain's facet: tilted 0.03-0.07° in its own direction, measured from its centre (more
    // would crease the grain boundaries like paving).
    const a = frac(id * 7.3) * Math.PI * 2;
    const tilt = 0.0006 + 0.0006 * frac(id * 13.7);
    const facet = tilt * (g.dx * Math.cos(a) + g.dy * Math.sin(a)) * cell;
    // Feathers: fine streaks along the grain's growth direction (tileable along u+v, u-v too).
    const k = Math.floor(frac(id * 91.3) * 4);
    const feather =
      k === 0 ? perlin(u * 8, v * 300, 8, 300, s + 2)
      : k === 1 ? perlin(u * 300, v * 8, 300, 8, s + 2)
      : k === 2 ? perlin((u + v) * 8, (u - v) * 220, 8, 220, s + 2)
      : perlin((u - v) * 8, (u + v) * 220, 8, 220, s + 2);
    const edge = smoothstep(0.045, 0, g.f2 - g.f1);
    const bump = 0.01 * fbm(u, v, 40, 3, s + 3);
    const mottle = fbm(u, v, 3, 3, s + 4);
    o.h = facet + bump + 0.0015 * feather - 0.0025 * edge;
    const sheen = 0.965 + 0.07 * frac(id * 7.77);
    const lum = sheen * (1 + 0.05 * mottle) * (1 - 0.025 * edge) * (1 + 0.03 * feather);
    o.r = lum;
    o.g = lum;
    o.b = lum * 1.01;
    o.rough = Math.min(1.9, Math.max(0.5, 0.85 + 0.3 * frac(id * 3.3) + 0.15 * mottle + 0.1 * feather + 0.15 * edge));
    o.metal = 0.5;
  },
};
