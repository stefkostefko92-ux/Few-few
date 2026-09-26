// 4b кръг 3 (Nexus порт, НЕ част от оригиналния boy) — паякът вече е ЕДНА SDF-изваяна повърхност
// (цефалоторакс+коремче+8 крака, spider-sdf.js + sdf-skin.js) — кръг 2 остави "топка с пръсти" (2
// твърди сфери + 8 отделни капсули, докладвано при преглед). Очите/зъбите остават остри твърди
// piece-ове, закачени за rig.parts.cephalo (батчерът ги чете срещу СЪЩАТА матрица, непроменено).
import * as THREE from 'three';
import { xf, merge } from './geo.js';
import { SpiderRig } from './spider-rig.js';
import { createBeastMaterials } from './beast-materials.js';
import { restSpiderJoints, spiderSDF, spiderBounds, spiderBoneSegments, SPIDER_BONES } from './spider-sdf.js';
import { buildSkinnedFromSDF, addBellyAttribute } from './sdf-skin.js';

const single = (g) => merge([g]);

export { SPIDER_BONES };

function buildOrganicSpiderBody(S, material) {
  const { rig, joints } = restSpiderJoints(S);
  const sdf = spiderSDF(S, joints);
  const bounds = spiderBounds(S, joints);
  const cell = Math.max(0.006, Math.min(0.016, S.legR * 0.28));
  const segMap = spiderBoneSegments(S, joints);
  // 4b QA-fix (кръг 4): виж beast-geo.js бележката — bind матрицата иска ЦЯЛАТА rig.parts[name]
  // (позиция+завъртане), не само позиция, иначе краката се усукват в сплескана лента.
  const bones = SPIDER_BONES.map((name) => ({
    name,
    restMatrix: rig.parts[name].matrix.clone(),
    segments: segMap[name],
  }));
  const { mesh, bones: boneMap } = buildSkinnedFromSDF({ sdf, bounds, cell, bones, material });
  // 4b QA-fix (кръг 4): по-тесен spread — виж beast-geo.js бележката (кракът не бива да поема
  // пълния коремски тон чак до лапата).
  // Коремен тон само за двете тела — 8-те крака иначе излизаха бели (същото като при четириногите).
  addBellyAttribute(mesh.geometry, joints.cephalo.y, S.cephaloR * 0.9, new Set([0, 1]));
  mesh.frustumCulled = false;
  return { mesh, bones: boneMap };
}

export function buildSpider(species) {
  const S = species;
  const M = createBeastMaterials(S);
  const rig = new SpiderRig(S);
  const fur = M.fur;
  const bodyMat = fur.clone();
  bodyMat.side = THREE.DoubleSide;
  const skin = buildOrganicSpiderBody(S, bodyMat);

  const eyePts = [[-0.55, 0.5], [0.55, 0.5], [-0.3, 0.7], [0.3, 0.7]].slice(0, S.eyeCount || 4);
  const cephalo = eyePts.map(([ex, ey]) => [
    single(xf(new THREE.SphereGeometry(S.headR * 0.1, 6, 6), [ex * S.cephaloR, ey * S.cephaloR * 0.4, S.cephaloR * 0.9])),
    M.eye,
  ]);
  const jaw = () => [[single(xf(new THREE.ConeGeometry(S.fangLen * 0.35, S.fangLen, 6), [0, -S.fangLen * 0.4, 0], [Math.PI, 0, 0])), M.tusk]];

  const pieces = { cephalo, jawL: jaw(), jawR: jaw() };
  return { rig, pieces, materials: M, skin };
}
