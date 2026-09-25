// Ръкавици / ботуши — СЪЩИЯТ gauntlet (buildHand) и greave+сабатон (buildShin+buildFoot) builders
// като бойния рицар (armor.js). Иконата показва ЕДИН предмет (десен), не чифт — стандартната
// конвенция за екипировъчна икона (виж инвентара на всяка друга RPG).
import * as THREE from 'three/webgpu';
import { buildHand, buildShin, buildFoot, harnessStyle } from '../../boy/src/armor.js';
import type { Rand } from '../rng';
import type { BoyMaterials } from '../boy-materials';

export function buildGloves(M: BoyMaterials, rand: Rand): THREE.Object3D {
  const st = harnessStyle(M, rand() < 0.5 ? 'A' : 'B');
  return buildHand(M, st) as THREE.Object3D;
}

/** Наколенник (shin, произход = коляното) + сабатон (foot, произход = глезена), споени на
 *  глезенния офсет, който greave профила на shin вече предполага (връх на профила при y≈-0.42,
 *  виж armor.js buildShin) — истинският боен силует, не отделен ботуш, залепен за крак. */
export function buildBoots(M: BoyMaterials, rand: Rand): THREE.Object3D {
  const st = harnessStyle(M, rand() < 0.5 ? 'A' : 'B');
  const g = new THREE.Group();
  const shin = buildShin(M, st) as THREE.Object3D;
  g.add(shin);
  const foot = buildFoot(M, st) as THREE.Object3D;
  foot.position.set(0, -0.42, 0.02);
  g.add(foot);
  return g;
}
