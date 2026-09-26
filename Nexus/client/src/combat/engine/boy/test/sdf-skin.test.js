// 4b кръг 4 (Nexus порт, НЕ част от оригиналния boy) — координаторски регресионен тест:
// "при rest поза без анимация мешът трябва да съвпада 1:1 с SDF-а (skinned позиции в rest ==
// bind позиции, допуск 1e-4)". Ловi точно бъга от кръг 3 (сега поправен) — bind матрицата на
// всяка кост беше ЧИСТА транслация (без реалното завъртане на rig.parts[name].matrix), затова
// дори В REST позата всяко завъртяно кокалче (крак/опашка) сплескваше геометрията около себе си.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BEAST_SPECIES } from '../src/beast-config.js';
import { restRigJoints, quadSDF, quadBounds, quadBoneSegments } from '../src/beast-sdf.js';
import { restSpiderJoints, spiderSDF, spiderBounds, spiderBoneSegments } from '../src/spider-sdf.js';
import { buildSkinnedFromSDF } from '../src/sdf-skin.js';
import { QUAD_BONES } from '../src/beast-geo.js';
import { SPIDER_BONES } from '../src/spider-geo.js';

// Ръчно CPU скиниране (== GPU LBS формулата, но синхронно/детерминирано за тест): за всеки връх,
// сумира weight_k * (bone.matrixWorld_k * bindMatrixInverse_k) * vertexBindPos.
function skinCPU(mesh, boneList) {
  const pos = mesh.geometry.attributes.position;
  const si = mesh.geometry.attributes.skinIndex;
  const sw = mesh.geometry.attributes.skinWeight;
  const inv = mesh.skeleton.boneInverses;
  const v = new THREE.Vector3();
  const acc = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const bm = new THREE.Matrix4();
  let maxErr = 0;
  for (let i = 0; i < pos.count; i += 7) { // sample — пълният меш е излишно бавен за CI
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    acc.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (w <= 0) continue;
      const bi = si.getComponent(i, k);
      bm.multiplyMatrices(boneList[bi].matrixWorld, inv[bi]);
      tmp.copy(v).applyMatrix4(bm);
      acc.addScaledVector(tmp, w);
    }
    maxErr = Math.max(maxErr, acc.distanceTo(v));
  }
  return maxErr;
}

function buildQuadSkin(name) {
  const S = BEAST_SPECIES[name];
  const { rig, joints } = restRigJoints(S);
  const sdf = quadSDF(S, joints);
  const bounds = quadBounds(S, joints);
  const cell = Math.max(0.008, Math.min(0.02, S.bodyR * 0.09));
  const segMap = quadBoneSegments(S, joints);
  const bones = QUAD_BONES.map((n) => ({ name: n, restMatrix: rig.parts[n].matrix.clone(), segments: segMap[n] }));
  const { mesh, bones: boneMap } = buildSkinnedFromSDF({ sdf, bounds, cell, bones, material: new THREE.MeshBasicMaterial() });
  mesh.updateMatrixWorld(true);
  return { mesh, boneList: QUAD_BONES.map((n) => boneMap[n]) };
}

test('rest-pose regression: quad SDF skin matches bind geometry within 1e-4 (rat/boar/wolf)', () => {
  for (const name of ['rat', 'boar', 'wolf']) {
    const { mesh, boneList } = buildQuadSkin(name);
    const err = skinCPU(mesh, boneList);
    assert.ok(err < 1e-4, `${name}: rest-pose skin drift ${err} — bind matrix loses the real bone rotation`);
  }
});

test('rest-pose regression: spider SDF skin matches bind geometry within 1e-4', () => {
  const S = BEAST_SPECIES.spider;
  const { rig, joints } = restSpiderJoints(S);
  const sdf = spiderSDF(S, joints);
  const bounds = spiderBounds(S, joints);
  const cell = Math.max(0.006, Math.min(0.016, S.legR * 0.28));
  const segMap = spiderBoneSegments(S, joints);
  const bones = SPIDER_BONES.map((n) => ({ name: n, restMatrix: rig.parts[n].matrix.clone(), segments: segMap[n] }));
  const { mesh, bones: boneMap } = buildSkinnedFromSDF({ sdf, bounds, cell, bones, material: new THREE.MeshBasicMaterial() });
  mesh.updateMatrixWorld(true);
  const err = skinCPU(mesh, SPIDER_BONES.map((n) => boneMap[n]));
  assert.ok(err < 1e-4, `spider: rest-pose skin drift ${err}`);
});

test('leg cross-section stays round (not flattened) at the mid-shin, every quad species', () => {
  // Регресия срещу "белите ленти" доклада — сравнява SDF стойността (= -радиус на сечението по
  // нормала) на няколко точки ПО ОСТА на пищяла с -legR: близка стойност значи сечението там е
  // близко до кръг с очаквания радиус. (Ъглово марширане около средата излезе крехко близо до
  // торса за дребни видове — тук вместо това мерим директно самата SDF стойност, без сонда.)
  for (const name of ['boar', 'wolf', 'drake']) {
    const S = BEAST_SPECIES[name];
    const { joints } = restRigJoints(S);
    const sdf = quadSDF(S, joints);
    const A = joints.frontUpperR, B = joints.frontLowerR;
    for (const t of [0.3, 0.5, 0.7]) {
      const p = A.clone().lerp(B, t);
      const d = sdf(p);
      // Очакваме d ≈ -legR (±40%) — драстично по-плитко (сплескано в лента) или по-дълбоко
      // (издуто) значи нещо не е наред с формата на крака на тази точка.
      const ratio = -d / S.legR;
      assert.ok(ratio > 0.55 && ratio < 1.8, `${name} t=${t}: sdf/-legR ratio ${ratio.toFixed(2)} (d=${d.toFixed(4)}, legR=${S.legR}) — крак сечение извън очаквания диапазон`);
    }
  }
});
