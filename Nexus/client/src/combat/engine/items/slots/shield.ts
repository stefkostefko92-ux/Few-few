// Щит — СЪЩИЯТ heaterShield builder, който Ser Aldric носи в боя (weapons.js). Хералдиката
// (боядисаното лице) идва от heraldry.js/shieldTextures() — фиксирана тауър-емблема, споделена
// с боя; лицето само се тонира по темата на предмета (rim/дърво/кожа остават естествени), иначе
// 27-те щита в каталога биха изглеждали идентични в contact sheet-а — виж бележката в
// buildItem.ts за компромиса.
import * as THREE from 'three/webgpu';
import { heaterShield } from '../../boy/src/weapons.js';
import type { BoyMaterials } from '../boy-materials';

export interface BuiltShield {
  object: THREE.Object3D;
  /** Клонираният shieldFace материал (тонира хералдиката) — трябва да се disposeне отделно от
   *  тонираните plate/trim материали (tintForItem вече покрива steelA/steelB/goldB/brass). */
  dispose(): void;
}

export function buildShield(M: BoyMaterials, tint: string): BuiltShield {
  const shieldFace = (M.shieldFace as THREE.MeshPhysicalNodeMaterial).clone();
  shieldFace.color = new THREE.Color(tint);
  const tintedM = { ...M, shieldFace };
  const { pieces } = heaterShield(tintedM) as unknown as { pieces: [THREE.BufferGeometry, THREE.Material][] };
  const g = new THREE.Group();
  for (const [geo, mat] of pieces) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return { object: g, dispose: () => shieldFace.dispose() };
}
