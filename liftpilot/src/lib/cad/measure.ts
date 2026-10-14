// Survey of the clear shaft on a drawing: from a point inside the shaft, four rays along the directions of the walls
// near it, each to the nearest segment of the visible layers. The rectangle they span is the clear shaft at that point.
// Pure: runs in the browser on the drawing, and in the tests.
import type { CadModel } from './model';

export interface Survey {
  /** point clicked, drawing units */
  x: number;
  y: number;
  /** direction of the first axis [rad], 0 ≤ angle < π/2, from the walls around the point */
  angle: number;
  /** distances from the point to the walls along +u, −u, +v, −v [drawing units] */
  right: number;
  left: number;
  up: number;
  down: number;
}

/** Wall of the surveyed rectangle holding the landing doors, in the frame of the survey. */
export type DoorSide = 'down' | 'up' | 'left' | 'right';

type Visible = (layer: number) => boolean;

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Direction of the walls around a point: histogram of the segment directions modulo 90°, weighted by length, over
 * the segments within the radius. Snaps to the drawing axes within half a degree.
 */
export function dominantAngle(m: CadModel, visible: Visible, x: number, y: number, radius: number): number {
  const bins = new Float64Array(180); // half-degree bins over 0…90°
  const s = m.seg;
  for (let i = 0; i < m.count; i++) {
    if (!visible(m.layerOf[i])) continue;
    const x1 = s[4 * i], y1 = s[4 * i + 1], x2 = s[4 * i + 2], y2 = s[4 * i + 3];
    if (distToSegment(x, y, x1, y1, x2, y2) > radius) continue;
    const len = Math.hypot(x2 - x1, y2 - y1);
    let deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    deg = ((deg % 90) + 90) % 90;
    bins[Math.min(179, Math.floor(deg * 2))] += len;
  }
  let best = 0;
  for (let b = 1; b < 180; b++) if (bins[b] > bins[best]) best = b;
  if (bins[best] === 0) return 0;
  // exact mean of the segments within a degree of the peak (angles unwrapped around it), weighted by length
  const peak = (best + 0.5) / 2;
  let sum = 0, w = 0;
  for (let i = 0; i < m.count; i++) {
    if (!visible(m.layerOf[i])) continue;
    const x1 = s[4 * i], y1 = s[4 * i + 1], x2 = s[4 * i + 2], y2 = s[4 * i + 3];
    if (distToSegment(x, y, x1, y1, x2, y2) > radius) continue;
    let deg = (((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI) % 90 + 90) % 90;
    if (deg - peak > 45) deg -= 90;
    else if (peak - deg > 45) deg += 90;
    if (Math.abs(deg - peak) > 1) continue;
    const len = Math.hypot(x2 - x1, y2 - y1);
    sum += deg * len;
    w += len;
  }
  const deg = (((sum / w) % 90) + 90) % 90;
  if (deg < 0.5 || deg > 89.5) return 0;
  return (deg * Math.PI) / 180;
}

/** Nearest hit of the ray from (x, y) along (dx, dy); Infinity when nothing is hit within maxDist. */
function ray(m: CadModel, visible: Visible, x: number, y: number, dx: number, dy: number, maxDist: number): number {
  const s = m.seg;
  let best = Infinity;
  for (let i = 0; i < m.count; i++) {
    if (!visible(m.layerOf[i])) continue;
    const ax = s[4 * i], ay = s[4 * i + 1], ex = s[4 * i + 2] - ax, ey = s[4 * i + 3] - ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const qx = ax - x, qy = ay - y;
    const t = (qx * ey - qy * ex) / den, u = (qx * dy - qy * dx) / den;
    if (t > 1e-9 && t < best && t <= maxDist && u >= -1e-9 && u <= 1 + 1e-9) best = t;
  }
  return best;
}

/**
 * The survey from a point: first one ray each way; then, for each direction, five parallel rays spread from 10 % to
 * 90 % across the shaft found so far, keeping the shortest. So a door opening, a niche or a window in a wall does not
 * let the measure run out of the shaft: the clear rectangle is the tightest one. Null when a ray hits nothing within
 * maxDist (the point is not closed in).
 */
export function castRays(m: CadModel, visible: Visible, x: number, y: number, angle: number, maxDist: number): Survey | null {
  const ux = Math.cos(angle), uy = Math.sin(angle), vx = -uy, vy = ux;
  // from the point shifted by a along u and b along v
  const from = (a: number, b: number, dx: number, dy: number): number => ray(m, visible, x + a * ux + b * vx, y + a * uy + b * vy, dx, dy, maxDist);
  let right = from(0, 0, ux, uy), left = from(0, 0, -ux, -uy), up = from(0, 0, vx, vy), down = from(0, 0, -vx, -vy);
  if (![right, left, up, down].every(Number.isFinite)) return null;
  const spread = (lo: number, hi: number): number[] => [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => -lo + f * (lo + hi));
  const refineV = (): void => {
    const at = spread(left, right);
    up = Math.min(...at.map((a) => from(a, 0, vx, vy)));
    down = Math.min(...at.map((a) => from(a, 0, -vx, -vy)));
  };
  const refineU = (): void => {
    const at = spread(down, up);
    right = Math.min(...at.map((b) => from(0, b, ux, uy)));
    left = Math.min(...at.map((b) => from(0, b, -ux, -uy)));
  };
  refineV();
  refineU();
  refineV();
  if (![right, left, up, down].every(Number.isFinite)) return null;
  return { x, y, angle, right, left, up, down };
}

/** Clear width (along the landing wall) and depth of the shaft [mm], rounded to the millimetre. */
export function shaftSize(s: Survey, mmPerUnit: number, door: DoorSide): { W: number; D: number } {
  const across = (s.left + s.right) * mmPerUnit, along = (s.up + s.down) * mmPerUnit;
  return door === 'down' || door === 'up' ? { W: Math.round(across), D: Math.round(along) } : { W: Math.round(along), D: Math.round(across) };
}

/** Corners of the surveyed rectangle in drawing units, counter-clockwise from the lower left. */
export function surveyCorners(s: Survey): [number, number][] {
  const ux = Math.cos(s.angle), uy = Math.sin(s.angle), vx = -uy, vy = ux;
  const at = (a: number, b: number): [number, number] => [s.x + a * ux + b * vx, s.y + a * uy + b * vy];
  return [at(-s.left, -s.down), at(s.right, -s.down), at(s.right, s.up), at(-s.left, s.up)];
}
