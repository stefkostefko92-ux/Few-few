// A 90° press-brake bend: the cylindrical strip joining a parent face to a child face, and the child's frame; inner
// radius r, thickness t. Ported from Panev's 3D catalogue (panev/3d/src/geo/bend.js), without the edge bevels.
import { EDGE, ZINC, type MeshBuilder, type V3 } from './mesh';
import type { Frame } from './face';

const HALF_PI = Math.PI / 2;
const addS = (a: V3, b: V3, k: number): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const neg = (a: V3): V3 => [-a[0], -a[1], -a[2]];

/** T0: the parent's tangent line at u = 0 on its s = 0 side; e3 along the edge, n3 the parent's outward in-plane normal
 *  there, N3 the parent's surface normal (+s). */
export interface BendGeo {
  T0: V3;
  e3: V3;
  n3: V3;
  N3: V3;
}

/** `up` folds the child towards +N3 (the parent's top becomes the inside of the bend). */
export function childFrame({ T0, e3, n3, N3 }: BendGeo, t: number, r: number, up: boolean): Frame {
  if (up) return { o: addS(T0, n3, r + t), u: e3, v: N3, n: neg(n3) };
  return { o: addS(addS(T0, n3, r), N3, t), u: e3, v: neg(N3), n: n3 };
}

/** Position and top-surface normal in the bend at distance u along it, angle phi, depth s. */
function bendPoint({ T0, e3, n3, N3 }: BendGeo, t: number, r: number, up: boolean, u: number, phi: number, s: number): { p: V3; top: V3 } {
  const sp = Math.sin(phi), cp = Math.cos(phi);
  if (up) {
    const radial: V3 = [sp * n3[0] - cp * N3[0], sp * n3[1] - cp * N3[1], sp * n3[2] - cp * N3[2]];
    return { p: addS(addS(addS(T0, e3, u), N3, t + r), radial, r + t - s), top: neg(radial) };
  }
  const radial: V3 = [sp * n3[0] + cp * N3[0], sp * n3[1] + cp * N3[1], sp * n3[2] + cp * N3[2]];
  return { p: addS(addS(addS(T0, e3, u), N3, -r), radial, r + s), top: radial };
}

export function buildBend(mb: MeshBuilder, geo: BendGeo, t: number, r: number, up: boolean, len: number, segs: number): void {
  const rows = Array.from({ length: segs + 1 }, (_, k) => (k / segs) * HALF_PI);
  // the coated inner and outer surfaces
  for (const [s, flip] of [[t, false], [0, true]] as const) {
    const row = rows.map((phi) => {
      const a = bendPoint(geo, t, r, up, 0, phi, s), c = bendPoint(geo, t, r, up, len, phi, s), nrm = flip ? neg(a.top) : a.top;
      return [mb.vertex(a.p, nrm), mb.vertex(c.p, flip ? neg(c.top) : c.top), nrm] as const;
    });
    for (let k = 0; k < segs; k++) mb.quad(ZINC, row[k][0], row[k][1], row[k + 1][1], row[k + 1][0], row[k][2]);
  }
  // the cut side walls at u = 0 and u = len
  for (const [u0, side] of [[0, neg(geo.e3)], [len, geo.e3]] as const) {
    const wall = rows.map((phi) => [mb.vertex(bendPoint(geo, t, r, up, u0, phi, 0).p, side), mb.vertex(bendPoint(geo, t, r, up, u0, phi, t).p, side)] as const);
    for (let k = 0; k < segs; k++) mb.quad(EDGE, wall[k][0], wall[k + 1][0], wall[k + 1][1], wall[k][1], side);
  }
}
