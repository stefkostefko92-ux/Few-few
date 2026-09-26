// Solids of the fasteners, built as triangles with their own normals and UVs in millimetres:
//  · hexBody — the hexagon of a bolt head or a nut (ISO 4017 / ISO 4032, M10): across flats `s`,
//    the corners rounded as they come out of the forging die (across corners about 18.1 mm for
//    s = 16; the standards ask at least 17.77), cut by the 30° chamfer cone at the top and, for a
//    nut, at the bottom too. The cone draws the arcs on each flat that make a real head read as one;
//  · revolve — a profile turned about the axis (washers, the washer face, countersinks), with
//    sharp corners kept sharp.
// Axis +Y, non-indexed.
import * as THREE from 'three/webgpu';

const TAN30 = Math.tan(Math.PI / 6);

// The rounded hexagon, counter-clockwise seen from +Y: { x, z, nx, nz, len } per point (outward
// normal, arc length from the start), `perFlat` segments per flat and `perArc` per corner.
export function hexOutline(s, rho, perFlat = 10, perArc = 6) {
  const pts = [];
  const dc = (s / 2 - rho) / Math.cos(Math.PI / 6);
  const push = (x, z, nx, nz) => {
    const last = pts[pts.length - 1];
    const len = last ? last.len + Math.hypot(x - last.x, z - last.z) : 0;
    pts.push({ x, z, nx, nz, len });
  };
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    const [ca, sa] = [Math.cos(a), Math.sin(a)];
    // Flat k runs between the arcs at corners a - 30° and a + 30°.
    const c0 = [dc * Math.cos(a - Math.PI / 6), dc * Math.sin(a - Math.PI / 6)];
    const c1 = [dc * Math.cos(a + Math.PI / 6), dc * Math.sin(a + Math.PI / 6)];
    const p0 = [c0[0] + rho * ca, c0[1] + rho * sa];
    const p1 = [c1[0] + rho * ca, c1[1] + rho * sa];
    for (let i = 0; i < perFlat; i++) {
      const t = i / perFlat;
      push(p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, ca, sa);
    }
    for (let i = 0; i < perArc; i++) {
      const phi = a + ((Math.PI / 3) * i) / perArc;
      push(c1[0] + rho * Math.cos(phi), c1[1] + rho * Math.sin(phi), Math.cos(phi), Math.sin(phi));
    }
  }
  const first = pts[0];
  pts.push({ ...first, len: pts[pts.length - 1].len + Math.hypot(first.x - pts[pts.length - 1].x, first.z - pts[pts.length - 1].z) });
  return pts;
}

// Collects triangles with per-vertex normals and UVs.
export class Tris {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
  }

  vert(v) {
    this.p.push(v.p[0], v.p[1], v.p[2]);
    this.n.push(v.n[0], v.n[1], v.n[2]);
    this.uv.push(v.uv[0], v.uv[1]);
  }

  // Quad a-b-c-d, counter-clockwise seen from the side its normals point to.
  quad(a, b, c, d) {
    this.vert(a);
    this.vert(b);
    this.vert(c);
    this.vert(a);
    this.vert(c);
    this.vert(d);
  }

  tri(a, b, c) {
    this.vert(a);
    this.vert(b);
    this.vert(c);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    return g;
  }
}

const unit = (x, y, z) => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};

