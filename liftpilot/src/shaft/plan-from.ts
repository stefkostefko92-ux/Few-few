// Where the extension lines of the plan's dimensions start (plan-dims.ts): at the element each point measures, on its
// face nearest the side of the plan the chain stands on — the car's, the car's inside, the counterweight's, a rail's
// flange or blade, a sill's end, the operator's front, a buffer's rim —, or at the end of an axis drawn past the walls
// (plan-view.ts). A point on a wall of the shaft keeps the default: the edge of the drawing. Model millimetres.
import type { Side } from '../drawing';
import { onWall } from './plan-walls';
import { RAILS } from './rails';
import type { Layout, Rail, Wall } from './types';

export interface Area {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** How far the axes run past the outer face of the walls (plan-view.ts). */
export const AXIS_OVER = 250;

/** The face of an area nearest a side of the plan. */
export const faceOf = (b: Area, side: Side): number => (side === 'top' ? b.y1 : side === 'bottom' ? b.y0 : side === 'left' ? b.x0 : b.x1);

export const areaOf = (r: { x: number; y: number; w: number; h: number }): Area => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h });

/** A part laid along a wall, u along it and v into the shaft from its inner face. */
export function wallArea(L: Layout, w: Wall, u0: number, v0: number, u1: number, v1: number): Area {
  const [a, b] = [onWall(L, w, u0, v0), onWall(L, w, u1, v1)];
  return { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) };
}

const dirOf = (r: Rail): readonly [number, number] => (r.dir === 'right' ? [1, 0] : r.dir === 'left' ? [-1, 0] : r.dir === 'back' ? [0, 1] : [0, -1]);

/** A rail seen from a side: the edge nearest that side of its flange (`foot`) or of its blade's tip (`tip`), across
 *  the rail's direction (a chain on that side measures where its foot or its tip stands along the rail). */
export function railFace(L: Layout, r: Rail, side: Side, part: 'foot' | 'tip'): number {
  const s = RAILS[r.kind === 'car' ? L.inputs.carRail : L.inputs.cwRail], half = (part === 'foot' ? s.b : s.k) / 2, [ux] = dirOf(r);
  // a rail pointing along x has its flange across y, and the other way round
  const c = ux !== 0 ? r.y : r.x, up = side === 'top' || side === 'right';
  return up ? c + half : c - half;
}

/** The outer end toward a side of an axis drawn across the plan past its walls: the car's, the rails' (plan-view.ts). */
export function axisEnd(L: Layout, side: Side): number {
  const { W, D, wall } = L.inputs, over = wall + AXIS_OVER;
  return side === 'top' ? D + over : side === 'bottom' ? -over : side === 'left' ? -over : W + over;
}

/** The end of a side counterweight's axis toward a side (along y, 80 past it; plan-view.ts). */
export function cwAxisEnd(L: Layout, side: Side): number {
  const c = L.cw;
  if (L.cwSide === 'rear') return side === 'top' ? L.inputs.D + L.inputs.wall + AXIS_OVER : c.y - 60;
  return side === 'top' ? c.y + c.h + 80 : c.y - 80;
}
