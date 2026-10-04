// The buffers' places in the plan of the pit (pit.ts), as rows of dimensions from the walls: the car buffers across the
// shaft on the side away from the landing door (the outer parts move them together, the distance between the outer
// ones spreads them about their middle), their row from the front wall on a side wall without the counterweight (with
// more than two buffers two rows a quarter of the car's depth from its middle: the distance between them is the car's
// depth's), the counterweight's buffer along the wall the counterweight stands by, on that side. Each segment changes
// where they stand (plan.bufX, bufY, bufSpan, cwBufPos; edit.ts).
import { edit as E, type Edit, type Side } from '../drawing';
import { bufferPlan } from './pit';
import type { Layout } from './types';

export interface PitRow {
  side: Side;
  dir: 'x' | 'y';
  pts: number[];
  text: (string | null)[];
  edit: Edit[];
}

export function pitRows(L: Layout, doorSide: Side): PitRow[] {
  const I = L.inputs, { W, D } = I, P = bufferPlan(L), q = L.car.h / 4, rear = L.cwSide === 'rear';
  const xSide: Side = doorSide === 'top' ? 'bottom' : 'top';
  const ySide: Side = L.cwSide === 'left' ? 'right' : L.cwSide === 'right' ? 'left' : doorSide === 'left' ? 'right' : 'left';
  const out: PitRow[] = [];
  if (P.span === null) out.push({ side: xSide, dir: 'x', pts: [0, P.x, W], text: ['{v} Ammort. cabina', null], edit: [E('plan.bufX'), E('plan.bufX', W, -1)] });
  else {
    const h = P.span / 2;
    out.push({ side: xSide, dir: 'x', pts: [0, P.x - h, P.x + h, W], text: [null, '{v} Interasse ammort.', null], edit: [E('plan.bufX', h), E('plan.bufSpan'), E('plan.bufX', W - h, -1)] });
  }
  const [r0, r1] = P.rows;
  out.push(r1 === undefined
    ? { side: ySide, dir: 'y', pts: [0, P.y, D], text: ['{v} Ammort. cabina', null], edit: [E('plan.bufY'), E('plan.bufY', D, -1)] }
    : { side: ySide, dir: 'y', pts: [0, r0, r1, D], text: ['{v} Ammort. cabina', null, null], edit: [E('plan.bufY', q), E('plan.B', -2 * I.carWall, 2), E('plan.bufY', D - q, -1)] });
  const len = rear ? W : D;
  out.push({ side: rear ? 'top' : L.cwSide === 'left' ? 'left' : 'right', dir: rear ? 'x' : 'y', pts: [0, P.cwPos, len], text: ['{v} Ammort. contrappeso', null],
    edit: [E('plan.cwBufPos'), E('plan.cwBufPos', len, -1)] });
  return out;
}
