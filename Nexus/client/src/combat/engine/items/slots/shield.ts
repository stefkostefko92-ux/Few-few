// Щит — СЪЩИЯТ heaterShield builder, който Ser Aldric носи в боя (weapons.js). Хералдиката
// (боядисаното лице) идва от heraldry.js/shieldTextures() — фиксирана тауър-емблема, споделена
// с боя; лицето само се тонира по темата на предмета (rim/дърво/кожа остават естествени), иначе
// 27-те щита в каталога биха изглеждали идентични в contact sheet-а — виж бележката в
// buildItem.ts за компромиса.
import * as THREE from 'three/webgpu';
import { heaterShield } from '../../boy/src/weapons.js';
import { merge } from '../../boy/src/geo.js';
import type { BoyMaterials } from '../boy-materials';

export interface BuiltShield {
  object: THREE.Object3D;
  /** Клонираният shieldFace материал (тонира хералдиката) — трябва да се disposeне отделно от
   *  тонираните plate/trim материали (tintForItem вече покрива steelA/steelB/goldB/brass). */
  dispose(): void;
}

export function buildShield(M: BoyMaterials, tint: string): BuiltShield {
  const shieldFace = (M.shieldFace as THREE.MeshPhysicalNodeMaterial).clone();
  shieldFace.color = new THREE.Color(tint);
  const tintedM = { ...M, shieldFace };
  const { pieces } = heaterShield(tintedM) as unknown as { pieces: [THREE.BufferGeometry, THREE.Material][] };
  const g = new THREE.Group();
  const bb = new THREE.Box3();
  for (const [geo] of pieces) { geo.computeBoundingBox(); if (geo.boundingBox) bb.union(geo.boundingBox); }
  const c = bb.getCenter(new THREE.Vector3());
  const sz = bb.getSize(new THREE.Vector3());
  const faceZ = bb.max.z;
  const R = Math.min(sz.x, sz.y) * 0.13;
  const trim = M.goldB as THREE.Material;
  const ornaments: THREE.BufferGeometry[] = [
    new THREE.SphereGeometry(R, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1, 0.6).rotateX(Math.PI / 2).translate(c.x, c.y - sz.y * 0.1, faceZ),
    new THREE.TorusGeometry(R * 1.3, R * 0.14, 8, 48).translate(c.x, c.y - sz.y * 0.1, faceZ),
  ];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    ornaments.push(new THREE.SphereGeometry(R * 0.13, 10, 8).translate(c.x + Math.cos(a) * R * 1.75, c.y - sz.y * 0.1 + Math.sin(a) * R * 1.75, faceZ + R * 0.04));
  }
  const orn = new THREE.Mesh(merge(ornaments), trim);
  orn.castShadow = true;
  g.add(orn);
  for (const [geo, mat] of pieces) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return { object: g, dispose: () => shieldFace.dispose() };
}
