// The buffers' places in the plan of the pit (pit.ts), as rows of dimensions from the walls: the car buffers across the
// shaft on the side away from the landing door (the outer parts move them together, the distance between the outer
// ones spreads them about their middle), their row from the front wall on a side wall without the counterweight (with
// more than two buffers two rows a quarter of the car's depth from its middle: the distance between them is the car's
// depth's), the counterweight's buffer along the wall the counterweight stands by, on that side. Each segment changes
// where they stand (plan.bufX, bufY, bufSpan, cwBufPos; edit.ts); the extension lines start at the buffers' rims.
import { edit as E, type Edit, type Side } from '../drawing';
import { bufferPlan, type BufferSpot } from './pit';
import { faceOf } from './plan-from';
import type { Layout } from './types';

export interface PitRow {
  side: Side;
  dir: 'x' | 'y';
  pts: number[];
  text: (string | null)[];
  edit: Edit[];
  /** where each point's extension line starts (undefined: the edge of the drawing) */
  from: (number | undefined)[];
}

/** The rim nearest a side of the buffers whose centres stand at `v` along a chain in direction `dir`. */
function rimAt(spots: readonly BufferSpot[], dir: 'x' | 'y', v: number, side: Side): number | undefined {
  const at = spots.filter((s) => Math.abs(s.c[dir === 'x' ? 0 : 1] - v) < 0.5).map((s) => faceOf({ x0: s.c[0] - s.r, y0: s.c[1] - s.r, x1: s.c[0] + s.r, y1: s.c[1] + s.r }, side));
  if (!at.length) return undefined;
  return side === 'top' || side === 'right' ? Math.max(...at) : Math.min(...at);
}

export function pitRows(L: Layout, doorSide: Side): PitRow[] {
  const I = L.inputs, { W, D } = I, P = bufferPlan(L), q = L.car.h / 4, rear = L.cwSide === 'rear';
  const xSide: Side = doorSide === 'top' ? 'bottom' : 'top';
  const ySide: Side = L.cwSide === 'left' ? 'right' : L.cwSide === 'right' ? 'left' : doorSide === 'left' ? 'right' : 'left';
  const car = P.spots.filter((s) => s.kind === 'car'), cw = P.spots.filter((s) => s.kind === 'cw');
  const rims = (spots: readonly BufferSpot[], dir: 'x' | 'y', side: Side, pts: readonly number[]): (number | undefined)[] =>
    pts.map((v, i) => (i === 0 || i === pts.length - 1 ? undefined : rimAt(spots, dir, v, side)));
  const out: PitRow[] = [];
  const xPts = P.span === null ? [0, P.x, W] : [0, P.x - P.span / 2, P.x + P.span / 2, W];
  if (P.span === null) out.push({ side: xSide, dir: 'x', pts: xPts, text: ['{v} Ammort. cabina', null], edit: [E('plan.bufX'), E('plan.bufX', W, -1)], from: rims(car, 'x', xSide, xPts) });
  else {
    const h = P.span / 2;
    out.push({ side: xSide, dir: 'x', pts: xPts, text: [null, '{v} Interasse ammort.', null], edit: [E('plan.bufX', h), E('plan.bufSpan'), E('plan.bufX', W - h, -1)], from: rims(car, 'x', xSide, xPts) });
  }
  const [r0, r1] = P.rows, yPts = r1 === undefined ? [0, P.y, D] : [0, r0 ?? P.y, r1, D];
  out.push(r1 === undefined
    ? { side: ySide, dir: 'y', pts: yPts, text: ['{v} Ammort. cabina', null], edit: [E('plan.bufY'), E('plan.bufY', D, -1)], from: rims(car, 'y', ySide, yPts) }
    : { side: ySide, dir: 'y', pts: yPts, text: ['{v} Ammort. cabina', null, null], edit: [E('plan.bufY', q), E('plan.B', -2 * I.carWall, 2), E('plan.bufY', D - q, -1)], from: rims(car, 'y', ySide, yPts) });
  const len = rear ? W : D, cwSide: Side = rear ? 'top' : L.cwSide === 'left' ? 'left' : 'right', cwPts = [0, P.cwPos, len];
  out.push({ side: cwSide, dir: rear ? 'x' : 'y', pts: cwPts, text: ['{v} Ammort. contrappeso', null], edit: [E('plan.cwBufPos'), E('plan.cwBufPos', len, -1)],
    from: rims(cw, rear ? 'x' : 'y', cwSide, cwPts) });
  return out;
}
