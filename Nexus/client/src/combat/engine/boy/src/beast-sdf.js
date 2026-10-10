// 4b кръг 3 (Nexus порт, НЕ част от оригиналния boy) — SDF описание на четириног звяр в РЕСТ
// позата на СЪЩИЯ BeastRig (beast-rig.js), точките идват директно от rig.parts/rig.w след един
// прогон в стойка-покой — така тялото и скелетът СЪВПАДАТ по конструкция (виж координаторския
// spike/wolf.js — доказан подход, тук обобщен по S вместо ръчно набити числа, за да получат
// плъх/глиган/вълк всеки свой силует от СЪЩИТЕ formuли, вместо per-species копиране).
import * as THREE from 'three';
import { v3, ellipsoid, cone, chain, blend } from './sdf-mesh.js';
import { BeastRig } from './beast-rig.js';

function pos(part) { return new THREE.Vector3().setFromMatrixPosition(part.matrix); }

// Прогонва временен BeastRig в естествена стойка (краката под раменете/таза, на земята) — връща
// РЕАЛНИЯ риг (за bind матриците на костите) + именуваните точки, четени от sdf-species.js.
export function restRigJoints(S) {
  const rig = new BeastRig(S);
  const zero = () => new THREE.Vector3();
  const baseP = {
    root: zero(), yaw: 0, hipY: S.hipY, spineBend: 0, breath: 0,
    headTarget: new THREE.Vector3(0, S.hipY + S.neckLen * 0.4, S.bodyLen),
    lunge: 0, biteOpen: 0, flinch: 0, tailWag: 0, earAlert: 1,
    feet: [0, 1, 2, 3].map(() => ({ pos: zero(), yaw: 0, pitch: 0 })),
    wingFlap: S.wings ? 0.3 : 0,
  };
  rig.update(baseP); // 1-ви прогон: само за да изчислим рамо/таз котвите (краката още не важни).
  const anchors = [rig.w.shoulderR, rig.w.shoulderL, rig.w.hipR, rig.w.hipL];
  const feet = anchors.map((a) => ({ pos: new THREE.Vector3(a.x, 0, a.z), yaw: 0, pitch: 0 }));
  rig.update({ ...baseP, feet }); // 2-ри прогон: краката вече слизат естествено до земята.
  const j = {
    pelvis: pos(rig.parts.pelvis), spine: pos(rig.parts.spine), head: pos(rig.parts.head),
    snoutTip: rig.w.snoutTip.clone(),
    earL: pos(rig.parts.earL), earR: pos(rig.parts.earR),
    tailA: pos(rig.parts.tailA), tailB: pos(rig.parts.tailB), tailC: pos(rig.parts.tailC),
    frontUpperR: pos(rig.parts.frontUpperR), frontLowerR: pos(rig.parts.frontLowerR), frontPawR: pos(rig.parts.frontPawR),
    frontUpperL: pos(rig.parts.frontUpperL), frontLowerL: pos(rig.parts.frontLowerL), frontPawL: pos(rig.parts.frontPawL),
    rearUpperR: pos(rig.parts.rearUpperR), rearLowerR: pos(rig.parts.rearLowerR), rearPawR: pos(rig.parts.rearPawR),
    rearUpperL: pos(rig.parts.rearUpperL), rearLowerL: pos(rig.parts.rearLowerL), rearPawL: pos(rig.parts.rearPawL),
  };
  return { rig, joints: j };
}

// Опашка на веригата — точка отвъд tailC, продължена по посоката B→C със същата стъпка (иначе
// последният сегмент няма дистален край и опашката "отрязва" рязко).
function tailTip(j) {
  return j.tailC.clone().addScaledVector(j.tailC.clone().sub(j.tailB), 1);
}

/** Едно SDF описание на цялото тяло (торс+глава+уши+опашка+4 крака) в rest позата — polygonize
 * ВЕДНЪЖ при зареждане (beast-geo.js), НЕ всеки кадър. k стойностите са в метри, скалирани грубо
 * по bodyR/headR, за да остане слятото по-меко при по-едро тяло (глиган/вълк), по-плътно при
 * дребно (плъх) — иначе малкият звяр се "издува" в meki гърбица от same-k стойност. */
