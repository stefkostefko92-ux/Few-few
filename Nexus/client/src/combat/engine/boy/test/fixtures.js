// Builds both knights without a GPU or textures, for tests that simulate the fight.
import * as THREE from 'three';
import { buildKnight } from '../src/armor.js';
import { longsword, armingSword, heaterShield } from '../src/weapons.js';
import { shortSword, staff, bow, mace } from '../src/weapons-ranged.js';
import { hasShieldKit } from '../src/loadout.js';
import { Cape } from '../src/cloth.js';
import { Fighter } from '../src/fighter.js';

// Any material works for geometry and rigging; one stand-in per name keeps batches apart.
export function dummyMaterials() {
  const cache = {};
  return new Proxy(cache, {
    get(target, key) {
      if (!target[key]) target[key] = new THREE.MeshBasicMaterial({ name: String(key) });
      return target[key];
    },
  });
}

// 4a.4 (кръг 2): kitA/kitB избират оръжието (weapons.js за 'sword' — оригиналния вид, иначе
// weapons-ranged.js) — same builder as world.js, за да тества ТОЧНО каквото се рендерира.
function buildWeapon(kit, slot, M) {
  if (kit === 'shortsword') return shortSword(M);
  if (kit === 'staff') return staff(M);
  if (kit === 'bow') return bow(M);
  if (kit === 'heavy') return mace(M);
  return slot === 'A' ? longsword(M) : armingSword(M);
}

export function buildFighters({ kitA = 'sword', kitB = 'sword' } = {}) {
  const M = dummyMaterials();
  const shield = hasShieldKit(kitB) ? heaterShield(M) : null;
  const A = new Fighter('A', buildKnight(M, 'A'), buildWeapon(kitA, 'A', M), new Cape(M.capeA), null);
  const B = new Fighter('B', buildKnight(M, 'B'), buildWeapon(kitB, 'B', M), new Cape(M.capeB), shield);
  return { A, B, M };
}
