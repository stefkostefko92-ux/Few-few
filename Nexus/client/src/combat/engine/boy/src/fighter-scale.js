// 4b (Nexus порт, НЕ част от оригиналния boy) — изнесено от fighter.js за лимита от 300 реда
// (закон #1). Единна мащабираща обвивка за едрите хуманоиди (golem/titan/troll): всеки part
// matrix от Rig.update()/placeWeapon()/placeShield() е {rotation, translation, ONE scale} (виж
// rig.js) — премултипликация с translate(root)·scale(s)·translate(-root) уголемява цялото тяло
// НА МЯСТО (краката остават на своите IK-решени земни точки), без да пипа rig.js/feet.js/
// timeline.js/DIM — всеки Fighter продължава да споделя същата анатомия.
import * as THREE from 'three';

const tm = new THREE.Matrix4();
const rm = new THREE.Matrix4();
const sm = new THREE.Matrix4();
const pos = new THREE.Vector3();

/** fighter: обект с .knight.parts/.weapon.part/.shield?.part/.grip/._scaleMat (виж fighter.js). */
export function applyGiantScale(fighter, root) {
  const s = fighter.scale;
  const m = fighter._scaleMat.makeTranslation(root.pos.x, 0, root.pos.z)
    .multiply(tm.makeScale(s, s, s))
    .multiply(rm.makeTranslation(-root.pos.x, 0, -root.pos.z));
  for (const name of Object.keys(fighter.knight.parts)) fighter.knight.parts[name].matrix.premultiply(m);
  fighter.weapon.part.matrix.premultiply(m);
  if (fighter.shield) fighter.shield.part.matrix.premultiply(m);
  fighter.grip.sub(root.pos).multiplyScalar(s).add(root.pos);
  return s;
}

// 4b кръг 2: голем/титан искат "огромни рамене/ръце, малка глава, къси крака"; трол — "дълги
// ръце до коленете" — само общ мащаб (applyGiantScale) прави пропорционално голям рицар, не
// различно СЪЩЕСТВО. Прилага се СЛЕД uniform мащаба, локално около текущата позиция на всяка
// става (не мести ставата — само наедрява/смалява самата геометрия там), затова остава евтино
// и не пипа IK/DIM (закон: споделена анатомия за всеки Fighter).
export const GIANT_BUILD = {
  upperArmR: 1.4, upperArmL: 1.4, foreArmR: 1.32, foreArmL: 1.32, handR: 1.3, handL: 1.3,
  head: 0.76, thighL: 0.82, thighR: 0.82, shinL: 0.78, shinR: 0.78, footL: 0.92, footR: 0.92,
};
export const TROLL_BUILD = {
  upperArmR: 1.25, upperArmL: 1.25, foreArmR: 1.55, foreArmL: 1.55, handR: 1.4, handL: 1.4,
  head: 0.86, thighL: 0.95, thighR: 0.95,
};
export function partBuildFor(sprite) {
  if (sprite === 'golem' || sprite === 'titan') return GIANT_BUILD;
  if (sprite === 'troll') return TROLL_BUILD;
  return null;
}

export function applyPartScale(fighter, partScale) {
  if (!partScale) return;
  for (const [name, mul] of Object.entries(partScale)) {
    const part = fighter.knight.parts[name];
    if (!part) continue;
    pos.setFromMatrixPosition(part.matrix);
    const m = tm.makeTranslation(pos.x, pos.y, pos.z)
      .multiply(rm.makeScale(mul, mul, mul))
      .multiply(sm.makeTranslation(-pos.x, -pos.y, -pos.z));
    part.matrix.premultiply(m);
  }
}
