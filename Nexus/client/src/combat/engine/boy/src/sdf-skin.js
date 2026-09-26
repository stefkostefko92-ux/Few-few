// 4b кръг 3 (Nexus порт, НЕ част от оригиналния boy) — скинира изхода на sdf-mesh.js polygonize()
// към частите на риг-а: 2–4 тегла по разстояние връх→сегмент(и) на костта, изгладени. Костите
// НЯМАТ родителска йерархия (matrixAutoUpdate=false, matrixWorld се пише директно всеки кадър от
// rig.parts[name].matrix — виж beast-fighter.js syncSkin) — същия принцип, вече доказан в кръг 2
// за 3-костния сплайн торс (beast-geo.js buildSkin), тук обобщен за произволен брой кости.
import * as THREE from 'three';
import { polygonize } from './sdf-mesh.js';

const ONE = new THREE.Vector3(1, 1, 1);
const _pt = new THREE.Vector3();
const _ab = new THREE.Vector3();

// Минимално разстояние от p до сегмента AB (капсула с радиус r — d е "оголеното" разстояние,
// може да е отрицателно вътре в костта, clamp-нато долу при тегленето).
function segDist(p, a, b, r) {
  _ab.subVectors(b, a);
  const l2 = _ab.lengthSq();
  const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, _pt.subVectors(p, a).dot(_ab) / l2));
  _pt.copy(a).addScaledVector(_ab, t);
  return _pt.distanceTo(p) - (r || 0);
}

/**
 * bones: [{ name, restMatrix: THREE.Matrix4 (СВЕТОВНА, в rest позата), segments: [[a,b,r], ...] }]
 *   segments са в СЪЩОТО пространство, в което е построен sdf-ът (world/rest, не bone-local) —
 *   тегленето по разстояние иска реални точки, bind-a после ги превежда в bone-local за GPU-то.
 * Връща SkinnedMesh + карта {name: THREE.Bone} за директен запис на матрици всеки кадър.
 */
export function buildSkinnedFromSDF({ sdf, bounds, cell, bones, material }) {
  const geo = polygonize(sdf, bounds.min, bounds.max, cell);
  const pos = geo.attributes.position.array;
  const n = pos.length / 3;
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const p = new THREE.Vector3();
  const scored = new Array(bones.length);
  for (let i = 0; i < n; i++) {
    p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    for (let bi = 0; bi < bones.length; bi++) {
      let d = Infinity;
      for (const [a, b, r] of bones[bi].segments) d = Math.min(d, segDist(p, a, b, r));
      scored[bi] = { bi, d: Math.max(d, 0.004) };
    }
    scored.sort((a, b) => a.d - b.d);
    let sum = 0;
    const w = [0, 0, 0, 0];
    for (let k = 0; k < 4 && k < scored.length; k++) { w[k] = 1 / (scored[k].d * scored[k].d); sum += w[k]; }
    for (let k = 0; k < 4; k++) {
      skinIndex[i * 4 + k] = k < scored.length ? scored[k].bi : 0;
      skinWeight[i * 4 + k] = k < scored.length && sum > 0 ? w[k] / sum : 0;
    }
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));

  const boneObjs = bones.map((b) => {
    const bone = new THREE.Bone();
    bone.name = b.name;
    bone.matrixAutoUpdate = false;
    bone.matrix.copy(b.restMatrix);
    bone.matrixWorld.copy(b.restMatrix);
    return bone;
  });
  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.add(...boneObjs);
  mesh.bind(new THREE.Skeleton(boneObjs));
  mesh.skeleton.calculateInverses();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const boneMap = {};
  bones.forEach((b, i) => { boneMap[b.name] = boneObjs[i]; });
  return { mesh, bones: boneMap };
}

// Корем по-светъл от гърба (spec кръг 3: "vertex color от позицията... корем=отдолу, гръб=
// отгоре") — плосък скалар 0(гръб)..1(корем) по светова Y спрямо REST референтна височина, четен
// от TSL атрибут в beast-materials.js createBeastMaterials. Споделено между всички SDF видове
// (квадрупед/паяк/змия) — материалът очаква този атрибут да съществува на всяка козина/люспа геометрия.
// torsoBones (по избор): индекси на костите на торса — коремен тон получават САМО върхове с
// доминираща торсова кост. Иначе всичко под нивото на гърба (краката!) ставаше „корем“ и тънките
// крака излизаха като бели ленти.
export function addBellyAttribute(geo, refY, spread, torsoBones) {
  const pos = geo.attributes.position.array;
  const si = geo.attributes.skinIndex?.array;
  const sw = geo.attributes.skinWeight?.array;
  const n = pos.length / 3;
  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = (refY - pos[i * 3 + 1]) / spread;
    let v = Math.min(1, Math.max(0, t));
    if (torsoBones && si && sw) {
      let torsoW = 0;
      for (let k = 0; k < 4; k++) if (torsoBones.has(si[i * 4 + k])) torsoW += sw[i * 4 + k];
      v *= torsoW;
    }
    arr[i] = v;
  }
  geo.setAttribute('aBelly', new THREE.Float32BufferAttribute(arr, 1));
}

export { v3, ellipsoid, cone, chain, smin, blend } from './sdf-mesh.js';
export const IDENTITY_SCALE = ONE;
