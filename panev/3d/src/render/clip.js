// The rail clip, "brida a T" type N1: one forging whose head holds the rail foot down with its
// nose and bears on the bracket with its heel, and whose M10 shank goes through the SG slot to a
// washer and a nut behind. N1, N2 and N3 are the trade's M10, M12 and M14 clips; the owner fits
// N1. The shape follows the owner's photo of the part, scaled by its M10 nut:
//  · head 36 x 20, the heel end tapered to 14, 14 high over the bracket, forging draft 5° and
//    rounded edges;
//  · a sunk panel on the outer face with the forged "M10" and "N1";
//  · under it a heel pad round the shank (on the bracket) and a ridge under the nose end (on the
//    rail foot, 5 mm up for the T50 rail), the underside between them clear of the foot.
// Millimetres. Origin on the shank axis at the bracket face; +x away from the rail (to the heel),
// +y along the rail, +z out of the bracket; the shank runs down -z. Non-indexed, normals and UVs
// in millimetres like the other fasteners.
import * as THREE from 'three/webgpu';
import { Tris, revolve, merge } from './forms.js';
import { externalThread } from './thread.js';
import { stamp } from './marking.js';

export const N1 = {
  nose: 19.5, // shank axis to the nose end (wide, over the rail foot)
  heel: 16.5, // shank axis to the heel end (tapered, on the bracket)
  width: 20,
  tip: 14, // width at the heel end
  top: 14, // outer face over the bracket
  foot: 5, // the nose ridge's underside: the rail foot's upper face
  relief: 0.8, // the underside between ridge and pad stands this much clear of the foot
  pad: -7, // front face of the heel pad (x): the foot edge must stay beyond it
  shank: 25, // shank length under the bracket face
};
const RIDGE = { from: 1, width: 3 }; // nose ridge: mm in from the nose end, and across
const DRAFT = Math.tan((5 * Math.PI) / 180);
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];

// How far from the rail's centre the shank may stand, for a foot `half` mm wide each side of it:
// the heel pad 0.5 mm clear of the foot's edge, the whole nose ridge on the foot.
export const clipReach = (half) => ({ min: half - N1.pad + 0.5, max: half + N1.nose - RIDGE.from - RIDGE.width });

// The head's outline seen from +z, counter-clockwise: wide at the nose, tapered at the heel.
const coffin = (c) => [[-c.nose, -c.width / 2], [0, -c.width / 2], [c.heel, -c.tip / 2], [c.heel, c.tip / 2], [0, c.width / 2], [-c.nose, c.width / 2]];

// Convex counter-clockwise polygon with every edge moved in by d.
function inset(poly, d) {
  const n = poly.length;
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const e = [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
    return { o: [p[0] - d * e[1], p[1] + d * e[0]], e };
  });
  return lines.map((b, i) => {
    const a = lines[(i + n - 1) % n];
    const s = cross([b.o[0] - a.o[0], b.o[1] - a.o[1]], b.e) / cross(a.e, b.e);
    return [a.o[0] + s * a.e[0], a.o[1] + s * a.e[1]];
  });
}

// The part of a convex polygon with x >= xs.
function clipX(poly, xs) {
  const out = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    if (p[0] >= xs) out.push(p);
    if ((p[0] - xs) * (q[0] - xs) < 0) out.push([xs, p[1] + ((xs - p[0]) / (q[0] - p[0])) * (q[1] - p[1])]);
  });
  return out;
}

// The outline of `core` grown by r: an arc round each corner (k points per right angle), straight
// edges between, closed (the first point repeated). Every ring of one core has the same points,
// so rings at different heights join into walls. Point: x, y, outward normal nx, ny, length s.
function ring(core, r, k = 5) {
  const n = core.length;
  const normal = core.map((p, i) => {
    const q = core[(i + 1) % n];
    return Math.atan2(-(q[0] - p[0]), q[1] - p[1]);
  });
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a0 = normal[(i + n - 1) % n];
    let a1 = normal[i];
    while (a1 < a0) a1 += 2 * Math.PI;
    const steps = Math.max(1, Math.ceil(((a1 - a0) / (Math.PI / 2)) * k));
    for (let j = 0; j <= steps; j++) {
      const a = a0 + ((a1 - a0) * j) / steps;
      pts.push({ x: core[i][0] + r * Math.cos(a), y: core[i][1] + r * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a) });
    }
  }
  pts.push({ ...pts[0] });
  let s = 0;
  pts.forEach((p, i) => {
    if (i) s += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
    p.s = s;
  });
  return pts;
}

// Walls between rings of one core. levels (bottom to top): { r, z, nh, nz }, the normal being nh
// times the outline's normal plus nz up; `inward` faces into the outline (a sunk panel).
function walls(T, core, levels, inward = false) {
  const rings = levels.map((L) => ring(core, L.r));
  const v = (p, L) => ({ p: [p.x, p.y, L.z], n: [L.nh * p.nx, L.nh * p.ny, L.nz], uv: [p.s, L.z] });
  for (let j = 0; j + 1 < levels.length; j++) {
    const [A, B, la, lb] = [rings[j], rings[j + 1], levels[j], levels[j + 1]];
    for (let i = 0; i + 1 < A.length; i++) {
      if (inward) T.quad(v(A[i + 1], la), v(A[i], la), v(B[i], lb), v(B[i + 1], lb));
      else T.quad(v(A[i], la), v(A[i + 1], la), v(B[i + 1], lb), v(B[i], lb));
    }
  }
}

