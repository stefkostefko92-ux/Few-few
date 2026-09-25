// Лакиран орех за рамките на масите, една плочка = 1 m. Производен на `wood` от boy:
// годишни пръстени около далечна сърцевина, изкривени от шум и чепове, но без палубните
// фуги и сивото изветряне — мебел, не под. Жилките вървят по u (както платното преди),
// затова повторенията в сцените остават същите.
import { fbm, perlin, hash2, smoothstep, clamp01, lerp } from '../field.mjs';

const BOARDS = 3;

export default {
  name: 'walnut',
  size: 1024,
  tile: 1,
  seed: 83,
  normalStrength: 0.8,
  aoRadii: [0.001, 0.005],
  aoWeights: [0.4, 0.3],

  setup(seed) {
    return { seed };
  },

  shade(ctx, uu, vv, o) {
    // boy шейди жилки по v; тук разменяме осите, за да легнат по дължината на рамката.
    const u = vv;
    const v = uu;
    const s = ctx.seed;
    const px = u * BOARDS;
    const inBoard = px - Math.floor(px);
    const board = ((Math.floor(px) % BOARDS) + BOARDS) % BOARDS;
    const k = hash2(board, 0, s);
    // Залепени дъски: шевът е едва видим тъмен ред, не фуга.
    const seam = 1 - smoothstep(0.0, 0.004, Math.min(inBoard, 1 - inBoard));
    const warp = 0.05 * fbm(u, v, 3, 4, s + 1) + 0.012 * fbm(u, v, 2, 3, s + 9, 0.5, 6);
    const knotU = (board + 0.5 + 0.3 * (hash2(board, 1, s) - 0.5)) / BOARDS;
    const knotV = hash2(board, 2, s);
    let dku = u - knotU;
    dku -= Math.round(dku);
    const dkx = dku * BOARDS;
    let dkv = v - knotV;
    dkv -= Math.round(dkv);
    const knot = Math.exp(-(dkx * dkx * 40 + dkv * dkv * 1400));
    const d = (inBoard + 1.5 + 3 * k) * 14 + warp * 30 + knot * 4 + 1.2 * perlin(u * 6, v * 2, 6, 2, s + 3);
    const ring = d - Math.floor(d);
    const late = smoothstep(0.5, 0.95, ring);
    // Пори: тънки тъмни чертички по жилката (типично за ореха), лакът ги запълва наполовина.
    const pores = smoothstep(0.62, 0.9, perlin(u * BOARDS * 60, v * 4, BOARDS * 60, 4, s + 4)) * 0.6;
    o.h = 0.0004 * late + 0.00012 * fbm(u, v, 40, 3, s + 6, 0.5, 4) - 0.00008 * pores - 0.0002 * seam;
    // Фигура („пламък“): бавна вълна в тона, която под лак хваща светлината.
    const figure = 0.08 * fbm(u, v, 2, 3, s + 7, 0.5, 16);
    // Фини ивици по жилката (радиални лъчи на дървото) — дълбочина вместо плосък кафяв тон.
    const streak = 0.12 * perlin(u * BOARDS * 24, v * 1, BOARDS * 24, 1, s + 10) + 0.06 * perlin(u * BOARDS * 90, v * 3, BOARDS * 90, 3, s + 11);
    const tone = 0.72 * (0.8 + 0.25 * k) * (1 + figure + streak);
    const shade = (1 - 0.35 * pores) * (1 - 0.5 * seam);
    o.r = lerp(0.2, 0.11, late) * tone * shade;
    o.g = lerp(0.105, 0.055, late) * tone * shade;
    o.b = lerp(0.05, 0.026, late) * tone * shade;
    // Сатенен лак: по-гладко по светлите ранни пръстени, по-матово в порите.
    o.rough = clamp01(0.34 + 0.12 * late + 0.25 * pores + 0.05 * fbm(u, v, 12, 3, s + 8));
    o.metal = 0;
    o.mask = late;
  },
};
