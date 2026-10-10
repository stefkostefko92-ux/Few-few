// Оръжия — СЪЩИТЕ builders като бойния рицар: longsword/armingSword/heaterShield (weapons.js) и
// shortSword/staff/bow/mace (weapons-ranged.js). Всеки връща `{pieces}` — масив от [geometry,
// material] чифтове, вече сплетени в едно root-local пространство (boy/geo.js flatten()); тук
// само ги превръщаме в мрежи. Брадва/копие boy НЕ моделира — виж support.ts, тези икони не се
// стигат дотук.
import * as THREE from 'three/webgpu';
import { longsword, armingSword } from '../../boy/src/weapons.js';
import { shortSword, staff, bow, mace } from '../../boy/src/weapons-ranged.js';
import type { Rand } from '../rng';
import type { BoyMaterials } from '../boy-materials';

type FlattenedPieces = [THREE.BufferGeometry, THREE.Material][];

/** Продуктов кадър: боевите пропорции на boy са тънки за икона — удебеляваме острието (+30% ширина,
 *  +60% дебелина, само над кръстача), дръжките на жезъл/лък и главата на жезъла, без да пипаме
 *  споделената боева геометрия (клонираме върховете). */
function bulk(pieces: FlattenedPieces, M: BoyMaterials, icon: string): FlattenedPieces {
  const out: FlattenedPieces = [];
  for (const [geo0, mat] of pieces) {
    const geo = geo0.clone();
    const p = geo.attributes.position;
    const isBlade = mat === (M.blade as THREE.Material) || mat === (M.bladeDark as THREE.Material);
    const isWood = mat === (M.wood as THREE.Material);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
      if ((icon === 'sword' || icon === 'dagger') && isBlade && (icon === 'dagger' || y > 0.078) && Math.abs(x) < 0.04) p.setXYZ(i, x * 1.3, y, z * 1.6);
      else if (icon === 'staff' && isWood) p.setXYZ(i, x * 1.5, y, z * 1.5);
      else if (icon === 'staff' && mat === (M.blade as THREE.Material)) { const cy = 1.045; p.setXYZ(i, x * 1.8, cy + (y - cy) * 1.8, z * 1.8); }
      else if (icon === 'bow' && isWood) p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
    out.push([geo, mat]);
  }
  return out;
}

function groupFromPieces(pieces: FlattenedPieces, M?: BoyMaterials, icon = ''): THREE.Object3D {
  const g = new THREE.Group();
  const src = M ? bulk(pieces, M, icon) : pieces;
  for (const [geo, mat] of src) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

/** `icon` идва от каталога (viж theme.ts бележката — за weapon ГЕОМЕТРИЯТА чете `icon`, не
 *  `sub_type`). Само стойностите от support.ts SUPPORTED_WEAPON_ICONS стигат дотук. */
export function buildWeapon(M: BoyMaterials, icon: string, rand: Rand): THREE.Object3D | null {
  switch (icon) {
    case 'sword':
      return groupFromPieces((rand() < 0.5 ? longsword(M) : armingSword(M)).pieces as FlattenedPieces, M, 'sword');
    case 'dagger':
      return groupFromPieces(shortSword(M).pieces as FlattenedPieces, M, 'dagger');
    case 'staff':
      return groupFromPieces(staff(M).pieces as FlattenedPieces, M, 'staff');
    case 'bow':
      return groupFromPieces(bow(M).pieces as FlattenedPieces);
    case 'mace':
      return groupFromPieces(mace(M).pieces as FlattenedPieces);
    default:
      return null;
  }
}
