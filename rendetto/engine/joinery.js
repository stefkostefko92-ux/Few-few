// Joinery shared by the generators: confirmat joints, the 32 mm system, back grooves and hole bookkeeping.
import { hole, holeThrough, edgeHoles, toUV, THROUGH_EXTRA } from './panel.js';
import { r1 } from './util.js';

export const SYSTEM = { row: 37, pitch: 32, d: 5, depth: 12, start: 64 };
export const CONFIRMAT = { face: 7, edge: 5, edgeDepth: 50, maxPitch: 220 };
export const GROOVE = { inset: 16, width: 4, depth: 8, clearance: 1 };
export const HDF_T = 3;
export const PILOT = { d: 3, depth: 10 };
export const MIN_WEB = 2; // material left between two holes, mm

// Evenly spaced confirmat positions between z0 and z1, at most maxPitch apart.
export function confirmatZs(z0, z1) {
  const span = z1 - z0;
  const n = Math.max(2, Math.ceil(span / CONFIRMAT.maxPitch) + 1);
  return Array.from({ length: n }, (_, i) => r1(z0 + (span * i) / (n - 1)));
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

// True when a hole of Ø d at p would leave less than MIN_WEB of material to a different existing hole.
export function clashes(part, p, d) {
  const [u, v] = toUV(part, p);
  return part.features.some((f) => f.type === 'hole' && !sameSpot(f, u, v, d) && Math.hypot(f.u - u, f.v - v) - (f.d + d) / 2 < MIN_WEB);
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
