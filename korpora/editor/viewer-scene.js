// Scene helpers for the 3D view: model extents, the walls of a Г or П kitchen and the purchased items around the boards.
import * as THREE from 'three';
import { boardTopDecor } from '../engine/materials.js';
import { worldParts, worldBox, runOf } from '../engine/transform.js';
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

const UP = new THREE.Vector3(0, 1, 0);

// The model's extents in the room (mm): a Г or П kitchen with its walls turned into place.
export function extents(model) {
  const e = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: 0, z0: Infinity, z1: -Infinity };
  for (const p of worldParts(model)) {
    e.x0 = Math.min(e.x0, p.box.min[0]);
    e.y0 = Math.min(e.y0, Math.max(0, p.box.min[1]));
    e.x1 = Math.max(e.x1, p.box.max[0]);
    e.y1 = Math.max(e.y1, p.box.max[1]);
    e.z0 = Math.min(e.z0, p.box.min[2]);
    e.z1 = Math.max(e.z1, p.box.max[2]);
  }
  for (const s of model.symbols) {
    if (s.type !== 'worktop') continue;
    e.y1 = Math.max(e.y1, s.y + s.t);
    // the side walls' worktops reach the furthest into the room
    if (s.run !== undefined)
      e.z1 = Math.max(
        e.z1,
        worldBox({ min: [s.x0, s.y, s.z0], max: [s.x1, s.y, s.z1] }, runOf(model, s.run)).max[2],
      );
  }
  if (!Number.isFinite(e.y0)) e.y0 = 0;
  return e;
}

// The walls of a Г or П kitchen (engine/transform.js): a group per run, turned and moved into the room. Its children
// are placed with v.P like everything else (centred on the footprint), so the group takes the centring back before
// it turns and gives it again after.
export function runGroups(v, model) {
  const out = new Map();
  for (const r of model.runs ?? []) {
    const g = new THREE.Group();
    g.rotation.y = (r.turn * Math.PI) / 2;
    const off = new THREE.Vector3(v.off[0], 0, v.off[2]).applyAxisAngle(UP, g.rotation.y);
    g.position.set((r.dx + v.off[0] - off.x) * S, 0, (r.dz + v.off[2] - off.z) * S);
    v.root.add(g);
    out.set(r.id, g);
  }
  return out;
}

export function addSymbols(v, model, meshOf) {
  // the legs, rails and worktop of each wall move with it in the exploded view; a model without walls has one group
  const statics = new Map();
  const into = (run) => {
    if (!statics.has(run)) statics.set(run, new THREE.Group());
    return statics.get(run);
  };
  into(undefined);
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
      into(s.run).add(g);
    } else if (s.type === 'rail') {
      const g = railMesh(v.mats, s.x1 - s.x0);
      g.position.copy(v.P((s.x0 + s.x1) / 2, s.y, s.z));
      into(s.run).add(g);
    } else if (s.type === 'slats') {
      const g = slatsMesh(v.mats, {
        ...centred(s),
        split: s.split === null ? null : s.split + v.off[0],
      });
      into(s.run).add(g);
    } else if (s.type === 'mattress') {
      into(s.run).add(mattressMesh(v.mats, centred(s)));
    } else if (s.type === 'worktop') {
      const mat = v.mats.board(boardTopDecor(model.spec));
      into(s.run).add(worktopMesh(v.mats, centred(s), mat));
    }
  }
  for (const [run, holder] of statics) {
    v.parentOf(run).add(holder);
    v.items.push({ kind: 'static', holder, base: new THREE.Vector3(), explode: [0, -0.2, 0] });
  }
}
