// Bright zinc-coated sheet with a clear (blue) passivation, one tile = 80 mm, u along the rolling
// direction: the fine lines the skin-pass rolls print along the strip, in bands; a light orange
// peel from the coat; long low waves from the mill; rare pits in the base steel; cloudy roughness;
// and, in the metal channel, the thickness of the passivation film, which drives the faint blue,
// violet and gold play where it is thicker. Heights in millimetres, sized so their slopes (about
// 0.02-0.03 rad) survive 8-bit maps and show in the reflections; colour and roughness are factors
// on the material's own values.
import { fbm, Cells, smoothstep } from '../noise.mjs';

export default {
  name: 'zinc',
  width: 1024,
  height: 1024,
  tile: [80, 80],
  seed: 7,
  normalStrength: 1,
  exact: true,
  aoRadii: [0.25, 1],
  aoWeights: [0.25, 0.15],

  setup(seed) {
    return { seed, pits: new Cells(90, 90, seed + 5) };
  },

  shade(ctx, u, v, o) {
    const s = ctx.seed;
    // Rolling lines: 2 cells along u, 220 across (about 0.36 mm), stronger in some bands.
    const band = 0.5 + 0.5 * fbm(u, v, 1, 2, s + 9, 0.5, 6);
    const lines = fbm(u, v, 2, 3, s + 1, 0.55, 220) * (0.6 + 0.8 * band);
    const waves = 0.03 * fbm(u, v, 3, 3, s + 2);
    const peel = 0.006 * fbm(u, v, 48, 3, s + 3);
    const p = ctx.pits.query(u, v);
    const pit = p.id > 0.992 ? smoothstep(0.3, 0.05, p.f1) : 0;
    o.h = waves + peel + 0.0016 * lines - 0.005 * pit;
    const cloud = fbm(u, v, 4, 4, s + 4);
    const tint = fbm(u, v, 2, 3, s + 6);
    const lum = 1 + 0.025 * cloud + 0.012 * lines - 0.06 * pit;
    o.r = lum * (1 - 0.012 * tint);
    o.g = lum * (1 - 0.002 * tint);
    o.b = lum * (1 + 0.014 * tint);
    o.rough = Math.min(1.9, Math.max(0.45, 1 + 0.2 * cloud + 0.14 * lines + 0.3 * pit));
    o.metal = Math.min(1, Math.max(0, 0.5 + 0.9 * fbm(u, v, 3, 3, s + 8)));
  },
};
