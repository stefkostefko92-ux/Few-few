// The machine's load on its support as sheet 1 counts it (registry carichi.macchina): the static load on its axis (the
// car, the rated load and the counterweight, half of them at 2:1, the ropes and the travelling cables) times the
// dynamic coefficient, plus the machine with its bedframe; and the check of the beams under it (src/shaft/support-check.ts)
// and of the HEB beams on the shaft's walls (src/shaft/heb.ts).
import type { Machine, ParsedInputs } from '@/calc/types';
import { freeSides, governorSpot, hebChecks, hebFor, layout, roomGeo, type HebOption, type Layout, type MachineSpec, type RoomGeo, type Rope, type ShaftCheck } from '@/shaft';
import { KV_VERT } from '@/shaft/norme-vert';
import { roomChecksOf } from '@/shaft/machine-room';
import { outlineGap, switchBox, type Box } from '@/shaft/room-floor';
import type { PanelSpot } from '@/shaft/room-panel';
import { governorFootprint, governorRopes as governorRopesIn, shaftUnder } from '@/shaft/room-site';
import { beamChecks, fitChecks, governorRoomChecks, machineParts, panelFloorChecks, panelPlace, rinvioChecks, type SupportLoad } from '@/shaft/support-check';
import { IRON } from '@/shaft/machine-shape';
import { supportRunIn } from '@/shaft/machine-room';
import { PROFILES } from '@/shaft/profiles';
import { bedplateBeams, bedplateLegs, rinvioRun } from '@/shaft/rinvio';
import { hasProfile, profileOf, supportOf, type MachineSupport } from '@/shaft/support';
import { beamSpans, supportTop } from '@/shaft/support-view';
import { machineMass, sheaveKg } from './machine-mass';
import { KM } from './norme-masse';

/** Length of each traction rope [m]: the roping times the travel and twice the rope beyond it, with the diverting
 *  pulley's drop or, with the machine below, the runs to it. */
export const ropeLength = (I: ParsedInputs['I']): number => I.r * (I.H + 2 * I.L0) + (I.layout === 'topDefl' ? I.h : I.layout === 'bottom' ? 2 * I.Hv : 0);

/** The travelling cable's length the software counts [m]: half the travel plus 3 m (registry carichi.cavi). */
export const cableLength = (travel: number): number => travel / 2 + 3;

/** Travelling cables [kg]: as given, or KV_VERT.cableKgM over half the travel [m] plus 3 m (registry carichi.cavi). */
export const cablesMass = (travel: number, given?: number): number => given ?? KV_VERT.cableKgM * cableLength(travel);

/** A machine below: what the head pulleys carry with the car at the lowest floor with its rated load [kg] (research,
 *  funi in basso, §8): both falls of each side, 2·(T_c + T_w), each T the ropes' static pull at the head (the mass
 *  hanging under it over the roping, and the ropes down to it). The pulleys' own weight is not in it. */
export const headStatic = ({ I, N }: Pick<ParsedInputs, 'I' | 'N'>, Mcw: number): number => {
  const w = N.n * N.qf;
  return 2 * ((I.P + I.Q) / I.r + w * (I.H + I.L0) + Mcw / I.r + w * I.L0);
};

/** Static load on the machine's axis [kg]. */
export const axisStatic = (x: { P: number; Q: number; Mcw: number; roping: number; ropes: number; cables: number }): number =>
  (x.roping > 1 ? (x.P + x.Q + x.Mcw) / 2 : x.P + x.Q + x.Mcw) + x.ropes + x.cables;

/** Of the static load on the machine's axis, what hangs on the car's fall [kg]: the car and its rated load (half of them
 *  at 2:1), half the ropes, the cables. */
export const carSideStatic = (x: { P: number; Q: number; roping: number; ropes: number; cables: number }): number =>
  (x.roping > 1 ? (x.P + x.Q) / 2 : x.P + x.Q) + x.ropes / 2 + x.cables;

/** The mass of the maker's bedplate with the diverting pulley the machine stands on [kg], 0 on any other support: the
 *  support carries it with the machine (registry carichi.macchina), on the screen, in the relazione and on sheet 1. */
export const bedplateMass = (M: Pick<MachineSpec, 'rinvio'> | null): number => (M?.rinvio?.on === 'frame' ? M.rinvio.maker?.mass ?? 0 : 0);

/** The own weight of what carries the machine on the slab (registry impianto.massa.basamento) [kg]: the maker's bedplate
 *  with the pulley (its catalogue's mass); our bedframe under a maker's machine (three channels as tall as the frame and
 *  their end cross members) or our riser under its feet; the support on the floor as the drawings draw it — a frame of
 *  profiles, the beams from wall to wall, the plates, the plinth's blocks, our bedplate with the pulley (its beams, legs
 *  and the pulley), the pulley's own stand. The HEB beams on the shaft's walls are their own (heb.ts). */
