// Процедурни PBR набори (албедо + нормал/височина + ORM) в договора на boy/baked.js — заменят
// плоските 1×1 резерви, на които бойната сцена пада, когато tex/manifest.json липсва. Собствено
// генерирани (без чужд лиценз). Метал: ковани вдлъбнатини, микро-драскотини, четкани линии,
// патина. Кожа: пори. Дърво: влакна. Плат: тъкан. Ризница: преплетени пръстени.
import * as THREE from 'three/webgpu';
import { clamp01, fbm, mix, normalFromHeight, scratches, worley, type Field } from './fields';

const SIZE = 512;

export interface PbrSet {
  tile: number;
  heightRange: number;
  albedo: THREE.Texture;
  normal: THREE.Texture;
  orm: THREE.Texture;
}
export type PbrSets = Record<'cobble' | 'wall' | 'metal' | 'leather' | 'fabric' | 'wood' | 'mail' | 'drops', PbrSet>;

function tex(data: Uint8Array, srgb: boolean): THREE.Texture {
  const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  t.flipY = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

const to8 = (v: number): number => Math.round(clamp01(v) * 255);

interface Maps { albedo: (i: number) => [number, number, number]; height: Field; normalStrength: number; ao: (i: number) => number; rough: (i: number) => number; metal: (i: number) => number; tile: number }

function pack(m: Maps): PbrSet {
  const n = SIZE * SIZE;
  const alb = new Uint8Array(n * 4);
  const orm = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const c = m.albedo(i);
    alb[i * 4] = to8(c[0]); alb[i * 4 + 1] = to8(c[1]); alb[i * 4 + 2] = to8(c[2]); alb[i * 4 + 3] = 255;
    orm[i * 4] = to8(m.ao(i)); orm[i * 4 + 1] = to8(m.rough(i)); orm[i * 4 + 2] = to8(m.metal(i)); orm[i * 4 + 3] = 255;
  }
  return { tile: m.tile, heightRange: 0.002, albedo: tex(alb, true), normal: tex(normalFromHeight(m.height, SIZE, m.normalStrength), false), orm: tex(orm, false) };
}

function flat(rgb: [number, number, number], tile: number, rough = 0.8): PbrSet {
  const p = (v: number[]): THREE.Texture => { const t = new THREE.DataTexture(new Uint8Array(v), 1, 1, THREE.RGBAFormat); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  const a = p([...rgb, 255]); a.colorSpace = THREE.SRGBColorSpace;
  return { tile, heightRange: 0, albedo: a, normal: p([128, 128, 255, 128]), orm: p([255, to8(rough), 255, 255]) };
}

/** Ковна стомана: широки вдлъбнатини от чук + четкани линии + драскотини; патина по ниското. */
function metal(): PbrSet {
  const dents = fbm(SIZE, 11, 5, 5, 4, 0.55);
  const grain = fbm(SIZE, 23, 2, 96, 3, 0.6); // линии по X (стреч по оста) = четкана стомана
  const fine = fbm(SIZE, 37, 64, 64, 2, 0.5);
  const scr = scratches(SIZE, 41, 70, 0.5);
  const patina = fbm(SIZE, 53, 3, 3, 5, 0.55);
  const h = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < h.length; i++) h[i] = dents[i] * 0.5 + grain[i] * 0.07 + fine[i] * 0.1 - scr[i] * 0.07;
  return pack({
    tile: 0.6, normalStrength: 2.2, height: h,
    albedo: (i) => { const v = mix(0.88, 1.0, grain[i]) - Math.max(0, patina[i] - 0.62) * 1.2; const w = Math.max(0, patina[i] - 0.66); return [v - w * 0.1, v - w * 0.25, v - w * 0.45]; },
    ao: (i) => 1 - clamp01((0.5 - dents[i]) * 1.4) * 0.5,
    rough: (i) => clamp01(0.62 + grain[i] * 0.14 + scr[i] * 0.22 + Math.max(0, patina[i] - 0.62) * 1.4 - 0.15),
    metal: (i) => 1 - clamp01((patina[i] - 0.7) * 3) * 0.35,
  });
}

/** Лицева кожа: пори (Worley) + гънки; албедото е самото тонирано цвят (leather.tint=false). */
function leather(): PbrSet {
  const w = worley(SIZE, 5, 56);
  const crease = fbm(SIZE, 7, 6, 6, 4, 0.55);
  const tone = fbm(SIZE, 9, 4, 4, 3, 0.5);
  const h = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < h.length; i++) h[i] = Math.min(1, w.edge[i] * 1.8) * 0.5 + crease[i] * 0.5;
  return pack({
    tile: 0.3, normalStrength: 3.2, height: h,
    albedo: (i) => { const k = 0.7 + tone[i] * 0.5 - (1 - Math.min(1, w.edge[i] * 3)) * 0.25; return [0.26 * k, 0.15 * k, 0.085 * k]; },
    ao: (i) => 0.65 + Math.min(1, w.edge[i] * 3) * 0.35,
    rough: (i) => 0.58 + tone[i] * 0.22 + (1 - Math.min(1, w.edge[i] * 3)) * 0.12,
    metal: () => 0,
  });
}

