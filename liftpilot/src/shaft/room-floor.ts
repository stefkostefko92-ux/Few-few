// The floor of the machine room in plan: its walls, the control panel and the free area in front of it (UNI EN
// 81-20:2020, 5.2.6.3.2.1 a)), the main switch by the door, the way through the door, and how rectangles on the floor
// stand to each other. What stands on the floor — the machine on its support with the diverting pulley's bedplate or
// stand, the governor, the main switch — comes in as rectangles. The ways from the door are in room-route.ts, the
// panel's checks and its place in room-panel.ts. Room axes as in RoomInputs (x along the front wall from the left, y
// from the front wall inwards) [mm]. Pure: the plan, the 3D, the checks and the form share it.
import { KV_VERT } from './norme-vert';
import type { RoomInputs } from './room';

/** A rectangle in the room's plan: [x0, y0, x1, y1] [mm]. */
export type Box = readonly [number, number, number, number];
/** A convex outline in the room's plan by its corners in order (a rectangle turned with the machine on a drop line
 *  askew) [mm]. */
export type Quad = readonly (readonly [number, number])[];
/** What stands on the floor: a rectangle on the room's axes, or a turned one by its corners. */
export type Outline = Box | Quad;

export const isBox = (o: Outline): o is Box => typeof o[0] === 'number';
const cornersOf = (o: Outline): Quad => (isBox(o) ? [[o[0], o[1]], [o[2], o[1]], [o[2], o[3]], [o[0], o[3]]] : o);
/** The rectangle round an outline. */
export function outlineBox(o: Outline): Box {
  if (isBox(o)) return o;
  const xs = o.map((p) => p[0]), ys = o.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
export type Wall = RoomInputs['panelWall'];

/** The walls in the order the software takes them for the panel when all else is equal. */
export const WALLS: readonly Wall[] = ['front', 'rear', 'left', 'right'];

export const alongX = (w: Wall): boolean => w === 'front' || w === 'rear';
/** A wall's length [mm]. */
export const wallLength = (R: RoomInputs, w: Wall): number => (alongX(w) ? R.W : R.D);

/** The rectangle along wall `w` from `at` for `len`, from `d0` to `d1` into the room. */
export function wallBox(R: RoomInputs, w: Wall, at: number, len: number, d0: number, d1: number): Box {
  if (w === 'front') return [at, d0, at + len, d1];
  if (w === 'rear') return [at, R.D - d1, at + len, R.D - d0];
  if (w === 'left') return [d0, at, d1, at + len];
  return [R.W - d1, at, R.W - d0, at + len];
}

export const panelBox = (R: RoomInputs): Box => wallBox(R, R.panelWall, R.panelAt, R.panelW, 0, R.panelD);

/** Where along its wall the free area in front of the panel runs (5.2.6.3.2.1 a)): as wide as the larger of
 *  KV_VERT.panelFreeWidth and the panel, centred on it and kept inside the wall. */
export function panelBand(R: RoomInputs): readonly [number, number] {
  const len = wallLength(R, R.panelWall), w = Math.max(KV_VERT.panelFreeWidth, R.panelW), c = R.panelAt + R.panelW / 2;
  const s0 = Math.min(Math.max(c - w / 2, 0), Math.max(0, len - w));
  return [s0, s0 + w];
}

/** The free area in front of the panel: its band, KV_VERT.panelFreeDepth deep from the panel's front. */
export function panelArea(R: RoomInputs): Box {
  const [s0, s1] = panelBand(R);
  return wallBox(R, R.panelWall, s0, s1 - s0, R.panelD, R.panelD + KV_VERT.panelFreeDepth);
}

/** The main switch as the plan draws it: 150 mm past the door's far jamb, 200 mm long; before the door when the wall
 *  ends first. Its box 130 mm deep (the 3D's). */
export const SWITCH = { gap: 150, len: 200, depth: 130 } as const;

/** Where the main switch runs along the door's wall [mm]. */
export function switchSpan(R: RoomInputs): readonly [number, number] {
  const len = wallLength(R, R.doorWall), after = R.doorAt + R.doorW + SWITCH.gap, before = R.doorAt - SWITCH.gap - SWITCH.len;
  return after + SWITCH.len <= len || before < 0 ? [after, after + SWITCH.len] : [before, before + SWITCH.len];
}

/** The main switch of the room below the shaft (lib/lift/bottom.ts), its middle along the door's wall [mm]: 300 mm
 *  before the door, or 100 mm past it when the door is near the corner — where its drawing and 3D have it. */
export const belowSwitchAt = (R: RoomInputs): number => (R.doorAt > 400 ? R.doorAt - 300 : R.doorAt + R.doorW + 100);

export function switchBox(R: RoomInputs): Box {
  const [a, b] = switchSpan(R);
  return wallBox(R, R.doorWall, a, b - a, 0, SWITCH.depth);
}

/** The way through the door: its clear opening carried KV_VERT.panelFreeDepth into the room, which the panel and the
 *  free area in front of it keep clear of (registry locale.quadro.posto). */
export const doorZone = (R: RoomInputs): Box => wallBox(R, R.doorWall, R.doorAt, R.doorW, 0, KV_VERT.panelFreeDepth);

/** Whether two rectangles overlap (touching is not). */
export const meets = (a: Box, b: Box): boolean => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** The gap between two rectangles [mm]: their distance apart, or minus the least shift that parts them. */
export function boxGap(a: Box, b: Box): number {
  const dx = Math.max(b[0] - a[2], a[0] - b[2]), dy = Math.max(b[1] - a[3], a[1] - b[3]);
  return dx >= 0 || dy >= 0 ? Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) : Math.max(dx, dy);
}

