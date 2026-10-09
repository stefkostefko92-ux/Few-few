// Drop-forged steel under electro-zinc, one tile = 24 mm: the die leaves a pebbled skin, shallow
// pits and bumps of about half a millimetre with a finer grain over them, which the plating
// follows; it scatters the light into many small glints instead of the rolled sheet's long
// streaks. For the rail clips' heads. Heights in millimetres; colour and roughness are factors
// on the material's own values, the metal channel the passivation film's thickness.
import { fbm, Cells, smoothstep } from '../noise.mjs';

const frac = (x) => x - Math.floor(x);

export default {
  name: 'forged',
  width: 512,
  height: 512,
  tile: [24, 24],
  seed: 31,
  normalStrength: 1,
  exact: true,
  aoRadii: [0.1, 0.4],
  aoWeights: [0.35, 0.2],

  setup(seed) {
    return { seed, pebbles: new Cells(48, 48, seed + 1), pits: new Cells(30, 30, seed + 2) };
  },

  shade(ctx, u, v, o) {
    const s = ctx.seed;
    // Pebbles about 0.5 mm, each domed or dished by its own amount; the crowns come out of the die
    // smoother and brighter than the hollows.
    const p = ctx.pebbles.query(u, v);
    const dome = (frac(p.id * 7.1) - 0.4) * smoothstep(0.62, 0, p.f1);
    // Deeper pits, one cell in five, about 0.4 mm across.
    const q = ctx.pits.query(u, v);
    const pit = frac(q.id * 3.7) < 0.2 ? smoothstep(0.34, 0.02, q.f1) : 0;
    const grain = fbm(u, v, 128, 2, s + 3);
    const skin = fbm(u, v, 12, 3, s + 4);
    o.h = 0.022 * dome - 0.01 * pit + 0.004 * grain + 0.02 * skin;
    const lum = (1 + 0.05 * dome + 0.03 * skin) * (1 - 0.03 * pit);
    o.r = lum;
    o.g = lum;
    o.b = lum * 1.01;
    o.rough = Math.min(1.9, Math.max(0.6, 1.15 - 0.3 * dome + 0.2 * grain + 0.1 * pit));
    o.metal = Math.min(1, Math.max(0, 0.5 + 0.8 * fbm(u, v, 3, 3, s + 5)));
  },
};
