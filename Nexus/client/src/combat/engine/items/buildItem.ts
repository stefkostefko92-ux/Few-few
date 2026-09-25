// Обща библиотека — предметите се обличат в СЪЩАТА геометрия/материя, с която боят облича
// рицарите (boy/src/{helmets,armor,weapons,weapons-ranged,heraldry,cloth,materials}.js), само
// тонирана по темата на предмета (catalog.json → theme.primary/secondary/trim, през
// loadout.js tintedMaterials). Използва се за: (1) изпечени икони (bake-item-icons.mjs),
// (2) живия 3D преглед (ItemViewer3D). Връща чист THREE.Object3D + dispose(), без React/DOM.
//
// НЕ всеки слот се бие от boy — вижте support.ts: boy не моделира пръстени/амулети изобщо, а
// брадва/копие нямат боен силует в него (само меч/кама/жезъл/лък/боздуган). За тези
// supports3DIcon() връща false и buildItem() връща null — извикващият (Sprite/bake скрипта)
// пада обратно на старата HD снимка (client/public/assets/icons/), точно както задачата иска.
import * as THREE from 'three/webgpu';
import { getBoyMaterials, tintForItem, type BoyMaterials } from './boy-materials';
import { decalMaterial } from './materials';
import { buildMotifTexture } from './motifTexture';
import { rngFor } from './rng';
import { buildHelm } from './slots/helm';
import { buildGloves, buildBoots } from './slots/hands';
import { buildCloak } from './slots/cloak';
import { buildShield } from './slots/shield';
import { buildWeapon } from './slots/weapons';
import { supports3DIcon } from './support';
import type { CatalogEntry } from './theme';

export interface BuildItemOpts {
  /** Слага мотив-декал на видима плоча (гърди/чело); по подразбиране true. */
  decal?: boolean;
}

export interface BuiltItem {
  object: THREE.Object3D;
  dispose(): void;
}

/** Disposeва САМО геометриите (винаги уникални за предмета) — материалите на boy СПОДЕЛЕНИ
 *  (mail/leather/wood/gambeson/slit/capeA/capeB/banner живеят за целия живот на приложението,
 *  точно като PMREM env картата в renderScene.ts); disposeването им тук би счупило следващия
 *  предмет, построен след този. Собствените клонинги (тонирани plate/trim/blade, shieldFace,
 *  декал) се disposeват отделно, изрично — виж `owned` по-долу. */
function disposeGeometries(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry?.dispose();
  });
}

function attachDecalPlate(group: THREE.Object3D, entry: CatalogEntry, rand: () => number, at: [number, number, number], size: [number, number], owned: Array<{ dispose(): void }>): void {
  // motifTexture.ts рисува в <canvas> (DOM) — недостъпно в `node --test` (без jsdom); декалът е
  // чисто козметичен слой, пропускаме го извън браузър вместо да чупим тестовете.
  if (typeof document === 'undefined') return;
  const tex = buildMotifTexture(entry.theme, rand, entry.tier);
  const decal = decalMaterial(entry.theme, tex);
  const geo = new THREE.PlaneGeometry(size[0], size[1]);
  geo.translate(at[0], at[1], at[2]);
  const m = new THREE.Mesh(geo, decal);
  group.add(m);
  owned.push({ dispose: () => { decal.dispose(); tex.dispose(); } });
}

/** Централира bbox по X/Z, спуска основата на Y=0 — еднакво кадриране за всички предмети. */
function normalizePivot(obj: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(obj);
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  for (const child of obj.children) {
    child.position.x -= cx;
    child.position.z -= cz;
  }
  obj.updateMatrixWorld(true);
}

function pickTint(entry: CatalogEntry): { plate: string; trim: string; blade: string } {
  return { plate: entry.theme.primary, trim: entry.theme.trim, blade: entry.theme.secondary };
}

export async function buildItem(entry: CatalogEntry, opts: BuildItemOpts = {}): Promise<BuiltItem | null> {
  if (!supports3DIcon(entry)) return null;
  const { decal = true } = opts;
  const rand = rngFor(entry.slug);
  const base: BoyMaterials = await getBoyMaterials();
  const tinted = tintForItem(base, pickTint(entry));
  const M = tinted.M;
  const owned: Array<{ dispose(): void }> = [{ dispose: () => tinted.dispose() }];

  const group = new THREE.Group();
  group.name = `item:${entry.slug}`;

  let piece: THREE.Object3D | null;
  switch (entry.category) {
    case 'weapon': {
      const icon = entry.icon || entry.sub_type || 'sword';
      piece = buildWeapon(M, icon, rand);
      break;
    }
    case 'shield': {
      const built = buildShield(M, entry.theme.trim);
      owned.push(built);
      piece = built.object;
      break;
    }
    case 'helm': piece = buildHelm(M, rand); break;
    case 'gloves': piece = buildGloves(M, rand); break;
    case 'boots': piece = buildBoots(M, rand); break;
    case 'cloak': {
      const built = buildCloak(M, entry.theme.primary, rand);
      owned.push(built);
      piece = built.object;
      break;
    }
    default: piece = null;
  }
  if (!piece) {
    // supports3DIcon вече би трябвало да е спряло дотук — защитен изход, не гнило състояние.
    tinted.dispose();
    return null;
  }
  group.add(piece);

  if (decal && entry.theme.motif !== 'plain' && entry.category === 'helm') {
    attachDecalPlate(group, entry, rand, [0, 0.1, 0.115], [0.09, 0.06], owned);
  }

  normalizePivot(group);
  // boy/surface.js applyGrime() reads WORLD-space Y assuming a full knight standing in mud (fades
  // out above y≈0.55m) — an icon's own local geometry sits near y≈0 (helm/boots/etc. all built
  // around their own joint origin), which reads as "ankle-deep". An item on a shop shelf isn't
  // standing in a battlefield puddle, so we deliberately lift it above the grime band instead of
  // simulating mud on a floating icon. frameCamera()/contactShadow() in renderScene.ts both
  // re-center on the object's own bounding sphere, so this is invisible to the camera framing.
  group.position.y = 1.35;

  return {
    object: group,
    dispose: () => {
      disposeGeometries(group);
      for (const o of owned) o.dispose();
    },
  };
}
