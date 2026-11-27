// Обвивката на семето, нарисувана в браузъра: основа с тъмни ивици или петна и точици, както при
// истинските семена — цветовете и шарката са на вида (strains.ts). С развалянето потъмнява и посивява, хваща плесен (бяло-зелени
// петна), мокро гниене и пукнатина; изтеклото е прашно сиво. Шумовите полета се смятат ВЕДНЪЖ; всяка
// степен на разваляне само смесва готовите полета, затова е бърза. u обикаля оста, v е по дължината.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { smoothstep, wrapFbm } from './noise.js';
import { strainOf, type RGB, type Strain } from './strains.js';

const W = 384;
const H = 192;

interface Fields {
  tone: Float32Array;
  stripes: Float32Array;
  speckle: Float32Array;
  mold: Float32Array;
  rot: Float32Array;
  grain: Float32Array;
}

const fieldsByStrain = new Map<string, Fields>();

function computeFields(st: Strain): Fields {
  const n = W * H;
  const f: Fields = {
    tone: new Float32Array(n),
    stripes: new Float32Array(n),
    speckle: new Float32Array(n),
    mold: new Float32Array(n),
    rot: new Float32Array(n),
    grain: new Float32Array(n),
  };
  for (let j = 0; j < H; j++) {
    const v = j / (H - 1);
    for (let i = 0; i < W; i++) {
      const u = i / W;
      const k = j * W + i;
      f.tone[k] = wrapFbm(u, v, 1.6, 2.5, st.seed + 11);
      f.stripes[k] = wrapFbm(u, v, st.stripeU, st.stripeV, st.seed + 23);
      f.speckle[k] = wrapFbm(u, v, 9, 7, st.seed + 37, 2);
      f.mold[k] = wrapFbm(u, v, 3.2, 3.6, st.seed + 51);
      f.rot[k] = wrapFbm(u, v, 2.0, 2.2, st.seed + 67);
      f.grain[k] = wrapFbm(u, v, 14, 12, st.seed + 79, 2);
    }
  }
  return f;
}

function getFields(key: string): Fields {
  const hit = fieldsByStrain.get(key);
  if (hit) return hit;
  const f = computeFields(strainOf(key));
  fieldsByStrain.set(key, f);
  return f;
}

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const ROT: RGB = [24, 17, 11];
const MOLD_WHITE: RGB = [206, 210, 194];
const MOLD_GREEN: RGB = [158, 172, 138];
const MOLD_BLUE: RGB = [86, 130, 108];
const DUST: RGB = [92, 86, 77];

export interface Masks {
  mold: number; // 0..1 — плесен (за власинките в 3D)
  rot: number;
}

/** Колко плесен и гниене има в точка (u, v) при дадено разваляне — същото като в текстурата. */
export function masksAt(strain: string, u: number, v: number, decay: number, dead: boolean): Masks {
  const f = getFields(strain);
  const i = Math.min(W - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * W)));
  const j = Math.min(H - 1, Math.max(0, Math.floor(v * (H - 1))));
  return maskValues(f, j * W + i, decay, dead);
}

function maskValues(f: Fields, k: number, decay: number, dead: boolean): Masks {
  const md = dead ? 0.5 : smoothstep(0.5, 0.97, decay);
  const th = 0.8 - 0.26 * md;
  // широк преход: плесента е мъглява, не с остър ръб
  const mold = md > 0 ? smoothstep(th - 0.02, th + 0.14, f.mold[k] ?? 0) : 0;
  const r = dead ? 0.5 : smoothstep(0.68, 1, decay);
  const rot = r > 0 ? smoothstep(0.62 - 0.2 * r, 0.68 - 0.2 * r, f.rot[k] ?? 0) * r : 0;
  return { mold, rot };
}

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) throw new Error('canvas 2d is unavailable');
  return [c, g];
}

export interface SeedTextures {
  map: Texture;
  roughness: Texture;
  bump: Texture;
}

const cache = new Map<string, SeedTextures>();

/** Ключът на кеша: видът и степента на разваляне, закръглена до 0,05. */
export function textureKey(strain: string, decay: number, dead: boolean): string {
  return `${strain}:${dead ? 'dead' : (Math.round(decay * 20) / 20).toFixed(2)}`;
}

