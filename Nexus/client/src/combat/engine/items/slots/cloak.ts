// Наметало — СЪЩАТА Verlet платно-симулация, с която боят люлее наметалото на Ser Aldric
// (cloth.js Cape), не статична равнина. За една статична икона пускаме симулацията 1.5с под
// гравитация без вятър/колизии, докато увисне естествено, после замразяваме кадъра — истинска
// физика на плата, не имитация на гънки.
//
// capeA/capeB носят ФИКСИРАНА хералдика (синьо/аленочервено-Ser Aldric знаме, heraldry.js) — без
// тониране 54-те наметала в каталога биха изглеждали само в два цвята, независимо от темата на
// предмета. Клонираме и тонираме по theme.primary — платът остава истинска boy геометрия/платно
// симулация, само цветът идва от предмета (същия компромис като shieldFace в shield.ts).
import * as THREE from 'three/webgpu';
import { Cape } from '../../boy/src/cloth.js';
import { chestCapeAnchors } from '../../boy/src/armor.js';
import type { Rand } from '../rng';
import type { BoyMaterials } from '../boy-materials';

const SETTLE_STEPS = 34; // спира докато плата ВИСИ, преди да легне напълно плоско
const DT = 1 / 60;
const NO_WIND = { x: 0, y: 0, z: 0, phase: 0 };
const NO_COLLIDERS: { c: THREE.Vector3; r: number }[] = [];

export interface BuiltCloak {
  object: THREE.Object3D;
  dispose(): void;
}

export function buildCloak(M: BoyMaterials, tint: string, rand: Rand): BuiltCloak {
  const base = (rand() < 0.5 ? M.capeA : M.capeB) as THREE.MeshPhysicalNodeMaterial;
  const material = base.clone();
  material.color = new THREE.Color(tint);
  const cape = new Cape(material, { cols: 9, rows: 15, length: 0.85, flare: 0.4 + rand() * 0.2 });
  const anchors = chestCapeAnchors();
  const back = new THREE.Vector3(0, 0, -1);
  cape.reset(anchors, back);
  for (let i = 0; i < SETTLE_STEPS; i++) cape.step(DT, anchors, NO_COLLIDERS, NO_WIND, back);
  return { object: cape.mesh as THREE.Object3D, dispose: () => material.dispose() };
}
