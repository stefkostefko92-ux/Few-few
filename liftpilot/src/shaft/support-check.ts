// The check of the two beams (putrelle) under the machine, registry locale.putrelle: each carries half the machine's
// load (the machine with its bedframe plus the static load on its axis times the dynamic coefficient) as one force at
// mid-span, with its own weight, over the span between the bearings' centres in the walls along the rope drop line.
// Stress σ = M/Wel,y ≤ fyk/γM0 and elastic deflection ≤ 1/1500 of the clear span. Pure.
import { check } from './checks';
import { dropSpan, type MachineSpec, type RoomGeo } from './machine-room';
import { KV_VERT } from './norme-vert';
import { PROFILES } from './profiles';
import { profileOf, supportOf } from './support';
import type { ShaftCheck } from './types';

const G = 9.81;

/** The machine's load on its support [kg]: the machine with its bedframe, the static load on its axis, the dynamic
 *  coefficient on the latter. */
export interface SupportLoad {
  machine: number;
  static: number;
  dyn: number;
}

export interface BeamResult {
  /** clear span between the walls and span between the bearings' centres [mm], force on each beam [N], stress [MPa]
   *  and its limit, deflection and its limit [mm] */
  clear: number;
  L: number;
  F: number;
  sigma: number;
  sigmaMax: number;
  f: number;
  fMax: number;
}

/** The beams under the machine at this load; null when the machine does not stand on beams. */
export function beamResult(Gm: RoomGeo, load: SupportLoad): BeamResult | null {
  const s = supportOf(Gm.room);
  if (s.kind !== 'beams') return null;
  const P = PROFILES[profileOf(s)], [r0, r1] = dropSpan(Gm, 0, 0, Gm.room.W, Gm.room.D);
  const clear = r1 - r0, L = clear + KV_VERT.supportBearing, F = ((load.machine + load.static * load.dyn) * G) / 2;
  // own weight [N/mm]; Wel,y [cm³] and Iy [cm⁴] in mm
  const q = (P.mass * G) / 1000, W = P.Wy * 1e3, I = P.Iy * 1e4, E = KV_VERT.steelE;
  const M = (F * L) / 4 + (q * L * L) / 8;
  const f = (F * L ** 3) / (48 * E * I) + (5 * q * L ** 4) / (384 * E * I);
  return { clear, L, F, sigma: M / W, sigmaMax: KV_VERT.steelFyk / KV_VERT.steelGammaM0, f, fMax: clear / KV_VERT.beamDeflection };
}

/** The check m_rinvio (registry locale.rinvio), soft: on a maker's bedplate the counterweight's rope drop within its
 *  reach — from the sheave's car side to the pulley's far side at most the maker's L max (a longer bedplate is made to
 *  measure); none on ours or without one. */
export function rinvioChecks(Gm: RoomGeo | null, M: MachineSpec): ShaftCheck[] {
  const mk = M.rinvio?.on === 'frame' ? M.rinvio.maker : null;
  if (!Gm || !mk || M.Dp <= 0) return [];
  const need = Gm.pulleyAt + M.Dp / 2 - M.ropeIn;
  return [check('m_rinvio', need <= mk.fall.max, need, mk.fall.max, 0, 'mm', true)];
}

/** The checks m_beam (stress) and m_beamf (deflection); none when the machine does not stand on beams. */
export function beamChecks(Gm: RoomGeo | null, load: SupportLoad): ShaftCheck[] {
  const b = Gm ? beamResult(Gm, load) : null;
  if (!b) return [];
  return [
    check('m_beam', b.sigma <= b.sigmaMax, b.sigma, b.sigmaMax, 0, 'MPa'),
    check('m_beamf', b.f <= b.fMax, b.f, b.fMax, 1, 'mm'),
  ];
}