export function quadSDF(S, j) {
  const bodyR = S.bodyR;
  const kBody = Math.max(0.02, bodyR * 0.7);
  const kSmall = Math.max(0.012, S.headR * 0.35);
  const chest = ellipsoid(j.spine, v3(bodyR * 1.0, bodyR * 0.85, S.bodyLen * 0.4));
  const pelvisE = ellipsoid(j.pelvis, v3(bodyR * 0.95, bodyR * 0.82, S.bodyLen * 0.32));
  const belly = ellipsoid(
    j.pelvis.clone().add(j.spine).multiplyScalar(0.5).setY(j.pelvis.y - bodyR * 0.15),
    v3(bodyR * 0.88, bodyR * 0.55, S.bodyLen * 0.5),
  );
  // Холка (spec: "масивна холка" за глиган) — само за туширани видове (S.tusks), не разчита на
  // ново поле в beast-config.js. Ellipsoid над предната половина на гръдния кош, малко напред.
  const withers = S.tusks
    ? ellipsoid(j.spine.clone().addScaledVector(j.head.clone().sub(j.spine).normalize(), bodyR * 0.35).setY(j.spine.y + bodyR * 0.35), v3(bodyR * 0.62, bodyR * 0.5, bodyR * 0.7))
    : null;
  const neck = cone(j.spine, j.head, bodyR * 0.6, S.headR * 0.7);
  const headE = ellipsoid(j.head, v3(S.headR * 0.9, S.headR * 0.8, S.headR * 1.0));
  const snout = cone(j.head, j.snoutTip, S.headR * 0.55, S.snoutR * 0.9);
  const snoutTip = ellipsoid(j.snoutTip, v3(S.snoutR, S.snoutR * 0.85, S.snoutR));
  const ear = (p) => cone(p, v3(p.x, p.y + S.earR * 1.5, p.z), S.earR * 0.6, S.earR * 0.04);
  const tail = chain([j.pelvis, j.tailA, j.tailB, j.tailC, tailTip(j)], [S.tailR * 1.3, S.tailR, S.tailR * 0.72, S.tailR * 0.42, S.tailR * 0.12]);
  const leg = (a, b, c, r0, r1, r2) => chain([a, b, c], [r0, r1, r2]);
  // Краката бяха пръчки спрямо тялото (легло ~0.35 от bodyR) — по-плътни бедра/рамене.
  const legR = S.legR * 1.35;
  const legs = [
    leg(j.frontUpperR, j.frontLowerR, j.frontPawR, legR * 1.05, legR * 0.7, legR * 0.85),
    leg(j.frontUpperL, j.frontLowerL, j.frontPawL, legR * 1.05, legR * 0.7, legR * 0.85),
    leg(j.rearUpperR, j.rearLowerR, j.rearPawR, legR * 1.15, legR * 0.72, legR * 0.9),
    leg(j.rearUpperL, j.rearLowerL, j.rearPawL, legR * 1.15, legR * 0.72, legR * 0.9),
  ];
  return blend([
    { f: chest, k: kBody },
    { f: pelvisE, k: kBody },
    { f: belly, k: kBody * 0.8 },
    ...(withers ? [{ f: withers, k: kBody * 0.7 }] : []),
    { f: neck, k: kBody * 0.6 },
    { f: headE, k: kSmall },
    { f: snout, k: kSmall * 0.7 },
    { f: snoutTip, k: kSmall * 0.5 },
    { f: ear(j.earL), k: kSmall * 0.4 },
    { f: ear(j.earR), k: kSmall * 0.4 },
    { f: tail, k: kSmall * 0.6 },
    ...legs.map((f) => ({ f, k: kSmall * 0.8 })),
  ]);
}

/** Габаритна кутия около всички стави (с margin за най-широкия радиус) — polygonize域. */
export function quadBounds(S, j) {
  const pts = Object.values(j);
  const margin = Math.max(S.bodyR, S.headR, S.tailR, S.legR) * 1.6 + 0.03;
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of pts) { min.min(p); max.max(p); }
  min.subScalar(margin);
  max.addScalar(margin);
  min.y = Math.max(min.y, -0.02);
  return { min, max };
}

/** Скининг сегменти по кост, в СЪЩОТО (rest/world) пространство като SDF-а — виж sdf-skin.js. */
export function quadBoneSegments(S, j) {
  const bodyR = S.bodyR, legR = S.legR;
  return {
    pelvis: [[j.pelvis, j.spine, bodyR * 0.85]],
    spine: [[j.spine, j.head, bodyR * 0.85]],
    head: [[j.head, j.snoutTip, S.headR * 0.75]],
    earL: [[j.earL, j.earL, S.earR * 0.5]],
    earR: [[j.earR, j.earR, S.earR * 0.5]],
    tailA: [[j.pelvis, j.tailA, S.tailR]],
    tailB: [[j.tailA, j.tailB, S.tailR * 0.7]],
    tailC: [[j.tailB, j.tailC, S.tailR * 0.45]],
    frontUpperR: [[j.frontUpperR, j.frontLowerR, legR]],
    frontLowerR: [[j.frontLowerR, j.frontPawR, legR * 0.75]],
    frontPawR: [[j.frontPawR, j.frontPawR, legR * 0.85]],
    frontUpperL: [[j.frontUpperL, j.frontLowerL, legR]],
    frontLowerL: [[j.frontLowerL, j.frontPawL, legR * 0.75]],
    frontPawL: [[j.frontPawL, j.frontPawL, legR * 0.85]],
    rearUpperR: [[j.rearUpperR, j.rearLowerR, legR]],
    rearLowerR: [[j.rearLowerR, j.rearPawR, legR * 0.75]],
    rearPawR: [[j.rearPawR, j.rearPawR, legR * 0.85]],
    rearUpperL: [[j.rearUpperL, j.rearLowerL, legR]],
    rearLowerL: [[j.rearLowerL, j.rearPawL, legR * 0.75]],
    rearPawL: [[j.rearPawL, j.rearPawL, legR * 0.85]],
  };
}
