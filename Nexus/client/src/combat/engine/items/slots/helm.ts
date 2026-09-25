// Шлем — СЪЩИТЕ два builders като бойния рицар: великия шлем с месингов кръст (Ser Aldric,
// стил 'A') и хундскул бацинета с авентайл (the Warden, стил 'B') — helmets.js. Изборът между
// двата е детерминиран по slug (rand), не по тема — boy няма трети силует.
import * as THREE from 'three/webgpu';
import { buildHelmet } from '../../boy/src/helmets.js';
import type { Rand } from '../rng';
import type { BoyMaterials } from '../boy-materials';

export function buildHelm(M: BoyMaterials, rand: Rand): THREE.Object3D {
  const style = rand() < 0.5 ? 'A' : 'B';
  return buildHelmet(M, style) as THREE.Object3D;
}
