// Dimensions and lettering of a plan, in the order of the trade's layout drawings: on the side of the landing door of
// the level, the door, the car door operator, the car inside, the platform and the shaft; on the other side the car
// rails (feet, tips, D.F.G.), the axes and the shaft; on the side walls the counterweight rails, the bracket, the car
// and the shaft; inside the car the clear door opening; the spaces with their sizes and the rope drop. Each dimension
// says which input its new length changes (edit.ts), so the screens can change any of them where it is drawn: a
// distance of the plan set by hand (plan.*), an allowance, the shaft's or the doors' size.
import { chain, edit as E, type Edit, type Entity, type Side } from '../drawing';
import { KV } from './norme';
import { RAILS } from './rails';
import { callStationAt, callStationOf } from './callstation';
import { cwNiche, nichesOf } from './niche';
import { doorsAt, pitSpace, roofSpaces, type PlanLevel } from './plan-view';
import type { DoorLayout, Layout, NicheUse, Wall } from './types';

const sideOf: Record<Wall, Side> = { front: 'bottom', rear: 'top', left: 'left', right: 'right' };
const opposite: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

export interface PlanLabels {
  /** total of the shaft at this level, e.g. `in Testata`, `piano "0"`, `piano "-1" e in Fossa` */
  level: string;
}

/** The input that places a door along its wall: where its clear opening starts. */
const doorKey = (d: DoorLayout): string => `plan.door${d.side}`;

const NICHE_TEXT: Record<NicheUse, string> = { cw: 'Nicchia contrappeso', light: 'Nicchia luce', duct: 'Nicchia canalina' };

