// Scene helpers for the 3D view: model extents and the purchased items around the boards.
import * as THREE from 'three';
import { boardTopDecor } from '../engine/materials.js';
import { S, legMesh, railMesh, slatsMesh, mattressMesh, worktopMesh } from './viewer-hw.js';
import { handleMesh } from './viewer-handles.js';

// What a handle needs to know about its front: thickness, and for an edge handle the distance (handle-local, across
// the handle) to the edge it hooks over — the top edge of a drawer front, the opening edge of a door.
function frontOf(part, s) {
  const out = { T: part.T * S, edge: 0.03 };
  if (s.model.type !== 'edge') return out;
  if (s.horizontal) out.edge = (part.box.max[1] - s.y) * S;
  else {
    const x = part.hingeSide === 'left' ? part.box.max[0] : part.box.min[0];
    out.edge = -(x - s.x) * S;
  }
  return out;
}

export function extents(model) {
  const e = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: 0, z0: Infinity, z1: -Infinity };
  for (const p of model.parts) {
    e.x0 = Math.min(e.x0, p.box.min[0]);
    e.y0 = Math.min(e.y0, Math.max(0, p.box.min[1]));
    e.x1 = Math.max(e.x1, p.box.max[0]);
    e.y1 = Math.max(e.y1, p.box.max[1]);
    e.z0 = Math.min(e.z0, p.box.min[2]);
    e.z1 = Math.max(e.z1, p.box.max[2]);
  }
  for (const s of model.symbols) if (s.type === 'worktop') e.y1 = Math.max(e.y1, s.y + s.t);
  if (!Number.isFinite(e.y0)) e.y0 = 0;
  return e;
}

export function addSymbols(v, model, meshOf) {
  const statics = new THREE.Group();
  // a symbol's footprint (mm) moved like the boards, centred on the furniture
  const centred = (s) => ({
    ...s,
    x0: s.x0 + v.off[0],
    x1: s.x1 + v.off[0],
    z0: s.z0 + v.off[2],
    z1: s.z1 + v.off[2],
  });
  for (const s of model.symbols) {
    if (s.type === 'handle') {
      const mesh = meshOf.get(s.partId);
      if (!mesh) continue;
      const g = handleMesh(v.mats, s, frontOf(mesh.userData.part, s));
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
        ...centred(s),
        split: s.split === null ? null : s.split + v.off[0],
      });
      statics.add(g);
    } else if (s.type === 'mattress') {
      statics.add(mattressMesh(v.mats, centred(s)));
    } else if (s.type === 'worktop') {
      const mat = v.mats.board(boardTopDecor(model.spec));
      statics.add(worktopMesh(v.mats, centred(s), mat));
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
