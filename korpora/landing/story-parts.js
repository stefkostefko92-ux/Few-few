// The furniture's own pieces in the landing story: the boards that leave it for their places on the sheets — turned
// face A up, never mirrored — and the hardware (hinges, handles, legs, worktop, slides) that goes before they take off.
// Doors swing and parts move apart exactly as in the editor's viewer. Loaded only through story.js, which main.js
// imports only when prefers-reduced-motion allows motion.
import * as THREE from 'three';
import { S } from '../editor/viewer-hw.js';
import { partFlight, arc, flatRotation } from './timeline.js';
import { SLAB } from './story-scene.js';

const OPEN = THREE.MathUtils.degToRad(105); // the viewer's own door swing
const EXPLODE = 0.24; // m per unit of the engine's explode vector at full explosion, as in the viewer
const LIFT = 0.55; // m, peak of a part's flight
const UP = new THREE.Vector3(0, 1, 0);

// m: a row-major 3 × 3 rotation (timeline.js), the order Matrix3.set takes
const rotationOf = (m) =>
  new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().setFromMatrix3(new THREE.Matrix3().set(...m)),
  );

// layout: sheetLayout() of the nesting's sheets; place.point(x, y): a sheet point (mm) on the scene's floor (m)
export function storyParts(viewer, nesting, layout, place) {
  // where every part lands: its sheet, its place on it
  const where = new Map();
  nesting.sheets.forEach((sh, i) =>
    sh.placements.forEach((pl, k) => where.set(pl.partId, { i, k, pl })),
  );
  // a drawer moves as one box in the editor; here every one of its boards flies on its own
  for (const it of viewer.items.filter((x) => x.kind === 'drawer')) {
    for (const mesh of [...it.holder.children].filter((c) => c.userData.part)) {
      const holder = new THREE.Group();
      viewer.root.add(holder);
      holder.attach(mesh);
      const part = mesh.userData.part;
      viewer.items.push({
        kind: 'part',
        part,
        holder,
        base: new THREE.Vector3(),
        explode: part.explode,
      });
    }
  }
  const flying = [];
  const hardware = [];
  for (const it of viewer.items) {
    // legs and worktop, drawer slides, what is left of a drawer: hardware that goes before the parts fly
    if (!it.part || it.kind === 'static' || it.kind === 'drawer') {
      hardware.push(...it.holder.children);
      continue;
    }
    const mesh = it.holder.children[0];
    for (const child of mesh.children)
      if (!child.userData.board && !child.userData.ops) hardware.push(child);
    const at = where.get(it.part.id);
    if (!at) {
      hardware.push(mesh);
      continue;
    }
    const turn = rotationOf(flatRotation(it.part.frame, at.pl.rot));
    const o = layout.origins[at.i];
    const c = place.point(o.x + at.pl.x + at.pl.w / 2, o.y + at.pl.y + at.pl.h / 2);
    const centre = new THREE.Vector3(c[0], SLAB + (it.part.T * S) / 2 + 0.0004, c[2]);
    flying.push({
      it,
      q: turn,
      target: centre.sub(mesh.position.clone().applyQuaternion(turn)),
      i: at.i,
      k: at.k,
    });
  }
  // they take off in the order they lie on the sheets
  flying.sort((a, b) => a.i - b.i || a.k - b.k);
  const flown = new Set(flying.map((f) => f.it));
  for (const h of hardware) h.userData.scale0 = h.scale.clone();

  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  // a piece in the furniture at st: doors swung open, everything moved apart along its explode vector
  const pose = (it, st) => {
    const d = EXPLODE * st.explode;
    const v = it.explode ?? [0, 0, 0];
    p.set(
      it.base.x + v[0] * d,
      it.base.y + v[1] * d + (it.kind === 'static' ? 0 : d),
      it.base.z + v[2] * d,
    );
    q.identity();
    if (it.kind === 'door')
      q.setFromAxisAngle(UP, (it.part.hingeSide === 'left' ? -1 : 1) * OPEN * st.open);
  };

  return {
    // st: storyState(t) of timeline.js
    apply(st) {
      for (const it of viewer.items) {
        if (flown.has(it)) continue;
        pose(it, st);
        it.holder.position.copy(p);
        it.holder.quaternion.copy(q);
      }
      flying.forEach((f, i) => {
        pose(f.it, st);
        const k = partFlight(st.fly, i, flying.length);
        f.it.holder.position.copy(p).lerp(f.target, k);
        f.it.holder.position.y += arc(k) * LIFT;
        f.it.holder.quaternion.copy(q).slerp(f.q, k);
      });
      for (const h of hardware) {
        h.visible = st.hardware > 0.002;
        h.scale.copy(h.userData.scale0).multiplyScalar(Math.max(0.002, st.hardware));
      }
    },
  };
}
