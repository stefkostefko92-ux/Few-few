// Rigid parts (armour, weapons, shield) drawn as one BatchedMesh per material:
// both knights cost about a dozen draw calls instead of ~180.
import * as THREE from 'three';

export class RigidBatcher {
  constructor() {
    this.slots = new Map();
    this.links = [];
    this.meshes = [];
  }

  // part = { matrix: Matrix4 } updated by the rig; pieces = [[geometry, material], ...].
  add(part, pieces) {
    for (const [g, m] of pieces) {
      if (!this.slots.has(m)) this.slots.set(m, []);
      this.slots.get(m).push({ g, part });
    }
  }

  build() {
    for (const [mat, list] of this.slots) {
      const verts = list.reduce((s, e) => s + e.g.attributes.position.count, 0);
      const bm = new THREE.BatchedMesh(list.length, verts, 0, mat);
      bm.name = `batch:${mat.name}`;
      bm.castShadow = mat.name !== 'slit';
      bm.receiveShadow = true;
      bm.frustumCulled = false;
      for (const e of list) {
        const id = bm.addInstance(bm.addGeometry(e.g));
        this.links.push({ bm, id, part: e.part });
      }
      this.meshes.push(bm);
    }
    return this.meshes;
  }

  update() {
    for (const l of this.links) l.bm.setMatrixAt(l.id, l.part.matrix);
  }
}
