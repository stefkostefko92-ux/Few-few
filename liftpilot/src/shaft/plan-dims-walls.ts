// The side walls of a plan's dimensions (plan-dims.ts). On the counterweight's side: the car rails of a cantilever
// sling, the counterweight rails with their profile (D.F.G.), the bridge bracket, the platform, the shaft. On a side
// without the counterweight: the depth from the start of the landing sill to the end of the car (landing sill, the gap
// between the sills, the car's sill with its door, the car), the car inside with its walls, with a counterweight at
// the back the car with its sill to the counterweight (the space between them, the counterweight, the wall behind
// it), the axis of the car rails, the shaft. With two such sides the first takes the depth, the second the car and the
// counterweight; alone, one side takes them all.
import { edit as E, type Edit, type Side } from '../drawing';
import { KV } from './norme';
import { RAILS } from './rails';
import { railPick } from './plan-picks';
import type { PushChain } from './plan-dims';
import type { DoorLayout, Layout } from './types';

export interface SideWallCtx {
  L: Layout;
  push: PushChain;
  total(side: Side, dir: 'x' | 'y'): void;
  /** landing doors of the level */
  open: readonly DoorLayout[];
  doorSide: Side;
  /** edits of the platform's depth from the front wall */
  carY: readonly Edit[];
  /** depth of the counterweight's niche */
  nd: number;
}

export function sideWallDims({ L, push, total, open, doorSide, carY, nd }: SideWallCtx): void {
  const I = L.inputs, { D, carWall: cw, landingDepth: ld, sillGap: sg } = I, { car, carInner: ci } = L, wr = RAILS[I.cwRail];
  const sill = ld + sg, end = car.y + car.h, rearDoor = L.doors.some((d) => d.wall === 'rear');
  const cwWallSide: Side | null = L.cwSide === 'left' ? 'left' : L.cwSide === 'right' ? 'right' : null;
  const sides = (['left', 'right'] as const).filter((s) => s !== doorSide), free = sides.filter((s) => s !== cwWallSide);
  // the landing door the depth starts from: on the front wall, else on the rear one; none at this level, the platform
  const from = open.find((d) => d.wall === 'front') ?? open.find((d) => d.wall === 'rear') ?? null;
  for (const side of sides) {
    if (side === cwWallSide) {
      const [a, b] = L.rails.filter((r) => r.kind === 'cw'), n = L.cw.h, sh = KV.cwShoe, pick = railPick('cwRail', I.cwRail);
      if (L.frame.kind === 'cantilever') {
        const [p, q] = L.rails.filter((r) => r.kind === 'car');
        push(side, 'y', [0, p.y, q.y, D], [null, '{v} D.F.G. Arcata', null], [E('plan.railY'), E('plan.dbg'), E('plan.railY', D - (q.y - p.y), -1)]);
      }
      push(side, 'y', [0, a.y - wr.h, a.y, b.y, b.y + wr.h, D], [null, '{v}', 'D.F.G {v}', '{v}', null],
        [E('plan.cwPos', sh + wr.h), pick, E('plan.cwLen', -2 * sh), pick, E('plan.cwPos', D - n - sh - wr.h, -1)]);
      if (L.bridge) {
        const o = sh + wr.h;
        push(side, 'y', [0, L.bridge.y0, L.bridge.y1, D], [null, '{v} Ingombro Staffa', null], [E('plan.cwPos', o), E('plan.cwLen', -2 * o), E('plan.cwPos', D - n - o, -1)]);
      }
      push(side, 'y', [0, car.y, end, D], undefined, [...carY]);
      total(side, 'y');
      continue;
    }
    const first = side === free[0], alone = free.length < 2;
    if (first && from) {
      // from the start of the landing sill: the sill, the gap, the car's sill and door, the car, and on to the other
      // wall (a second entrance: its car door, gap and landing sill)
      push(side, 'y', [0, ld, sill, car.y, end, ...(rearDoor ? [D - sill, D - ld] : []), D], ['{v}', '{v}', '{v}', '{v} Cabina', ...(rearDoor ? ['{v}', '{v}', '{v}'] : [null])],
        [E('landingDepth'), E('sillGap'), E('carDoorDepth'), E('plan.B', -2 * cw),
          ...(rearDoor ? [E('plan.B', D - sill - car.y - 2 * cw, -1), E('sillGap'), E('landingDepth')] : [E('plan.B', D - car.y - 2 * cw, -1)])]);
      // the landing sill's start to the far end of the car: the car's depth changes (from the rear door: its car door)
      if (from.wall === 'front') push(side, 'y', [0, end], ['{v} Inizio soglia di piano – fine cabina'], [E('plan.B', -(car.y + 2 * cw))]);
      else push(side, 'y', [car.y, D], ['{v} Inizio soglia di piano – fine cabina'], [E('carDoorDepth', D - sill, -1)]);
    } else if (first) push(side, 'y', [0, car.y, end, D], [null, '{v} Piattaforma', null], [...carY]);
    if (!first || alone) {
      push(side, 'y', [0, car.y, ci.y, ci.y + ci.h, end, D], [null, '{v}', '{v} Interno Cabina', '{v}', null],
        [E('carDoorDepth', -sill), E('carWall'), E('plan.B'), E('carWall'), E('plan.B', D - car.y - 2 * cw, -1)]);
      if (L.cwSide === 'rear') {
        // the car with its sill to the counterweight at the back, the space between them (the counterweight moves with
        // its wall gap, the car keeps its depth), the counterweight and the wall behind it (the back of its niche)
        const c = L.cw, keep = [{ key: 'plan.B', value: L.B }] as const;
        push(side, 'y', [sill, end, c.y, c.y + c.h, D + nd], ['{v} Cabina con soglia', '{v}', '{v}', '{v}'],
          [E('plan.B', -(I.carDoorDepth + 2 * cw)), E('cwWallGap', D + nd - I.cwDepth - end, -1, keep), E('cwDepth'), E('cwWallGap')]);
        push(side, 'y', [sill, c.y], ['{v} Soglia di cabina – contrappeso'], [E('cwWallGap', D + nd - I.cwDepth - sill, -1, keep)]);
      }
    }
    if (first && L.frame.kind === 'central') push(side, 'y', [0, L.frame.axis, D], ['{v}', null], [E('plan.railY'), E('plan.railY', D, -1)]);
    total(side, 'y');
  }
}
