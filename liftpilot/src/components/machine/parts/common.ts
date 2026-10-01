// Shared dimensions and small builders of the machine parts. Metres; X along the worm, Y up, Z toward the viewer.
// Loaded only through boot.ts, after the prefers-reduced-motion and save-data gate of MachineStage.tsx.
import * as THREE from 'three/webgpu';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

export const DIM = {
  yBed: 0.14, // top of the bedplate beams
  zBeam: 0.16, // bedplate beams
  yWorm: 0.34, // worm, brake and motor axis
  yWheel: 0.5, // wheel and sheave axis
  zSheave: 0.34,
  xDrum: 0.295, // brake drum on the worm shaft
  rp: 0.28, // pitch radius: D 560
  ropes: 4,
  ropeR: 0.005,
  pitch: 0.018, // groove spacing
  ropeBottom: -0.3, // the ropes go through the floor
};
export const ROPE_LENGTH = 2 * (DIM.yWheel - DIM.ropeBottom) + Math.PI * DIM.rp;

export type Mat = THREE.Material;
export const V = (x: number, y: number) => new THREE.Vector2(x, y);
export const P3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function mesh(geometry: THREE.BufferGeometry, material: Mat, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
/** Cylinder with its axis along X. */
export const cylX = (r: number, len: number, seg = 32) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
/** Cylinder with its axis along Z. */
export const cylZ = (r: number, len: number, seg = 32) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);
/** Cylinder with its axis along Y. */
export const cylY = (r: number, len: number, seg = 32) => new THREE.CylinderGeometry(r, r, len, seg);
/** Hexagon (nut, plug) with flat faces, axis along Z. */
export const hexZ = (r: number, len: number) => toCreasedNormals(cylZ(r, len, 6), Math.PI / 4);

/**
 * Surface of revolution of a (radius, axial) profile, as turned on a lathe. The profile runs counter-clockwise
 * (outward along the bottom, up the outside, back along the top), so the normals point out; short chamfers at the
 * corners keep the edges crisp and catch a thin highlight, as on a machined part.
 */
export function latheZ(points: THREE.Vector2[], segments = 64): THREE.BufferGeometry {
  return new THREE.LatheGeometry(points, segments).rotateX(Math.PI / 2);
}
export function latheX(points: THREE.Vector2[], segments = 64): THREE.BufferGeometry {
  return new THREE.LatheGeometry(points, segments).rotateZ(-Math.PI / 2);
}

/**
 * An outline extruded along Z, centred on z = 0, with rounded edges: cast and pressed parts. Creased normals keep
 * the curves smooth and the corners sharp.
 */
export function slab(shape: THREE.Shape, depth: number, bevel: number, curveSegments = 24): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: depth - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments });
  g.translate(0, 0, -depth / 2 + bevel);
  return toCreasedNormals(g, Math.PI / 5);
}

export type Facing = '+x' | '-x' | '+y' | '+z' | '-z';
const FACING: Record<Facing, THREE.Euler> = {
  '+z': new THREE.Euler(0, 0, 0),
  '-z': new THREE.Euler(0, Math.PI, 0),
  '+x': new THREE.Euler(0, Math.PI / 2, 0),
  '-x': new THREE.Euler(0, -Math.PI / 2, 0),
  '+y': new THREE.Euler(-Math.PI / 2, 0, 0),
};

/** Hexagon head on a washer, standing on z = 0 and facing +Z. */
function boltGeometry(head: number): THREE.BufferGeometry {
  const washer = cylZ(head * 1.3, 0.0018, 20).translate(0, 0, 0.0009);
  const hex = cylZ(head, head * 1.1, 6).translate(0, 0, 0.0018 + head * 0.55);
  const top = new THREE.CylinderGeometry(head * 0.82, head, head * 0.12, 6).rotateX(Math.PI / 2).translate(0, 0, 0.0018 + head * 1.16); // chamfer
  return toCreasedNormals(mergeGeometries([washer, hex, top]), Math.PI / 4);
}

/** Bolt heads (with washers) on a surface, all facing the same way. */
export function bolts(material: Mat, spots: readonly THREE.Vector3[], facing: Facing, head = 0.009): THREE.InstancedMesh {
  const inst = new THREE.InstancedMesh(boltGeometry(head), material, spots.length);
  const q = new THREE.Quaternion().setFromEuler(FACING[facing]);
  const one = new THREE.Vector3(1, 1, 1);
  const m = new THREE.Matrix4();
  spots.forEach((p, i) => inst.setMatrixAt(i, m.compose(p, q, one)));
  inst.castShadow = true;
  inst.receiveShadow = true;
  return inst;
}

/** n points on a circle around centre, in the plane across the axis. */
export function circle(center: THREE.Vector3, radius: number, n: number, axis: 'x' | 'y' | 'z', phase = Math.PI / n): THREE.Vector3[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + phase;
    const c = Math.cos(a) * radius, s = Math.sin(a) * radius;
    if (axis === 'z') return P3(center.x + c, center.y + s, center.z);
    if (axis === 'x') return P3(center.x, center.y + s, center.z + c);
    return P3(center.x + c, center.y, center.z + s);
  });
}

/** Helical compression spring along Z, from z0 to z1. */
export function springZ(x: number, y: number, z0: number, z1: number, radius: number, wire: number, turns: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const n = turns * 24;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2 * turns;
    pts.push(P3(x + Math.cos(a) * radius, y + Math.sin(a) * radius, z0 + ((z1 - z0) * k) / n));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, wire, 8);
}
