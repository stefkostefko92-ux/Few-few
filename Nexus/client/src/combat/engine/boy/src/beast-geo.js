// 4b кръг 3 (Nexus порт, НЕ част от оригиналния boy) — четириног звяр: тялото (таз+гръбнак+
// глава+муцуна+уши+опашка+4 крака) вече е ЕДНА гладка SDF-изваяна повърхност (sdf-mesh.js
// polygonize + sdf-skin.js скининг към рига), не низ от капсули и не сплайн-профил (кръг 2,
// отхвърлен: "тялото не е органично"). Само зъбите/бивните/очите остават остри твърди парчета
// (RigidBatcher piece), закачени за таз/глава костите — SDF-ът не ги моделира (spec го позволява).
import * as THREE from 'three';
import { xf, merge } from './geo.js';
import { BeastRig } from './beast-rig.js';
import { createBeastMaterials } from './beast-materials.js';
import { restRigJoints, quadSDF, quadBounds, quadBoneSegments } from './beast-sdf.js';
import { buildSkinnedFromSDF, addBellyAttribute } from './sdf-skin.js';

// БЕЛИТЕ_ИМЕНА реда решава skinIndex подредбата (sdf-skin.js bones[]) — beast-fighter.js
// syncSkin() го изминава всеки кадър, копирайки rig.parts[name].matrix направо в bone.matrix.
export const QUAD_BONES = [
  'pelvis', 'spine', 'head', 'earL', 'earR', 'tailA', 'tailB', 'tailC',
  'frontUpperR', 'frontLowerR', 'frontPawR', 'frontUpperL', 'frontLowerL', 'frontPawL',
  'rearUpperR', 'rearLowerR', 'rearPawR', 'rearUpperL', 'rearLowerL', 'rearPawL',
];

// Строи SDF-скинираното тяло ВЕДНЪЖ при зареждане на вида (polygonize + тегла — не евтино, но
// еднократно, виж beast-sdf.js). rig връщаният тук е ХВЪРЛЕН (само за rest-точките) — реалният
// риг, който bones четат всеки кадър, е новият в buildBeast() долу (СЪЩИТЕ part-имена).
function buildOrganicBody(S, material) {
  const { rig, joints } = restRigJoints(S);
  const sdf = quadSDF(S, joints);
  const bounds = quadBounds(S, joints);
  const cell = Math.max(0.008, Math.min(0.02, S.bodyR * 0.09));
  const segMap = quadBoneSegments(S, joints);
  // 4b QA-fix (кръг 4): bind матрицата ТРЯБВА да е ЦЯЛАТА rig.parts[name].matrix (позиция+
  // завъртане) от СЪЩИЯ REST прогон, не само позиция — краче/опашка костите НЕ сочат по +Y
  // (setSegment ги завърта по посока на крайника). Chиста транслация тук значеше, че на runtime
  // текущото завъртане на костта се прилага ОТГОРЕ ВЪРХУ identity rest завъртане, вместо като
  // delta от реалната rest ориентация — краката/опашката се "усукваха" в сплескана лента,
  // докладвано при преглед. Потвърдено CPU rest-pose тест (0 грешка само с ПРАВИЛНАТА матрица).
  const bones = QUAD_BONES.map((name) => ({
    name,
    restMatrix: rig.parts[name].matrix.clone(),
    segments: segMap[name],
  }));
  const { mesh, bones: boneMap } = buildSkinnedFromSDF({ sdf, bounds, cell, bones, material });
  // 4b QA-fix (кръг 4): spread беше S.bodyR*1.5 — за дълъг крак (wolf legLen 0.38 >> bodyR*1.5)
  // коремският тон стигаше ЧАК до лапата, "боядисвайки" целия долен крак в светло — докладвано
  // при преглед като "получават цвета на корема". По-тесен spread концентрира прехода под торса.
  const torso = new Set(['pelvis', 'spine', 'head'].map((b) => QUAD_BONES.indexOf(b)));
  addBellyAttribute(mesh.geometry, joints.spine.y, S.bodyR * 0.85, torso);
  mesh.frustumCulled = false;
  return { mesh, bones: boneMap };
}

