// The machine room's wiring, as installers leave it: the controller's feed to the motor in a galvanized floor trunking
// (a lidded channel 100 × 60 mm) from the foot of the cabinet to under the end of the motor's conduit, square to the
// room's walls and clear of the rope openings, the bedframe, the pulleys' stands, the governor and the doorway — or,
// with no clear way, a floor box at the conduit's end and the cable under the screed; the main switch's feed in a grey
// conduit on saddles along the walls under the ceiling, over the door, down into the cabinet's top. Plan and heights
// in millimetres, in the shaft's coordinates. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import type { RoomInputs } from '@/shaft';
import { onWall, P, type Batch } from './geom';
import type { LiftMaterials, Side } from './materials';

type Pt = readonly [number, number];
/** A rectangle in plan [mm]. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// the trunking's half width and height, the clearance kept round what it passes; the conduit's radius and inset
const HALF = 50, HIGH = 60, CLEAR = 30, PIPE = 12, INSET = 22;

/** The bounds of points, grown by g on every side. */
export function rectOf(pts: readonly Pt[], g = 0): Rect {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs) - g, y0: Math.min(...ys) - g, x1: Math.max(...xs) + g, y1: Math.max(...ys) + g };
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

/** The trunking along the way on the floor at z0 [mm], the motor's cable dropping into its lid at the end (its height
 *  over the floor h); with no way, a floor box under the end. */
export function trunking(B: Batch, M: LiftMaterials, way: readonly Pt[] | null, end: Pt, h: number, z0: number): void {
  if (way) {
    for (let i = 1; i < way.length; i++) {
      const r = rectOf([way[i - 1], way[i]], HALF);
      if (r.x1 - r.x0 <= 2 * HALF + 1 && r.y1 - r.y0 <= 2 * HALF + 1) continue;
      B.box(r.x0, r.y0, z0, r.x1, r.y1, z0 + HIGH - 4, M.galv);
      B.box(r.x0 - 2, r.y0 - 2, z0 + HIGH - 4, r.x1 + 2, r.y1 + 2, z0 + HIGH, M.galv);
    }
  } else B.box(end[0] - 70, end[1] - 70, z0, end[0] + 70, end[1] + 70, z0 + HIGH, M.galv);
  // the gland on the lid and the cable's drop into it
  B.rod([end[0], end[1], z0 + HIGH], [end[0], end[1], z0 + HIGH + 10], 14, M.rubber, 14);
  if (h > HIGH + 10) B.rod([end[0], end[1], z0 + HIGH + 10], [end[0], end[1], z0 + h], 11, M.rubber, 12);
}

/** The main switch's feed: up from the switch's top (its centre at `switchAt` along the door's wall, `switchTop`
 *  high), round the walls under the ceiling the short way, down into the cabinet's top. The room's corner at (x0, y0)
 *  of the shaft's plan, its floor at z0. */
export function mainFeed(B: Batch, M: LiftMaterials, R: RoomInputs, x0: number, y0: number, z0: number, switchAt: number, switchTop: number): void {
  const Wr = R.W, Dr = R.D, L = 2 * (Wr + Dr), zc = z0 + R.H - 70;
  // the walls in turn round the room, each point by its distance along them
  const per = (side: Side, u: number): number => (side === 'front' ? u : side === 'right' ? Wr + u : side === 'rear' ? Wr + Dr + (Wr - u) : 2 * Wr + Dr + (Dr - u));
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
  const pts = [p0, ...corners, p1].map(pointAt), [sx, sy] = pts[0], [ex, ey] = pts[pts.length - 1];
  B.rod([sx, sy, switchTop], [sx, sy, zc], PIPE, M.panel, 12);
  B.rod([ex, ey, zc], [ex, ey, z0 + R.panelH], PIPE, M.panel, 12);
  for (const [x, y] of [pts[0], pts[pts.length - 1]]) B.add(new THREE.SphereGeometry(PIPE / 1000, 12, 8).translate(...P(x, y, zc).toArray()), M.panel);
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]], alongX = Math.abs(b[0] - a[0]) > 1, n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 600));
    B.rod([a[0], a[1], zc], [b[0], b[1], zc], PIPE, M.panel, 12);
    // the bend at the corner, and the saddles that hold the conduit off the wall
    B.add(new THREE.SphereGeometry(PIPE / 1000, 12, 8).translate(...P(b[0], b[1], zc).toArray()), M.panel);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, [hx, hy] = alongX ? [8, INSET] : [INSET, 8];
      B.box(x - hx, y - hy, zc - PIPE - 3, x + hx, y + hy, zc + PIPE + 3, M.galv);
    }
  }
}

/** A wall's point (u along it, v out of it) in the shaft's plan, the room's corner at (x0, y0). */
export const roomPoint = (R: RoomInputs, x0: number, y0: number, wall: Side, u: number, v: number): Pt => {
  const [x, y] = onWall(wall, R.W, R.D, u, v);
  return [x + x0, y + y0];
};
