// Per-part 3D helpers for the viewer: face materials by edge banding, UVs that follow the grain, the drilled holes
// (instanced) and the hinge cups. Split out of viewer.js; `viewer` gives the materials, the scale and the ops toggle.
import * as THREE from 'three';
import { S, hingeMesh } from './viewer-hw.js';

const IDX = { x: 0, y: 1, z: 2 };

export function faceMaterials(mats, part) {
  // BoxGeometry groups: +x, -x, +y, -y, +z, -z
  const tAxis = part.frame.n[1];
  return ['+x', '-x', '+y', '-y', '+z', '-z'].map((d) => {
    if (part.stock === 'hdf3') return mats.hdf(d === part.frame.n);
    if (d[1] === tAxis) return mats.board(part.decor);
    return part.bands[d] || part.stock === 'mdf18' ? mats.board(part.decor, true) : mats.raw();
  });
}

export function remapUv(geo, part) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const L = IDX[part.frame.eu[1]];
  const T = IDX[part.frame.n[1]];
  const Wd = 3 - L - T;
  const seed = [...part.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  const ou = (seed % 97) / 160;
  const ov = (seed % 53) / 90;
  for (let i = 0; i < pos.count; i++) {
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const n = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))];
    const a = n.indexOf(Math.max(...n));
    const [u, v] = a === T ? [p[L], p[Wd]] : a === Wd ? [p[L], p[T]] : [p[Wd], p[T]];
    uv.setXY(i, u / 2.4 + ou, v / 1.2 + ov);
  }
  uv.needsUpdate = true;
}

export function addHoles(viewer, mesh, part, centre, holeGeo) {
  const holes = part.features.filter((f) => f.type === 'hole');
  if (!holes.length) return;
  const axis = part.frame.n[1];
  const sign = part.frame.n[0] === '+' ? 1 : -1;
  const inst = new THREE.InstancedMesh(
    holeGeo,
    viewer.mats.plain('hole', { color: 0x1c1d1e, roughness: 0.7 }),
    holes.length,
  );
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(...[0, 1, 2].map((i) => (i === IDX[axis] ? 1 : 0))),
  );
  const m = new THREE.Matrix4();
  holes.forEach((h, i) => {
    const local = viewer.P(...h.world).sub(centre);
    local.setComponent(IDX[axis], local.getComponent(IDX[axis]) + sign * 0.0004);
    const r = (h.d / 2) * S;
    m.compose(local, q, new THREE.Vector3(r, 0.0012, r));
    inst.setMatrixAt(i, m);
  });
  inst.instanceMatrix.needsUpdate = true;
  inst.visible = viewer.showOps;
  inst.userData.ops = true;
  mesh.add(inst);
}

export function addHinges(viewer, mesh, part, centre) {
  const towards = part.hingeSide === 'left' ? -1 : 1;
  for (const f of part.features.filter((x) => x.kind === 'cup')) {
    const g = hingeMesh(viewer.mats, f.d, towards);
    g.position.copy(viewer.P(f.world[0], f.world[1], part.box.min[2]).sub(centre));
    mesh.add(g);
  }
}
