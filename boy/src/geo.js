// Small geometry toolkit for armour plates, props and masonry.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;

export function lathe(profile, segs = 32, phiStart = 0, phiLen = TAU) {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segs,
    phiStart,
    phiLen,
  );
}

// Open cylinder hanging down from yTop, theta measured from +Z towards +X.
export function tube(rTop, rBot, len, radial = 24, thetaStart = 0, thetaLen = TAU, yTop = 0) {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, radial, 1, true, thetaStart, thetaLen);
  g.translate(0, yTop - len / 2, 0);
  return g;
}

// Spherical cap around +Y with the given polar opening angle.
export function cap(r, polar, ws = 24, hs = 10) {
  return new THREE.SphereGeometry(r, ws, hs, 0, TAU, 0, polar);
}

export function ring(radius, thick, arc = TAU, radial = 6, tubular = 40) {
  const g = new THREE.TorusGeometry(radius, thick, radial, tubular, arc);
  g.rotateX(Math.PI / 2);
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
export function xf(g, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  _e.set(r[0], r[1], r[2]);
  _q.setFromEuler(_e);
  _m.compose(new THREE.Vector3(...p), _q, new THREE.Vector3(...s));
  g.applyMatrix4(_m);
  return g;
}

export function scaleUV(g, su, sv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return g;
}

// Merges any mix of indexed / non-indexed geometries that share position, normal and uv.
export function merge(list) {
  const prepared = list.map((g) => {
    const q = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(q.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') q.deleteAttribute(name);
    }
    if (!q.attributes.uv) {
      q.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2));
    }
    if (!q.attributes.normal) q.computeVertexNormals();
    q.morphAttributes = {};
    return q;
  });
  const out = mergeGeometries(prepared, false);
  if (!out) throw new Error('Geometry merge failed');
  return out;
}

// World-aligned planar UVs by dominant normal axis: stone keeps a constant texel density.
export function worldUV(g, tile) {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let u;
    let v;
    if (ny >= nx && ny >= nz) {
      u = x;
      v = z;
    } else if (nx >= nz) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// Cylindrical UVs for towers and wells so courses stay horizontal.
export function cylUV(g, radius, tile) {
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getX(i), pos.getZ(i));
    uv[i * 2] = ((a + Math.PI) * radius) / tile;
    uv[i * 2 + 1] = pos.getY(i) / tile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// Bakes every mesh under `root` into root-local space and merges them per material.
// Subtrees listed in `exclude` are skipped (they are flattened separately).
export function flatten(root, exclude = []) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const skip = new Set(exclude);
  const byMat = new Map();
  const rel = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (let p = o; p && p !== root; p = p.parent) if (skip.has(p)) return;
    const g = o.geometry.clone();
    g.applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
  });
  return [...byMat].map(([mat, list]) => [merge(list), mat]);
}

// Mirror copy with corrected winding, so a mirrored limb shades like the original.
export function mirrored(pieces, axis) {
  const s = axis === 'x' ? [-1, 1, 1] : [1, 1, -1];
  return pieces.map(([g, mat]) => {
    const m = g.clone();
    m.scale(s[0], s[1], s[2]);
    for (const a of Object.values(m.attributes)) {
      const n = a.itemSize;
      const arr = a.array;
      for (let i = 0; i + 2 < a.count; i += 3) {
        for (let k = 0; k < n; k++) {
          const i1 = (i + 1) * n + k;
          const i2 = (i + 2) * n + k;
          const t = arr[i1];
          arr[i1] = arr[i2];
          arr[i2] = t;
        }
      }
      a.needsUpdate = true;
    }
    return [m, mat];
  });
}