/** The gap between two convex outlines [mm]: their distance apart, or minus the least shift that parts them (on the
 *  axes of their sides); two rectangles on the room's axes as boxGap. */
export function outlineGap(a: Outline, b: Outline): number {
  if (isBox(a) && isBox(b)) return boxGap(a, b);
  const A = cornersOf(a), B = cornersOf(b), axes = [A, B].flatMap((P) => P.map((p, i) => {
    const q = P[(i + 1) % P.length], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l] as const;
  }));
  let pen = -Infinity;
  for (const [nx, ny] of axes) {
    const pa = A.map((p) => p[0] * nx + p[1] * ny), pb = B.map((p) => p[0] * nx + p[1] * ny);
    const sep = Math.max(Math.min(...pb) - Math.max(...pa), Math.min(...pa) - Math.max(...pb));
    if (sep >= 0) return Math.min(...A.map((p) => edgeDistance(p, B)), ...B.map((p) => edgeDistance(p, A)));
    pen = Math.max(pen, sep);
  }
  return pen;
}

/** The distance from a point to the nearest side of an outline by its corners. */
export function edgeDistance(p: readonly [number, number], P: Quad): number {
  let d = Infinity;
  P.forEach((a, i) => {
    const b = P[(i + 1) % P.length], ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / l2)) : 0;
    d = Math.min(d, Math.hypot(p[0] - a[0] - t * ex, p[1] - a[1] - t * ey));
  });
  return d;
}

/** Whether a point lies inside a convex outline by its corners (either way round). */
export function insideQuad(p: readonly [number, number], P: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (Math.abs(c) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(c);
    else if (Math.sign(c) !== sign) return false;
  }
  return true;
}

/** A convex outline's part between s0 and s1 along `coord` (0: x, 1: y): its corners, none when it lies outside. */
function clipTo(P: Quad, coord: 0 | 1, s0: number, s1: number): [number, number][] {
  let pts: [number, number][] = P.map((p) => [p[0], p[1]]);
  for (const [lim, keep] of [[s0, 1], [s1, -1]] as const) {
    const out: [number, number][] = [], inside = (q: readonly [number, number]): boolean => (q[coord] - lim) * keep >= 0;
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length];
      if (inside(a)) out.push(a);
      if (inside(a) !== inside(b)) {
        const t = (lim - a[coord]) / (b[coord] - a[coord]);
        out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    });
    pts = out;
    if (!pts.length) return pts;
  }
  return pts;
}

/** How deep the free area in front of the panel is [mm]: from the panel's front to the opposite wall, or to the nearest
 *  of `obstacles` that reaches into it (its near side from the panel's wall, so minus where it stands beside the panel
 *  or in it; a turned outline by its part in front of the panel). */
export function panelFree(R: RoomInputs, obstacles: readonly Outline[] = []): number {
  const w = R.panelWall, [s0, s1] = panelBand(R);
  let depth = (alongX(w) ? R.D : R.W) - R.panelD;
  // from the panel's wall: how far a point is
  const from = (p: readonly [number, number]): number => (w === 'front' ? p[1] : w === 'rear' ? R.D - p[1] : w === 'left' ? p[0] : R.W - p[0]);
  for (const o of obstacles) {
    if (!isBox(o)) {
      const part = clipTo(o, alongX(w) ? 0 : 1, s0, s1), ds = part.map(from);
      // (touching the band's edge only is not in it)
      const inBand = part.some((p) => (alongX(w) ? p[0] : p[1]) > s0 && (alongX(w) ? p[0] : p[1]) < s1);
      if (part.length && inBand && Math.max(...ds) > R.panelD) depth = Math.min(depth, Math.min(...ds) - R.panelD);
      continue;
    }
    const [x0, y0, x1, y1] = o, [b0, b1] = alongX(w) ? [x0, x1] : [y0, y1];
    // from the panel's wall: the obstacle's near and far sides
    const [near, far] = w === 'front' ? [y0, y1] : w === 'rear' ? [R.D - y1, R.D - y0] : w === 'left' ? [x0, x1] : [R.W - x1, R.W - x0];
    if (b0 < s1 && s0 < b1 && far > R.panelD) depth = Math.min(depth, near - R.panelD);
  }
  return depth;
}
