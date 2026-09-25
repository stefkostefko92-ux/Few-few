// Weathered oak boards, one tile = 1 m: planks along v with growth rings, knots, checking
// cracks and grey weathering on the exposed face.
import { fbm, perlin, hash2, smoothstep, clamp01, lerp } from '../field.mjs';

const PLANKS = 6;

export default {
  name: 'wood',
  size: 2048,
  tile: 1,
  seed: 71,
  aoRadii: [0.001, 0.006],
  aoWeights: [0.5, 0.5],

  setup(seed) {
    return { seed };
  },

  shade(ctx, u, v, o) {
    const s = ctx.seed;
    const px = u * PLANKS;
    const inPlank = px - Math.floor(px);
    const plank = ((Math.floor(px) % PLANKS) + PLANKS) % PLANKS;
    const k = hash2(plank, 0, s);
    const gap = smoothstep(0.0, 0.012, Math.min(inPlank, 1 - inPlank));
    // Rings: distance to a virtual pith far off to the side, warped by noise and knots.
    const warp = 0.06 * fbm(u, v, 3, 4, s + 1);
    const knotU = (plank + 0.5 + 0.3 * (hash2(plank, 1, s) - 0.5)) / PLANKS;
    const knotV = hash2(plank, 2, s);
    let dku = u - knotU;
    dku -= Math.round(dku);
    const dkx = dku * PLANKS;
    let dkv = v - knotV;
    dkv -= Math.round(dkv);
    const knot = Math.exp(-(dkx * dkx * 30 + dkv * dkv * 900));
    const d = (inPlank + 1.5 + 3 * k) * 18 + warp * 40 + knot * 6 + 2 * perlin(u * 6, v * 2, 6, 2, s + 3);
    const ring = d - Math.floor(d);
    const late = smoothstep(0.55, 0.95, ring);
    const crack = smoothstep(0.93, 0.985, 1 - Math.abs(perlin(u * PLANKS * 8, v * 3, PLANKS * 8, 3, s + 4))) * smoothstep(0.2, 0.6, fbm(u, v, 4, 2, s + 5));
    o.h = gap * (0.004 + 0.0004 * late + 0.0008 * fbm(u, v, 40, 3, s + 6, 0.5, 4)) - 0.0012 * crack;
    const weather = smoothstep(0.1, 0.7, fbm(u, v, 3, 3, s + 7) + 0.3);
    const tone = 0.8 + 0.3 * k;
    const r = lerp(0.2, 0.09, late) * tone;
    const g = lerp(0.11, 0.05, late) * tone;
    const b = lerp(0.05, 0.025, late) * tone;
    const grey = 0.12 * tone;
    o.r = lerp(r, grey, weather * 0.6) * (gap * 0.8 + 0.2) * (1 - 0.6 * crack);
    o.g = lerp(g, grey, weather * 0.6) * (gap * 0.8 + 0.2) * (1 - 0.6 * crack);
    o.b = lerp(b, grey * 0.95, weather * 0.6) * (gap * 0.8 + 0.2) * (1 - 0.6 * crack);
    o.rough = clamp01(0.78 + 0.1 * late + 0.1 * weather);
    o.metal = 0;
    o.mask = weather;
  },
};
