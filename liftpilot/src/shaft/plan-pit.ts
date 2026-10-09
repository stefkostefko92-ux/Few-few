// What the plan of the pit adds to the buffers and the refuge space (round 36): the counterweight's screen (screen.ts),
// the access ladder and the pit's control box (pit-kit.ts), and where the tag of the car buffers' load (P6) stands — off
// the rails' line and their brackets, off the axes, clear of the other tags, so that its leader plainly ends at the
// buffer and never reads as a load on a rail's foot. Pure.
import type { Box, Entity, Pt } from '../drawing';
import { pitKitPlan } from './pit-kit';
import { RAILS } from './rails';
import { screenPlan } from './screen';
import { TAG_SCALE, letteringBoxes } from './tag-place';
import type { Layout } from './types';

/** How far a tag stands from what it points at, and the room its circle takes [mm, at the plan's usual 1:20]. */
const OFF = 230, ROOM = 95;

/** `taken`: the boxes of the plan's lettering so far, at its `scale` (lettering-place.ts): the screen's and the kit's
 *  keep off them and off each other — the names among them (`names`, and the screen's for the kit) above all, a
 *  dimension's line where nothing else is free. */
export const pitPlanExtras = (L: Layout, taken: Box[] = [], scale: number = TAG_SCALE, names: readonly Box[] = []): Entity[] => {
  const screen = screenPlan(L, taken, scale);
  return [...screen, ...pitKitPlan(L, taken, scale, letteringBoxes(screen.filter((e) => e.e !== 'path'), scale), names)];
};

/** The place of the tag of a car buffer at `c`: round it at 230 mm, the first of the directions square to the rails'
 *  line (toward the front, then the rear; across the shaft on a cantilever sling), then the diagonals, whose circle keeps
 *  off the rails and their brackets, the axes and the tags already placed (`taken`). */
export function bufferTagAt(L: Layout, c: Pt, taken: readonly Pt[]): Pt {
  const central = L.frame.kind === 'central', cx = L.car.x + L.car.w / 2;
  const square: Pt[] = central ? [[0, -1], [0, 1]] : [[1, 0], [-1, 0]], d = Math.SQRT1_2;
  const dirs: Pt[] = [...square, [d, -d], [-d, -d], [d, d], [-d, d], ...(central ? [[1, 0], [-1, 0]] as Pt[] : [[0, -1], [0, 1]] as Pt[])];
  // each rail with its bracket out to its wall
  const rails = L.rails.map((r) => {
    const s = RAILS[r.kind === 'car' ? L.inputs.carRail : L.inputs.cwRail], tx = r.bracketAxis === 'x' ? r.bracketTo : r.x, ty = r.bracketAxis === 'y' ? r.bracketTo : r.y;
    return { x0: Math.min(r.x, tx) - s.b, x1: Math.max(r.x, tx) + s.b, y0: Math.min(r.y, ty) - s.b, y1: Math.max(r.y, ty) + s.b };
  });
  const lineY = central ? L.frame.axis : null, lineX = central ? null : L.frame.axis;
  const clear = (p: Pt): boolean =>
    rails.every((b) => p[0] < b.x0 - ROOM || p[0] > b.x1 + ROOM || p[1] < b.y0 - ROOM || p[1] > b.y1 + ROOM)
    && (lineY === null || Math.abs(p[1] - lineY) > ROOM) && (lineX === null || Math.abs(p[0] - lineX) > ROOM) && Math.abs(p[0] - cx) > ROOM
    && taken.every((t) => Math.hypot(p[0] - t[0], p[1] - t[1]) > 2 * ROOM);
  for (const [ux, uy] of dirs) {
    const p: Pt = [c[0] + ux * OFF, c[1] + uy * OFF];
    if (clear(p)) return p;
  }
  return [c[0] + square[0][0] * OFF, c[1] + square[0][1] * OFF];
}
