// Dimensions and lettering of a plan, in the order of the trade's layout drawings: on the side of the landing door of
// the level, the call station, the door, the car door operator, the door's own frame or the linings of an old opening
// between the marbles, the car inside, the platform and the shaft; on the other side the car rails (feet, blades, the
// car between its shoes), D.F.G., a side counterweight to the car rail, the axes (the rope drop between a side
// counterweight's and the car's), the space between the car and a side counterweight, the counterweight to the far end
// of the car, and the shaft; on the side walls (plan-dims-walls.ts) the depth from the landing sill to the end of the
// car, the car inside with its walls, the car with its sill to a counterweight at the back, the counterweight rails,
// the bracket, the rails' axis, and the shaft; inside the car the clear door opening and, for a landing door set
// apart, the distance between its axis and the car door's (landing.ts); the spaces with their sizes and the rope drop
// of a counterweight at the back; in the pit where the buffers stand (plan-dims-pit.ts). Each value is measured from
// the element it names: its extension lines start at it (plan-from.ts), an axis' are drawn as the axis; no value is
// drawn twice. Each dimension says which input its new length changes (edit.ts), so the screens can change any of
// them where it is drawn: a distance of the plan set by hand (plan.*), an allowance, the shaft's or the doors' size,
// the linings; a rail's profile and a refuge space's type by choice. In the headroom the walls stand where head.ts
// puts them and the dimensions that end on a wall move that wall (head.*): the car, its rails and the counterweight
// run plumb.
import { chain, edit as E, type Edit, type Entity, type Side } from '../drawing';
import { KV } from './norme';
import { RAILS } from './rails';
import { railPick, refugePick } from './plan-picks';
import { callStationAt, callStationOf, lowIsLeft } from './callstation';
import { portalOf } from './frame';
import { hasImbotti, marbleOpening } from './imbotti';
import { landingKey, shiftDims } from './landing';
import { cwNiche, nichesOf } from './niche';
import { calataEdit } from './drop';
import { doorOpDepthOf } from './operator';
import { doorsAt, roofSpaces, wallsAt, type PlanLevel } from './plan-view';
import { pitSpace } from './pit';
import { areaOf, axisEnd, cwAxisEnd, faceOf, railFace, wallArea } from './plan-from';
import { pitRows, type PitRow } from './plan-dims-pit';
import { sideWallDims } from './plan-dims-walls';
import type { DoorLayout, Layout, NicheUse, Wall } from './types';

export const sideOf: Record<Wall, Side> = { front: 'bottom', rear: 'top', left: 'left', right: 'right' };
const opposite: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

export interface PlanLabels {
  /** total of the shaft at this level, e.g. `in Testata`, `piano "0"`, `piano "-1" e in Fossa` */
  level: string;
}

/** Where each point's extension line starts (undefined: the edge of the drawing) and which points are on an axis. */
export interface Ext {
  from?: readonly (number | null | undefined)[];
  axis?: readonly boolean[];
}

/** Adds a chain on a side of the plan, in the next row there. */
export type PushChain = (side: Side, dir: 'x' | 'y', pts: number[], text?: (string | null)[], edit?: (Edit | null)[], ext?: Ext) => void;

/** The input that places a door along its wall: where its clear opening starts. */
const doorKey = (d: DoorLayout): string => `plan.door${d.side}`;

const NICHE_TEXT: Record<NicheUse, string> = { cw: 'Nicchia contrappeso', light: 'Nicchia luce', duct: 'Nicchia canalina' };

