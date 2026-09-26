// 4b кръг 3 (Nexus порт, НЕ част от оригиналния boy) — SDF описание на паяка: цефалоторакс +
// коремче СИ остават два различими лоба (истински паяк, не един блоб — spec го иска изрично), но
// сега слети с ТЪНКА талия (не два откъснати fixed shapes) и 8-те крака са ВЕРИГИ (sdf-mesh.js
// chain), слети В тялото на котвата им — не отделни "пръсти", закачени отвън (докладваният "топка
// с пръсти" проблем).
import * as THREE from 'three';
import { v3, ellipsoid, cone, chain, blend } from './sdf-mesh.js';
import { SpiderRig } from './spider-rig.js';

function pos(part) { return new THREE.Vector3().setFromMatrixPosition(part.matrix); }

export const SPIDER_BONES = ['cephalo', 'abdomen'];
for (let i = 0; i < 8; i++) SPIDER_BONES.push(`legUpper${i}`, `legLower${i}`, `legPaw${i}`);

export function restSpiderJoints(S) {
  const rig = new SpiderRig(S);
  const zero = () => ({ pos: new THREE.Vector3(), yaw: 0, pitch: 0 });
  const baseP = {
    root: new THREE.Vector3(), yaw: 0, hipY: S.hipY, breath: 0,
    headTarget: new THREE.Vector3(0, S.hipY, S.cephaloR * 3), lunge: 0, biteOpen: 0, flinch: 0,
    legs: Array.from({ length: 8 }, zero),
  };
  rig.update(baseP); // 1-ви прогон: пълни rig.legAnchors (котвите на краката около тялото).
  const legs = rig.legAnchors.map((a) => ({ pos: new THREE.Vector3(a.x * 1.55, 0, a.z * 1.55), yaw: 0, pitch: 0 }));
  rig.update({ ...baseP, legs }); // 2-ри прогон: краката слизат естествено до земята, разперени.
  const j = {
    cephalo: pos(rig.parts.cephalo), abdomen: pos(rig.parts.abdomen),
    legAnchors: rig.legAnchors.map((v) => v.clone()),
  };
  for (let i = 0; i < 8; i++) {
    j[`legUpper${i}`] = pos(rig.parts[`legUpper${i}`]);
    j[`legLower${i}`] = pos(rig.parts[`legLower${i}`]);
    j[`legPaw${i}`] = pos(rig.parts[`legPaw${i}`]);
  }
  return { rig, joints: j };
}

export function spiderSDF(S, j) {
  const cephalo = ellipsoid(j.cephalo, v3(S.cephaloR, S.cephaloR * 0.82, S.cephaloR * 1.05));
  const abdomen = ellipsoid(j.abdomen, v3(S.abdomenR, S.abdomenR * 0.9, S.abdomenR * 1.2));
  const waist = cone(j.cephalo, j.abdomen, S.cephaloR * 0.42, S.abdomenR * 0.35);
  // legUpper{i}/legLower{i}/legPaw{i} позициите СА рамото/коляното/лапата (spider-rig.js
  // setSegment слага матрицата на всяка кост на ПРОКСИМАЛНИЯ ѝ край — виж beast-sdf.js
  // коментара за същата конвенция при квадрупед) — 3 точки, БЕЗ отделна "котва" (тя съвпада с
  // legUpper{i}), иначе първият сегмент на веригата е с нулева дължина (закачен извън тялото).
  const legR = S.legR;
  const legs = [];
  for (let i = 0; i < 8; i++) {
    legs.push(chain(
      [j[`legUpper${i}`], j[`legLower${i}`], j[`legPaw${i}`]],
      [legR * 1.1, legR * 0.62, legR * 0.72],
    ));
  }
  const fangs = [
    cone(j.cephalo.clone().add(v3(S.cephaloR * 0.28, -S.cephaloR * 0.15, S.cephaloR * 0.8)), j.cephalo.clone().add(v3(S.cephaloR * 0.24, -S.cephaloR * 0.55, S.cephaloR * 0.95)), S.fangLen * 0.35, S.fangLen * 0.05),
    cone(j.cephalo.clone().add(v3(-S.cephaloR * 0.28, -S.cephaloR * 0.15, S.cephaloR * 0.8)), j.cephalo.clone().add(v3(-S.cephaloR * 0.24, -S.cephaloR * 0.55, S.cephaloR * 0.95)), S.fangLen * 0.35, S.fangLen * 0.05),
  ];
  const kBody = Math.max(0.015, S.cephaloR * 0.35);
  const kLeg = Math.max(0.01, S.legR * 1.4);
  return blend([
    { f: cephalo, k: kBody },
    { f: abdomen, k: kBody },
    { f: waist, k: kBody * 0.6 },
    ...legs.map((f) => ({ f, k: kLeg })),
    ...fangs.map((f) => ({ f, k: 0 })),
  ]);
}

export function spiderBounds(S, j) {
  const pts = Object.keys(j).filter((k) => k !== 'legAnchors').map((k) => j[k]);
  const margin = Math.max(S.cephaloR, S.abdomenR, S.legR) * 1.6 + 0.03;
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of pts) { min.min(p); max.max(p); }
  min.subScalar(margin);
  max.addScalar(margin);
  min.y = Math.max(min.y, -0.02);
  return { min, max };
}

export function spiderBoneSegments(S, j) {
  const legR = S.legR;
  const out = {
    cephalo: [[j.cephalo, j.cephalo, S.cephaloR * 0.8]],
    abdomen: [[j.abdomen, j.abdomen, S.abdomenR * 0.85]],
  };
  for (let i = 0; i < 8; i++) {
    out[`legUpper${i}`] = [[j[`legUpper${i}`], j[`legLower${i}`], legR]];
    out[`legLower${i}`] = [[j[`legLower${i}`], j[`legPaw${i}`], legR * 0.8]];
    out[`legPaw${i}`] = [[j[`legPaw${i}`], j[`legPaw${i}`], legR * 0.7]];
  }
  return out;
}
