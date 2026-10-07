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

/** How deep the free area in front of the panel is [mm]: from the panel's front to the opposite wall, or to the nearest
 *  of `obstacles` that reaches into it (its near side from the panel's wall, so minus where it stands beside the panel
 *  or in it). */
export function panelFree(R: RoomInputs, obstacles: readonly Box[] = []): number {
  const w = R.panelWall, [s0, s1] = panelBand(R);
  let depth = (alongX(w) ? R.D : R.W) - R.panelD;
  for (const [x0, y0, x1, y1] of obstacles) {
    const [b0, b1] = alongX(w) ? [x0, x1] : [y0, y1];
    // from the panel's wall: the obstacle's near and far sides
    const [near, far] = w === 'front' ? [y0, y1] : w === 'rear' ? [R.D - y1, R.D - y0] : w === 'left' ? [x0, x1] : [R.W - x1, R.W - x0];
    if (b0 < s1 && s0 < b1 && far > R.panelD) depth = Math.min(depth, near - R.panelD);
  }
  return depth;
}