/** Тъкан: основа/вътък като редуващи се синусоиди + влакнест шум. */
function fabric(): PbrSet {
  const fuzz = fbm(SIZE, 71, 96, 96, 2, 0.6);
  const slub = fbm(SIZE, 73, 3, 40, 3, 0.5);
  const T = 64;
  const h = new Float32Array(SIZE * SIZE);
  const over = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const gx = (x / SIZE) * T; const gy = (y / SIZE) * T;
      const cx = Math.floor(gx); const cy = Math.floor(gy);
      const warpOver = (cx + cy) % 2 === 0;
      const thread = warpOver ? Math.sin((gx % 1) * Math.PI) : Math.sin((gy % 1) * Math.PI);
      const i = y * SIZE + x;
      over[i] = warpOver ? 1 : 0;
      h[i] = thread * 0.7 + fuzz[i] * 0.3;
    }
  }
  return pack({
    tile: 0.12, normalStrength: 2.4, height: h,
    albedo: (i) => { const v = 0.74 + fuzz[i] * 0.2 + slub[i] * 0.1 - over[i] * 0.04; return [v, v, v]; },
    ao: (i) => 0.7 + h[i] * 0.3,
    rough: () => 0.9,
    metal: () => 0,
  });
}

/** Дърво: годишни пръстени, огънати от шум, дълги влакна по V (оста на геометрията). */
function wood(): PbrSet {
  const warp = fbm(SIZE, 81, 3, 3, 4, 0.5);
  const fibre = fbm(SIZE, 83, 90, 3, 3, 0.6);
  const pores = fbm(SIZE, 85, 160, 12, 2, 0.5);
  const ring = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { const i = y * SIZE + x; const t = (x / SIZE) * 11 + warp[i] * 2.2; ring[i] = Math.pow(Math.abs(Math.sin(t * Math.PI)), 1.6); }
  const h = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < h.length; i++) h[i] = ring[i] * 0.25 + fibre[i] * 0.5 + pores[i] * 0.25;
  return pack({
    tile: 1, normalStrength: 1.6, height: h,
    albedo: (i) => { const k = mix(0.55, 1, ring[i]) * (0.8 + fibre[i] * 0.4); return [0.36 * k, 0.21 * k, 0.1 * k]; },
    ao: (i) => 0.7 + pores[i] * 0.3,
    rough: (i) => 0.5 + ring[i] * 0.15 + pores[i] * 0.2,
    metal: () => 0,
  });
}

/** Ризница: преплетени пръстени (редове изместени) — височина от радиална функция. */
function mail(): PbrSet {
  const N = 28; // пръстени по страна на плочката
  const h = new Float32Array(SIZE * SIZE);
  const ao = new Float32Array(SIZE * SIZE);
  const cell = SIZE / N;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let best = 0; let cav = 0;
      const row = Math.floor(y / cell);
      for (let dr = -1; dr <= 1; dr++) {
        const r = row + dr;
        const off = (((r % N) + N) % N) % 2 ? 0.5 : 0;
        const cxIdx = Math.floor(x / cell - off);
        for (let dc = -1; dc <= 1; dc++) {
          const cx = ((cxIdx + dc + off) * cell) % SIZE;
          const cy = (r + 0.5) * cell;
          let ddx = Math.abs(x - cx); ddx = Math.min(ddx, SIZE - ddx);
          let ddy = Math.abs(y - cy); ddy = Math.min(ddy, SIZE - ddy);
          const d = Math.hypot(ddx / 0.62, ddy) / (cell * 0.62);
          const tube = Math.max(0, 1 - Math.abs(d - 0.72) / 0.2);
          const lay = tube * (((r + dc) % 2 + 2) % 2 ? 1 : 0.82);
          if (lay > best) best = lay;
          if (d < 0.5) cav = 1;
        }
      }
      h[y * SIZE + x] = best; ao[y * SIZE + x] = 1 - cav * 0.55 - (1 - best) * 0.2;
    }
  }
  const tone = fbm(SIZE, 91, 6, 6, 3, 0.5);
  return pack({
    tile: 0.08, normalStrength: 4.5, height: h,
    albedo: (i) => { const v = 0.55 + h[i] * 0.4 + tone[i] * 0.12; return [v, v, v * 1.02]; },
    ao: (i) => clamp01(ao[i]),
    rough: (i) => 0.34 + tone[i] * 0.25 + (1 - h[i]) * 0.2,
    metal: () => 1,
  });
}

let cache: PbrSets | null = null;
/** Набор от процедурни карти за целия живот на приложението (като boy-materials кеша). */
export function proceduralSets(): PbrSets {
  if (cache) return cache;
  cache = {
    cobble: flat([30, 30, 29], 4), wall: flat([52, 49, 44], 4), drops: flat([255, 255, 255], 0.2, 1),
    metal: metal(), leather: leather(), fabric: fabric(), wood: wood(), mail: mail(),
  };
  return cache;
}