// THREE.BatchedMesh (batcher.js) изисква всяка геометрия в една материя-партида да е еднакво
// индексирана — armor.js го гарантира през flatten()/merge() (geo.js merge() винаги връща
// неиндексирано). Твърдите парчета тук (зъби/бивни/очи) минават през същата врата.
const single = (g) => merge([g]);

export function buildBeast(species) {
  const S = species;
  const M = createBeastMaterials(S);
  const rig = new BeastRig(S);
  const fur = M.fur;
  const torsoMat = fur.clone();
  torsoMat.side = THREE.DoubleSide; // предпазна мрежа срещу обратна навивка на triangle-ите.
  const skin = buildOrganicBody(S, torsoMat);

  // Очите/зъбите остават твърди — закачени за rig.parts.head (батчерът чете piece срещу
  // rig.parts[name].matrix всеки кадър, точно както преди).
  const head = [
    [single(xf(new THREE.SphereGeometry(S.headR * 0.09, 6, 6), [S.headR * 0.55, S.headR * 0.12, S.headR * 0.6])), M.eye],
    [single(xf(new THREE.SphereGeometry(S.headR * 0.09, 6, 6), [-S.headR * 0.55, S.headR * 0.12, S.headR * 0.6])), M.eye],
  ];
  if (S.tusks) {
    const tuskGeo = () => xf(new THREE.ConeGeometry(S.snoutR * 0.42, S.snoutR * 3.1, 6), [0, 0, 0], [Math.PI * 0.62, 0, 0]);
    head.push([single(xf(tuskGeo(), [S.headR * 0.42, -S.headR * 0.35, S.snoutLen * 0.85])), M.tusk]);
    head.push([single(xf(tuskGeo(), [-S.headR * 0.42, -S.headR * 0.35, S.snoutLen * 0.85])), M.tusk]);
  }
  const jaw = [[single(xf(new THREE.ConeGeometry(S.snoutR * 1.3, S.snoutLen * 0.75, 8), [0, -S.snoutR * 0.4, 0], [Math.PI / 2, 0, 0])), M.skin]];

  const pieces = { head, jaw };
  if (S.wings) {
    const wingMat = M.wing || fur;
    pieces.wingL = [[single(wingGeo(S.wingSpan || S.bodyLen * 0.9)), wingMat]];
    pieces.wingR = [[single(wingGeo(S.wingSpan || S.bodyLen * 0.9)), wingMat]];
  }
  return { rig, pieces, materials: M, skin };
}

// Дракон: ципесто крило — 4 "пръста" от рамото + провиснала (не права) ципа между тях (spec
// кръг 4: "3-4 пръстови кости... тънък SDF лист (или огънат триъгълен меш с кривина)") — вместо
// нови кости (риск за целия рег), тук е ЕДИН твърд piece с ОФОРМЕНА геометрия: 4 пръста + 3
// хлътнали "уеб" точки между тях (издърпани към корена и увиснали надолу), не права ветрилообразна
// линия — силует вече чете като ципа, не като плосък червен правоъгълник (докладвано при преглед).
function wingGeo(span) {
  const root = [0, 0, 0];
  const fingers = [
    [span * 0.36, span * 0.3, -span * 0.06],
    [span * 0.74, span * 0.2, span * 0.02],
    [span * 1.0, span * 0.02, span * 0.14],
    [span * 0.78, -span * 0.24, span * 0.3],
  ];
  const sag = (a, b, pull, drop) => [
    a[0] + (b[0] - a[0]) * 0.5 * (1 - pull),
    a[1] + (b[1] - a[1]) * 0.5 - drop,
    a[2] + (b[2] - a[2]) * 0.5 * (1 - pull),
  ];
  const webs = [
    sag(fingers[0], fingers[1], 0.3, span * 0.14),
    sag(fingers[1], fingers[2], 0.22, span * 0.18),
    sag(fingers[2], fingers[3], 0.28, span * 0.16),
  ];
  const pos = [root, fingers[0], webs[0], fingers[1], webs[1], fingers[2], webs[2], fingers[3]].flat();
  // ветрило: root-f0-w0, root-w0-f1, root-f1-w1, root-w1-f2, root-f2-w2, root-w2-f3
  const idx = [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 6, 0, 6, 7];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
