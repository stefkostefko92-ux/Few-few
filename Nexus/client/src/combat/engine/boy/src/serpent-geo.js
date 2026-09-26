// 4b кръг 2 (Nexus порт, НЕ част от оригиналния boy) — геометрия на змията: конусовидно-тесни
// сегменти (segProfile от beast-config.js — реален радиус-профил, не еднакъв цилиндър), глава с
// муцуна/очи/уста. Същия piece-принцип като beast-geo.js/armor.js (RigidBatcher срещу matrix).
import * as THREE from 'three';
import { xf, merge } from './geo.js';
import { SerpentRig } from './serpent-rig.js';
import { createBeastMaterials } from './beast-materials.js';

const single = (g) => merge([g]);

// Капсула по local Z (setBasis конвенцията в serpent-rig.js — tangent е Z оста).
function segGeo(r, len) {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 0.5), 4, 8);
  xf(g, [0, 0, 0], [Math.PI / 2, 0, 0]);
  return g;
}

export function buildSerpent(species) {
  const S = species;
  const M = createBeastMaterials(S);
  const rig = new SerpentRig(S);
  const fur = M.fur;

  const pieces = {};
  for (let i = 0; i < S.segCount; i++) {
    const rTop = S.segR * S.segProfile[i];
    const rBot = S.segR * (S.segProfile[Math.min(S.segCount - 1, i + 1)] ?? S.segProfile[i]);
    const r = (rTop + rBot) / 2;
    pieces[`seg${i}`] = [[single(segGeo(Math.max(0.012, r), S.segLen * 1.15)), fur]];
  }

  const headFur = merge([
    xf(new THREE.SphereGeometry(S.headR, 12, 10), [0, 0, 0], [0, 0, 0], [0.92, 0.85, 1.15]),
    xf(new THREE.ConeGeometry(S.snoutR * 1.4, S.snoutLen, 8), [0, -S.headR * 0.1, S.snoutLen * 0.5], [Math.PI / 2, 0, 0]),
  ]);
  pieces.head = [
    [headFur, fur],
    [single(xf(new THREE.SphereGeometry(S.headR * 0.1, 6, 6), [S.headR * 0.5, S.headR * 0.15, S.headR * 0.65])), M.eye],
    [single(xf(new THREE.SphereGeometry(S.headR * 0.1, 6, 6), [-S.headR * 0.5, S.headR * 0.15, S.headR * 0.65])), M.eye],
  ];
  pieces.jaw = [[single(xf(new THREE.ConeGeometry(S.snoutR * 1.15, S.snoutLen * 0.8, 8), [0, -S.snoutR * 0.35, 0], [Math.PI / 2, 0, 0])), M.skin]];

  return { rig, pieces, materials: M };
}
