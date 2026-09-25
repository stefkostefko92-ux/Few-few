// Rain on armour, one tile = 0.2 m: beaded droplets of many sizes plus meandering rivulets.
// Used as a clearcoat normal map; A of ORM = water coverage for wet darkening.
import { Cells, fbm, perlin, smoothstep, clamp01 } from '../field.mjs';

export default {
  name: 'drops',
  size: 1024,
  tile: 0.2,
  seed: 91,
  aoRadii: [0.0005],
  aoWeights: [0.2],

  setup(seed) {
    return { seed, big: new Cells(28, 28, seed, 0.95), small: new Cells(90, 90, seed + 1, 0.95) };
  },

  shade(ctx, u, v, o) {
    const s = ctx.seed;
    const cap = (f1, radius, height) => {
      const q = clamp01(1 - (f1 / radius) ** 2);
      return q > 0 ? height * q ** 0.65 : 0;
    };
    const b = ctx.big.query(u, v);
    const bigH = b.id > 0.35 ? cap(b.f1, 0.18 + 0.2 * b.id, 0.0016) : 0;
    const m = ctx.small.query(u, v);
    const smallH = m.id > 0.25 ? cap(m.f1, 0.2 + 0.2 * m.id, 0.0006) : 0;
    // Rivulets: thin meandering channels running down (+v), 4 per tile.
    const meander = 0.012 * perlin(v * 6, u * 2, 6, 2, s + 2) + 0.004 * perlin(v * 40, u * 3, 40, 3, s + 3);
    const lane = (u + meander) * 4;
    const dist = Math.abs(lane - Math.round(lane)) / 4;
    const flow = smoothstep(0.2, 0.7, fbm(u, v, 3, 3, s + 4, 0.5, 1));
    const riv = flow * 0.0005 * clamp01(1 - (dist / 0.004) ** 2);
    o.h = Math.max(bigH, smallH, riv);
    o.r = o.g = o.b = 1;
    o.rough = 0.05;
    o.metal = 0;
    o.mask = o.h > 0 ? 1 : 0;
  },
};
