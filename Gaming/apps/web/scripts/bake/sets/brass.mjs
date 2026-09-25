// Шлифован месинг за обковите, една плочка = една повторка. Производен на `metal` от boy:
// фасети от чука, лека вълнистост, шлифовъчни линии и драскотини — без ръжда и питинг
// (месингът потъмнява, не ръждясва). Албедото е неутрален множител, грапавостта и металността
// са множители към стойностите на материала.
import { Cells, fbm, perlin, smoothstep, clamp01 } from '../field.mjs';

export default {
  name: 'brass',
  size: 512,
  tile: 1,
  seed: 29,
  normalStrength: 0.6,
  aoRadii: [0.002, 0.01],
  aoWeights: [0.3, 0.3],

  setup(seed) {
    return { seed, facets: new Cells(12, 12, seed, 0.9) };
  },

  shade(ctx, u, v, o) {
    const s = ctx.seed;
    const f = ctx.facets.query(u, v);
    const facet = -0.005 * (1 - Math.min(1, f.f1 / 0.62) ** 2) ** 2;
    const wave = 0.004 * fbm(u, v, 3, 3, s + 1);
    const brush = perlin(u * 8, v * 600 + 12 * fbm(u, v, 2, 2, s + 2), 8, 600, s + 3);
    o.h = facet + wave + 0.0004 * brush;
    // Патина в ниските места, по-светло там, където ръката търка ръбовете.
    const tarnish = smoothstep(0.45, 0.85, fbm(u, v, 4, 4, s + 4)) * 0.5;
    const tint = 0.95 + 0.04 * fbm(u, v, 8, 3, s + 6);
    o.r = tint * (1 - 0.35 * tarnish);
    o.g = tint * (1 - 0.42 * tarnish);
    o.b = tint * (1 - 0.5 * tarnish);
    const smudge = 0.1 * fbm(u, v, 6, 4, s + 7);
    o.rough = clamp01(0.55 + smudge + 0.08 * brush + 0.3 * tarnish);
    o.metal = 1 - 0.2 * tarnish;
    o.mask = tarnish;
  },

  // Драскотини след шейдинга: тънки бразди, които и загрубяват повърхността.
  relief(img, size, mpp) {
    let seed = 4321;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let n = 0; n < 160; n++) {
      const len = (0.02 + 0.12 * rnd() ** 2) / mpp;
      const a = rnd() * Math.PI;
      const depth = 0.0003 + 0.001 * rnd() ** 3;
      let x = rnd() * size;
      let y = rnd() * size;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      for (let t = 0; t < len; t++, x += dx, y += dy) {
        const fade = Math.sin((Math.PI * t) / len);
        const i = ((((Math.round(y) % size) + size) % size) | 0) * size + ((((Math.round(x) % size) + size) % size) | 0);
        img.h[i] -= depth * fade;
        img.rough[i] = Math.min(1, img.rough[i] + 0.15 * fade);
      }
    }
  },
};
