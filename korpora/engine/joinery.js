// Joinery shared by the generators: confirmat joints, the 32 mm system, back grooves and hole bookkeeping.
import { hole, holeThrough, edgeHoles, toUV, THROUGH_EXTRA } from './panel.js';
import { r1, clamp, AX, dot, sub, neg } from './util.js';

export const SYSTEM = { row: 37, pitch: 32, d: 5, depth: 12, start: 64 };
export const CONFIRMAT = { face: 7, edge: 5, edgeDepth: 50, maxPitch: 220 };
export const GROOVE = { inset: 16, width: 4, depth: 8, clearance: 1 };
export const HDF_T = 3;
export const PILOT = { d: 3, depth: 10 };
export const MIN_WEB = 2; // material left between two holes, or a hole and an edge or a groove, mm
export const FRONT_GAP_Z = 1; // doors and drawer fronts stand this far in front of the carcass, mm

// Evenly spaced confirmat positions between z0 and z1, at most maxPitch apart. With `clear` (z → true where a
// confirmat leaves MIN_WEB to the holes already drilled), each position moves in 1 mm steps to the nearest clear place
// inside z0…z1, at most a quarter of the spacing; one more position is tried when that is not enough. When no
// arrangement clears every hole, the even one is returned and checkHoles reports the clash (fail closed).
export function confirmatZs(z0, z1, clear = null) {
  const span = z1 - z0;
  const n0 = Math.max(2, Math.ceil(span / CONFIRMAT.maxPitch) + 1);
  const even = (n) => Array.from({ length: n }, (_, i) => r1(z0 + (span * i) / (n - 1)));
  if (!clear) return even(n0);
  for (let n = n0; n <= n0 + 1; n++) {
    const reach = Math.floor(span / (n - 1) / 4);
    const zs = [];
    const fits = (c) => c >= z0 && c <= z1 && (!zs.length || c - zs.at(-1) <= CONFIRMAT.maxPitch) && clear(c);
    for (const z of even(n)) {
      let got = null;
      for (let k = 0; k <= reach && got === null; k++) {
        for (const c of k ? [r1(z + k), r1(z - k)] : [z]) {
          if (fits(c)) {
            got = c;
            break;
          }
        }
      }
      if (got === null) break;
      zs.push(got);
    }
    if (zs.length === n) return zs;
  }
  return even(n0);
}

// Confirmat 7×50: Ø7 through the face of `face`, Ø5×50 into the end (`edgeDir`) of `end`.
export function confirmat(ctx, face, end, edgeDir, points) {
  for (const p of points) holeThrough(face, p, CONFIRMAT.face, 'confirmat', { hw: 'confirmat' });
  edgeHoles(end, edgeDir, points, CONFIRMAT.edge, CONFIRMAT.edgeDepth, 'confirmat', { label: 'конфирмат 7×50, за резбата' });
  ctx.hw('confirmat', { name: 'Конфирмат 7×50', qty: points.length, unit: 'бр.', group: 'Крепежи' });
}

const sameSpot = (f, u, v, d) => f.type === 'hole' && f.u === u && f.v === v && f.d === d;

// Drill once per spot: a second request at the same (u, v, Ø) merges into the first, and a specific purpose
// (hinge plate, slide) replaces a plain system hole.
export function addHoleOnce(part, p, d, depth, kind, meta = {}, through = false) {
  const [u, v] = toUV(part, p);
  const same = part.features.find((f) => sameSpot(f, u, v, d));
  if (same) {
    if (same.kind === 'system' && kind !== 'system') Object.assign(same, { kind, ...meta });
    if (through && !same.through) Object.assign(same, { through: true, depth: r1(part.T + THROUGH_EXTRA) });
    return same;
  }
  return through ? holeThrough(part, p, d, kind, meta) : hole(part, p, d, depth, kind, meta);
}

export function hasHole(part, p, d, kind = null) {
  const [u, v] = toUV(part, p);
  return part.features.some((f) => sameSpot(f, u, v, d) && (!kind || f.kind === kind));
}

// True when a through hole of Ø d at p would leave less than MIN_WEB of material to a different existing hole or to
// a bore in the board's edges.
export function clashes(part, p, d) {
  const [u, v] = toUV(part, p);
  const h = { u, v, d, through: true };
  return part.features.some((f) => f.type === 'hole' && !sameSpot(f, u, v, d) && Math.hypot(f.u - u, f.v - v) - (f.d + d) / 2 < MIN_WEB) || edgeBores(part).some((b) => boreWeb(h, b) < MIN_WEB);
}

// Distance from a point to a segment in the (u, v) plane (a groove's or a bore's centre line).
export function toSegment(u, v, g) {
  const du = g.u2 - g.u1;
  const dv = g.v2 - g.v1;
  const len2 = du * du + dv * dv;
  const t = len2 ? clamp(((u - g.u1) * du + (v - g.v1) * dv) / len2, 0, 1) : 0;
  return Math.hypot(u - (g.u1 + t * du), v - (g.v1 + t * dv));
}

// A bore of Ø d into the edge `edge` (its outward direction) at the world point p: its axis as a segment in the
// (u, v) plane, from the edge into the board, and the axis depth below face A.
function boreAt(part, edge, p, d, depth) {
  const into = AX[neg(edge)];
  const [u, v] = toUV(part, p);
  const du = dot(into, AX[part.frame.eu]) * depth;
  const dv = dot(into, AX[part.frame.ev]) * depth;
  return { u1: u, v1: v, u2: u + du, v2: v + dv, d, t: -dot(sub(p, part.frame.origin), AX[part.frame.n]) };
}

// Every bore in the edges of a board (confirmat threads, slide hooks).
export function edgeBores(part) {
  return part.edgeOps.flatMap((e) => e.world.map((p) => ({ ...boreAt(part, e.edge, p, e.d, e.depth), kind: e.kind })));
}

// Material between a face hole and a bore in an edge of the same board: apart in the plan of the face, or a blind
// hole that stops short of the bore across the thickness (face holes are drilled from face A).
export function boreWeb(h, b) {
  const plan = toSegment(h.u, h.v, b) - (h.d + b.d) / 2;
  const across = h.through ? -Infinity : b.t - b.d / 2 - h.depth;
  return Math.max(plan, across);
}

// True when a confirmat bore into the edge `edge` at p leaves MIN_WEB to every face hole of the board.
export function boreClear(part, edge, p) {
  const b = boreAt(part, edge, p, CONFIRMAT.edge, CONFIRMAT.edgeDepth);
  return part.features.every((f) => f.type !== 'hole' || boreWeb(f, b) >= MIN_WEB);
}

// Front and back rows of system holes (37 mm from the front edge, the back row a whole number of pitches behind).
export function systemRows(zEnd, backFront) {
  const front = zEnd - SYSTEM.row;
  const k = Math.floor((front - (backFront + SYSTEM.row)) / SYSTEM.pitch);
  return k > 0 ? [front, front - SYSTEM.pitch * k] : [front];
}

// Hinge height whose mounting-plate holes land on the system grid c + 64 + 32k (plate holes at y + dy).
export function snapHingeY(y, c, dy0 = -SYSTEM.pitch / 2) {
  const base = c + SYSTEM.start - dy0;
  return r1(base + SYSTEM.pitch * Math.round((y - base) / SYSTEM.pitch));
}
