// Варова мазилка за паянтовите етажи, една плочка = 1 единица: ръчно мазана неравна повърхност,
// тънки пукнатини, петна от влага отдолу и олющени места, където прозира камъкът.
// Албедото е топло бяло; материалът може да го оцвети (охра, пепел).
import { fbm, ridged, smoothstep, clamp01, lerp } from '../field.mjs';

export default {
  name: 'plaster',
  size: 512,
  tile: 1,
  seed: 59,
  normalStrength: 0.9,
  aoRadii: [0.004, 0.02],
  aoWeights: [0.4, 0.3],

  setup(seed) {
    return { seed };
  },

  shade(ctx, u, v, o) {
    const s = ctx.seed;
    const trowel = 0.002 * fbm(u, v, 5, 4, s + 1) + 0.0006 * fbm(u, v, 40, 3, s + 2);
    const crack = smoothstep(0.9, 0.97, ridged(u, v, 6, 4, s + 3)) * smoothstep(0.4, 0.7, fbm(u, v, 3, 2, s + 4));
    const flake = smoothstep(0.66, 0.72, fbm(u, v, 5, 5, s + 5));
    o.h = trowel - 0.0015 * crack - 0.002 * flake;
    const damp = smoothstep(0.35, 0.0, v) * smoothstep(0.3, 0.7, fbm(u, v, 4, 3, s + 6) + 0.3);
    const tone = (0.78 + 0.08 * fbm(u, v, 8, 3, s + 7)) * (1 - 0.35 * damp) * (1 - 0.5 * crack);
    // Олющено: отдолу се вижда тъмен камък/тухла.
    o.r = lerp(tone * 1.0, 0.22, flake);
    o.g = lerp(tone * 0.95, 0.16, flake);
    o.b = lerp(tone * 0.86, 0.12, flake);
    o.rough = clamp01(0.9 + 0.08 * flake);
    o.metal = 0;
    o.mask = damp;
  },
};
