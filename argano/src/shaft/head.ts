// The shaft at the top floor and in the headroom (testata), where an old building's walls may stand elsewhere than at
// the main floor: their inner faces (the box the plan of the headroom is drawn in), the rails' brackets reaching them,
// and what they must keep clear of — the car and the counterweight running past them, the landing doors of the top
// floor in line with the car, the rails' feet (registry distanze.testata). Pure.
import { check } from './checks';
import { KV } from './norme';
import { KV_VERT } from './norme-vert';
import { RAILS } from './rails';
import type { DoorLayout, HeadWalls, Layout, Rail, ShaftCheck, ShaftInputs, Wall } from './types';

export const NO_HEAD: HeadWalls = { front: 0, rear: 0, left: 0, right: 0 };
const WALLS: readonly Wall[] = ['front', 'rear', 'left', 'right'];

export const headOf = (I: ShaftInputs): HeadWalls => I.head ?? NO_HEAD;
export const hasHead = (I: ShaftInputs): boolean => WALLS.some((w) => headOf(I)[w] !== 0);

/** Inner faces of the shaft in plan [mm]: x0 the left wall, x1 the right, y0 the front, y1 the rear. */
export interface WallBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export const mainBox = (I: ShaftInputs): WallBox => ({ x0: 0, x1: I.W, y0: 0, y1: I.D });

export function headBox(I: ShaftInputs): WallBox {
  const h = headOf(I);
  return { x0: h.left, x1: I.W - h.right, y0: h.front, y1: I.D - h.rear };
}

/** A rail whose bracket reaches its wall where that wall stands in the headroom: a bracket to a wall (or to the back of
 *  its niche) ends that much nearer or further; one to a bridge stays. */
export function headRail(I: ShaftInputs, r: Rail): Rail {
  const h = headOf(I), x = r.bracketAxis === 'x', far = x ? I.W : I.D, [lo, hi] = x ? [h.left, h.right] : [h.front, h.rear];
  return { ...r, bracketTo: r.bracketTo <= 0 ? r.bracketTo + lo : r.bracketTo >= far ? r.bracketTo - hi : r.bracketTo };
}

type Box4 = readonly [number, number, number, number];

/** A box from (u0, v0) to (u1, v1) on a wall (u along it, v into the shaft from its face at the main floor). */
function onWall(I: ShaftInputs, w: Wall, u0: number, v0: number, u1: number, v1: number): Box4 {
  const a = w === 'front' ? [u0, v0] : w === 'rear' ? [u0, I.D - v0] : w === 'left' ? [v0, u0] : [I.W - v0, u0];
  const b = w === 'front' ? [u1, v1] : w === 'rear' ? [u1, I.D - v1] : w === 'left' ? [v1, u1] : [I.W - v1, u1];
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
}

/** A rail's section in plan: from its tip back to the foot, the foot's width across. */
function railBox(I: ShaftInputs, r: Rail): Box4 {
  const s = RAILS[r.kind === 'car' ? I.carRail : I.cwRail], [ux, uy] = r.dir === 'right' ? [1, 0] : r.dir === 'left' ? [-1, 0] : r.dir === 'back' ? [0, 1] : [0, -1];
  const fx = r.x - ux * s.h, fy = r.y - uy * s.h, half = s.b / 2;
  const xs = [r.x, fx, fx - uy * half, fx + uy * half], ys = [r.y, fy, fy + ux * half, fy - ux * half];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Clearances from the walls that stand elsewhere in the headroom [mm]: of what runs (the car with its door sills and
 *  operators, the counterweight) and of what stands (the landing doors of the top floor, the rails' feet, a side
 *  counterweight's bridge); below 0 inside a wall. The walls as at the main floor are the plan's own checks. */
export function headClearances(L: Layout): { moving: number; fixed: number } {
  const I = L.inputs, B = headBox(I), h = headOf(I), top = I.vertical.floors.length - 1, v0 = I.landingDepth + I.sillGap;
  const moved = WALLS.filter((w) => h[w] !== 0);
  const clear = ([x0, y0, x1, y1]: Box4): number => {
    const d: Record<Wall, number> = { left: x0 - B.x0, right: B.x1 - x1, front: y0 - B.y0, rear: B.y1 - y1 };
    return Math.min(Infinity, ...moved.map((w) => d[w]));
  };
  const { car, cw } = L, served = I.vertical.floors[top]?.door ?? '';
  const moving: Box4[] = [[car.x, car.y, car.x + car.w, car.y + car.h], [cw.x, cw.y, cw.x + cw.w, cw.y + cw.h]];
  const fixed: Box4[] = L.rails.map((r) => railBox(I, r));
  for (const d of L.doors) {
    moving.push(onWall(I, d.wall, Math.min(d.op0, d.u0 - 40), v0, Math.max(d.op1, d.u1 + 40), v0 + KV.doorOpDepth));
    if (served.includes(d.side)) fixed.push(onWall(I, d.wall, d.frame0, 0, d.frame1, I.landingDepth));
  }
  if (L.bridge) fixed.push([L.bridge.x - 25, L.bridge.y0, L.bridge.x + 25, L.bridge.y1]);
  return { moving: Math.min(...moving.map(clear)), fixed: Math.min(...fixed.map(clear)) };
}

/** How much further the walls of the top floor's entrances stand from the car than at the main floor [mm]. */
export function headFacingExtra(I: ShaftInputs, doors: readonly DoorLayout[]): number {
  const h = headOf(I), served = I.vertical.floors[I.vertical.floors.length - 1]?.door ?? '';
  return Math.max(0, ...doors.filter((d) => served.includes(d.side)).map((d) => -h[d.wall]));
}

/** The check of the headroom's walls: the running parts KV_VERT.headRun clear at least (closer: a warning), nothing
 *  inside a wall. Null when the walls are as at the main floor. */
export function headCheck(L: Layout): ShaftCheck | null {
  if (!hasHead(L.inputs)) return null;
  const { moving, fixed } = headClearances(L), value = Math.round(Math.min(moving, fixed < 0 ? fixed : Infinity));
  return check('v_head', value >= KV_VERT.headRun, value, KV_VERT.headRun, 0, 'mm', value >= 0);
}
