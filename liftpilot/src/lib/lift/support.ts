// The machine's load on its support as sheet 1 counts it (registry carichi.macchina): the static load on its axis (the
// car, the rated load and the counterweight, half of them at 2:1, the ropes and the travelling cables) times the
// dynamic coefficient, plus the machine with its bedframe; and the check of the beams under it (src/shaft/support-check.ts).
import type { ParsedInputs } from '@/calc/types';
import { roomGeo, type Layout, type MachineSpec, type ShaftCheck } from '@/shaft';
import { KV_VERT } from '@/shaft/norme-vert';
import { roomChecksOf } from '@/shaft/machine-room';
import { beamChecks, fitChecks, machineBox, rinvioChecks, type SupportLoad } from '@/shaft/support-check';

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

/** The load the support carries for these values: `over` takes the data of the installation (machine with bedframe,
 *  cables, dynamic coefficient) where given. */
export function supportLoad({ I, N }: Pick<ParsedInputs, 'I' | 'N'>, Mcw: number, over: { machine?: number; cables?: number; dyn?: number } = {}): SupportLoad {
  const ropes = N.n * N.qf * ropeLength(I), cables = cablesMass(I.H, over.cables);
  return { machine: over.machine ?? N.mass, static: axisStatic({ P: I.P, Q: I.Q, Mcw, roping: I.r, ropes, cables }), dyn: over.dyn ?? KV_VERT.dynFactor };
}

/** The checks of the machine's support (the beams' stress and deflection, none for the other supports; the reach of
 *  a maker's bedplate with the diverting pulley) and of the machine in the room (it fits, and the free area in front of
 *  the panel up to it, in place of the shaft's own m_panel: mergeChecks; `above`: the machine stands in the room over
 *  the shaft, not below). */
export const supportChecks = (L: Layout, M: MachineSpec, load: SupportLoad, above = true): ShaftCheck[] => {
  const G = roomGeo(L, M), panel = above && G ? roomChecksOf(G.room, machineBox(G, M)).filter((c) => c.id === 'm_panel') : [];
  return [...beamChecks(G, load), ...rinvioChecks(G, M), ...(above ? fitChecks(G, M) : []), ...panel];
};
