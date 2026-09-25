// Worn plate steel detail, one tile = 0.6 m: planishing-hammer facets, gentle waviness,
// brushed polishing lines, random scratches, sparse pitting with rust. Roughness and metalness
// are factors in [0,1] multiplied by the material's own values at runtime.
import { Cells, fbm, perlin, hash2, smoothstep, clamp01, lerp } from '../field.mjs';

export default {
  name: 'metal',
  size: 2048,
  tile: 0.6,
  seed: 21,
  normalStrength: 1,
  aoRadii: [0.0006, 0.003],
  aoWeights: [0.5, 0.5],

  setup(seed) {
    return { seed, facets: new Cells(48, 48, seed, 0.9), pits: new Cells(380, 380, seed + 3, 0.9) };
  },

  shade(ctx, u, v, o) {
    const s = ctx.seed;
    const f = ctx.facets.query(u, v);
    const facet = -0.00012 * (1 - Math.min(1, f.f1 / 0.62) ** 2) ** 2;
    const wave = 0.00025 * fbm(u, v, 3, 3, s + 1);
    // Brushed lines bend with a slow periodic warp, like hand polishing (stays tileable).
    const brush = perlin(u * 24, v * 1800 + 40 * fbm(u, v, 2, 2, s + 2), 24, 1800, s + 3);
    const p = ctx.pits.query(u, v);
    const corrosion = smoothstep(0.35, 0.7, fbm(u, v, 5, 4, s + 4));
    const pit = p.id > 0.96 - 0.1 * corrosion ? smoothstep(0.4, 0.08, p.f1) : 0;
    o.h = facet + wave + 0.000006 * brush - 0.00012 * pit;

    const rust = clamp01(pit * 1.4 + corrosion * 0.25 * smoothstep(0.2, 0.9, fbm(u, v, 60, 3, s + 5)));
    const tint = 0.93 + 0.05 * fbm(u, v, 8, 3, s + 6);
    o.r = lerp(tint, 0.2, rust);
    o.g = lerp(tint, 0.085, rust);
    o.b = lerp(tint * 1.01, 0.035, rust);
    const smudge = 0.12 * fbm(u, v, 6, 4, s + 7);
    o.rough = clamp01(0.72 + smudge + 0.06 * brush + 0.35 * rust);
    o.metal = 1 - 0.85 * rust;
    o.mask = rust;
  },

  // Random scratches carved after shading: thin grooves that also roughen the surface.
  relief(img, size, mpp) {
    let seed = 1234;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let n = 0; n < 900; n++) {
      const len = (0.01 + 0.07 * rnd() ** 2) / mpp;
      const a = rnd() * Math.PI;
      const depth = 0.00002 + 0.00008 * rnd() ** 3;
      let x = rnd() * size;
      let y = rnd() * size;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      for (let t = 0; t < len; t++, x += dx, y += dy) {
        const fade = Math.sin((Math.PI * t) / len);
        for (let w = -1; w <= 1; w++) {
          const xi = (((Math.round(x - dy * w) % size) + size) % size) | 0;
          const yi = (((Math.round(y + dx * w) % size) + size) % size) | 0;
          const i = yi * size + xi;
          const k = w === 0 ? 1 : 0.35;
          img.h[i] -= depth * fade * k;
          img.rough[i] = Math.min(1, img.rough[i] + 0.12 * fade * k);
        }
      }
    }
  },
};
