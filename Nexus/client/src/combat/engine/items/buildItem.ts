// Обща библиотека — процедурен генератор на 3D предмети от сетовете/екипировката на Nexus
// Dominion, в стила на boy (TSL/node материали, детерминизъм по slug). Използва се за:
// (1) изпечени икони (bake-item-icons.mjs), (2) живия 3D преглед (ItemViewer3D), и по-късно
// (3) обличане на боец в новия бой — затова връща чист THREE.Object3D + dispose(), без React/DOM.
import * as THREE from 'three/webgpu';
import { buildRoleSet, decalMaterial, rarityHalo } from './materials';
import { buildMotifTexture } from './motifTexture';
import { rngFor } from './rng';
import { buildHelm } from './slots/helm';
import { buildTorso } from './slots/torso';
import { buildGloves, buildBoots } from './slots/hands';
import { buildCloak } from './slots/cloak';
import { buildShield } from './slots/shield';
import { buildWeapon } from './slots/weapons';
import { buildRing, buildAmulet } from './slots/jewelry';
import type { CatalogEntry } from './theme';

export interface BuildItemOpts {
  /** Слага мотив-декал на видима плоча (гърди/чело); по подразбиране true. */
  decal?: boolean;
}

export interface BuiltItem {
  object: THREE.Object3D;
  dispose(): void;
}

function disposeMaterial(mat: THREE.Material): void {
  const m = mat as THREE.MeshPhysicalNodeMaterial & Record<string, unknown>;
  for (const key of ['map', 'emissiveMap', 'roughnessMap', 'normalMap', 'clearcoatNormalMap']) {
    const tex = m[key];
    if (tex && typeof (tex as THREE.Texture).dispose === 'function') (tex as THREE.Texture).dispose();
  }
  mat.dispose();
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach(disposeMaterial);
    else if (mat) disposeMaterial(mat);
  });
}

function attachDecalPlate(group: THREE.Object3D, mats: ReturnType<typeof buildRoleSet>, entry: CatalogEntry, rand: () => number, at: [number, number, number], size: [number, number]): void {
  const tex = buildMotifTexture(entry.theme, rand, entry.tier);
  const decal = decalMaterial(entry.theme, tex);
  const geo = new THREE.PlaneGeometry(size[0], size[1]);
  geo.translate(at[0], at[1], at[2]);
  const m = new THREE.Mesh(geo, decal);
  group.add(m);
  void mats;
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

export function buildItem(entry: CatalogEntry, opts: BuildItemOpts = {}): BuiltItem {
  const { decal = true } = opts;
  const rand = rngFor(entry.slug);
  const M = buildRoleSet(entry.theme);
  const group = new THREE.Group();
  group.name = `item:${entry.slug}`;

  let piece: THREE.Object3D;
  switch (entry.category) {
    case 'weapon': piece = buildWeapon(M, entry.theme, entry.icon || entry.sub_type || 'sword', entry.tier, rand); break;
    case 'shield': piece = buildShield(M, entry.theme, entry.tier, rand); break;
    case 'helm': piece = buildHelm(M, entry.theme, entry.tier, rand); break;
    case 'armor': piece = buildTorso(M, entry.theme, entry.tier); break;
    case 'gloves': piece = buildGloves(M); break;
    case 'boots': piece = buildBoots(M); break;
    case 'cloak': piece = buildCloak(M, rand); break;
    case 'ring': piece = buildRing(M, entry.theme); break;
    case 'amulet': piece = buildAmulet(M); break;
    default: piece = buildWeapon(M, entry.theme, 'sword', entry.tier, rand);
  }
  group.add(piece);

  if (decal && entry.theme.motif !== 'plain') {
    if (entry.category === 'armor' && entry.theme.family !== 'cloth') attachDecalPlate(group, M, entry, rand, [0, 0.02, 0.035], [0.14, 0.12]);
    if (entry.category === 'helm') attachDecalPlate(group, M, entry, rand, [0, 0.1, 0.115], [0.09, 0.06]);
  }

  const halo = rarityHalo(entry.rarity);
  if (halo) {
    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const r = Math.max(size.x, size.y, size.z) * 0.62 + 0.02;
    const haloMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), halo);
    haloMesh.position.copy(center);
    group.add(haloMesh);
  }

  normalizePivot(group);

  return {
    object: group,
    dispose: () => disposeObject(group),
  };
}