export function planDims(L: Layout, level: PlanLevel, floor: number, labels: PlanLabels): Entity[] {
  const I = L.inputs, { W, D, carWall: cw } = I, out: Entity[] = [], { car, carInner: ci } = L;
  const cr = RAILS[I.carRail], wr = RAILS[I.cwRail], nd = cwNiche(I, L.cwSide)?.depth ?? 0;
  const open = doorsAt(L, floor), door = open[0] ?? L.doors[0];
  const doorSide = sideOf[door.wall];
  const rows: Record<Side, number> = { top: 0, bottom: 0, left: 0, right: 0 };
  const push = (side: Side, dir: 'x' | 'y', pts: number[], text?: (string | null)[], edit?: (Edit | null)[]): void => {
    out.push(chain({ dir, pts, side, row: rows[side]++, text, edit }));
  };
  // the niches of a wall along it, inside the shaft's total; the depth of each across its wall, at its middle
  const niches = (side: Side): void => nichesOf(I).forEach((n, i) => {
    if (sideOf[n.wall] !== side) return;
    const along = n.wall === 'front' || n.wall === 'rear', len = along ? W : D, k = `n.${i}`, mid = n.at + n.width / 2;
    push(side, along ? 'x' : 'y', [0, n.at, n.at + n.width, len], [null, `{v} ${NICHE_TEXT[n.use]}`, null], [E(`${k}.at`), E(`${k}.width`), E(`${k}.at`, len - n.width, -1)]);
    const face = n.wall === 'rear' ? D : n.wall === 'right' ? W : 0, pts = face === 0 ? [-n.depth, 0] : [face, face + n.depth];
    out.push(chain({ dir: along ? 'y' : 'x', pts, at: mid, edit: [E(`${k}.depth`)] }));
  });
  const total = (side: Side, dir: 'x' | 'y'): void => {
    niches(side);
    push(side, dir, [0, dir === 'x' ? W : D], [`{v} Vano ${dir === 'x' ? labels.level : ''}`.trim()], [E(dir === 'x' ? 'W' : 'D')]);
  };
  // the call station of each landing door at this level, from the door's portal, nearest the drawing
  const cs = callStationOf(I);
  for (const d of open) {
    const { u, from } = callStationAt(d, cs);
    push(sideOf[d.wall], d.wall === 'front' || d.wall === 'rear' ? 'x' : 'y', [Math.min(u, from), Math.max(u, from)], ['{v} Bottoniera'], [E('cs.offset')]);
  }
  // from the front wall: the landing door with the sill gap, then the car door; the platform across y
  const sill = I.landingDepth + I.sillGap;
  const carY = [E('carDoorDepth', -sill), E('plan.B', -2 * cw), E('plan.B', D - car.y - 2 * cw, -1)];
  const platformX = [E('plan.carX'), E('plan.A', -2 * cw), E('plan.carX', W - car.w, -1)];

  // the side of the landing door at this level: door, operator (it moves with its door), car inside, platform, shaft
  const horizDoor = doorSide === 'top' || doorSide === 'bottom';
  const dAxis = horizDoor ? 'x' : 'y', len = horizDoor ? W : D, dk = doorKey(door);
  if (open.length) push(doorSide, dAxis, [0, door.u0, door.u1, len], [null, `Porta Piano ${door.width}x H.${door.height}`, null], [E(dk), E('doorWidth'), E(dk, len - door.width, -1)]);
  push(doorSide, dAxis, [0, door.op0, door.op1, len], [null, '{v} Ingombro Operatore porta cabina', null],
    [E(dk, door.u0 - door.op0), E('plan.opLen'), E(dk, len - (door.op1 - door.u0), -1)]);
  if (horizDoor) {
    push(doorSide, 'x', [car.x, ci.x, ci.x + ci.w, car.x + car.w], [null, '{v} Interno cabina', null], [E('carWall'), E('plan.A'), E('carWall')]);
    push(doorSide, 'x', [0, car.x, car.x + car.w, W], [null, '{v} Piattaforma', null], platformX);
  } else {
    push(doorSide, 'y', [car.y, ci.y, ci.y + ci.h, car.y + car.h], [null, '{v} Interno cabina', null], [E('carWall'), E('plan.B'), E('carWall')]);
    push(doorSide, 'y', [0, car.y, car.y + car.h, D], [null, '{v} Piattaforma', null], carY);
  }
  total(doorSide, dAxis);

  // the other side: car rails, D.F.G. (the car follows the rails), axes, shaft
  const railSide = opposite[doorSide], carRails = L.rails.filter((r) => r.kind === 'car');
  if (L.frame.kind === 'central' && (railSide === 'top' || railSide === 'bottom')) {
    const [l, r] = carRails, footL = l.x - cr.h, footR = r.x + cr.h, sg = I.shoeGap;
    push(railSide, 'x', [0, footL, l.x, r.x, footR, W], [null, null, '', null, null], [E('plan.carX', cr.h + sg), null, null, null, E('plan.carX', W - car.w - sg - cr.h, -1)]);
    push(railSide, 'x', [0, l.x, r.x, W], [null, '{v} D.F.G. Arcata', null], [E('plan.carX', sg), E('plan.A', -2 * (sg + cw)), E('plan.carX', W - car.w - sg, -1)]);
    // axes of the car and of a side counterweight: the car moves, the counterweight goes with its wall gap (from the
    // back of its niche)
    const cx = car.x + car.w / 2, ax = L.cw.x + L.cw.w / 2, wallGap = E('cwWallGap', nd - I.cwDepth / 2);
    if (L.cwSide === 'rear') push(railSide, 'x', [0, cx, W], undefined, [E('plan.carX', -car.w / 2), E('plan.carX', W - car.w / 2, -1)]);
    else if (L.cwSide === 'left') push(railSide, 'x', [0, ax, cx, W], undefined, [wallGap, E('plan.carX', ax - car.w / 2), E('plan.carX', W - car.w / 2, -1)]);
    else push(railSide, 'x', [0, cx, ax, W], undefined, [E('plan.carX', -car.w / 2), E('plan.carX', ax - car.w / 2, -1), wallGap]);
    total(railSide, 'x');
  } else if (railSide === 'top' || railSide === 'bottom') {
    push(railSide, 'x', [0, car.x, car.x + car.w, W], [null, '{v} Piattaforma', null], platformX);
    total(railSide, 'x');
  }

  // side walls: the counterweight's side and the other one
  const cwWallSide: Side | null = L.cwSide === 'left' ? 'left' : L.cwSide === 'right' ? 'right' : null;
  for (const side of ['left', 'right'] as const) {
    if (side === doorSide) continue;
    if (side === cwWallSide) {
      const [a, b] = L.rails.filter((r) => r.kind === 'cw'), n = L.cw.h, sh = KV.cwShoe;
      if (L.frame.kind === 'cantilever') {
        const [p, q] = L.rails.filter((r) => r.kind === 'car');
        push(side, 'y', [0, p.y, q.y, D], [null, '{v} D.F.G. Arcata', null], [E('plan.railY'), E('plan.dbg'), E('plan.railY', D - (q.y - p.y), -1)]);
      }
      push(side, 'y', [0, a.y, b.y, D], [null, 'D.F.G {v}', null], [E('plan.cwPos', sh), E('plan.cwLen', -2 * sh), E('plan.cwPos', D - n - sh, -1)]);
      if (L.bridge) {
        const o = sh + wr.h;
        push(side, 'y', [0, L.bridge.y0, L.bridge.y1, D], [null, '{v} Ingombro Staffa', null], [E('plan.cwPos', o), E('plan.cwLen', -2 * o), E('plan.cwPos', D - n - o, -1)]);
      }
      push(side, 'y', [0, car.y, car.y + car.h, D], undefined, carY);
    } else {
      const rearDoor = L.doors.some((d) => d.wall === 'rear'), landing = E('landingDepth', -I.sillGap);
      push(side, 'y', rearDoor ? [0, sill, D - sill, D] : [0, sill, D], rearDoor ? [null, '', null] : [null, ''], rearDoor ? [landing, null, landing] : [landing, null]);
      push(side, 'y', [0, ci.y, ci.y + ci.h, D], [null, '{v} Interno Cabina', null], [E('carDoorDepth', -(sill + cw)), E('plan.B'), E('plan.B', D - ci.y, -1)]);
      push(side, 'y', [0, car.y, car.y + car.h, D], [null, '{v} Piattaforma', null], carY);
      if (L.frame.kind === 'central') push(side, 'y', [0, L.frame.axis, D], ['{v}', null], [E('plan.railY'), E('plan.railY', D, -1)]);
    }
    total(side, 'y');
  }
  if (cwWallSide === null && L.cwSide === 'rear' && doorSide !== 'top') {
    // counterweight at the back: its rails across x, dimensioned inside the shaft by the rear wall
    const [a, b] = L.rails.filter((r) => r.kind === 'cw');
    out.push(chain({ dir: 'x', pts: [a.x, b.x], at: L.cw.y - 90, text: ['D.F.G {v}'], edit: [E('plan.cwLen', -2 * KV.cwShoe)] }));
  }

  // inside: clear openings of the car doors, counterweight thickness, rope drop (in the pit only the spaces)
  if (level === 'pit') {
    const p = pitSpace(L);
    out.push(chain({ dir: 'x', pts: [p.x0, p.x1], at: p.y0 + (p.y1 - p.y0) * 0.62 }), chain({ dir: 'y', pts: [p.y0, p.y1], at: p.x0 + (p.x1 - p.x0) * 0.3 }));
    return out;
  }
  for (const d of L.doors) {
    const k = doorKey(d), text = [null, `Luce ${d.width} x ${d.height}`, null];
    if (d.wall === 'front' || d.wall === 'rear') {
      const y = d.wall === 'front' ? ci.y + 140 : ci.y + ci.h - 140;
      out.push(chain({ dir: 'x', pts: [ci.x, d.u0, d.u1, ci.x + ci.w], at: y, text, edit: [E(k, ci.x), E('doorWidth'), E(k, ci.x + ci.w - d.width, -1)] }));
    } else {
      const x = d.wall === 'left' ? ci.x + 140 : ci.x + ci.w - 140;
      out.push(chain({ dir: 'y', pts: [ci.y, d.u0, d.u1, ci.y + ci.h], at: x, text, edit: [E(k, ci.y), E('doorWidth'), E(k, ci.y + ci.h - d.width, -1)] }));
    }
  }
  const c = L.cw;
  if (L.cwSide === 'rear') {
    // the counterweight moves with its wall gap; the car keeps its depth
    const drop = E('cwWallGap', D + nd - I.cwDepth / 2 - car.y - car.h / 2, -1, [{ key: 'plan.B', value: L.B }]);
    out.push(chain({ dir: 'y', pts: [car.y + car.h / 2, c.y + c.h / 2], at: c.x + c.w / 2 - 120, text: ['Calata ({v})'], edit: [drop] }));
  } else {
    const cx = car.x + car.w / 2, ax = c.x + c.w / 2, y = L.frame.kind === 'central' ? L.frame.axis - 160 : c.y + c.h / 2 - 160;
    const drop = L.cwSide === 'left' ? E('plan.carX', ax - car.w / 2) : E('plan.carX', ax - car.w / 2, -1);
    out.push(chain({ dir: 'x', pts: L.cwSide === 'left' ? [ax, cx] : [cx, ax], at: y, text: ['Calata ({v})'], edit: [drop] }));
    out.push(chain({ dir: 'x', pts: [c.x, c.x + c.w], at: c.y + c.h / 2 + 60, edit: [E('cwDepth')] }));
  }
  if (level === 'top') {
    const { refuge: r, free: f } = roofSpaces(L);
    out.push(chain({ dir: 'x', pts: [r.x0, r.x1], at: (r.y0 + r.y1) / 2 }), chain({ dir: 'y', pts: [r.y0, r.y1], at: r.x0 + 150 }));
    out.push(chain({ dir: 'x', pts: [f.x0, f.x1], at: f.y0 + 90 }), chain({ dir: 'y', pts: [f.y0, f.y1], at: f.x1 - 70 }));
  }
  return out;
}
