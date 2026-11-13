// Cells of a free carcass in 3D: a click (not a drag of the camera) on one of its parts tells which cell it belongs
// to (the part's place, engine/cells.js), and the selected cell — from here or from the constructor — is lit: a
// frame of its clear inside, in the selection's green, over everything (the boards around it hide nothing).
import * as THREE from 'three';

const CLICK = { px: 5, ms: 600 }; // a press that moves less and lasts less is a click, not a turn of the camera
const GREEN = 0x2e7d1f;

export function createCellPick(viewer, onPick) {
  const canvas = viewer.renderer.domElement;
  const ray = new THREE.Raycaster();
  let down = null;
  let lit = null;
  let sel = null;

  canvas.addEventListener('pointerdown', (ev) => {
    down =
      ev.isPrimary && ev.button === 0
        ? { x: ev.clientX, y: ev.clientY, t: performance.now() }
        : null;
  });
  canvas.addEventListener('pointerup', (ev) => {
    const d = down;
    down = null;
    if (!d || !viewer.model?.cells) return;
    if (
      Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > CLICK.px ||
      performance.now() - d.t > CLICK.ms
    )
      return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(
      new THREE.Vector2(
        ((ev.clientX - r.left) / r.width) * 2 - 1,
        -((ev.clientY - r.top) / r.height) * 2 + 1,
      ),
      viewer.camera,
    );
    for (const hit of ray.intersectObjects(viewer.root.children, true)) {
      let o = hit.object;
      while (o && !o.userData.part) o = o.parent;
      const place = o?.userData.part.place;
      if (place) {
        onPick({ column: place.column, cell: place.cell });
        return;
      }
    }
  });

  // the frame of the selected cells (one column, from…to), drawn again after every new model
  function light(next) {
    sel = next;
    if (lit) {
      lit.parent?.remove(lit);
      lit.geometry.dispose();
      lit.material.dispose();
      lit = null;
    }
    const model = viewer.model;
    const cells =
      sel &&
      model?.cells?.filter(
        (c) => c.column === sel.column && c.cell >= sel.from && c.cell <= sel.to,
      );
    if (!cells?.length) {
      viewer.invalidate();
      return;
    }
    const sides = model.parts.filter((p) => p.role === 'side');
    const z0 = Math.min(...sides.map((p) => p.box.min[2]));
    const z1 = Math.max(...sides.map((p) => p.box.max[2]));
    const a = viewer.P(cells[0].x0, Math.min(...cells.map((c) => c.y0)), z0);
    const b = viewer.P(cells[0].x1, Math.max(...cells.map((c) => c.y1)), z1);
    const box = new THREE.Box3(a.clone().min(b), a.clone().max(b));
    lit = new THREE.Box3Helper(box, GREEN);
    lit.material.depthTest = false;
    lit.material.transparent = true;
    lit.renderOrder = 10;
    viewer.root.add(lit);
    viewer.invalidate();
  }

  return {
    light,
    // after setModel (it empties the scene): the same selection again
    relight: () => light(sel),
  };
}
