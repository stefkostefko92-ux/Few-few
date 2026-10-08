// The machine room's plan (room-view.ts): the control panel with the free area in front of it (UNI EN 81-20:2020,
// 5.2.6.3.2.1 a): as wide as the larger of 500 mm and the panel, crossed in front of the panel only, not through its
// name) and the main switch by the door (room-floor.ts switchSpan) with its name clear of them. Model entities, room
// axes [mm].
import { line, path, textWidth, type Box, type Entity, type Pt } from '../drawing';
import { KV_VERT } from './norme-vert';
import { panelBand, switchSpan } from './room-floor';
import type { RoomInputs } from './room';

const SWITCH_NAME = 'INTERRUTTORE GENERALE';

/** The panel, its free area and the main switch drawn, the switch's name clear of `gear` too (the machine's parts);
 *  the outlines and the name's place the rest of the plan keeps clear of. */
export function fittingsPlan(R: RoomInputs, gear: readonly Box[] = []): { entities: Entity[]; free: Pt[]; sw: Pt[]; swAt: Pt } {
  const side = R.panelWall === 'left' || R.panelWall === 'right', [b0, b1] = panelBand(R), pan = wallBox(R, R.panelWall, R.panelAt, R.panelW, R.panelD), free = wallBox(R, R.panelWall, b0, b1 - b0, R.panelD + KV_VERT.panelFreeDepth);
  const front = wallBand(R, R.panelWall, b0, b1 - b0, R.panelD, R.panelD + KV_VERT.panelFreeDepth);
  const [w0, w1] = switchSpan(R), sw = wallBox(R, R.doorWall, w0, w1 - w0, 120);
  const inward: Pt = R.doorWall === 'front' ? [0, 1] : R.doorWall === 'rear' ? [0, -1] : R.doorWall === 'left' ? [1, 0] : [-1, 0];
  const [swAt, onGear] = switchName(R, mid(sw), inward, [bbox(pan), bbox(free), ...gear]);
  return {
    entities: [
      path(free, true, 'space'), line(front[0], front[2], 'space'), line(front[1], front[3], 'space'),
      // (along a side wall the name runs along the panel, as on the room below's: below-view.ts)
      path(pan, true, 'outline', 'paper'), { e: 'text', at: mid(pan), text: 'QUADRO MANOVRA', size: 1.8, align: 'c', halo: true, fit: R.panelW - 60, ...(side ? { angle: 90 } : {}) },
      path(sw, true, 'outline', 'paper'), { e: 'text', at: swAt, text: SWITCH_NAME, size: 1.5, align: 'c', ...(onGear ? { halo: true } : {}) },
    ],
    free, sw, swAt,
  };
}

/** Where the main switch's name goes: 260 mm into the room from the switch at `c` as always; where its lettering (1:50 at
 *  most) would meet `busy` (the panel and the free area in front of it, the machine), the nearest place along the wall or
 *  further in that stays clear and in the room — none, where it was, and whether it lies on them (then on a halo). */
function switchName(R: RoomInputs, c: Pt, inward: Pt, busy: readonly Box[]): [Pt, boolean] {
  const hw = (textWidth(SWITCH_NAME, { size: 1.5 }) / 2 + 0.8) * 50, along: Pt = [Math.abs(inward[1]), Math.abs(inward[0])];
  const at = (d: number, k: number): Pt => [c[0] + inward[0] * d + along[0] * k, c[1] + inward[1] * d + along[1] * k - 30];
  const hits = (p: Pt): boolean => busy.some((b) => p[0] - hw < b.x1 && b.x0 < p[0] + hw && p[1] - 62.5 < b.y1 && b.y0 < p[1] + 107.5);
  const first = at(260, 0);
  if (!hits(first)) return [first, false];
  const inRoom = (p: Pt): boolean => p[0] - hw >= 0 && p[0] + hw <= R.W && p[1] - 62.5 >= 0 && p[1] + 107.5 <= R.D;
  const spots = [260, 460, 660].flatMap((d) => Array.from({ length: 41 }, (_, i) => ({ p: at(d, (i - 20) * 100), cost: Math.abs(i - 20) * 100 + 2 * (d - 260) })));
  const best = spots.filter((q) => inRoom(q.p) && !hits(q.p)).sort((a, b) => a.cost - b.cost)[0]?.p;
  return best ? [best, false] : [first, true];
}

/** The rectangle along a wall from it to `depth` into the room, its corners in order. */
function wallBox(R: RoomInputs, w: RoomInputs['panelWall'], at: number, len: number, depth: number): Pt[] {
  if (w === 'front') return [[at, 0], [at + len, 0], [at + len, depth], [at, depth]];
  if (w === 'rear') return [[at, R.D - depth], [at + len, R.D - depth], [at + len, R.D], [at, R.D]];
  if (w === 'left') return [[0, at], [depth, at], [depth, at + len], [0, at + len]];
  return [[R.W - depth, at], [R.W, at], [R.W, at + len], [R.W - depth, at + len]];
}

/** The band along a wall from depth d0 to d1 into the room, its corners in order. */
function wallBand(R: RoomInputs, w: RoomInputs['panelWall'], at: number, len: number, d0: number, d1: number): Pt[] {
  if (w === 'front') return [[at, d0], [at + len, d0], [at + len, d1], [at, d1]];
  if (w === 'rear') return [[at, R.D - d1], [at + len, R.D - d1], [at + len, R.D - d0], [at, R.D - d0]];
  if (w === 'left') return [[d0, at], [d1, at], [d1, at + len], [d0, at + len]];
  return [[R.W - d1, at], [R.W - d0, at], [R.W - d0, at + len], [R.W - d1, at + len]];
}

const mid = (p: Pt[]): Pt => [(p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2];

/** The rectangle round points. */
export const bbox = (p: readonly Pt[]): Box => ({
  x0: Math.min(...p.map((q) => q[0])), y0: Math.min(...p.map((q) => q[1])), x1: Math.max(...p.map((q) => q[0])), y1: Math.max(...p.map((q) => q[1])),
});
