// The machine room's wiring, as installers leave it: the controller's feed to the motor in a galvanized floor trunking
// (a lidded channel 100 × 60 mm) from the foot of the cabinet to under the end of the motor's conduit, square to the
// room's walls and clear of the rope openings, the bedframe, the pulleys' stands, the governor, the doorway and the
// steel lying on the floor (the HEB beams, a support's beams from wall to wall) — or, with no clear way, a floor box
// at the conduit's end (when that would stand on the floor's steel, at the nearest clear spot, the cable bent over the
// steel) and the cable under the screed; the main switch's feed in a grey conduit on saddles along the walls under
// the ceiling, over the door, down into the cabinet's top, each wall's part with that wall (it hides with the wall's
// x-ray). Plan and heights in millimetres, in the shaft's coordinates. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { KV_VERT, PROFILES, type HebLayout, type RoomInputs } from '@/shaft';
import { onWall, P, type Batch, type Point } from './geom';
import type { LiftMaterials, Side } from './materials';

type Pt = readonly [number, number];
/** A rectangle in plan [mm]. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// the trunking's half width and height, the clearance kept round what it passes, the floor box's half side; the
// conduit's radius and inset
const HALF = 50, HIGH = 60, CLEAR = 30, BOX = 70, PIPE = 12, INSET = 22;
/** What lies lower over the floor than this [mm] is in the trunking's way: the trunking's height and its clearance. */
export const FLOOR_REACH = HIGH + CLEAR;

/** The bounds of points, grown by g on every side. */
export function rectOf(pts: readonly Pt[], g = 0): Rect {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs) - g, y0: Math.min(...ys) - g, x1: Math.max(...xs) + g, y1: Math.max(...ys) + g };
}
/** The HEB beams lying on the floor (support.ts hebBeams), each its plan rectangle in the shaft's axes. */
export function hebRects(lay: HebLayout, R: RoomInputs): Rect[] {
  const b = PROFILES[lay.profile].b / 2, [e0, e1] = lay.ends, pw = KV_VERT.hebPlateW / 2;
  const rect = (a0: number, a1: number, c0: number, c1: number): Rect =>
    rectOf(lay.dir === 'x' ? [[a0 - R.shaftX, c0 - R.shaftY], [a1 - R.shaftX, c1 - R.shaftY]] : [[c0 - R.shaftX, a0 - R.shaftY], [c1 - R.shaftX, a1 - R.shaftY]]);
  // the beams, and their bearing plates over the walls, wider than the flanges (round 36)
  return lay.at.flatMap((c) => [rect(e0, e1, c - b, c + b), rect(e0, lay.span[0], c - pw, c + pw), rect(lay.span[1], e1, c - pw, c + pw)]);
}

/** A strip `half` either side of the line from a to b (plan) as rectangles: one when it runs square to the axes, else
 *  one per piece of at most 100 mm along it (the bounds of a skewed beam would close off half the room). */
export function stripRects(a: Pt, b: Pt, half: number): Rect[] {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  if (len < 1e-9) return [rectOf([a], half)];
  const nx = (-dy / len) * half, ny = (dx / len) * half, k = Math.min(Math.abs(dx), Math.abs(dy)) < 1e-6 * len ? 1 : Math.ceil(len / 100), out: Rect[] = [];
  for (let i = 0; i < k; i++) {
    const [p, q] = [i / k, (i + 1) / k].map((t) => [a[0] + dx * t, a[1] + dy * t] as const);
    out.push(rectOf([[p[0] + nx, p[1] + ny], [p[0] - nx, p[1] - ny], [q[0] + nx, q[1] + ny], [q[0] - nx, q[1] - ny]]));
  }
  return out;
}
const overlaps = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const within = (a: Rect, b: Rect): boolean => a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1;

/** The trunking's way from `from` (under the cabinet) to `to`, square to the wall the cabinet stands on (`out`: the
 *  unit plan vector away from it): out from the wall, along it at some depth, out again, and along it once more to
 *  the end (the shorter shapes are the same with legs of no length), past which it runs on by 60 mm. Of the ways with
 *  every leg clear of `blocked` and inside `room`, the shortest, each corner counted as 250 mm; null when none is. */
