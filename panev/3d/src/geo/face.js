// Solid for one flat face of a sheet-metal part: coated top (s = t) and bottom (s = 0) surfaces,
// cut-edge walls round every free edge and hole, and a small bevel between wall and surface that
// catches the light like the rounded edge of a real galvanised part. Bend edges stay open: the
// bend strip continues the solid there.
import { ShapeUtils, Vector2 } from 'three';
import { insetLoop } from './outline.js';
import { ZINC, EDGE } from './mesh.js';

const SMOOTH_COS = Math.cos((35 * Math.PI) / 180); // walls closer than 35° share a normal

const norm3 = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

// frame: { o, u, v, n } — local (x, y, s) maps to o + x·u + y·v + s·n (unit axes, any handedness).
// flat(x, y) gives flat-pattern coordinates (mm) for the coated surfaces' texture.
export function buildFace(mb, { loop, flags, holes, frame, flat }, { t, bevel }) {
  const { o, u, v, n } = frame;
  const P = (x, y, s) => [o[0] + x * u[0] + y * v[0] + s * n[0], o[1] + x * u[1] + y * v[1] + s * n[1], o[2] + x * u[2] + y * v[2] + s * n[2]];
  const dir = (x, y) => norm3([x * u[0] + y * v[0], x * u[1] + y * v[1], x * u[2] + y * v[2]]);
  const neg = [-n[0], -n[1], -n[2]];
  const b = bevel;

  const loops = [
    { pts: loop, offs: flags.map((f) => (f == null ? b : 0)), free: flags.map((f) => f == null) },
    ...holes.map((h) => ({ pts: h, offs: h.map(() => b), free: h.map(() => true) })),
  ];
  for (const L of loops) L.inner = b > 0 ? insetLoop(L.pts, L.offs) : L.pts;

  // Coated surfaces: one triangulation of the inset outline, used for both sides.
  const contour = loops[0].inner.map(([x, y]) => new Vector2(x, y));
  const holeRings = loops.slice(1).map((L) => L.inner.map(([x, y]) => new Vector2(x, y)));
  const tris = ShapeUtils.triangulateShape(contour, holeRings);
  const all = [...loops[0].inner, ...loops.slice(1).flatMap((L) => L.inner)];
  const back = [37.1, 91.7]; // the far side of the sheet shows a different patch of the pattern
  const top = all.map(([x, y]) => mb.vertex(P(x, y, t), n, flat(x, y)));
  const bot = all.map(([x, y]) => {
    const [fx, fy] = flat(x, y);
    return mb.vertex(P(x, y, 0), neg, [fx + back[0], fy + back[1]]);
  });
  for (const [a, c, d] of tris) {
    mb.tri(ZINC, top[a], top[c], top[d], n);
    mb.tri(ZINC, bot[a], bot[c], bot[d], neg);
  }

  // Walls and bevels, edge by edge; neighbouring walls on the same curve share smoothed normals.
  for (const L of loops) {
    const m = L.pts.length;
    const edgeN = L.pts.map((p, i) => {
      const q = L.pts[(i + 1) % m];
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const l = Math.hypot(dx, dy) || 1;
      return [dy / l, -dx / l]; // outward: right of the edge (material is on the left)
    });
    // Normal of vertex `vi` on edge `edge`: shared with the neighbouring edge at that vertex when
    // both are free cut edges on the same curve (a hole or a rounded slot end), split otherwise.
    const vertexN = (vi, edge) => {
      const other = edge === vi ? (vi - 1 + m) % m : vi;
      const a = edgeN[edge];
      const c = edgeN[other];
      if (!L.free[other] || a[0] * c[0] + a[1] * c[1] < SMOOTH_COS) return dir(a[0], a[1]);
      return dir(a[0] + c[0], a[1] + c[1]);
    };
    let along = 0;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const [ax, ay] = L.pts[i];
      const [bx, by] = L.pts[j];
      const segLen = Math.hypot(bx - ax, by - ay);
      if (!L.free[i]) {
        along += segLen;
        continue;
      }
      const facing = dir(edgeN[i][0], edgeN[i][1]);
      const na = vertexN(i, i);
      const nb = vertexN(j, i);
      const w0 = mb.vertex(P(ax, ay, b), na, [along, b]);
      const w1 = mb.vertex(P(bx, by, b), nb, [along + segLen, b]);
      const w2 = mb.vertex(P(bx, by, t - b), nb, [along + segLen, t - b]);
      const w3 = mb.vertex(P(ax, ay, t - b), na, [along, t - b]);
      mb.quad(EDGE, w0, w1, w2, w3, facing);
      if (b > 0) {
        const [ix, iy] = L.inner[i];
        const [jx, jy] = L.inner[j];
        const up = norm3([facing[0] + n[0], facing[1] + n[1], facing[2] + n[2]]);
        const t0 = mb.vertex(P(ax, ay, t - b), na, flat(ax, ay));
        const t1 = mb.vertex(P(bx, by, t - b), nb, flat(bx, by));
        const t2 = mb.vertex(P(jx, jy, t), n, flat(jx, jy));
        const t3 = mb.vertex(P(ix, iy, t), n, flat(ix, iy));
        mb.quad(ZINC, t0, t1, t2, t3, up);
        const down = norm3([facing[0] - n[0], facing[1] - n[1], facing[2] - n[2]]);
        const [fa0, fa1] = flat(ax, ay);
        const [fb0, fb1] = flat(bx, by);
        const [fj0, fj1] = flat(jx, jy);
        const [fi0, fi1] = flat(ix, iy);
        const b0 = mb.vertex(P(ax, ay, b), na, [fa0 + back[0], fa1 + back[1]]);
        const b1 = mb.vertex(P(bx, by, b), nb, [fb0 + back[0], fb1 + back[1]]);
        const b2 = mb.vertex(P(jx, jy, 0), neg, [fj0 + back[0], fj1 + back[1]]);
        const b3 = mb.vertex(P(ix, iy, 0), neg, [fi0 + back[0], fi1 + back[1]]);
        mb.quad(ZINC, b0, b1, b2, b3, down);
      }
      along += segLen;
    }
  }
}