export function planDims(L: Layout, level: PlanLevel, floor: number, labels: PlanLabels): Entity[] {
  const I = L.inputs, { W, D, carWall: cw } = I, out: Entity[] = [], { car, carInner: ci } = L;
  const cr = RAILS[I.carRail], nd = cwNiche(I, L.cwSide)?.depth ?? 0;
  const open = doorsAt(L, floor), door = open[0] ?? L.doors[0];
  const doorSide = sideOf[door.wall];
  const rows: Record<Side, number> = { top: 0, bottom: 0, left: 0, right: 0 }, B = wallsAt(L, level), head = level === 'top';
  const carA = areaOf(car), ciA = areaOf(ci), cwA = areaOf(L.cw);
  // in the headroom a chain that ends on a wall ends where that wall stands there, and that end moves it
  const atHead = (dir: 'x' | 'y', pts: number[], edit?: (Edit | null)[]): [number[], (Edit | null)[] | undefined] => {
    const size = dir === 'x' ? W : D, [h0, h1] = dir === 'x' ? [B.x0, B.x1] : [B.y0, B.y1], [lo, hi] = dir === 'x' ? ['left', 'right'] : ['front', 'rear'];
    const n = pts.length, p = pts.map((v) => (v === 0 ? h0 : v === size ? h1 : v)), e = Array.from({ length: n - 1 }, (_, i) => edit?.[i] ?? null);
    if (pts[n - 1] === size) e[n - 2] = E(`head.${hi}`, size - p[n - 2], -1);
    if (pts[0] === 0 && n > 2) e[0] = E(`head.${lo}`, p[1], -1);
    return [p, e];
  };
  const push: PushChain = (side, dir, pts0, text, edit0, ext) => {
    const [pts, edit] = head ? atHead(dir, pts0, edit0) : [pts0, edit0];
    out.push(chain({ dir, pts, side, row: rows[side]++, text, edit, ...ext }));
  };
  // the niches of a wall along it, inside the shaft's total; the depth of each across its wall, at its middle
  const niches = (side: Side): void => nichesOf(I).forEach((n, i) => {
    if (sideOf[n.wall] !== side) return;
    const along = n.wall === 'front' || n.wall === 'rear', len = along ? W : D, k = `n.${i}`, mid = n.at + n.width / 2;
    push(side, along ? 'x' : 'y', [0, n.at, n.at + n.width, len], [null, `{v} ${NICHE_TEXT[n.use]}`, null], [E(`${k}.at`), E(`${k}.width`), E(`${k}.at`, len - n.width, -1)]);
    const out1 = n.wall === 'rear' || n.wall === 'right', face = n.wall === 'rear' ? B.y1 : n.wall === 'right' ? B.x1 : n.wall === 'front' ? B.y0 : B.x0;
    const pts = out1 ? [face, face + n.depth] : [face - n.depth, face];
    out.push(chain({ dir: along ? 'y' : 'x', pts, at: mid, edit: [E(`${k}.depth`)] }));
  });
  // in the pit the buffers' places, each in a row just inside the shaft's total of its side (any left over outside)
  const pit = level === 'pit' ? pitRows(L, doorSide) : [], placed = new Set<PitRow>();
  const pitRow = (r: PitRow): void => {
    push(r.side, r.dir, r.pts, r.text, r.edit, { from: r.from });
    placed.add(r);
  };
  const total = (side: Side, dir: 'x' | 'y'): void => {
    niches(side);
    for (const r of pit) if (!placed.has(r) && r.side === side && r.dir === dir) pitRow(r);
    push(side, dir, [0, dir === 'x' ? W : D], [`{v} Vano ${dir === 'x' ? labels.level : ''}`.trim()], [E(dir === 'x' ? 'W' : 'D')]);
  };
  // the call station of each landing door at this level, from the door's portal (or frame), nearest the drawing
  const cs = callStationOf(I), fr = portalOf(I);
  for (const d of open) {
    const { u, from } = callStationAt(d, cs, fr.jamb);
    push(sideOf[d.wall], d.wall === 'front' || d.wall === 'rear' ? 'x' : 'y', [Math.min(u, from), Math.max(u, from)], ['{v} Bottoniera'], [E('cs.offset')]);
  }
  // from the front wall: the landing door with the sill gap, then the car door; the platform across y
  const sill = I.landingDepth + I.sillGap;
  const carY = [E('carDoorDepth', -sill), E('plan.B', -2 * cw), E('plan.B', D - car.y - 2 * cw, -1)];
  const platformX = [E('plan.carX'), E('plan.A', -2 * cw), E('plan.carX', W - car.w, -1)];

  // the side of the landing door at this level: door, operator (it moves with its door), the door's own frame or the
  // linings between the marbles, car inside, platform, shaft
  const horizDoor = doorSide === 'top' || doorSide === 'bottom';
  const dAxis = horizDoor ? 'x' : 'y', len = horizDoor ? W : D, dk = doorKey(door), lk = landingKey(door);
  const carF = faceOf(carA, doorSide), ciF = faceOf(ciA, doorSide);
  // the landing door where it stands: its place moves it alone (the car door stays; landing.ts)
  if (open.length) push(doorSide, dAxis, [0, door.l0, door.l1, len], [null, `Porta Piano ${door.width}x H.${door.height}`, null], [E(lk), E('doorWidth'), E(lk, len - door.width, -1)]);
  const v0 = sill, opF = faceOf(wallArea(L, door.wall, door.op0, v0, door.op1, v0 + doorOpDepthOf(I)), doorSide);
  push(doorSide, dAxis, [0, door.op0, door.op1, len], [null, '{v} Ingombro Operatore porta cabina', null],
    [E(dk, door.u0 - door.op0), E('plan.opLen'), E(dk, len - (door.op1 - door.u0), -1)], { from: [undefined, opF, opF, undefined] });
  if (open.length && fr.depth !== null && !hasImbotti(I)) {
    // the door's own frame in the shaft: its jambs beside the clear opening, the opening in the wall across them
    const frF = faceOf(wallArea(L, door.wall, door.l0 - fr.jamb, 0, door.l1 + fr.jamb, fr.depth), doorSide), f4 = [frF, frF, frF, frF];
    push(doorSide, dAxis, [door.l0 - fr.jamb, door.l0, door.l1, door.l1 + fr.jamb], ['Tel. {v}', null, 'Tel. {v}'], [E('frame.jamb'), E('doorWidth'), E('frame.jamb')], { from: f4 });
    push(doorSide, dAxis, [door.l0 - fr.jamb, door.l1 + fr.jamb], ['{v} Vano telaio'], [E('doorWidth', -2 * fr.jamb)], { from: [frF, frF] });
  }
  if (open.length && hasImbotti(I)) {
    // the old opening: the wall to the marble, a lining, the portal (or frame) with the door, the other lining, the
    // marble to the wall; the distance between the marbles shares itself between the two linings
    const m = marbleOpening(I, door), p = fr.jamb, [lowKey, highKey] = lowIsLeft(door.wall) ? ['imb.left', 'imb.right'] : ['imb.right', 'imb.left'];
    push(doorSide, dAxis, [0, m.u0, door.l0 - p, door.l1 + p, m.u1, len], [null, 'Imb. {v}', '{v}', 'Imb. {v}', null],
      [E(lk, p + m.low), E(lowKey), E('doorWidth', -2 * p), E(highKey), E(lk, len - m.high - p - door.width, -1)]);
    push(doorSide, dAxis, [m.u0, m.u1], ['{v} Distanza tra i marmi'], [E('imb.marble')]);
  }
  if (horizDoor) {
    push(doorSide, 'x', [car.x, ci.x, ci.x + ci.w, car.x + car.w], [null, '{v} Interno cabina', null], [E('carWall'), E('plan.A'), E('carWall')], { from: [carF, ciF, ciF, carF] });
    push(doorSide, 'x', [0, car.x, car.x + car.w, W], [null, '{v} Piattaforma', null], platformX, { from: [undefined, carF, carF, undefined] });
  } else {
    push(doorSide, 'y', [car.y, ci.y, ci.y + ci.h, car.y + car.h], [null, '{v} Interno cabina', null], [E('carWall'), E('plan.B'), E('carWall')], { from: [carF, ciF, ciF, carF] });
    push(doorSide, 'y', [0, car.y, car.y + car.h, D], [null, '{v} Piattaforma', null], carY, { from: [undefined, carF, carF, undefined] });
  }
  total(doorSide, dAxis);

  // the other side: car rails with the car between their blades, D.F.G. (the car follows the rails), a side
  // counterweight to the car rail, the axes, the space between the car and a side counterweight, the counterweight to
  // the far end of the car, shaft
  const railSide = opposite[doorSide], carRails = L.rails.filter((r) => r.kind === 'car'), side = L.cwSide !== 'rear';
  // a side counterweight's rope drop is the distance between the axes, and its thickness is in its row: drawn there,
  // not inside again
  let dropOnAxes = false, cwOnRow = false;
  if (railSide === 'top' || railSide === 'bottom') {
    const rs = railSide, carR = faceOf(carA, rs), cwR = faceOf(cwA, rs);
    if (L.frame.kind === 'central') {
      const [l, r] = carRails, footL = l.x - cr.h, footR = r.x + cr.h, sg = I.shoeGap, rp = railPick('carRail', I.carRail);
      const [lf, lt, rt, rf] = [railFace(L, l, rs, 'foot'), railFace(L, l, rs, 'tip'), railFace(L, r, rs, 'tip'), railFace(L, r, rs, 'foot')];
      // the car between the shoes without its width: the platform's row by the door gives it
      push(rs, 'x', [0, footL, l.x, car.x, car.x + car.w, r.x, footR, W], [null, '{v}', '{v}', '', '{v}', '{v}', null],
        [E('plan.carX', cr.h + sg), rp, E('shoeGap'), E('plan.A', -2 * cw), E('shoeGap'), rp, E('plan.carX', W - car.w - sg - cr.h, -1)],
        { from: [undefined, lf, lt, carR, carR, rt, rf, undefined] });
      push(rs, 'x', [0, l.x, r.x, W], [null, '{v} D.F.G. Arcata', null], [E('plan.carX', sg), E('plan.A', -2 * (sg + cw)), E('plan.carX', W - car.w - sg, -1)],
        { from: [undefined, lt, rt, undefined] });
      if (side) {
        // the counterweight from its wall (the back of its niche) to the foot of the car rail beside it: that rail
        // follows the car, so the last part moves the car
        const c = L.cw, wall = L.cwSide === 'left' ? -nd : W + nd;
        cwOnRow = true;
        if (L.cwSide === 'left') {
          push(rs, 'x', [wall, c.x, c.x + c.w, footL], [null, '{v} Contrappeso', null],
            [E('cwWallGap'), E('cwDepth'), E('plan.carX', c.x + c.w + sg + cr.h)], { from: [undefined, cwR, cwR, lf] });
        } else {
          push(rs, 'x', [footR, c.x, c.x + c.w, wall], [null, '{v} Contrappeso', null],
            [E('plan.carX', c.x - car.w - sg - cr.h, -1), E('cwDepth'), E('cwWallGap')], { from: [rf, cwR, cwR, undefined] });
        }
      }
      // the axes of the car and of a side counterweight, drawn out to their row: the car moves, the counterweight goes
      // with its wall gap (from the back of its niche); between them a side counterweight's rope drop
      const cx = car.x + car.w / 2, ax = L.cw.x + L.cw.w / 2, wallGap = E('cwWallGap', nd - I.cwDepth / 2), carEnd = axisEnd(L, rs), cwEnd = cwAxisEnd(L, rs);
      if (L.cwSide === 'rear') {
        push(rs, 'x', [0, cx, W], undefined, [E('plan.carX', -car.w / 2), E('plan.carX', W - car.w / 2, -1)], { from: [undefined, carEnd, undefined], axis: [false, true, false] });
      } else {
        dropOnAxes = true;
        const [pts, text, edit] = L.cwSide === 'left'
          ? [[0, ax, cx, W], [null, 'Calata {v}', null], [wallGap, calataEdit(L), E('plan.carX', W - car.w / 2, -1)]]
          : [[0, cx, ax, W], [null, 'Calata {v}', null], [E('plan.carX', -car.w / 2), calataEdit(L), wallGap]];
        push(rs, 'x', pts, text, edit, { from: L.cwSide === 'left' ? [undefined, cwEnd, carEnd, undefined] : [undefined, carEnd, cwEnd, undefined], axis: [false, true, true, false] });
      }
    }
    if (side) {
      // the space between the car and the counterweight (the counterweight moves with its wall gap, the car stays),
      // and from the counterweight to the far end of the car
      const c = L.cw, keep = [{ key: 'plan.carX', value: car.x }, { key: 'plan.A', value: L.A }] as const;
      if (L.cwSide === 'left') {
        push(rs, 'x', [c.x + c.w, car.x], ['{v} Spazio cabina–contrappeso'], [E('cwWallGap', car.x - I.cwDepth + nd, -1, keep)], { from: [cwR, carR] });
        push(rs, 'x', [c.x + c.w, car.x + car.w], ['{v} Contrappeso – fine cabina'], [E('cwWallGap', car.x + car.w - I.cwDepth + nd, -1, keep)], { from: [cwR, carR] });
      } else {
        push(rs, 'x', [car.x + car.w, c.x], ['{v} Spazio cabina–contrappeso'], [E('cwWallGap', W + nd - I.cwDepth - (car.x + car.w), -1, keep)], { from: [carR, cwR] });
        push(rs, 'x', [car.x, c.x], ['{v} Inizio cabina – contrappeso'], [E('cwWallGap', W + nd - I.cwDepth - car.x, -1, keep)], { from: [carR, cwR] });
      }
    }
    total(rs, 'x');
  }

  // the side walls: the counterweight's side and the other one(s)
  sideWallDims({ L, push, total, open, doorSide, carY, nd });
  if (L.cwSide === 'rear' && doorSide !== 'top') {
    // counterweight at the back: its rails across x, dimensioned inside the shaft by the rear wall, from their fronts
    const [a, b] = L.rails.filter((r) => r.kind === 'cw'), h = RAILS[I.cwRail].h, pick = railPick('cwRail', I.cwRail);
    const [af, at, bt, bf] = [railFace(L, a, 'bottom', 'foot'), railFace(L, a, 'bottom', 'tip'), railFace(L, b, 'bottom', 'tip'), railFace(L, b, 'bottom', 'foot')];
    out.push(chain({ dir: 'x', pts: [a.x - h, a.x, b.x, b.x + h], at: L.cw.y - 90, from: [af, at, bt, bf], text: ['{v}', 'D.F.G {v}', '{v}'], edit: [pick, E('plan.cwLen', -2 * KV.cwShoe), pick] }));
  }

  // inside: clear openings of the car doors, counterweight thickness, rope drop (in the pit only the spaces)
  if (level === 'pit') {
    for (const r of pit) if (!placed.has(r)) pitRow(r);
    const p = pitSpace(L), pick = refugePick('v.pitRefuge', I.vertical.pitRefuge);
    out.push(chain({ dir: 'x', pts: [p.x0, p.x1], at: p.y0 + (p.y1 - p.y0) * 0.62, edit: [pick] }), chain({ dir: 'y', pts: [p.y0, p.y1], at: p.x0 + (p.x1 - p.x0) * 0.3, edit: [pick] }));
    return out;
  }
  for (const d of L.doors) {
    // from the car's inner walls to the clear opening, its edges where the car's front wall opens
    const k = doorKey(d), text = [null, `Luce ${d.width} x ${d.height}`, null];
    if (d.wall === 'front' || d.wall === 'rear') {
      const y = d.wall === 'front' ? ci.y + 140 : ci.y + ci.h - 140, edge = d.wall === 'front' ? ci.y : ci.y + ci.h;
      out.push(chain({ dir: 'x', pts: [ci.x, d.u0, d.u1, ci.x + ci.w], at: y, from: [null, edge, edge, null], text, edit: [E(k, ci.x), E('doorWidth'), E(k, ci.x + ci.w - d.width, -1)] }));
    } else {
      const x = d.wall === 'left' ? ci.x + 140 : ci.x + ci.w - 140, edge = d.wall === 'left' ? ci.x : ci.x + ci.w;
      out.push(chain({ dir: 'y', pts: [ci.y, d.u0, d.u1, ci.y + ci.h], at: x, from: [null, edge, edge, null], text, edit: [E(k, ci.y), E('doorWidth'), E(k, ci.y + ci.h - d.width, -1)] }));
    }
  }
  // a landing door set apart from its car door: the distance between their axes
  out.push(...shiftDims(L, open));
  const c = L.cw;
  if (L.cwSide === 'rear') {
    // the counterweight moves with its wall gap; the car keeps its depth
    out.push(chain({ dir: 'y', pts: [car.y + car.h / 2, c.y + c.h / 2], at: c.x + c.w / 2 - 120, text: ['Calata ({v})'], edit: [calataEdit(L)] }));
  } else {
    const cx = car.x + car.w / 2, ax = c.x + c.w / 2, y = L.frame.kind === 'central' ? L.frame.axis - 160 : c.y + c.h / 2 - 160;
    if (!dropOnAxes) out.push(chain({ dir: 'x', pts: L.cwSide === 'left' ? [ax, cx] : [cx, ax], at: y, text: ['Calata ({v})'], edit: [calataEdit(L)] }));
    // the counterweight's thickness where no row over the plan gives it
    if (!cwOnRow) out.push(chain({ dir: 'x', pts: [c.x, c.x + c.w], at: c.y + c.h / 2 + 60, edit: [E('cwDepth')] }));
  }
  if (level === 'top') {
    // the refuge space by its type; the place to stand by its own sizes, each inside its own outline, apart
    const { refuge: r, free: f } = roofSpaces(L), pick = refugePick('v.topRefuge', I.vertical.topRefuge);
    out.push(chain({ dir: 'x', pts: [r.x0, r.x1], at: r.y0 + 0.28 * (r.y1 - r.y0), edit: [pick] }), chain({ dir: 'y', pts: [r.y0, r.y1], at: r.x0 + 0.28 * (r.x1 - r.x0), edit: [pick] }));
    out.push(chain({ dir: 'x', pts: [f.x0, f.x1], at: f.y0 + 90, edit: [E('v.standW')] }), chain({ dir: 'y', pts: [f.y0, f.y1], at: f.x0 + 40, edit: [E('v.standD')] }));
  }
  return out;
}
