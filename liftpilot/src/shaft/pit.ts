// The pit in plan: the refuge space under the car and where the buffers stand — the car's under the platform, the
// counterweight's under the counterweight —, as set by hand (plan.bufX, bufY, bufSpan, cwBufPos) or as the software
// puts them: one car buffer under the middle of the car; two or more 160 mm in from the platform's sides on the car's
// middle line (more than two in two rows a quarter of the car's depth from it), further out when the refuge space would
// reach their plates, still under the platform; the counterweight's under its middle. The refuge space under the middle
// of the car, or the free place nearest to it. The plan, section A-A, their dimensions, the check and the 3D all take
// them from here. Pure.
import type { Box, Pt } from '../drawing';
import { check } from './checks';
import { KV_VERT } from './norme-vert';
import type { Layout, ShaftCheck } from './types';

/** The buffers' radius as drawn (the striker plate's), car and counterweight [mm]. */
export const BUFFER_R = { car: 75, cw: 60 } as const;
/** Two or more car buffers by default: their axes this far in from the platform's sides [mm]. */
const SIDE_IN = 160;
/** Half the side of a buffer's footprint on the pit floor: the plate of its pedestal, or its own base without one [mm]. */
export const bufferFoot = (base: number): number => (base > 0 ? 150 : 90);

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

/** The refuge space in the pit across and along the car [mm]: its long side along the car's longer one. */
function refugeSize(L: Layout): readonly [number, number] {
  const ci = L.carInner, [a, b] = KV_VERT.refugePlan[L.inputs.vertical.pitRefuge];
  return ci.h >= ci.w ? [a, b] : [b, a];
}

/** How far a buffer's plate stays out of a box in plan [mm]: negative when it reaches into it. */
const clearOf = (B: Box, s: BufferSpot): number =>
  Math.hypot(Math.max(B.x0 - s.c[0], 0, s.c[0] - B.x1), Math.max(B.y0 - s.c[1], 0, s.c[1] - B.y1)) - s.r;

/** a search step for a free place of the refuge space [mm] */
const STEP = 10;
const placed = new WeakMap<Layout, Box>();

/** In the pit, under the car: the refuge space under its middle, or, where a car buffer's plate reaches into it there,
 *  the free place nearest to the middle under the car's inside (none free: the middle, and the check of the buffers
 *  says so). */
export function pitSpace(L: Layout): Box {
  const known = placed.get(L);
  if (known) return known;
  const ci = L.carInner, [w, h] = refugeSize(L), spots = bufferPlan(L).spots.filter((s) => s.kind === 'car');
  const at = (dx: number, dy: number): Box => {
    const x0 = ci.x + (ci.w - w) / 2 + dx, y0 = ci.y + (ci.h - h) / 2 + dy;
    return { x0, y0, x1: x0 + w, y1: y0 + h };
  };
  const free = (B: Box): boolean => spots.every((s) => clearOf(B, s) >= 0);
  // the shifts from one end to the other in steps, both ends included
  const shifts = (m: number): number[] => {
    const out: number[] = [];
    for (let v = -m; v < m; v += STEP) out.push(v);
    return [...out, m];
  };
  let best = at(0, 0);
  if (!free(best)) {
    let d = Infinity;
    for (const dy of shifts(Math.max(0, (ci.h - h) / 2))) {
      for (const dx of shifts(Math.max(0, (ci.w - w) / 2))) {
        const B = at(dx, dy), e = Math.hypot(dx, dy);
        if (e < d - 1e-9 && free(B)) {
          best = B;
          d = e;
        }
      }
    }
  }
  placed.set(L, best);
  return best;
}

/** The car buffers' distance between the outer axes across the car when the software places them: 160 mm in from the
 *  platform's sides, or further out until their plates clear the refuge space under the middle of the car — never with
 *  their footprint past the platform's sides, where the rails, their brackets and the counterweight stand (there the
 *  check of the buffers says that they meet the refuge space). */
function autoSpan(L: Layout): number {
  const car = L.car, [w] = refugeSize(L), r = BUFFER_R.car, foot = bufferFoot(L.inputs.vertical.carBufferBase);
  return Math.min(car.w - 2 * Math.max(r, foot), Math.max(car.w - 2 * SIDE_IN, w + 2 * r));
}

export function bufferPlan(L: Layout): BufferPlan {
  const fix = L.inputs.plan ?? {}, n = Math.max(1, L.inputs.vertical.carBuffers), car = L.car, cw = L.cw, rear = L.cwSide === 'rear';
  const x = fix.bufX ?? car.x + car.w / 2, y = fix.bufY ?? car.y + car.h / 2;
  const span = n > 1 ? fix.bufSpan ?? autoSpan(L) : null, rows = n > 2 ? [y - car.h / 4, y + car.h / 4] : [y];
  const cwPos = fix.cwBufPos ?? (rear ? cw.x + cw.w / 2 : cw.y + cw.h / 2);
  const spots: BufferSpot[] = span === null ? [{ c: [x, y], r: BUFFER_R.car, kind: 'car' }]
    : Array.from({ length: n }, (_, i) => ({ c: [x + (i % 2 ? span / 2 : -span / 2), rows[i < 2 ? 0 : 1] ?? y] as Pt, r: BUFFER_R.car, kind: 'car' as const }));
  spots.push({ c: rear ? [cwPos, cw.y + cw.h / 2] : [cw.x + cw.w / 2, cwPos], r: BUFFER_R.cw, kind: 'cw' });
  return { x, y, span, rows, cwPos, spots };
}

/** The buffers, set by hand or placed by the software: each car buffer's plate under the platform and out of the plan
 *  of the refuge space in the pit (UNI EN 81-20, 5.2.5.8.1), the counterweight's within the counterweight's length; the
 *  least margin [mm], negative when out of place. */
export function bufferMargin(L: Layout): number {
  const P = bufferPlan(L), car = L.car, cw = L.cw, ref = pitSpace(L), rear = L.cwSide === 'rear';
  let m = Infinity;
  for (const s of P.spots) {
    const [x, y] = s.c, r = s.r;
    if (s.kind === 'car') m = Math.min(m, x - r - car.x, car.x + car.w - x - r, y - r - car.y, car.y + car.h - y - r, clearOf(ref, s));
    else m = Math.min(m, rear ? Math.min(x - r - cw.x, cw.x + cw.w - x - r) : Math.min(y - r - cw.y, cw.y + cw.h - y - r));
  }
  return Math.round(m) || 0;
}

/** The check of the buffers' places. */
export function bufferChecks(L: Layout): ShaftCheck[] {
  const m = bufferMargin(L);
  return [check('v_buffer', m >= 0, m, 0, 0, 'mm')];
}
