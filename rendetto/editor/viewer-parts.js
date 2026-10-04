// Per-part 3D helpers for the viewer: the rounded board with face materials by edge banding and UVs that follow the
// grain, the drilled holes (copies merged into one mesh per part, not instanced: the photo view's path tracer does
// not read instanced meshes) and the hinge cups. `viewer` gives the materials, the scale and the ops toggle.
import * as THREE from 'three';
import { S, hingeMesh, hingeArmMesh, merged, shelfPinGeometry } from './viewer-hw.js';
import { panelGeometry } from './viewer-panel.js';

const IDX = { x: 0, y: 1, z: 2 };

const DIRS = ['+x', '-x', '+y', '-y', '+z', '-z'];
const CHIP = 0.018; // the chipboard texture spans one 18 mm thickness

const isRaw = (part, d) =>
  part.stock !== 'hdf3' && part.stock !== 'mdf18' && d[1] !== part.frame.n[1] && !part.bands[d];

export function faceMaterials(mats, part) {
  // in panelGeometry's face order: +x, -x, +y, -y, +z, -z
  const tAxis = part.frame.n[1];
  return DIRS.map((d) => {
    if (part.stock === 'hdf3') return mats.hdf(d === part.frame.n);
    if (d[1] === tAxis) return mats.board(part.decor);
    return isRaw(part, d) ? mats.raw() : mats.board(part.decor, true);
  });
}

// Edge radius: 2 mm ABS is rounded with ~2 mm, thin bands ~1 mm, lacquered MDF fronts are profiled, HDF is sharp.
function radiusOf(part) {
  if (part.stock === 'hdf3') return 0.0004;
  if (part.stock === 'mdf18') return 0.002;
  const band = Math.max(0, ...Object.values(part.bands));
  return band >= 2 ? 0.0018 : band > 0 ? 0.001 : 0.0006;
}

// Size in metres that one tile of a material's textures covers (the baked maps carry it in their repeat).
function spanOf(material) {
  const t = material.map ?? material.normalMap;
  return t ? [1 / t.repeat.x, 1 / t.repeat.y] : [1, 1];
}

