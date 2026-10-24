// Drawer slides, seen when a drawer is pulled out. Side-mounted ball-bearing slides fill the clearance between the box
// and the carcass side with three telescopic members (fixed on the carcass, middle at half the travel, inner on the
// box); concealed slides run under the bottom near each side. The side slide's clearance and height come from the slide
// system of the catalogue, as in the engine; the profiles themselves are a visual approximation.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { slideModel, slideSystemOf } from '../engine/hardware.js';
import { S } from './viewer-hw.js';

function rail(w, h, len, material) {
  const m = new THREE.Mesh(
    new RoundedBoxGeometry(w * S, h * S, len * S, 2, Math.min(w, h) * S * 0.3),
    material,
  );
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// The carcass side (or partition) whose inner face is at x (mm), to carry the fixed member through the explode.
function carcassAt(model, meshOf, x, y) {
  const p = model.parts.find(
    (q) =>
      (q.role === 'side' || q.role === 'partition') &&
      (Math.abs(q.box.max[0] - x) < 1 || Math.abs(q.box.min[0] - x) < 1) &&
      y >= q.box.min[1] &&
      y <= q.box.max[1],
  );
  return p ? meshOf.get(p.id) : null;
}

function place(viewer, parent, mesh, at) {
  const p = viewer.P(...at);
  mesh.position.copy(parent?.userData.centre ? p.sub(parent.userData.centre) : p);
  (parent ?? viewer.root).add(mesh);
}

export function addSlides(viewer, model, meshOf, drawerHolders) {
  const sys = slideSystemOf(slideModel(model.spec.slide));
  if (!sys) return;
  const steel = viewer.mats.metal('стомана');
  for (const g of model.groups.filter((x) => x.type === 'drawer')) {
    const holder = drawerHolders.get(g.id);
    const parts = model.parts.filter((p) => g.partIds.includes(p.id));
    const bottom = parts.find((p) => p.role === 'drawer-bottom');
    for (const sd of parts.filter((p) => p.role === 'drawer-side')) {
      const left = sd.frame.n === '+x';
      const out = left ? sd.box.min[0] : sd.box.max[0];
      const dir = left ? -1 : 1; // from the box side towards the carcass side
      const len = sd.box.max[2] - sd.box.min[2];
      const zc = (sd.box.max[2] + sd.box.min[2]) / 2;
      if (sys.mount === 'side') {
        const gap = sys.sideClearance;
        const y = sd.box.min[1] + sys.axisAboveBox;
        const carcass = carcassAt(model, meshOf, out + dir * gap, y);
        place(viewer, carcass, rail(gap * 0.36, 45, len, steel), [out + dir * gap * 0.8, y, zc]);
        const mid = new THREE.Group();
        mid.add(rail(gap * 0.3, 40, len * 0.98, steel));
        mid.children[0].position.copy(viewer.P(out + dir * gap * 0.47, y, zc));
        viewer.root.add(mid);
        viewer.items.push({
          kind: 'slide',
          holder: mid,
          base: new THREE.Vector3(),
          travel: g.travel,
        });
        const inner = rail(gap * 0.22, 34, len * 0.96, steel);
        inner.position.copy(viewer.P(out + dir * gap * 0.13, y, zc));
        (holder ?? viewer.root).add(inner);
      } else if (bottom) {
        const x = out - dir * 9;
        const y = bottom.box.min[1] - 9;
        const carcass = carcassAt(model, meshOf, out + dir * 5, y);
        place(viewer, carcass, rail(13, 18, len * 0.97, steel), [x, y, zc]);
      }
    }
  }
}