export interface SupportMass {
  maker: number;
  frame: number;
  base: number;
  kind: MachineSupport['kind'];
}

export function supportMass(G: RoomGeo | null, M: MachineSpec): SupportMass {
  const s = supportOf(G?.room ?? null, M.Dp > 0), rf = M.rinvio ?? null, maker = bedplateMass(M);
  if (!G) return { maker, frame: 0, base: 0, kind: s.kind };
  const F = G.frame, steel = KM.steelKgM3 / 1e9, run = (r: readonly [number, number] | null): number => (r ? r[1] - r[0] : 0);
  const channel = (h: number, len: number): number => (2 * IRON * KM.ironTf + Math.max(0, h - 2 * KM.ironTf) * KM.ironTw) * len * steel;
  const across = Math.max(...F.beams) - Math.min(...F.beams);
  // our bedframe under a maker's machine (the generic machine's own is in its mass), or our riser on our bedplate
  const frame = F.shape && F.on === 'frame' ? channel(F.bed, F.beams.length * run(F.run) + 2 * Math.max(0, across - IRON))
    : F.shape && F.on === 'pad' ? box(F.shape.feet, F.bed) * steel : 0;
  const top = supportTop(M, s) - (M.base ?? 0), P = hasProfile(s) ? PROFILES[profileOf(s)] : null, mounts = 2;
  let base = 0;
  if (s.kind === 'plates') base = mounts * F.beams.length * KM.plateL * KM.plateW * top * steel;
  else if (s.kind === 'plinth') base = F.plinth.reduce((a, [z0, z1]) => a + Math.abs(z1 - z0), 0) * run(supportRunIn(G, M)) * top * KM.concreteKgM3 / 1e9;
  else if (s.kind === 'frame' && P) base = (P.mass * (F.beams.length * run(supportRunIn(G, M)) + 2 * (across + P.b))) / 1000;
  else if (s.kind === 'beams' && P) base = (P.mass * beamSpans(G).reduce((a, r) => a + run(r), 0)) / 1000;
  else if (rf?.on === 'frame' && !rf.maker) {
    // our bedplate with the pulley: its beams along and across, its legs, the pulley
    const U = PROFILES[KV_VERT.rinvioBeam], bp = bedplateBeams(F.beams, KV_VERT.rinvioWidth), width = bp.edges[1] - bp.edges[0];
    base = (U.mass * ((2 + bp.inner.length) * run(rinvioRun(M, G)) + 2 * width)) / 1000 + sheaveKg(M.Dp, M.n, M.d)
      + (bedplateLegs(G, M, null).length * KM.legKgM * Math.max(0, rf.top - (rf.base ?? 0) - U.h)) / 1000;
  }
  // the pulley on its own stand beside another support: the pulley and four legs up to its axis
  if (rf?.on === 'stand') base += sheaveKg(M.Dp, M.n, M.d) + (4 * KM.legKgM * Math.max(0, rf.pulleyAxis - (rf.base ?? 0))) / 1000;
  return { maker, frame: Math.round(frame), base: Math.round(base), kind: s.kind };
}

/** A welded box under the feet [x0, z0, x1, z1] `h` tall: plates top and bottom, walls round it [mm³]. */
const box = (feet: readonly number[], h: number): number => {
  const [x0, z0, x1, z1] = feet, a = Math.abs(x1 - x0), b = Math.abs(z1 - z0), t = 12, w = 8;
  return 2 * a * b * t + 2 * (a + b) * Math.max(0, h - 2 * t) * w;
};

/** The mass the support's checks take as the machine's (the beams under it, the HEB beams on the shaft's walls): the
 *  `whole` machine (machine-mass.ts), the maker's bedplate, our bedframe and, on anything but the beams checked (whose
 *  own weight the check counts), the support. */
export const carriedBy = (w: SupportMass, whole: number): number => whole + w.maker + w.frame + (w.kind === 'beams' ? 0 : w.base);

/** carriedBy for the machine `M` in the room `G` (null: none over the shaft), the calculation's machine `N`, the maker's
 *  model `made`. */
export const carriedMass = (G: RoomGeo | null, M: MachineSpec, N: Machine, made: { brand: string; model: string } | null): number =>
  carriedBy(supportMass(G, M), machineMass(N, made).kg);

/** The load the support carries for these values: `over` takes the data of the installation (machine with bedframe,
 *  cables, dynamic coefficient) where given. */