// The board in metres around its centre, UVs in metres along the grain (u). Each part starts at its own random place
// inside one tile of the print, so parts differ and a part never shows the mirrored seam of the texture unless it is
// longer than the tile. Raw edges get v across the thickness for the layered chipboard. One mesh per material (face,
// band, raw edge): fewer draw calls than six groups, and the path tracer of the photo view reads single materials.
export function boardMeshes(part, size, materials) {
  const byMaterial = new Map();
  materials.forEach((m, i) => byMaterial.set(m, [...(byMaterial.get(m) ?? []), i]));
  return [...byMaterial].map(([material, faces]) => {
    const mesh = new THREE.Mesh(boardGeometry(part, size, materials, faces), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  });
}

function boardGeometry(part, size, materials, faces) {
  const L = IDX[part.frame.eu[1]];
  const T = IDX[part.frame.n[1]];
  const Wd = 3 - L - T;
  const seed = [...part.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const tIndex = DIRS.indexOf(part.frame.n);
  const [su, sv] = spanOf(materials[tIndex]);
  const ou = ((seed % 97) / 97) * Math.max(0, su - size[L]) + size[L] / 2;
  const ov = ((seed % 53) / 53) * Math.max(0, sv - size[Wd]) + size[Wd] / 2;
  const halfT = size[T] / 2;
  const uvFor = (a, sgn, p) => {
    const dir = `${sgn > 0 ? '+' : '-'}${'xyz'[a]}`;
    if (isRaw(part, dir))
      return [(a === L ? p[Wd] : p[L]) + ou, ((p[T] + halfT) / (2 * halfT)) * CHIP];
    if (a === T) return [p[L] + ou, p[Wd] + ov];
    if (a === Wd) return [p[L] + ou, p[T] + halfT];
    return [p[Wd] + ov, p[T] + halfT];
  };
  return panelGeometry(size, radiusOf(part), uvFor, 2, faces);
}

export function addHoles(viewer, mesh, part, centre, holeGeo) {
  const holes = part.features.filter((f) => f.type === 'hole');
  if (!holes.length) return;
  const axis = part.frame.n[1];
  const sign = part.frame.n[0] === '+' ? 1 : -1;
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(...[0, 1, 2].map((i) => (i === IDX[axis] ? 1 : 0))),
  );
  const matrices = holes.map((h) => {
    const local = viewer.P(...h.world).sub(centre);
    local.setComponent(IDX[axis], local.getComponent(IDX[axis]) + sign * 0.0004);
    const r = (h.d / 2) * S;
    return new THREE.Matrix4().compose(local, q, new THREE.Vector3(r, 0.0012, r));
  });
  const dots = new THREE.Mesh(
    merged(holeGeo, matrices),
    viewer.mats.plain('hole', { color: 0x1c1d1e, roughness: 0.7 }),
  );
  dots.visible = viewer.showOps;
  dots.userData.ops = true;
  mesh.add(dots);
}

export function addHinges(viewer, mesh, part, centre) {
  for (const f of part.features.filter((x) => x.kind === 'cup')) {
    const g = hingeMesh(viewer.mats, f.d);
    g.position.copy(viewer.P(f.world[0], f.world[1], part.box.min[2]).sub(centre));
    mesh.add(g);
  }
}

// Hinge plates on the carcass (pairs of plate holes on a side or partition) with the arm reaching to the front edge.
export function addHingeArms(viewer, mesh, part, centre) {
  const holes = part.features.filter((f) => f.type === 'hole' && f.kind === 'plate');
  const plates = [];
  for (const h of holes) {
    const [x, y, z] = h.world;
    const p = plates.find(
      (q) => Math.abs(q.x - x) < 1 && Math.abs(q.z - z) < 1 && Math.abs(q.y - y) < 40,
    );
    if (p) p.ys.push(y);
    else plates.push({ x, z, y, ys: [y] });
  }
  for (const p of plates) {
    const y = p.ys.reduce((a, b) => a + b, 0) / p.ys.length;
    const inward = Math.abs(p.x - part.box.max[0]) < Math.abs(p.x - part.box.min[0]) ? 1 : -1;
    const g = hingeArmMesh(viewer.mats, inward, (part.box.max[2] - p.z) * S);
    g.position.copy(viewer.P(p.x, y, p.z).sub(centre));
    mesh.add(g);
  }
}

// Shelf pins under every shelf, in the system holes of the two sides at the shelf's pin height.
export function addShelfPins(viewer, model, meshOf) {
  const geo = shelfPinGeometry();
  const metal = viewer.mats.metal('никел');
  const byPanel = new Map();
  for (const shelf of model.parts.filter((p) => p.role === 'shelf' && p.pinY !== undefined)) {
    const xs = [shelf.box.min[0] - 1, shelf.box.max[0] + 1];
    for (const part of model.parts) {
      if (part.role !== 'side' && part.role !== 'partition') continue;
      for (const f of part.features) {
        if (f.kind !== 'system' || Math.abs(f.world[1] - shelf.pinY) > 0.6) continue;
        if (!xs.some((x) => Math.abs(f.world[0] - x) < 0.6)) continue;
        if (f.world[2] < shelf.box.min[2] || f.world[2] > shelf.box.max[2]) continue;
        // a pin on the left side of the column points +x, on the right side -x
        const dir = Math.abs(f.world[0] - xs[0]) < 0.6 ? 1 : -1;
        if (!byPanel.has(part.id)) byPanel.set(part.id, []);
        byPanel.get(part.id).push({ at: f.world, dir });
      }
    }
  }
  const one = new THREE.Vector3(1, 1, 1);
  for (const [id, pins] of byPanel) {
    const mesh = meshOf.get(id);
    if (!mesh) continue;
    const matrices = pins.map((pin) => {
      // the lathe axis (+y) turned to point from the side face into the column
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(pin.dir, 0, 0),
      );
      return new THREE.Matrix4().compose(viewer.P(...pin.at).sub(mesh.userData.centre), q, one);
    });
    const pinsMesh = new THREE.Mesh(merged(geo, matrices), metal);
    pinsMesh.castShadow = true;
    mesh.add(pinsMesh);
  }
}
