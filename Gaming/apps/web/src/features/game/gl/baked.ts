/**
 * Рейвънхолд: изпечените PBR набори (порт на boy/src/baked.js) за мебелите на 3D масите —
 * лакиран орех, игрално сукно и шлифован месинг. Картите се изпичат офлайн
 * (`pnpm --filter @aso/web bake`) и Vite ги пакетира с хеш, затова се кешират завинаги и се
 * теглят само заедно с чънка на 3D сцената.
 *
 * Сцените се строят синхронно с евтините canvas текстури от helpers.ts; `upgradeMaterial`
 * после подменя картите, щом изпечените се заредят. Провал (без мрежа, jsdom) оставя
 * canvas резервата — сцената никога не остава празна.
 *
 * ORM е по конвенцията на three: R = AO, G = грапавост, B = металност (множители към
 * стойностите на материала).
 */
import {
  type BufferGeometry,
  type ColorRepresentation,
  RepeatWrapping,
  SRGBColorSpace,
  NoColorSpace,
  type Texture,
  TextureLoader,
  type MeshStandardMaterial,
} from "three";

export type BakedName = "walnut" | "felt" | "brass" | "stone" | "roof" | "plaster";
type MapKind = "albedo" | "normal" | "orm";

const URLS: Record<BakedName, Partial<Record<MapKind, string>>> = {
  walnut: {
    albedo: new URL("./tex/walnut_albedo.webp", import.meta.url).href,
    normal: new URL("./tex/walnut_normal.webp", import.meta.url).href,
    orm: new URL("./tex/walnut_orm.webp", import.meta.url).href,
  },
  // Сукното и месингът взимат цвета от материала: техните албеда са неутрални и не се теглят.
  felt: {
    normal: new URL("./tex/felt_normal.webp", import.meta.url).href,
    orm: new URL("./tex/felt_orm.webp", import.meta.url).href,
  },
  brass: {
    normal: new URL("./tex/brass_normal.webp", import.meta.url).href,
    orm: new URL("./tex/brass_orm.webp", import.meta.url).href,
  },
  // Сградите на Магнат: дялан камък (от `wall` на boy), покривни плочи и варова мазилка.
  // Албедото на плочите и мазилката е светло — материалът ги оцветява (шисти/глина, охра).
  stone: {
    albedo: new URL("./tex/stone_albedo.webp", import.meta.url).href,
    normal: new URL("./tex/stone_normal.webp", import.meta.url).href,
    orm: new URL("./tex/stone_orm.webp", import.meta.url).href,
  },
  roof: {
    albedo: new URL("./tex/roof_albedo.webp", import.meta.url).href,
    normal: new URL("./tex/roof_normal.webp", import.meta.url).href,
    orm: new URL("./tex/roof_orm.webp", import.meta.url).href,
  },
  plaster: {
    albedo: new URL("./tex/plaster_albedo.webp", import.meta.url).href,
    normal: new URL("./tex/plaster_normal.webp", import.meta.url).href,
    orm: new URL("./tex/plaster_orm.webp", import.meta.url).href,
  },
};

type BakedSet = Partial<Record<MapKind, Texture>>;
const cache = new Map<BakedName, Promise<BakedSet | null>>();

function load(name: BakedName): Promise<BakedSet | null> {
  let p = cache.get(name);
  if (!p) {
    const loader = new TextureLoader();
    const entries = Object.entries(URLS[name]) as Array<[MapKind, string]>;
    p = Promise.all(entries.map(async ([kind, url]) => [kind, await loader.loadAsync(url)] as const))
      .then((maps) => {
        const set: BakedSet = {};
        for (const [kind, tex] of maps) {
          tex.wrapS = tex.wrapT = RepeatWrapping;
          tex.colorSpace = kind === "albedo" ? SRGBColorSpace : NoColorSpace;
          set[kind] = tex;
        }
        return set;
      })
      .catch(() => {
        cache.delete(name); // следващата сцена опитва наново
        return null;
      });
    cache.set(name, p);
  }
  return p;
}

export interface UpgradeOpts {
  /** Повторки на плочката (както при canvas текстурата, която се подменя). */
  repeat: [number, number];
  /** Сила на нормалите (по подразбиране — тази, която материалът вече има). */
  normalScale?: number;
  /** Орехът носи и цвета си; сукното и месингът — само релеф и грапавост. */
  albedo?: boolean;
  /** Металност от картата (месинг). */
  metalness?: boolean;
  /** Цвят след подмяната (албедото на ореха носи тона сам — дотогава материалът е с плътен цвят). */
  color?: ColorRepresentation;
  /** Четвърт оборот на картите: жилката да върви по дължината на страничните греди. */
  rotate?: boolean;
  /** Базова грапавост (картата я умножава) — орехът иска ~0.9, за да остане сатенен лак. */
  roughness?: number;
  /** Сила на кухинната AO от картата. */
  ao?: number;
  /** Извиква се след подмяната (напр. RenderCore.invalidate). */
  onReady?: () => void;
}

/**
 * Подменя canvas картите на `mat` с изпечените, щом се заредят. Клоновете делят
 * изображението (един GPU ъплоуд), но всеки носи свои повторки. Старите карти се
 * освобождават. Материал, изхвърлен междувременно, не се пипа.
 */
export function upgradeMaterial(mat: MeshStandardMaterial, name: BakedName, opts: UpgradeOpts): void {
  void load(name).then((set) => {
    if (!set || (mat as { __disposed?: boolean }).__disposed) return;
    const take = (tex: Texture | undefined) => {
      if (!tex) return null;
      const t = tex.clone();
      t.repeat.set(opts.repeat[0], opts.repeat[1]);
      if (opts.rotate) {
        t.center.set(0.5, 0.5);
        t.rotation = Math.PI / 2;
      }
      t.anisotropy = 8; // three го сваля до максимума на устройството; жилката остава остра под ъгъл
      t.needsUpdate = true;
      return t;
    };
    const swap = <K extends "map" | "normalMap" | "roughnessMap" | "metalnessMap" | "aoMap">(key: K, tex: Texture | null) => {
      if (!tex) return;
      const old = mat[key] as Texture | null;
      mat[key] = tex as MeshStandardMaterial[K];
      // ORM се ползва за няколко слота — не освобождавай карта, която още е вързана.
      if (old && old !== tex && ![mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.aoMap].includes(old)) old.dispose();
    };
    if (opts.albedo) swap("map", take(set.albedo));
    if (opts.color !== undefined) mat.color.set(opts.color);
    swap("normalMap", take(set.normal));
    if (opts.normalScale !== undefined) mat.normalScale.set(opts.normalScale, opts.normalScale);
    const orm = take(set.orm);
    swap("roughnessMap", orm);
    swap("aoMap", orm);
    mat.aoMapIntensity = opts.ao ?? 0.6;
    if (opts.roughness !== undefined) mat.roughness = opts.roughness;
    if (opts.metalness) swap("metalnessMap", orm);
    mat.needsUpdate = true;
    opts.onReady?.();
  });
}

/**
 * Клон на геометрия с UV, отместени с `seed`: полетата на една дъска делят един материал
 * (едно извикване на шейдъра), но всяко показва свое парче дърво — като истинска инкрустация.
 */
export function grainUv<G extends BufferGeometry>(geo: G, seed: number): G {
  const g = geo.clone();
  const uv = g.getAttribute("uv");
  const du = ((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1;
  const dv = ((Math.sin(seed * 78.233) * 12543.1234) % 1 + 1) % 1;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.3 + du, uv.getY(i) * 0.3 + dv);
  uv.needsUpdate = true;
  return g;
}
