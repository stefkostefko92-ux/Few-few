// Предметите се обличат в СЪЩИТЕ материали като рицарите в боя (materials.js/baked.js/heraldry.js
// на boy) — само тонирани по темата на предмета (loadout.js tintedMaterials, същата функция,
// която боят вече ползва за клас/регион). Нула нова геометрия/материя тук, само мост.
//
// Изгражда се веднъж (module-level кеш), споделено между всички предмети за живота на
// приложението — точно като PMREM env картата в renderScene.ts. `loadBakedSets('tex/', ...)`
// пада грациозно на плоски 1×1 текстури, когато tex/manifest.json липсва (виж baked.js) — днес
// липсва за всички продукти (живата бойна сцена също рисува с плоски fallback текстури), затова
// няма загуба на верност спрямо реалния бой.
import * as THREE from 'three/webgpu';
import { loadBakedSets } from '../boy/src/baked.js';
import { createMaterials } from '../boy/src/materials.js';
import { capeTextureAzure, capeTextureCrimson, shieldTextures, bannerTexture } from '../boy/src/heraldry.js';
import { tintedMaterials } from '../boy/src/loadout.js';
import { noiseTexture } from '../boy/src/fields.js';
import { setNoise } from '../boy/src/tsl.js';

export type BoyMaterials = ReturnType<typeof createMaterials>;

const TEX_SIZES = { default: 256 };
const ANISO = 4;

let cached: Promise<BoyMaterials> | null = null;

/** 1×1 неутрален stub — heraldry.js рисува в `<canvas>` (DOM), недостъпен в `node --test`
 *  (без jsdom). Иконите/живия преглед винаги тичат в браузър и получават истинските канава
 *  текстури; тестовата среда пада на неутрален плейсхолдър — геометрията не зависи от пикселите. */
function stubTexture(): THREE.Texture {
  return new THREE.DataTexture(new Uint8Array([160, 160, 160, 255]), 1, 1, THREE.RGBAFormat);
}

function heraldryTextures(): { capeA: THREE.Texture; capeB: THREE.Texture; shield: { map: THREE.Texture; roughnessMap: THREE.Texture }; banner: THREE.Texture } {
  if (typeof document === 'undefined') {
    return { capeA: stubTexture(), capeB: stubTexture(), shield: { map: stubTexture(), roughnessMap: stubTexture() }, banner: stubTexture() };
  }
  return { capeA: capeTextureAzure(), capeB: capeTextureCrimson(), shield: shieldTextures(), banner: bannerTexture() };
}

async function build(): Promise<BoyMaterials> {
  // world.js calls setNoise() once before booting the live scene — grime/rain sample this GLOBAL
  // shared noise texture (tsl.js `noise()`); without it every steel/mail material that calls
  // applyGrime() or rainOnSteel() samples a null texture and renders near-black. Icons never boot
  // world.js, so we call it ourselves — same texture, same call, just here instead.
  setNoise(noiseTexture());
  const S = await loadBakedSets('tex/', TEX_SIZES, ANISO);
  const T = heraldryTextures();
  return createMaterials(S, T);
}

/** Споделеният boy материален пакет (S+T изградени веднъж) — НИКОГА не се disposeва тук (живее
 *  толкова, колкото приложението; виж buildEnvironmentMap в renderScene.ts за същия патерн). */
export function getBoyMaterials(): Promise<BoyMaterials> {
  if (!cached) cached = build();
  return cached;
}

export interface ItemTint {
  plate: string;
  trim: string;
  blade: string;
  /** Кожа/плат тема (виж tint.ts) — маха metalness/clearcoat, вдига roughness на клонингите,
   *  инак „Leather Helm" излиза полиран бронз (боя тонира само hue-а, не PBR отговора). */
  nonMetal?: boolean;
}

export interface TintedItemMaterials {
  /** Пълният boy пакет, с steelA/steelB/goldB/brass/blade/bladeDark заменени с тонирани клонинги
   *  по темата на предмета; mail/leather/wood/shieldFace/capeA/capeB/banner остават СПОДЕЛЕНИ
   *  (не се тонират — точно както при класовото/регионалното тониране в боя). */
  M: BoyMaterials;
  /** Disposeва САМО клонираните материали (не пипа споделените S/T/M ресурси на getBoyMaterials()). */
  dispose(): void;
}

const CLONED_KEYS = ['steelA', 'steelB', 'goldB', 'brass', 'blade', 'bladeDark'] as const;

/** Тонира boy материалите по темата на един предмет, чрез СЪЩАТА `tintedMaterials()`, която боят
 *  ползва за клас/регион (loadout.js) — вижте задачата: „оцветяване на материалите на boy, не нова
 *  геометрия". */
export function tintForItem(M: BoyMaterials, tint: ItemTint): TintedItemMaterials {
  const tinted = tintedMaterials(M, tint) as BoyMaterials;
  if (tint.nonMetal) {
    for (const key of CLONED_KEYS) {
      const mat = tinted[key] as THREE.MeshPhysicalNodeMaterial;
      mat.metalness = 0;
      mat.roughness = Math.max(mat.roughness, 0.85);
      mat.clearcoat = 0;
    }
  }
  return {
    M: tinted,
    dispose(): void {
      for (const key of CLONED_KEYS) (tinted[key] as THREE.Material).dispose();
    },
  };
}
