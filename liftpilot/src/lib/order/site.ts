// What the design knows of the ordered machine where it stands, for the draft order (build.ts): its hand seen from the
// sheave (registry ordine.esecuzione), one rope's cut length (support.ts ropeCut, the same as sheet 1 and the bill),
// and a machine below beside the shaft its slow shaft through the wall (bottom.ts belowMachine: the overhang from the
// gearbox's face to the sheave, the wall, the extension; registry impianto.basso.albero) — with the drawings of its
// room: the machine room in plan and section B-B, or the room of the machine below in plan and section C-C. Pure.
import type { MachineCandidate } from '@/lib/lift/advice';
import { belowMachine, type BottomScheme } from '@/lib/lift/bottom';
import type { LiftDerived, LiftInputs } from '@/lib/lift/derive';
import { rigLength } from '@/lib/lift/rope';
import { ropeCut } from '@/lib/lift/support';
import type { ReportBlock } from '@/lib/report/model';
import { belowGeoOf } from '@/lib/tavole/views';
import { roomGeo, type RoomGeo } from '@/shaft/machine-room';
import type { Layout } from '@/shaft/types';
import { calcRoom, calcSpec, designRoom, designWith } from './drawings';

type P2 = readonly [number, number];

/** The machine's hand: looking at it from the sheave's side along the slow shaft, the motor on the right or the left. */
export type Hand = 'destra' | 'sinistra';

export interface OrderSite {
  /** the hand the drawings and the 3D give it; null without them */
  hand: Hand | null;
  /** one traction rope's cut length [m] */
  ropeCut: number | null;
  /** the scheme of a machine below; null above */
  below: BottomScheme | null;
  /** a machine below beside the shaft: the sheave's overhang from the gearbox's face, the wall the slow shaft crosses and
   *  how much longer the shaft is than the machine's own [mm]; null otherwise */
  through: { overhang: number; wall: number; ext: number } | null;
}

/** The hand of a machine whose motor lies along `motor` from its gearbox and whose sheave along `toSheave`, in plan
 *  (x, y with z up): seen from the sheave, the motor on the observer's right is the right hand. */
export function handOf(motor: P2, toSheave: P2): Hand {
  const right: P2 = [-toSheave[1], toSheave[0]];
  return right[0] * motor[0] + right[1] * motor[1] >= 0 ? 'destra' : 'sinistra';
}

/** In the machine room over the shaft (machine-room.ts geoOn): the worm (+X, the motor) along dir·u, the sheave across
 *  the drop line toward −dir·v. */
export const roomHand = (G: RoomGeo): Hand => handOf([G.dir * G.ux, G.dir * G.uy], [G.dir * G.uy, -G.dir * G.ux]);

/** The design's own facts for the machine `x` derived with it. */
function siteOf(x: LiftDerived): OrderSite {
  const ropes = ropeCut(x.analysis.ctx.I, rigLength(x));
  if (x.bottom) {
    const M = x.machine, g = belowGeoOf(x.analysis, x.layout, M, x.bottom), m = belowMachine(x.layout, g, M.D, M.n, M.d, M.shape ?? null);
    const through = x.bottom !== 'under' ? { overhang: Math.round(m.F.zSheave - m.F.face + m.ext), wall: x.layout.inputs.wall, ext: Math.round(m.ext) } : null;
    return { hand: handOf(m.xDir, m.zDir), ropeCut: ropes, below: x.bottom, through };
  }
  const G = roomGeo(x.layout, x.machine);
  return { hand: G ? roomHand(G) : null, ropeCut: ropes, below: null, through: null };
}

/** The machine's room and its facts for a lift design with machine `m`: the design as saved when it verified that
 *  machine, else derived again with it (its frame, its axis, its bedplate, its rope geometry). */
export function designSite(inp: LiftInputs, d: LiftDerived, m: MachineCandidate, recorded: boolean): { room: ReportBlock[]; site: OrderSite } {
  const x = designWith(inp, d, m, recorded);
  return { room: designRoom(inp, x, m, true), site: siteOf(x) };
}

/** The same for a calculation with machine `m` and the shaft design `L` it comes from (none: no room, no hand); the
 *  rope's cut length by the formula; a machine below has no scheme: no drawing, the overhang to be measured. */
export function calcSite(L: Layout | null, m: MachineCandidate): { room: ReportBlock[]; site: OrderSite } {
  const site: OrderSite = { hand: null, ropeCut: ropeCut(m.I), below: m.I.layout === 'bottom' ? 'head' : null, through: null };
  if (!L?.inputs.room || m.I.layout === 'bottom') return { room: [], site };
  const G = roomGeo(L, calcSpec(L, m));
  return { room: calcRoom(L, m), site: { ...site, hand: G ? roomHand(G) : null } };
}
