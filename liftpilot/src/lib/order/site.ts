// What the design knows of the ordered machine where it stands, for the draft order (build.ts): its hand seen from the
// sheave (registry ordine.esecuzione: the motor's side as the machine's shape has it), one rope's cut length (support.ts
// ropeCut, the same as sheet 1 and the bill), and a machine below beside the shaft its slow shaft through the wall
// (bottom.ts belowMachine: the sheave's plane from the wall, the wall, the overhang from the gearbox's face, the
// extension over the maker's drawing when the machine is drawn as it is; registry impianto.basso.albero) — with the
// drawings of its room: the machine room in plan and section B-B, or the room of the machine below in plan and section
// C-C. Pure.
import type { FormValues } from '@/calc/types';
import { mountOf } from '@/lib/catalog/mounting';
import type { MachineCandidate } from '@/lib/lift/advice';
import { belowMachine, type BottomScheme } from '@/lib/lift/bottom';
import type { LiftDerived, LiftInputs } from '@/lib/lift/derive';
import { layoutRigLength, rigLength } from '@/lib/lift/rope';
import { ropeCut } from '@/lib/lift/support';
import { analyse, mirrorRopes } from '@/lib/present/analysis';
import type { ReportBlock } from '@/lib/report/model';
import { belowGeoOf } from '@/lib/tavole/views';
import { roomGeo, type RoomGeo } from '@/shaft/machine-room';
import { motorSide } from '@/shaft/machine-shape';
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
  /** a machine below beside the shaft [mm]: the sheave's mid-plane from the wall's face in the shaft (`inner`), the wall
   *  the slow shaft crosses, the least overhang from the gearbox's face to the sheave through it (`reach`, the face 50 mm
   *  off the wall), whatever the machine; the overhang of the machine as drawn and how much longer its slow shaft is than
   *  on the maker's drawing (`ext`) — null when the machine is not drawn as it is (the generic body) or is already the
   *  long-shaft variant, whose drawing the software has not; null above or under the pit */
  through: { inner: number; wall: number; reach: number; overhang: number; ext: number | null } | null;
}

/** The hand of a machine whose motor lies along `motor` from its gearbox and whose sheave along `toSheave`, in plan
 *  (x, y with z up): seen from the sheave, the motor on the observer's right is the right hand. */
export function handOf(motor: P2, toSheave: P2): Hand {
  const right: P2 = [-toSheave[1], toSheave[0]];
  return right[0] * motor[0] + right[1] * motor[1] >= 0 ? 'destra' : 'sinistra';
}

/** In the machine room over the shaft (machine-room.ts geoOn): the worm (+X) along dir·u, the motor on the side of it
 *  the machine's shape has (motorSide), the sheave across the drop line toward −dir·v. */
export const roomHand = (G: RoomGeo): Hand => {
  const s = motorSide(G.frame.shape) * G.dir;
  return handOf([s * G.ux, s * G.uy], [G.dir * G.uy, -G.dir * G.ux]);
};

/** The design's own facts for the machine `x` derived with it, the catalogue's machine `c`. */
function siteOf(x: LiftDerived, c: MachineCandidate): OrderSite {
  const ropes = ropeCut(x.analysis.ctx.I, rigLength(x));
  if (x.bottom) {
    const M = x.machine, g = belowGeoOf(x.analysis, x.layout, M, x.bottom), m = belowMachine(x.layout, g, M.D, M.n, M.d, M.shape ?? null);
    // the extension over the maker's own shaft only of a machine drawn as it is that is not the long-shaft variant
    const own = !!M.shape && mountOf(c)?.kind !== 'long', side = motorSide(M.shape ?? null);
    const through = x.bottom !== 'under'
      ? { inner: Math.round(m.inner), wall: x.layout.inputs.wall, reach: Math.round(m.reach), overhang: Math.round(m.F.zSheave - m.F.face + m.ext), ext: own ? Math.round(m.ext) : null }
      : null;
    return { hand: handOf([side * m.xDir[0], side * m.xDir[1]], m.zDir), ropeCut: ropes, below: x.bottom, through };
  }
  const G = roomGeo(x.layout, x.machine);
  return { hand: G ? roomHand(G) : null, ropeCut: ropes, below: null, through: null };
}

/** The machine's room and its facts for a lift design with machine `m`: the design as saved when it verified that
 *  machine, else derived again with it (its frame, its axis, its bedplate, its rope geometry). */
export function designSite(inp: LiftInputs, d: LiftDerived, m: MachineCandidate, recorded: boolean): { room: ReportBlock[]; site: OrderSite } {
  const x = designWith(inp, d, m, recorded);
  return { room: designRoom(inp, x, m, true), site: siteOf(x, m) };
}

/** The same for a calculation (the calculator's values `V`) with machine `m` and the shaft design `L` it comes from: the
 *  rope's cut length on that design's rig with the machine as the calculation (or the advice, its values loaded:
 *  advice.ts valuesCandidate) verified it, as sheet 1 and the bill measure it (rope.ts layoutRigLength); without a
 *  shaft design by the formula, and no room, no hand; a machine below has no scheme: no drawing, the overhang to be
 *  measured. */
export function calcSite(L: Layout | null, m: MachineCandidate, V: FormValues): { room: ReportBlock[]; site: OrderSite } {
  const rig = L ? layoutRigLength(L, analyse(mirrorRopes({ ...V, ...m.values }))) : null;
  const site: OrderSite = { hand: null, ropeCut: ropeCut(m.I, rig), below: m.I.layout === 'bottom' ? 'head' : null, through: null };
  if (!L?.inputs.room || m.I.layout === 'bottom') return { room: [], site };
  const G = roomGeo(L, calcSpec(L, m));
  return { room: calcRoom(L, m), site: { ...site, hand: G ? roomHand(G) : null } };
}
