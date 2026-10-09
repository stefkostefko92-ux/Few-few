// Laser-cut edge under the zinc, one tile = 20 mm along the cut by 5 mm through the sheet (v = 0
// on the beam's entry side): striations that trail as the beam exits, a rougher dross band at the
// exit, darker and duller than the faces.
import { fbm, perlin, smoothstep } from '../noise.mjs';

export default {
  name: 'edge',
  width: 1024,
  height: 256,
  tile: [20, 5],
  seed: 11,
  normalStrength: 1,
  aoRadii: [0.05, 0.2],
  aoWeights: [0.4, 0.2],

  setup(seed) {
    return { seed };
  },

  shade(ctx, u, v, o) {
    const s = ctx.seed;
    const trail = 0.06 * v * v + 0.012 * fbm(u, v, 6, 2, s + 1, 0.5, 1);
    const wob = 2.5 * perlin(u * 12, v * 3, 12, 3, s + 2);
    let stri = Math.sin(2 * Math.PI * (u + trail) * 52 + wob);
    stri += 0.55 * Math.sin(2 * Math.PI * (u + trail * 1.4) * 79 + 1.7 * wob);
    const amp = 0.0015 + 0.006 * v * v;
    const dross = smoothstep(0.78, 0.97, v) * (0.5 + 0.5 * fbm(u, v, 40, 3, s + 3, 0.55, 10));
    o.h = amp * stri + 0.0015 * fbm(u, v, 70, 3, s + 4, 0.5, 18) + 0.01 * dross;
    const lum = 0.8 + 0.04 * fbm(u, v, 9, 3, s + 5) - 0.08 * v - 0.12 * dross;
    o.r = lum;
    o.g = lum;
    o.b = lum * 1.02;
    o.rough = Math.min(2, 1.25 + 0.15 * fbm(u, v, 30, 3, s + 6) + 0.35 * dross);
    o.metal = 1;
  },
};
