// Scene helpers for the 3D view: model extents, purchased items around the boards, sun and shadow bounds, room.
import * as THREE from 'three';
import {
  S,
  handleMesh,
  legMesh,
  railMesh,
  slatsMesh,
  mattressMesh,
  worktopMesh,
} from './viewer-hw.js';

export function extents(model) {
  const e = { x0: Infinity, x1: -Infinity, y1: 0, z0: Infinity, z1: -Infinity };
  for (const p of model.parts) {
    e.x0 = Math.min(e.x0, p.box.min[0]);
    e.x1 = Math.max(e.x1, p.box.max[0]);
    e.y1 = Math.max(e.y1, p.box.max[1]);
    e.z0 = Math.min(e.z0, p.box.min[2]);
    e.z1 = Math.max(e.z1, p.box.max[2]);
  }
  for (const s of model.symbols) if (s.type === 'worktop') e.y1 = Math.max(e.y1, s.y + s.t);
  return e;
}

export function addSymbols(v, model, meshOf) {
  const statics = new THREE.Group();
  for (const s of model.symbols) {
    if (s.type === 'handle') {
      const mesh = meshOf.get(s.partId);
      if (!mesh) continue;
      const g = handleMesh(v.mats, s);
      g.position.copy(v.P(s.x, s.y, s.z).sub(mesh.userData.centre));
      mesh.add(g);
    } else if (s.type === 'leg') {
      const g = legMesh(v.mats, s.h);
      g.position.copy(v.P(s.x, s.y0, s.z));
      statics.add(g);
    } else if (s.type === 'rail') {
      const g = railMesh(v.mats, s.x1 - s.x0);
      g.position.copy(v.P((s.x0 + s.x1) / 2, s.y, s.z));
      statics.add(g);
    } else if (s.type === 'slats') {
      const g = slatsMesh(v.mats, {
        ...s,
        x0: s.x0 + v.off[0],
        x1: s.x1 + v.off[0],
        split: s.split === null ? null : s.split + v.off[0],
        z0: s.z0 + v.off[2],
        z1: s.z1 + v.off[2],
      });
      statics.add(g);
    } else if (s.type === 'mattress') {
      statics.add(
        mattressMesh(v.mats, {
          ...s,
          x0: s.x0 + v.off[0],
          x1: s.x1 + v.off[0],
          z0: s.z0 + v.off[2],
          z1: s.z1 + v.off[2],
        }),
      );
    } else if (s.type === 'worktop') {
      const mat = v.mats.board(
        model.spec.frontMaterial === 'ral' ? model.spec.carcassDecor : model.spec.frontDecor,
      );
      statics.add(
        worktopMesh(
          v.mats,
          {
            ...s,
            x0: s.x0 + v.off[0],
            x1: s.x1 + v.off[0],
            z0: s.z0 + v.off[2],
            z1: s.z1 + v.off[2],
          },
          mat,
        ),
      );
    }
  }
  v.root.add(statics);
  v.items.push({
    kind: 'static',
    holder: statics,
    base: new THREE.Vector3(),
    explode: [0, -0.2, 0],
  });
}

export function lightFor(v, ext) {
  const W = ext.x1 - ext.x0;
  const D = ext.z1 - ext.z0;
  const r = Math.hypot(W, ext.y1, D) * S * 0.5;
  v.sun.position.set(r * 2.2, r * 3.2, r * 2.6);
  v.sun.target.position.set(0, (ext.y1 * S) / 2, 0);
  const cam = v.sun.shadow.camera;
  cam.left = cam.bottom = -r * 1.8;
  cam.right = cam.top = r * 1.8;
  cam.near = 0.1;
  cam.far = r * 10;
  cam.updateProjectionMatrix();
}

export function buildRoom(v, ext) {
  for (const c of [...v.roomGroup.children]) {
    c.geometry?.dispose();
    v.roomGroup.remove(c);
  }
  const W = Math.max(4.2, (ext.x1 - ext.x0) * S + 2.4);
  const back = (ext.z0 + v.off[2]) * S - 0.002;
  const wall = v.mats.plain('wall', { color: 0xe9e5dc, roughness: 0.92 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, 4.2), v.mats.floor());
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, back + 2.1);
  floor.receiveShadow = true;
  const bw = new THREE.Mesh(new THREE.PlaneGeometry(W, 2.7), wall);
  bw.position.set(0, 1.35, back);
  bw.receiveShadow = true;
  const sw = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.7), wall);
  sw.rotation.y = Math.PI / 2;
  sw.position.set(-W / 2, 1.35, back + 2.1);
  sw.receiveShadow = true;
  v.roomGroup.add(floor, bw, sw);
}