export function trunkingRoute(from: Pt, out: Pt, to: Pt, blocked: readonly Rect[], room: Rect): Pt[] | null {
  const along: Pt = [Math.abs(out[1]), Math.abs(out[0])];
  const uv = (p: Pt): Pt => [p[0] * along[0] + p[1] * along[1], p[0] * out[0] + p[1] * out[1]];
  const xy = (u: number, v: number): Pt => [along[0] * u + out[0] * v, along[1] * u + out[1] * v];
  const [uF, vF] = uv(from), [uT, vT] = uv(to);
  const clear = (way: readonly Pt[]): boolean => way.slice(1).every((q, i) => {
    const r = rectOf([way[i], q], HALF);
    return within(r, room) && !blocked.some((b) => overlaps(rectOf([[r.x0, r.y0], [r.x1, r.y1]], CLEAR), b));
  });
  const offs = [0];
  for (let k = 1; k <= 30; k++) offs.push(-60 * k, 60 * k);
  let best: { way: Pt[]; cost: number } | null = null;
  for (const dm of offs) {
    const m = vT + dm;
    if (m < vF + 160) continue;
    for (const du of offs) {
      const uk = uT + du, raw = [xy(uF, vF), xy(uF, m), xy(uk, m), xy(uk, vT), xy(uT, vT)];
      const pts = raw.filter((p, i) => i === 0 || Math.hypot(p[0] - raw[i - 1][0], p[1] - raw[i - 1][1]) > 1);
      if (pts.length < 2) continue;
      const [a, b] = [pts[pts.length - 2], pts[pts.length - 1]], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const way = [...pts.slice(0, -1), [b[0] + ((b[0] - a[0]) / l) * 60, b[1] + ((b[1] - a[1]) / l) * 60] as const];
      const cost = way.slice(1).reduce((t, q, i) => t + Math.hypot(q[0] - way[i][0], q[1] - way[i][1]), 0) + 250 * (way.length - 2);
      if (best && cost >= best.cost) continue;
      if (clear(way)) best = { way, cost };
    }
  }
  return best?.way ?? null;
}

/** Where the floor box stands: under `end`, unless that puts it on the floor's `steel` (or within CLEAR of it); then
 *  the nearest spot (10 mm steps, at most 600 mm away) inside `room`, CLEAR off the steel and off all else `blocked`
 *  that the box under the end kept off (the bounds of a skewed bedframe may hold the end: no reason to go further); under
 *  the end when there is none. */
export function floorBoxAt(end: Pt, steel: readonly Rect[], blocked: readonly Rect[], room: Rect): Pt {
  const near = (x: number, y: number): Rect => ({ x0: x - BOX - CLEAR, y0: y - BOX - CLEAR, x1: x + BOX + CLEAR, y1: y + BOX + CLEAR });
  const at = near(end[0], end[1]);
  if (!steel.some((b) => overlaps(at, b))) return end;
  const keep = [...steel, ...blocked.filter((b) => !overlaps(at, b))];
  let best: Pt = end, least = Infinity;
  for (let i = -60; i <= 60; i++) for (let j = -60; j <= 60; j++) {
    const k = Math.hypot(i, j), x = end[0] + 10 * i, y = end[1] + 10 * j, g = near(x, y);
    if (k < least && k <= 60 && within({ x0: x - BOX, y0: y - BOX, x1: x + BOX, y1: y + BOX }, room) && !keep.some((b) => overlaps(g, b))) [best, least] = [[x, y], k];
  }
  return best;
}

/** The floor's steel the floor box keeps off, what else it keeps off when it moves, the room, and how high the steel
 *  stands [mm] (the cable bends over it). */
export interface FloorSpot {
  steel: readonly Rect[];
  blocked: readonly Rect[];
  room: Rect;
  over: number;
}

/** The motor's cable from the gland on the lid at `at` up to the end of its conduit, `h` over the floor [mm, heights
 *  from the floor]: straight up when under it, else up over what it passes (`over` high) with a clearance, across to
 *  under the end, and up. */
export function cableRun(end: Pt, at: Pt, h: number, over: number): Point[] {
  const top = HIGH + 10;
  if (Math.hypot(at[0] - end[0], at[1] - end[1]) < 1) return h > top ? [[end[0], end[1], top], [end[0], end[1], h]] : [];
  const k = Math.min(Math.max(h, top), Math.max(top + 30, over + 40));
  return [[at[0], at[1], top], [at[0], at[1], k], [end[0], end[1], k], [end[0], end[1], h]];
}

/** The trunking along the way on the floor at z0 [mm], the motor's cable dropping into its lid at the end (its height
 *  over the floor h); with no way, a floor box under the end or, when that is on the floor's steel, at the nearest
 *  clear spot (floorBoxAt), the cable bent over the steel between them (cableRun). */
