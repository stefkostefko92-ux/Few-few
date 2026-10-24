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

function groupFromPieces(pieces: FlattenedPieces): THREE.Object3D {
  const g = new THREE.Group();
  for (const [geo, mat] of pieces) {
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
      return groupFromPieces((rand() < 0.5 ? longsword(M) : armingSword(M)).pieces as FlattenedPieces);
    case 'dagger':
      return groupFromPieces(shortSword(M).pieces as FlattenedPieces);
    case 'staff':
      return groupFromPieces(staff(M).pieces as FlattenedPieces);
    case 'bow':
      return groupFromPieces(bow(M).pieces as FlattenedPieces);
    case 'mace':
      return groupFromPieces(mace(M).pieces as FlattenedPieces);
    default:
      return null;
  }
}
