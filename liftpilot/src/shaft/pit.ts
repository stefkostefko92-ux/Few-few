// The pit in plan: the refuge space under the middle of the car and where the buffers stand — the car's under the
// platform, the counterweight's under the counterweight —, as set by hand (plan.bufX, bufY, bufSpan, cwBufPos) or as
// the software puts them: one car buffer under the middle of the car; two or more 160 mm in from the platform's sides
// on the car's middle line (more than two in two rows a quarter of the car's depth from it); the counterweight's under
// its middle. The plan, section A-A, their dimensions, the check and the 3D all take them from here. Pure.
import type { Box, Pt } from '../drawing';
import { check } from './checks';
import { KV_VERT } from './norme-vert';
import type { Layout, ShaftCheck } from './types';

/** The buffers' radius as drawn (the striker plate's), car and counterweight [mm]. */
export const BUFFER_R = { car: 75, cw: 60 } as const;
/** Two or more car buffers by default: their axes this far in from the platform's sides [mm]. */
const SIDE_IN = 160;

export interface BufferSpot {
  c: Pt;
  r: number;
  kind: 'car' | 'cw';
}

export interface BufferPlan {
  /** the car buffers: the middle between the outer ones from the left wall, their line (the middle of their two rows)
   *  from the front wall [mm] */
  x: number;
  y: number;
  /** between the axes of the outer car buffers across the car; null with one buffer [mm] */
  span: number | null;
  /** the rows of car buffers from the front wall: one, or two with more than two buffers [mm] */
  rows: number[];
  /** the counterweight's buffer along the wall the counterweight stands by: x at the back, y on a side [mm] */
  cwPos: number;
  spots: BufferSpot[];
}

/** In the pit, under the middle of the car: the refuge space, its long side along the car's longer one. */
export function pitSpace(L: Layout): Box {
  const ci = L.carInner, [a, b] = KV_VERT.refugePlan[L.inputs.vertical.pitRefuge], [w, h] = ci.h >= ci.w ? [a, b] : [b, a];
  const x0 = ci.x + (ci.w - w) / 2, y0 = ci.y + (ci.h - h) / 2;
  return { x0, y0, x1: x0 + w, y1: y0 + h };
}

export function bufferPlan(L: Layout): BufferPlan {
  const fix = L.inputs.plan ?? {}, n = Math.max(1, L.inputs.vertical.carBuffers), car = L.car, cw = L.cw, rear = L.cwSide === 'rear';
  const x = fix.bufX ?? car.x + car.w / 2, y = fix.bufY ?? car.y + car.h / 2;
  const span = n > 1 ? fix.bufSpan ?? car.w - 2 * SIDE_IN : null, rows = n > 2 ? [y - car.h / 4, y + car.h / 4] : [y];
  const cwPos = fix.cwBufPos ?? (rear ? cw.x + cw.w / 2 : cw.y + cw.h / 2);
  const spots: BufferSpot[] = span === null ? [{ c: [x, y], r: BUFFER_R.car, kind: 'car' }]
    : Array.from({ length: n }, (_, i) => ({ c: [x + (i % 2 ? span / 2 : -span / 2), rows[i < 2 ? 0 : 1] ?? y] as Pt, r: BUFFER_R.car, kind: 'car' as const }));
  spots.push({ c: rear ? [cwPos, cw.y + cw.h / 2] : [cw.x + cw.w / 2, cwPos], r: BUFFER_R.cw, kind: 'cw' });
  return { x, y, span, rows, cwPos, spots };
}

/** The buffers set by hand: each car buffer under the platform and out of the plan of the refuge space in the pit, the
 *  counterweight's within the counterweight's length; the least margin [mm], negative when out of place. Only what was
 *  set by hand is checked (the software's places are typical, see the registry); null when nothing was. */
export function bufferMargin(L: Layout): number | null {
  const fix = L.inputs.plan ?? {}, carSet = fix.bufX !== undefined || fix.bufY !== undefined || fix.bufSpan !== undefined;
  const cwSet = fix.cwBufPos !== undefined;
  if (!carSet && !cwSet) return null;
  const P = bufferPlan(L), car = L.car, cw = L.cw, ref = pitSpace(L), rear = L.cwSide === 'rear';
  let m = Infinity;
  for (const { c: [x, y], r, kind } of P.spots) {
    if (kind === 'car' && carSet) {
      const outside = Math.hypot(Math.max(ref.x0 - x, 0, x - ref.x1), Math.max(ref.y0 - y, 0, y - ref.y1)) - r;
      m = Math.min(m, x - r - car.x, car.x + car.w - x - r, y - r - car.y, car.y + car.h - y - r, outside);
    }
    if (kind === 'cw' && cwSet) m = Math.min(m, rear ? Math.min(x - r - cw.x, cw.x + cw.w - x - r) : Math.min(y - r - cw.y, cw.y + cw.h - y - r));
  }
  return Math.round(m);
}

/** The check of the buffers set by hand (none when nothing was). */
export function bufferChecks(L: Layout): ShaftCheck[] {
  const m = bufferMargin(L);
  return m === null ? [] : [check('v_buffer', m >= 0, m, 0, 0, 'mm')];
}
