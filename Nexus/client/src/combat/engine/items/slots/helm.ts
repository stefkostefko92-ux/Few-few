// Шлем — СЪЩИТЕ два builders като бойния рицар: великия шлем с месингов кръст (Ser Aldric,
// стил 'A') и хундскул бацинета с авентайл (the Warden, стил 'B') — helmets.js. Изборът между
// двата е детерминиран по slug (rand), не по тема — boy няма трети силует.
import * as THREE from 'three/webgpu';
import { buildHelmet } from '../../boy/src/helmets.js';
import type { Rand } from '../rng';
import type { BoyMaterials } from '../boy-materials';

export function buildHelm(M: BoyMaterials, rand: Rand): THREE.Object3D {
  const style = rand() < 0.5 ? 'A' : 'B';
  const helm = buildHelmet(M, style) as THREE.Group;
  // Хундскул бацинета (стил 'B') носи авентайл — мрежеста плоча, драпираща от шлема надолу върху
  // раменете на рицаря (helmets.js). Изолирана без тяло под нея, лате-геометрията се разгъва в
  // солиден сив КОНУС ("стойка" под шлема — обратна връзка от прегледа). Маха се само за
  // самостоятелната икона; в живия бой аvентайлът си стои (пада върху раменете).
  const aventail = helm.children.find((c) => (c as THREE.Mesh).material && ((c as THREE.Mesh).material as THREE.Material).name === 'mail');
  if (aventail) helm.remove(aventail);
  return helm;
}
