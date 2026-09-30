// Dimensions and lettering of a plan, in the order of the trade's layout drawings: on the side of the landing door of
// the level, the door, the car door operator, the car inside, the platform and the shaft; on the other side the car
// rails (feet, tips, D.F.G.), the axes and the shaft; on the side walls the counterweight rails, the bracket, the car
// and the shaft; inside the car the clear door opening; the spaces with their sizes and the rope drop.
import { chain, type Entity, type Side } from '../drawing';
import { RAILS } from './rails';
import { doorsAt, pitSpace, roofSpaces, type PlanLevel } from './plan-view';
import type { Layout, Wall } from './types';

const sideOf: Record<Wall, Side> = { front: 'bottom', rear: 'top', left: 'left', right: 'right' };
const opposite: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

export interface PlanLabels {
  /** total of the shaft at this level, e.g. `in Testata`, `piano "0"`, `piano "-1" e in Fossa` */
  level: string;
}

export function planDims(L: Layout, level: PlanLevel, floor: number, labels: PlanLabels): Entity[] {
  const { W, D } = L.inputs, out: Entity[] = [], { car, carInner: ci } = L;
  const cr = RAILS[L.inputs.carRail];
  const open = doorsAt(L, floor), door = open[0] ?? L.doors[0];
  const doorSide = sideOf[door.wall];
  const rows: Record<Side, number> = { top: 0, bottom: 0, left: 0, right: 0 };
  const push = (side: Side, dir: 'x' | 'y', pts: number[], text?: (string | null)[]): void => {
    out.push(chain({ dir, pts, side, row: rows[side]++, text }));
  };
  const total = (side: Side, dir: 'x' | 'y'): void => push(side, dir, [0, dir === 'x' ? W : D], [`{v} Vano ${dir === 'x' ? labels.level : ''}`.trim()]);

  // the side of the landing door at this level: door, operator, car inside, platform, shaft
  const horizDoor = doorSide === 'top' || doorSide === 'bottom';
  const dAxis = horizDoor ? 'x' : 'y', len = horizDoor ? W : D;
  if (open.length) push(doorSide, dAxis, [0, door.u0, door.u1, len], [null, `Porta Piano ${door.width}x H.${door.height}`, null]);
  push(doorSide, dAxis, [0, door.op0, door.op1, len], [null, '{v} Ingombro Operatore porta cabina', null]);
  if (horizDoor) {
    push(doorSide, 'x', [car.x, ci.x, ci.x + ci.w, car.x + car.w], [null, '{v} Interno cabina', null]);
    push(doorSide, 'x', [0, car.x, car.x + car.w, W], [null, '{v} Piattaforma', null]);
  } else {
    push(doorSide, 'y', [car.y, ci.y, ci.y + ci.h, car.y + car.h], [null, '{v} Interno cabina', null]);
    push(doorSide, 'y', [0, car.y, car.y + car.h, D], [null, '{v} Piattaforma', null]);
  }
  total(doorSide, dAxis);

  // the other side: car rails, D.F.G., axes, shaft
  const railSide = opposite[doorSide], carRails = L.rails.filter((r) => r.kind === 'car');
  if (L.frame.kind === 'central' && (railSide === 'top' || railSide === 'bottom')) {
    const [l, r] = carRails, footL = l.x - cr.h, footR = r.x + cr.h;
    push(railSide, 'x', [0, footL, l.x, r.x, footR, W], [null, null, '', null, null]);
    push(railSide, 'x', [0, l.x, r.x, W], [null, '{v} D.F.G. Arcata', null]);
    const cx = car.x + car.w / 2, axes = L.cwSide === 'rear' ? [0, cx, W] : L.cwSide === 'left' ? [0, L.cw.x + L.cw.w / 2, cx, W] : [0, cx, L.cw.x + L.cw.w / 2, W];
    push(railSide, 'x', axes);
    total(railSide, 'x');
  } else if (railSide === 'top' || railSide === 'bottom') {
    push(railSide, 'x', [0, car.x, car.x + car.w, W], [null, '{v} Piattaforma', null]);
    total(railSide, 'x');
  }

  // side walls: the counterweight's side and the other one
  const cwWallSide: Side | null = L.cwSide === 'left' ? 'left' : L.cwSide === 'right' ? 'right' : null;
  for (const side of ['left', 'right'] as const) {
    if (side === doorSide) continue;
    if (side === cwWallSide) {
      const [a, b] = L.rails.filter((r) => r.kind === 'cw');
      if (L.frame.kind === 'cantilever') {
        const [p, q] = L.rails.filter((r) => r.kind === 'car');
        push(side, 'y', [0, p.y, q.y, D], [null, '{v} D.F.G. Arcata', null]);
      }
      push(side, 'y', [0, a.y, b.y, D], [null, 'D.F.G {v}', null]);
      if (L.bridge) push(side, 'y', [0, L.bridge.y0, L.bridge.y1, D], [null, '{v} Ingombro Staffa', null]);
      push(side, 'y', [0, car.y, car.y + car.h, D]);
    } else {
      const sill = L.inputs.landingDepth + L.inputs.sillGap, rearDoor = L.doors.some((d) => d.wall === 'rear');
      push(side, 'y', rearDoor ? [0, sill, D - sill, D] : [0, sill, D], rearDoor ? [null, '', null] : [null, '']);
      push(side, 'y', [0, ci.y, ci.y + ci.h, D], [null, '{v} Interno Cabina', null]);
      push(side, 'y', [0, car.y, car.y + car.h, D], [null, '{v} Piattaforma', null]);
      if (L.frame.kind === 'central') push(side, 'y', [0, L.frame.axis, D], ['{v}', null]);
    }
    total(side, 'y');
  }
  if (cwWallSide === null && L.cwSide === 'rear' && doorSide !== 'top') {
    // counterweight at the back: its rails across x, dimensioned inside the shaft by the rear wall
    const [a, b] = L.rails.filter((r) => r.kind === 'cw');
    out.push(chain({ dir: 'x', pts: [a.x, b.x], at: L.cw.y - 90, text: ['D.F.G {v}'] }));
  }

  // inside: clear openings of the car doors, counterweight thickness, rope drop (in the pit only the spaces)
  if (level === 'pit') {
    const p = pitSpace(L);
    out.push(chain({ dir: 'x', pts: [p.x0, p.x1], at: p.y0 + (p.y1 - p.y0) * 0.62 }), chain({ dir: 'y', pts: [p.y0, p.y1], at: p.x0 + (p.x1 - p.x0) * 0.3 }));
    return out;
  }
  for (const d of L.doors) {
    if (d.wall === 'front' || d.wall === 'rear') {
      const y = d.wall === 'front' ? ci.y + 140 : ci.y + ci.h - 140;
      out.push(chain({ dir: 'x', pts: [ci.x, d.u0, d.u1, ci.x + ci.w], at: y, text: [null, `Luce ${d.width} x ${d.height}`, null] }));
    } else {
      const x = d.wall === 'left' ? ci.x + 140 : ci.x + ci.w - 140;
      out.push(chain({ dir: 'y', pts: [ci.y, d.u0, d.u1, ci.y + ci.h], at: x, text: [null, `Luce ${d.width} x ${d.height}`, null] }));
    }
  }
  const c = L.cw;
  if (L.cwSide === 'rear') {
    out.push(chain({ dir: 'y', pts: [car.y + car.h / 2, c.y + c.h / 2], at: c.x + c.w / 2 - 120, text: ['Calata ({v})'] }));
  } else {
    const cx = car.x + car.w / 2, ax = c.x + c.w / 2, y = L.frame.kind === 'central' ? L.frame.axis - 160 : c.y + c.h / 2 - 160;
    out.push(chain({ dir: 'x', pts: L.cwSide === 'left' ? [ax, cx] : [cx, ax], at: y, text: ['Calata ({v})'] }));
    out.push(chain({ dir: 'x', pts: [c.x, c.x + c.w], at: c.y + c.h / 2 + 60 }));
  }
  if (level === 'top') {
    const { refuge: r, free: f } = roofSpaces(L);
    out.push(chain({ dir: 'x', pts: [r.x0, r.x1], at: (r.y0 + r.y1) / 2 }), chain({ dir: 'y', pts: [r.y0, r.y1], at: r.x0 + 150 }));
    out.push(chain({ dir: 'x', pts: [f.x0, f.x1], at: f.y0 + 90 }), chain({ dir: 'y', pts: [f.y0, f.y1], at: f.x1 - 70 }));
  }
  return out;
}
