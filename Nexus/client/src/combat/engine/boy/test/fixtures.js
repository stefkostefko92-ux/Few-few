// Builds both knights without a GPU or textures, for tests that simulate the fight.
import * as THREE from 'three';
import { buildKnight } from '../src/armor.js';
import { longsword, armingSword, heaterShield } from '../src/weapons.js';
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

export function buildFighters() {
  const M = dummyMaterials();
  const A = new Fighter('A', buildKnight(M, 'A'), longsword(M), new Cape(M.capeA), null);
  const B = new Fighter('B', buildKnight(M, 'B'), armingSword(M), new Cape(M.capeB), heaterShield(M));
  return { A, B, M };
}
