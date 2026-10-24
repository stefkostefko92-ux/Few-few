// Ръкавица — СЪЩИЯТ gauntlet builder (buildHand) като бойния рицар (armor.js). Иконата показва
// ЕДИН предмет (десен), не чифт — стандартната конвенция за екипировъчна икона.
// Ботушите вече не са самостоятелен предмет (наколенник+сабатон изолирано четеше се двусмислено —
// виж support.ts) — обличат се на манекен, mannequin.ts.
import * as THREE from 'three/webgpu';
import { buildHand, harnessStyle } from '../../boy/src/armor.js';
import type { Rand } from '../rng';
import type { BoyMaterials } from '../boy-materials';

export function buildGloves(M: BoyMaterials, rand: Rand): THREE.Object3D {
  const st = harnessStyle(M, rand() < 0.5 ? 'A' : 'B');
  return buildHand(M, st) as THREE.Object3D;
}
