// A 90° press-brake bend: the cylindrical strip joining a parent face to a child face, and the
// child's frame. Inner radius r, thickness t; the neutral fibre sits at r + K·t, which fixes the
// flat length of the bend (bend allowance) used for texture continuity across the fold.
import { ZINC, EDGE } from './mesh.js';

const HALF_PI = Math.PI / 2;
export const bendAllowance = (r, t, K) => HALF_PI * (r + K * t);

const addS = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const neg = (a) => [-a[0], -a[1], -a[2]];

// T0: 3D point of the parent's tangent line at u = 0 on its s = 0 side; e3 along the edge, n3 the
// parent's outward in-plane normal there, N3 the parent's surface normal (+s). `up` folds the child
// towards +N3 (the parent's top becomes the inside of the bend).
export function childFrame({ T0, e3, n3, N3 }, { t, r, up }) {
  if (up) return { o: addS(addS(T0, n3, r + t), N3, 0), u: e3, v: N3, n: neg(n3) };
  return { o: addS(addS(T0, n3, r), N3, t), u: e3, v: neg(N3), n: n3 };
}

// Position and top-surface normal inside the bend at distance u along it, angle phi, depth s.
function bendPoint({ T0, e3, n3, N3 }, { t, r, up }, u, phi, s) {
  const sp = Math.sin(phi);
  const cp = Math.cos(phi);
  if (up) {
    const radial = [sp * n3[0] - cp * N3[0], sp * n3[1] - cp * N3[1], sp * n3[2] - cp * N3[2]];
    const p = addS(addS(addS(T0, e3, u), N3, t + r), radial, r + t - s);
    return { p, top: neg(radial) };
  }
  const radial = [sp * n3[0] + cp * N3[0], sp * n3[1] + cp * N3[1], sp * n3[2] + cp * N3[2]];
  const p = addS(addS(addS(T0, e3, u), N3, -r), radial, r + s);
  return { p, top: radial };
}

// flatAt(u, d): flat-pattern coordinates at distance u along the bend and d into its allowance.
export function buildBend(mb, geo, { t, r, up, len, bevel, segs, K, flatAt, back }) {
  const b = bevel;
  const BA = bendAllowance(r, t, K);
  const opt = { t, r, up };
  const rows = [];
  for (let k = 0; k <= segs; k++) rows.push((k / segs) * HALF_PI);
  const d = (phi) => (phi / HALF_PI) * BA;
  const flatBack = (u, dd) => {
    const f = flatAt(u, dd);
    return [f[0] + back[0], f[1] + back[1]];
  };
  const side0 = neg(geo.e3);
  const side1 = geo.e3;

  // Coated inner and outer surfaces.
  const topRow = rows.map((phi) => {
    const a = bendPoint(geo, opt, b, phi, t);
    const c = bendPoint(geo, opt, len - b, phi, t);
    return [mb.vertex(a.p, a.top, flatAt(b, d(phi))), mb.vertex(c.p, c.top, flatAt(len - b, d(phi))), a.top];
  });
  const botRow = rows.map((phi) => {
    const a = bendPoint(geo, opt, b, phi, 0);
    const c = bendPoint(geo, opt, len - b, phi, 0);
    return [mb.vertex(a.p, neg(a.top), flatBack(b, d(phi))), mb.vertex(c.p, neg(c.top), flatBack(len - b, d(phi))), neg(a.top)];
  });
  for (let k = 0; k < segs; k++) {
    mb.quad(ZINC, topRow[k][0], topRow[k][1], topRow[k + 1][1], topRow[k + 1][0], topRow[k][2]);
    mb.quad(ZINC, botRow[k][0], botRow[k][1], botRow[k + 1][1], botRow[k + 1][0], botRow[k][2]);
  }

  // Side walls (cut edges) and their bevels at u = 0 and u = len.
  for (const [u0, uIn, side] of [[0, b, side0], [len, len - b, side1]]) {
    const wall = rows.map((phi) => {
      const lo = bendPoint(geo, opt, u0, phi, b);
      const hi = bendPoint(geo, opt, u0, phi, t - b);
      const along = d(phi);
      return [mb.vertex(lo.p, side, [along, b]), mb.vertex(hi.p, side, [along, t - b])];
    });
    for (let k = 0; k < segs; k++) mb.quad(EDGE, wall[k][0], wall[k + 1][0], wall[k + 1][1], wall[k][1], side);
    if (b <= 0) continue;
    const bev = rows.map((phi) => {
      const hi = bendPoint(geo, opt, u0, phi, t - b);
      const topIn = bendPoint(geo, opt, uIn, phi, t);
      const lo = bendPoint(geo, opt, u0, phi, b);
      const botIn = bendPoint(geo, opt, uIn, phi, 0);
      const up3 = [side[0] + topIn.top[0], side[1] + topIn.top[1], side[2] + topIn.top[2]];
      const dn3 = [side[0] - topIn.top[0], side[1] - topIn.top[1], side[2] - topIn.top[2]];
      return {
        t0: mb.vertex(hi.p, side, flatAt(u0, d(phi))),
        t1: mb.vertex(topIn.p, topIn.top, flatAt(uIn, d(phi))),
        b0: mb.vertex(lo.p, side, flatBack(u0, d(phi))),
        b1: mb.vertex(botIn.p, neg(botIn.top), flatBack(uIn, d(phi))),
        up3,
        dn3,
      };
    });
    for (let k = 0; k < segs; k++) {
      const A = bev[k];
      const B = bev[k + 1];
      mb.quad(ZINC, A.t0, B.t0, B.t1, A.t1, A.up3);
      mb.quad(ZINC, A.b0, B.b0, B.b1, A.b1, A.dn3);
    }
  }
  return BA;
}
