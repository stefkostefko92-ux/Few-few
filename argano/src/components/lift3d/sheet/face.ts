// The solid of one flat face of a sheet-metal part: its coated top (s = t) and bottom (s = 0) surfaces and the cut
// walls round every free edge and hole. Bend edges stay open: the bend's strip carries the solid on. Ported from
// Panev's 3D catalogue (panev/3d/src/geo/face.js), without the edge bevels (too small to show in the shaft).
import * as THREE from 'three/webgpu';
import { EDGE, ZINC, type MeshBuilder, type V3 } from './mesh';
import type { Flags } from './outline';
import type { Loop, V2 } from './path';

/** Local (x, y, s) of a face maps to o + x·u + y·v + s·n (unit axes, any handedness). */
export interface Frame {
  o: V3;
  u: V3;
  v: V3;
  n: V3;
}

const SMOOTH_COS = Math.cos((35 * Math.PI) / 180); // walls closer than 35° share a normal

export const norm3 = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

export function buildFace(mb: MeshBuilder, face: { loop: Loop; flags: Flags; holes: Loop[]; frame: Frame }, t: number): void {
  const { o, u, v, n } = face.frame;
  const P = (x: number, y: number, s: number): V3 => [o[0] + x * u[0] + y * v[0] + s * n[0], o[1] + x * u[1] + y * v[1] + s * n[1], o[2] + x * u[2] + y * v[2] + s * n[2]];
  const dir = (x: number, y: number): V3 => norm3([x * u[0] + y * v[0], x * u[1] + y * v[1], x * u[2] + y * v[2]]);
  const neg: V3 = [-n[0], -n[1], -n[2]];
  const loops = [{ pts: face.loop, free: face.flags.map((f) => f === null) }, ...face.holes.map((h) => ({ pts: h, free: h.map(() => true) }))];
  // the coated surfaces: one triangulation of the outline less its holes, for both sides
  const ring = (pts: Loop): THREE.Vector2[] => pts.map(([x, y]) => new THREE.Vector2(x, y));
  const tris = THREE.ShapeUtils.triangulateShape(ring(loops[0].pts), loops.slice(1).map((L) => ring(L.pts)));
  const all = loops.flatMap((L) => L.pts);
  const top = all.map(([x, y]) => mb.vertex(P(x, y, t), n)), bot = all.map(([x, y]) => mb.vertex(P(x, y, 0), neg));
  for (const [a, c, d] of tris) {
    mb.tri(ZINC, top[a], top[c], top[d], n);
    mb.tri(ZINC, bot[a], bot[c], bot[d], neg);
  }
  // the cut walls, edge by edge; neighbouring walls on one curve (a hole, a slot's end) share a smoothed normal
  for (const L of loops) {
    const m = L.pts.length;
    const edgeN = L.pts.map((p, i): V2 => {
      const q = L.pts[(i + 1) % m], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
      return [dy / l, -dx / l]; // outward: right of the edge (the material is on its left)
    });
    const vertexN = (vi: number, edge: number): V3 => {
      const other = edge === vi ? (vi - 1 + m) % m : vi, a = edgeN[edge], c = edgeN[other];
      return !L.free[other] || a[0] * c[0] + a[1] * c[1] < SMOOTH_COS ? dir(a[0], a[1]) : dir(a[0] + c[0], a[1] + c[1]);
    };
    for (let i = 0; i < m; i++) {
      if (!L.free[i]) continue;
      const j = (i + 1) % m, [ax, ay] = L.pts[i], [bx, by] = L.pts[j];
      const facing = dir(edgeN[i][0], edgeN[i][1]), na = vertexN(i, i), nb = vertexN(j, i);
      const w0 = mb.vertex(P(ax, ay, 0), na), w1 = mb.vertex(P(bx, by, 0), nb), w2 = mb.vertex(P(bx, by, t), nb), w3 = mb.vertex(P(ax, ay, t), na);
      mb.quad(EDGE, w0, w1, w2, w3, facing);
    }
  }
}