/** Текстурите за вида и степента на разваляне — кешират се. */
export function seedTextures(strain: string, decay: number, dead: boolean): SeedTextures {
  const key = textureKey(strain, decay, dead);
  const hit = cache.get(key);
  if (hit) return hit;
  const d = dead ? 1 : Math.round(decay * 20) / 20;
  const f = getFields(strain);
  const st = strainOf(strain);
  const [cc, cg] = canvas();
  const [rc, rg] = canvas();
  const [bc, bg] = canvas();
  const col = cg.createImageData(W, H);
  const rough = rg.createImageData(W, H);
  const bump = bg.createImageData(W, H);
  const age = smoothstep(0.1, 0.75, d);
  const spoil = smoothstep(0.55, 0.9, d);
  for (let k = 0; k < W * H; k++) {
    const tone = f.tone[k] ?? 0.5;
    const sn = f.stripes[k] ?? 0.5;
    const sp = f.speckle[k] ?? 0.5;
    const gr = f.grain[k] ?? 0.5;
    let c = mix(st.light, st.grey, tone);
    const stripe = smoothstep(st.stripeFrom, st.stripeFrom + 0.08, sn);
    c = mix(c, st.stripe, stripe * 0.85);
    c = mix(c, st.dark, smoothstep(st.darkFrom, st.darkFrom + 0.07, sn));
    c = mix(c, st.dark, smoothstep(st.speckleFrom, st.speckleFrom + 0.05, sp) * st.speckle);
    // остаряване: посивява и потъмнява; при разваляне — зеленикав оттенък
    const lum = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
    c = mix(c, [lum, lum * 0.97, lum * 0.9], age * 0.5);
    const dim = (1 - 0.38 * age) * (1 - 0.3 * smoothstep(0.8, 1, d));
    c = [c[0] * dim, c[1] * dim, c[2] * dim];
    c = mix(c, [c[0] * 0.86, c[1] * 0.95, c[2] * 0.84], spoil * 0.6);
    if (dead) c = mix(c, DUST, 0.55);
    const m = maskValues(f, k, d, dead);
    c = mix(c, ROT, m.rot * 0.9);
    let mold = mix(MOLD_WHITE, MOLD_GREEN, sp);
    if (d > 0.85 || dead) mold = mix(mold, MOLD_BLUE, smoothstep(0.58, 0.68, gr) * 0.8);
    if (dead) mold = mix(mold, [185, 183, 173], 0.6);
    c = mix(c, mold, m.mold * 0.9);
    const o = k * 4;
    col.data[o] = c[0];
    col.data[o + 1] = c[1];
    col.data[o + 2] = c[2];
    col.data[o + 3] = 255;
    // грапавост (three чете зеления канал): свежото е лъскаво, плесента — матова, гниенето — мокро
    let r = 0.3 + 0.45 * age + (dead ? 0.2 : 0) + (sn - 0.5) * 0.08;
    r = r + (0.97 - r) * m.mold;
    r = r + (0.42 - r) * m.rot;
    const rv = Math.round(Math.min(1, Math.max(0.05, r)) * 255);
    rough.data[o] = rv;
    rough.data[o + 1] = rv;
    rough.data[o + 2] = rv;
    rough.data[o + 3] = 255;
    // релеф: фина зърнистост, повече при развалено; плесента стърчи, гниенето хлътва
    const b = 0.5 + (gr - 0.5) * 0.3 * (0.3 + d) - stripe * 0.04 + m.mold * 0.25 - m.rot * 0.15;
    const bv = Math.round(Math.min(1, Math.max(0, b)) * 255);
    bump.data[o] = bv;
    bump.data[o + 1] = bv;
    bump.data[o + 2] = bv;
    bump.data[o + 3] = 255;
  }
  cg.putImageData(col, 0, 0);
  rg.putImageData(rough, 0, 0);
  bg.putImageData(bump, 0, 0);
  if (d >= 0.62 || dead) crack(cg, bg, d);
  const tex = (c: HTMLCanvasElement, color: boolean): Texture => {
    const t = new CanvasTexture(c);
    if (color) t.colorSpace = SRGBColorSpace;
    t.wrapS = RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  const out = { map: tex(cc, true), roughness: tex(rc, false), bump: tex(bc, false) };
  cache.set(key, out);
  return out;
}

// Пукнатина по дължината на обвивката: начупена тъмна линия, вдлъбната в релефа.
function crack(color: CanvasRenderingContext2D, bump: CanvasRenderingContext2D, d: number): void {
  const len = 0.35 + 0.45 * smoothstep(0.62, 1, d);
  const draw = (g: CanvasRenderingContext2D, style: string, width: number) => {
    g.strokeStyle = style;
    g.lineWidth = width;
    g.lineJoin = 'round';
    g.beginPath();
    let x = W * 0.27;
    const y0 = H * (0.5 - len / 2);
    g.moveTo(x, y0);
    for (let y = y0; y <= H * (0.5 + len / 2); y += 6) {
      x += Math.sin(y * 0.37) * 2.2 + Math.cos(y * 0.91) * 1.4;
      g.lineTo(x, y);
    }
    g.stroke();
  };
  draw(color, 'rgba(18, 12, 8, 0.92)', 2.2);
  draw(bump, 'rgb(40, 40, 40)', 3);
}

/** Масата: тъмен камък с фино зърно (повтаря се). */
export function tableTexture(): { map: Texture; roughness: Texture } {
  const S = 256;
  const make = (fill: (k: number, n: number) => [number, number, number]) => {
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const g = c.getContext('2d');
    if (!g) throw new Error('canvas 2d is unavailable');
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const n = wrapFbm(x / S, y / S, 5, 5, 91, 4);
        const [r, gg, b] = fill(y * S + x, n);
        const o = (y * S + x) * 4;
        img.data[o] = r;
        img.data[o + 1] = gg;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    const t = new CanvasTexture(c);
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.repeat.set(3, 3);
    return t;
  };
  const map = make((_, n) => [30 + n * 16, 36 + n * 16, 33 + n * 14]);
  map.colorSpace = SRGBColorSpace;
  const roughness = make((_, n) => {
    const v = 170 + n * 70;
    return [v, v, v];
  });
  return { map, roughness };
}
