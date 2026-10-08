// The car rails' check and the loads on the building as sheet 1 counts them — one computation for the data sheet
// (data.ts) and the relazione (src/lib/report/guide.ts): the rails from the pit floor to under the slab with a bracket
// every pitch (registry guide.staffe, guide.verifica), the forces at the safety gear's operation; the machine as a whole
// (machine-mass.ts), the own weight of what carries it (support.ts supportMass) and of the HEB beams on the shaft's
// walls, the ropes and the cables, the dynamic coefficient (registry carichi.macchina), P1…P9, and a bottom machine's
// pull on its anchors. Pure.
import { KV_VERT } from '@/shaft/norme-vert';
import { bracketHeights, railSpan } from '@/shaft/brackets';
import { PROFILES } from '@/shaft/profiles';
import { section } from '@/shaft/section';
import type { HebOption } from '@/shaft/heb';
import type { MachineSpec } from '@/shaft/machine-room';
import { roomGeo } from '@/shaft/machine-room';
import { RAILS } from '@/shaft/rails';
import type { Layout } from '@/shaft/types';
import { anchorPull, type AnchorPull } from '../lift/anchor';
import { machineMass, type MachineMass } from '../lift/machine-mass';
import { cablesMass, carSideStatic, carriedBy, headStatic, hebOf, supportMass, type SupportMass } from '../lift/support';
import type { Plant } from '../plant';
import type { Analysis } from '../present/analysis';
import { railForces, type SafetyGear } from './forces';
import { loads, type Loads, type LoadsInput } from './loads';
import { railCheck, type RailCheck } from './rail-check';

export interface SheetRails {
  /** the rails' length [m], the brackets' heights and the longest span between two [mm] */
  railLen: number;
  hs: number[];
  span: number;
  gear: SafetyGear;
  rc: RailCheck;
  /** the forces on the rails at the safety gear's operation [N] */
  F: { fx: number; fy: number };
}

/** The car rails under an empty car P and a rated load Q [kg], with the data of the installation (the safety gear, the
 *  bracket pitch, the lift's use). */
export function sheetRails(L: Layout, P: number, Q: number, Pl: Plant): SheetRails {
  const V = L.inputs.vertical, S = section(L), railLen = (V.pit + S.top + V.headroom - KV_VERT.railTopGap) / 1000, gear = Pl.safetyGear ?? 'progressive';
  const [z0, z1] = railSpan(S), hs = bracketHeights(z0, z1, L.inputs.carRail, Pl.carBracketPitch), span = Math.max(...hs.slice(1).map((z, i) => z - hs[i]));
  return { railLen, hs, span, gear, rc: railCheck(L, L.inputs.carRail, P, Q, gear, span, z1 - z0, Pl.liftUse), F: railForces(L, P, Q, gear) };
}

export interface SheetLoads {
  ropesKg: number;
  cablesKg: number;
  /** the machine as a whole, what carries it, the HEB beams on the shaft's walls and their mass [kg] */
  machine: MachineMass;
  support: SupportMass;
  heb: HebOption | null;
  hebKg: number;
  /** what the support's checks take as the machine (support.ts carriedMass) [kg] */
  carried: number;
  dyn: number;
  ld: Loads;
  /** a machine below: the pull on its anchors (anchor.ts); null above */
  anchor: AnchorPull | null;
}

/** The loads for the calculation `a` on the design `L` with the machine `M` (`made`: the maker's model) and the ropes'
 *  mass `ropesKg`, the rails `R`; `cwGear`: the counterweight's safety gear over a space under the shaft (cw-gear.ts
 *  cwGearOf), none without. */
export function sheetLoads(a: Analysis, L: Layout, Pl: Plant, M: MachineSpec, made: { brand: string; model: string } | null, ropesKg: number, R: SheetRails,
  cwGear: SafetyGear | null = null): SheetLoads {
  const { ctx, res } = a, { I, N } = ctx, V = L.inputs.vertical, below = I.layout === 'bottom', dyn = KV_VERT.dynFactor;
  const cablesKg = cablesMass(section(L).top / 1000), machine = machineMass(N, made), support = supportMass(below ? null : roomGeo(L, M), M);
  const carried = carriedBy(support, machine.kg);
  const inp: LoadsInput = {
    P: I.P, Q: I.Q, Mcw: res.Mcw, ropes: ropesKg, cables: cablesKg, machine: carried, roping: I.r,
    carRailQ: RAILS[L.inputs.carRail].q, carRailLen: R.railLen, cwRailQ: RAILS[L.inputs.cwRail].q, cwRailLen: R.railLen,
    safetyGear: R.gear, dyn, carBuffers: V.carBuffers, cwBuffers: 1, governor: Pl.governorLoad ?? null, below: below ? headStatic(ctx, res.Mcw) : null, cwGear,
  };
  const car = carSideStatic({ P: I.P, Q: I.Q, roping: I.r, ropes: ropesKg, cables: cablesKg });
  const heb = below ? null : hebOf(L, M, { machine: carried, static: loads(inp).static, dyn, car })?.chosen ?? null;
  const hebKg = heb ? (2 * PROFILES[heb.profile].mass * heb.length) / 1000 : 0;
  // on the slab with the machine also the beams under it (borne in the room's walls: counted with the slab's) and the
  // HEB beams on the shaft's walls
  const ld = loads({ ...inp, base: (support.kind === 'beams' ? support.base : 0) + hebKg });
  return { ropesKg, cablesKg, machine, support, heb, hebKg, carried, dyn, ld, anchor: anchorPull(res.shaft, N.mass, dyn) };
}

/** The row of sheet 1 for what carries the machine (registry impianto.massa.basamento): its parts by name, their mass,
 *  marked as an estimate where the software's geometry gives it (the maker's bedplate is its catalogue's); none when
 *  the machine stands on shims. */
export function supportRows(w: SupportMass, M: MachineSpec, fmt: (x: number, dec?: number) => string): (readonly [string, string, string])[] {
  const rf = M.rinvio ?? null, mk = rf?.on === 'frame' ? rf.maker : null, stand = rf?.on === 'stand';
  const BASE: Readonly<Record<SupportMass['kind'], string>> = { shims: 'RINVIO E SUPPORTO', frame: 'TELAIO', beams: 'PUTRELLE', plates: 'PIASTRE', plinth: 'PLINTO', rinvio: 'TELAIO CON RINVIO' };
  const names = [...(w.frame > 0 ? ['TELAIO ARGANO'] : []), ...(w.base > 0 ? [`${BASE[w.kind]}${stand && w.kind !== 'shims' ? ' + RINVIO' : ''}`] : []),
    ...(mk ? [`TELAIO CON RINVIO ${mk.code}`] : [])];
  const total = w.frame + w.base + w.maker;
  return total > 0 ? [[`${names.join(' + ')}${w.frame + w.base > 0 ? ' (STIMA)' : ''}`, fmt(total, 0), 'kg']] : [];
}