export function supportLoad({ I, N }: Pick<ParsedInputs, 'I' | 'N'>, Mcw: number, over: { machine?: number; cables?: number; dyn?: number } = {}): SupportLoad {
  const ropes = N.n * N.qf * ropeLength(I), cables = cablesMass(I.H, over.cables);
  return {
    machine: over.machine ?? N.mass, static: axisStatic({ P: I.P, Q: I.Q, Mcw, roping: I.r, ropes, cables }), dyn: over.dyn ?? KV_VERT.dynFactor,
    car: carSideStatic({ P: I.P, Q: I.Q, roping: I.r, ropes, cables }),
  };
}

/** The governor's rope where it goes through the slab, both strands (room axes; room-site.ts — the drawings take the
 *  same); none without one placed. */
export const governorRopes = (L: Layout, G: RoomGeo): Rope[] => governorRopesIn(L, G.room);

/** The HEB beams on the shaft's walls under the machine of a whole design at `load` (heb.ts hebFor): the six weighed and
 *  the one taken; null without them or without a room over the shaft. */
export function hebOf(L: Layout, M: MachineSpec, load: SupportLoad): { options: HebOption[]; chosen: HebOption } | null {
  const G = roomGeo(L, M);
  return G ? hebFor(G, M, shaftUnder(L), load, governorRopes(L, G)) : null;
}

/** What stands on the floor of the room over the shaft besides the machine: the governor as the plan draws it, the main
 *  switch by the door (room axes). */
const floorOthers = (L: Layout, G: RoomGeo): Box[] => {
  const gov = governorFootprint(L, G.room);
  return [...(gov ? [gov] : []), switchBox(G.room)];
};

/** The checks of the machine's support (the beams' stress and deflection, none for the other supports; the reach of
 *  a maker's bedplate with the diverting pulley; the HEB beams on the shaft's walls) and of the machine in the room (it
 *  fits, the free area beside it, and the free area in front of the panel up to what stands on the floor, in place of
 *  the shaft's own m_panel: mergeChecks; the panel clear of it all, the ways from the door; `above`: the machine stands
 *  in the room over the shaft, not below). */
export const supportChecks = (L: Layout, M: MachineSpec, load: SupportLoad, above = true): ShaftCheck[] => {
  const G = roomGeo(L, M);
  if (!above || !G) return [...beamChecks(G, M, load), ...rinvioChecks(G, M)];
  const others = floorOthers(L, G), panel = roomChecksOf(G.room, [...machineParts(G, M), ...others]).filter((c) => c.id === 'm_panel');
  return [...beamChecks(G, M, load), ...rinvioChecks(G, M), ...hebChecks(hebOf(L, M, load)?.chosen.result ?? null), ...fitChecks(G, M, others), ...panel,
    ...panelFloorChecks(G, M, others), ...governorRoomChecks(governorFootprint(L, G.room), G, M)];
};

/** Where the software puts the control panel in the room over the shaft for the machine `M` (room-panel.ts placePanel);
 *  null without a room. */
export function placedPanel(L: Layout, M: MachineSpec): PanelSpot | null {
  const G = roomGeo(L, M);
  return G ? panelPlace(G, M, floorOthers(L, G)) : null;
}

/** How far the governor stands from the machine and its support in the room over the shaft [mm] (below 0: on them);
 *  Infinity without a room or a governor drawn. */
function governorGap(L: Layout, M: MachineSpec): number {
  const G = roomGeo(L, M), gov = G ? governorFootprint(L, G.room) : null;
  return G && gov ? Math.min(...machineParts(G, M).map((b) => outlineGap(gov, b))) : Infinity;
}

/** The side wall of the governor's rope the software takes for the machine `M` when the side is left to it (registry
 *  limitatore.posto): the last free one, or the other free one when only there the governor stands clear of the
 *  machine in the room over the shaft (the machine turned round toward the car's drop reaches across to it); null: the
 *  layout's own — the side chosen, the governor placed by hand on the plan, one free side, no room over the shaft. */
export function governorSideFor(L: Layout, M: MachineSpec): 'left' | 'right' | null {
  const I = L.inputs, spot = governorSpot(L), byHand = I.plan?.govX !== undefined || I.plan?.govY !== undefined;
  if (I.governorSide || byHand || !I.room || !spot || governorGap(L, M) >= 0) return null;
  const other = freeSides(L).find((s) => s !== spot.side);
  if (!other) return null;
  const Lo = layout({ ...I, governorSide: other });
  return governorSpot(Lo)?.side === other && governorGap(Lo, M) >= 0 ? other : null;
}