export function trunking(B: Batch, M: LiftMaterials, way: readonly Pt[] | null, end: Pt, h: number, z0: number, spot: FloorSpot | null = null): void {
  const at = way || !spot ? end : floorBoxAt(end, spot.steel, spot.blocked, spot.room);
  if (way) {
    for (let i = 1; i < way.length; i++) {
      const r = rectOf([way[i - 1], way[i]], HALF);
      if (r.x1 - r.x0 <= 2 * HALF + 1 && r.y1 - r.y0 <= 2 * HALF + 1) continue;
      B.box(r.x0, r.y0, z0, r.x1, r.y1, z0 + HIGH - 4, M.galv);
      B.box(r.x0 - 2, r.y0 - 2, z0 + HIGH - 4, r.x1 + 2, r.y1 + 2, z0 + HIGH, M.galv);
    }
  } else B.box(at[0] - BOX, at[1] - BOX, z0, at[0] + BOX, at[1] + BOX, z0 + HIGH, M.galv);
  // the gland on the lid and the cable out of it, a bend where it turns
  B.rod([at[0], at[1], z0 + HIGH], [at[0], at[1], z0 + HIGH + 10], 14, M.rubber, 14);
  const run = cableRun(end, at, h, spot?.over ?? 0).map(([x, y, z]) => [x, y, z0 + z] as const).filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1], p[2] - a[i - 1][2]) > 0.5);
  for (let i = 1; i < run.length; i++) {
    B.rod(run[i - 1], run[i], 11, M.rubber, 12);
    if (i < run.length - 1) B.add(new THREE.SphereGeometry(0.011, 12, 8).translate(...P(...run[i]).toArray()), M.rubber);
  }
}

/** The main switch's feed: up from the switch's top (its centre at `switchAt` along the door's wall, `switchTop`
 *  high), round the walls under the ceiling the short way, down into the cabinet's top; each part into the batch of
 *  the wall it runs along (`B`, by side). The room's corner at (x0, y0) of the shaft's plan, its floor at z0. */
export function mainFeed(B: Record<Side, Batch>, M: LiftMaterials, R: RoomInputs, x0: number, y0: number, z0: number, switchAt: number, switchTop: number): void {
  const Wr = R.W, Dr = R.D, L = 2 * (Wr + Dr), zc = z0 + R.H - 70;
  // the walls in turn round the room, each point by its distance along them
  const per = (side: Side, u: number): number => (side === 'front' ? u : side === 'right' ? Wr + u : side === 'rear' ? Wr + Dr + (Wr - u) : 2 * Wr + Dr + (Dr - u));
  const sideAt = (p: number): Side => {
    const q = ((p % L) + L) % L;
    return q <= Wr ? 'front' : q <= Wr + Dr ? 'right' : q <= 2 * Wr + Dr ? 'rear' : 'left';
  };
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  const pointAt = (p: number): Pt => {
    const q = ((p % L) + L) % L;
    if (q <= Wr) return [x0 + clamp(q, INSET, Wr - INSET), y0 + INSET];
    if (q <= Wr + Dr) return [x0 + Wr - INSET, y0 + clamp(q - Wr, INSET, Dr - INSET)];
    if (q <= 2 * Wr + Dr) return [x0 + clamp(2 * Wr + Dr - q, INSET, Wr - INSET), y0 + Dr - INSET];
    return [x0 + INSET, y0 + clamp(L - q, INSET, Dr - INSET)];
  };
  const p0 = per(R.doorWall, switchAt), p1 = per(R.panelWall, R.panelAt + R.panelW * 0.7);
  const dir = (((p1 - p0) % L) + L) % L <= L / 2 ? 1 : -1, dist = (c: number): number => (((dir * (c - p0)) % L) + L) % L, len = dist(p1);
  const corners = [0, Wr, Wr + Dr, 2 * Wr + Dr].filter((c) => dist(c) > 0 && dist(c) < len).sort((a, b) => dist(a) - dist(b));
  const at = [p0, ...corners, p1], pts = at.map(pointAt), [sx, sy] = pts[0], [ex, ey] = pts[pts.length - 1];
  const bend = (into: Batch, [x, y]: Pt): void => into.add(new THREE.SphereGeometry(PIPE / 1000, 12, 8).translate(...P(x, y, zc).toArray()), M.panel);
  B[R.doorWall].rod([sx, sy, switchTop], [sx, sy, zc], PIPE, M.panel, 12);
  B[R.panelWall].rod([ex, ey, zc], [ex, ey, z0 + R.panelH], PIPE, M.panel, 12);
  bend(B[R.doorWall], pts[0]);
  bend(B[R.panelWall], pts[pts.length - 1]);
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]], alongX = Math.abs(b[0] - a[0]) > 1, n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 600));
    // the wall it runs along: the one under its middle
    const W = B[sideAt(p0 + (dir * (dist(at[i - 1]) + dist(at[i]))) / 2)];
    W.rod([a[0], a[1], zc], [b[0], b[1], zc], PIPE, M.panel, 12);
    // the bend at the corner, and the saddles that hold the conduit off the wall
    bend(W, b);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, [hx, hy] = alongX ? [8, INSET] : [INSET, 8];
      W.box(x - hx, y - hy, zc - PIPE - 3, x + hx, y + hy, zc + PIPE + 3, M.galv);
    }
  }
}

/** A wall's point (u along it, v out of it) in the shaft's plan, the room's corner at (x0, y0). */
export const roomPoint = (R: RoomInputs, x0: number, y0: number, wall: Side, u: number, v: number): Pt => {
  const [x, y] = onWall(wall, R.W, R.D, u, v);
  return [x + x0, y + y0];
};