// Flat face at height z inside a ring, less an optional hole ring; facing +z when `up`.
function cap(T, outer, z, up, hole = null) {
  const contour = outer.slice(0, -1).map((p) => new THREE.Vector2(p.x, p.y));
  const holes = hole ? [hole.slice(0, -1).map((p) => new THREE.Vector2(p.x, p.y))] : [];
  const all = [...contour, ...holes.flat()];
  const nz = up ? 1 : -1;
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, holes)) {
    const [pa, pb, pc] = [all[a], all[b], all[c]];
    const turn = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
    const tri = turn * nz > 0 ? [pa, pb, pc] : [pa, pc, pb];
    T.tri(...tri.map((q) => ({ p: [q.x, q.y, z], n: [0, 0, nz], uv: [q.x, q.y] })));
  }
}

// A forged block between z0 and z1 over `poly` (its widest outline), the walls drafted to narrow
// upward (`up`) or downward, rounded rb at the bottom edge and rt at the top (0: none), corners
// rounded R. Caps where asked; `hole` cuts the top cap. Returns the core and the cap rings.
function block(T, poly, { R, z0, z1, rb = 0, rt = 0, up = true, bottom = true, top = true, hole = null }) {
  const core = inset(poly, R);
  const a = up ? Math.atan(DRAFT) : -Math.atan(DRAFT);
  const wall = (z) => R - DRAFT * (up ? z - z0 : z1 - z);
  const levels = [];
  const arc = (cz, r, f0, f1) => {
    const ch = wall(cz) - r / Math.cos(a);
    for (let i = 0; i <= 6; i++) {
      const f = f0 + ((f1 - f0) * i) / 6;
      levels.push({ r: ch + r * Math.cos(f), z: cz + r * Math.sin(f), nh: Math.cos(f), nz: Math.sin(f) });
    }
  };
  if (rb > 0) arc(z0 + rb, rb, -Math.PI / 2, a);
  else levels.push({ r: wall(z0), z: z0, nh: Math.cos(a), nz: Math.sin(a) });
  if (rt > 0) arc(z1 - rt, rt, a, Math.PI / 2);
  else levels.push({ r: wall(z1), z: z1, nh: Math.cos(a), nz: Math.sin(a) });
  walls(T, core, levels);
  const low = ring(core, levels[0].r);
  const high = ring(core, levels[levels.length - 1].r);
  if (bottom) cap(T, low, z0, false);
  if (top) cap(T, high, z1, true, hole);
  return { core, low, high };
}

// The head: body, sunk panel, heel pad, nose ridge. Returns the panel floor's height.
function head(T, c) {
  const outline = coffin(c);
  const zb = c.foot + c.relief;
  const skin = 0.3; // pad and ridge reach this far up into the body, out of sight
  // Panel: the outline 3.8 mm in, corners 1.2; its wall sinks 0.7 mm over 0.5 mm, facing in.
  const panel = inset(outline, 3.8 + 1.2);
  const depth = 0.7;
  const rim = ring(panel, 1.2);
  block(T, outline, { R: 2.5, z0: zb, z1: c.top, rb: 0.6, rt: 1.6, hole: rim });
  const slope = Math.hypot(0.5, depth);
  walls(T, panel, [{ r: 0.7, z: c.top - depth, nh: -depth / slope, nz: 0.5 / slope }, { r: 1.2, z: c.top, nh: -depth / slope, nz: 0.5 / slope }], true);
  cap(T, ring(panel, 0.7), c.top - depth, true);
  // Heel pad: the outline 1.2 mm in, cut square at the front; it narrows down to the bracket.
  const pad = clipX(inset(outline, 1.2), c.pad);
  block(T, pad, { R: 1.5, z0: 0, z1: zb + skin, rb: 0.6, up: false, top: false });
  // Nose ridge across the nose end, standing 0.8 mm under the body on the foot.
  const x0 = -c.nose + RIDGE.from;
  const ridge = [[x0, -8.2], [x0 + RIDGE.width, -8.2], [x0 + RIDGE.width, 8.2], [x0, 8.2]];
  block(T, ridge, { R: 0.8, z0: c.foot, z1: zb + skin, rb: 0.4, up: false, top: false });
  return c.top - depth;
}

// The shank, built along +Y from its end (y = 0) to the pad (y = length) like a bolt, then turned
// to run down -z: the thread runs out 3 mm under the pad into the blank, a 0.8 mm root fillet.
function shank(length, left) {
  const threadTo = length - 3;
  const fillet = [];
  for (let i = 0; i <= 6; i++) {
    const phi = Math.PI - (Math.PI / 2) * (i / 6);
    fillet.push({ r: 5.32 + 0.8 * Math.cos(phi), y: length - 0.8 + 0.8 * Math.sin(phi) });
  }
  const neck = revolve([{ r: 4.52, y: threadTo }, ...fillet], 72);
  const end = revolve([{ r: 0, y: 0 }, { r: 3.9, y: 0 }], 72);
  const g = merge([externalThread({ from: 0, to: threadTo, left }), end, neck]);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, -length);
  return g;
}

// `left`: the assembly is shown mirrored — left-hand thread and the marks reversed, so both read
// right on screen. Group 0 is the forged head, group 1 the shank.
export function clipGeometry({ left = false } = {}) {
  const T = new Tris();
  const floor = head(T, N1);
  const mark = (text, x) => {
    const g = stamp(text, { mirror: left, height: 5, relief: 0.5 });
    g.rotateZ(Math.PI / 2); // reads along +y, the tops of the letters towards the nose
    g.translate(x, 0, floor);
    return g;
  };
  const top = merge([T.geometry(), mark('M10', -8.5), mark('N1', 4.5)]);
  const clip = merge([top, shank(N1.shank, left)]);
  const n = top.attributes.position.count;
  clip.addGroup(0, n, 0);
  clip.addGroup(n, clip.attributes.position.count - n, 1);
  clip.userData.thread = left ? 'left' : 'right';
  return clip;
}