// Chamfered hexagon prism. top/bottom: radius where the 30° cone meets the flat end face (null =
// no chamfer, the end face runs to the outline). The end faces are annuli down to `topHole` /
// `bottomHole` (0 = full disc); a bolt head leaves its bottom to the washer face.
export function hexBody({ s = 16, rho = 1.2, height, top = null, bottom = null, topHole = 0, bottomHole = 0, faceBottom = true }) {
  const out = hexOutline(s, rho);
  const T = new Tris();
  const r = (q) => Math.hypot(q.x, q.z);
  const yTop = (q) => (top ? Math.min(height, height - (r(q) - top) * TAN30) : height);
  const yBot = (q) => (bottom ? Math.max(0, (r(q) - bottom) * TAN30) : 0);
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i];
    const b = out[i + 1];
    // Side wall between the two chamfers; the flats are planar, the corner arcs smooth.
    const v = (q, y) => ({ p: [q.x, y, q.z], n: [q.nx, 0, q.nz], uv: [q.len, y] });
    T.quad(v(b, yBot(b)), v(a, yBot(a)), v(a, yTop(a)), v(b, yTop(b)));
    // Top: the cone from the wall's upper edge in to the circle `top`, then the flat end face.
    const dir = (q) => [q.x / r(q), q.z / r(q)];
    const [da, db] = [dir(a), dir(b)];
    if (top) {
      const cone = (q, d, rad, y) => ({ p: [d[0] * rad, y, d[1] * rad], n: unit(d[0] * 0.5, 0.8660254, d[1] * 0.5), uv: [q.len, height - y] });
      T.quad(cone(b, db, r(b), yTop(b)), cone(a, da, r(a), yTop(a)), cone(a, da, top, height), cone(b, db, top, height));
    }
    const ra = top ?? r(a);
    const rb = top ?? r(b);
    const flat = (d, rad, y, ny) => ({ p: [d[0] * rad, y, d[1] * rad], n: [0, ny, 0], uv: [d[0] * rad, d[1] * rad] });
    const outA = top ? flat(da, ra, height, 1) : flat(da, r(a), height, 1);
    const outB = top ? flat(db, rb, height, 1) : flat(db, r(b), height, 1);
    if (topHole > 0) T.quad(outB, outA, flat(da, topHole, height, 1), flat(db, topHole, height, 1));
    else T.tri(outB, outA, flat([0, 0], 0, height, 1));
    // Bottom: the same, mirrored (a nut); a bolt head's bottom is the ring under the hex.
    if (bottom) {
      const cone = (q, d, rad, y) => ({ p: [d[0] * rad, y, d[1] * rad], n: unit(d[0] * 0.5, -0.8660254, d[1] * 0.5), uv: [q.len, y] });
      T.quad(cone(a, da, r(a), yBot(a)), cone(b, db, r(b), yBot(b)), cone(b, db, bottom, 0), cone(a, da, bottom, 0));
    }
    if (faceBottom) {
      const ba = bottom ?? r(a);
      const bb = bottom ?? r(b);
      if (bottomHole > 0) T.quad(flat(da, ba, 0, -1), flat(db, bb, 0, -1), flat(db, bottomHole, 0, -1), flat(da, bottomHole, 0, -1));
      else T.tri(flat(da, ba, 0, -1), flat(db, bb, 0, -1), flat([0, 0], 0, 0, -1));
    }
  }
  return T.geometry();
}

// Profile turned about +Y: points { r, y } counter-clockwise in the (r, y) plane (r to the right,
// y up), so the outward side is on the right of the walk; `sharp` indices keep their corner crisp.
// Normals come from the segment directions.
export function revolve(profile, segments = 96, sharp = []) {
  const T = new Tris();
  const n = profile.length;
  // Per-point normals, averaged across a point unless it is sharp (then per segment).
  const seg = [];
  for (let i = 0; i < n - 1; i++) {
    const dr = profile[i + 1].r - profile[i].r;
    const dy = profile[i + 1].y - profile[i].y;
    const l = Math.hypot(dr, dy) || 1;
    seg.push([dy / l, -dr / l]);
  }
  let len = 0;
  const vAt = [0];
  for (let i = 1; i < n; i++) vAt.push((len += Math.hypot(profile[i].r - profile[i - 1].r, profile[i].y - profile[i - 1].y)));
  const nrm = (i, side) => {
    if (sharp.includes(i) || i === 0 || i === n - 1) return seg[Math.min(Math.max(side === 'start' ? i : i - 1, 0), n - 2)];
    const a = seg[i - 1];
    const b = seg[i];
    const l = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1;
    return [(a[0] + b[0]) / l, (a[1] + b[1]) / l];
  };
  for (let i = 0; i < n - 1; i++) {
    const p0 = profile[i];
    const p1 = profile[i + 1];
    const n0 = nrm(i, 'start');
    const n1 = nrm(i + 1, 'end');
    for (let k = 0; k < segments; k++) {
      const a0 = (k / segments) * Math.PI * 2;
      const a1 = ((k + 1) / segments) * Math.PI * 2;
      const v = (p, nn, a, vv) => ({
        p: [p.r * Math.sin(a), p.y, p.r * Math.cos(a)],
        n: [nn[0] * Math.sin(a), nn[1], nn[0] * Math.cos(a)],
        uv: [a * Math.max(p.r, 0.5), vv],
      });
      T.quad(v(p0, n0, a0, vAt[i]), v(p0, n0, a1, vAt[i]), v(p1, n1, a1, vAt[i + 1]), v(p1, n1, a0, vAt[i + 1]));
    }
  }
  return T.geometry();
}
