// The counterweight's guide rails under the grip of its safety gear (round 37; registry guide.contrappeso): a space
// people reach under the shaft gives the counterweight a safety gear (cw-gear.ts), whose operation loads its two rails
// with Fv = k1·g·Mcw/2 and the rail's own weight (UNI EN 81-20:2020, 5.7.2.3.5) — buckling by the omega method like the
// car's (rail-check.ts) — and with the guiding forces of the counterweight's mass off its centre by KV_VERT.cwEccWidth
// of its width and KV_VERT.cwEccDepth of its depth (5.7.2.3.3), at the same k1; the car's load cases do not apply.
// Units: N, mm, N/mm². Pure.
import { check } from '@/shaft/checks';
import { maxBracketSpan, railSpan } from '@/shaft/brackets';
import { KV_VERT } from '@/shaft/norme-vert';
import { RAILS, RAIL_SECTIONS, iMin } from '@/shaft/rails';
import { section } from '@/shaft/section';
import type { Layout, ShaftCheck } from '@/shaft/types';
import type { Plant } from '../plant';
import { impactFactor, type SafetyGear } from './forces';
import { omega, railLimits } from './rail-check';

const G = 9.81;

export interface CwRailCheck {
  /** the longest span between two of its brackets [mm], the slenderness and ω (null: λ beyond the table) */
  l: number;
  lambda: number;
  omega: number | null;
  /** the impact factor of the counterweight's gear, the vertical force on a rail and the guiding forces across the
   *  rails' line (on the blades' faces, both rails) and along it (on a tip) [N] */
  k1: number;
  fv: number;
  fx: number;
  fy: number;
  /** σm, σ = σm + Fv/A, σk, σc = σk + 0,9·σm [N/mm²] */
  sm: number;
  s: number;
  sk: number | null;
  sc: number | null;
}

/** The counterweight's rails of `L` under the grip of its safety gear `gear`, the counterweight of `Mcw` kg; the bracket
 *  pitch of the data of the installation `Pl` (none: the rule's). */
export function cwRailCheck(L: Layout, Mcw: number, gear: SafetyGear, Pl: Plant): CwRailCheck {
  const K = KV_VERT, type = L.inputs.cwRail, S = RAIL_SECTIONS[type], [z0, z1] = railSpan(section(L));
  const l = maxBracketSpan(z0, z1, type, Pl.cwBracketPitch), own = (G * RAILS[type].q * (z1 - z0)) / 1000;
  const lambda = l / iMin(S), w = omega(lambda), k1 = impactFactor(gear), n = 2;
  // its width between its rails (along their line) and its depth across it [m]; its shoes the counterweight's height apart
  const rear = L.cwSide === 'rear', width = (rear ? L.cw.w : L.cw.h) / 1000, depth = L.inputs.cwDepth / 1000, h = L.inputs.vertical.cwH / 1000;
  const fx = (k1 * G * Mcw * K.cwEccDepth * depth) / (n * h), fy = (k1 * G * Mcw * K.cwEccWidth * width) / ((n / 2) * h);
  const sm = (K.railBend * fx * l) / S.Wy + (K.railBend * fy * l) / S.Wx;
  const fv = (k1 * G * Mcw) / n + own, sk = w === null ? null : (fv * w) / S.A;
  return { l, lambda, omega: w, k1, fv, fx, fy, sm, s: sm + fv / S.A, sk, sc: sk === null ? null : sk + K.railCombine * sm };
}

/** The check gr_cw: the larger of σ and σc within the permissible stress at a safety gear's operation (Rm/1,8); a
 *  slenderness beyond the table fails it. */
export function cwRailChecks(c: CwRailCheck): ShaftCheck[] {
  const lim = railLimits().gear, s = c.sc === null ? null : Math.max(c.s, c.sc);
  return [check('gr_cw', s !== null && s <= lim, s, lim, 1, 'MPa')];
}

/** gr_cw where the counterweight has a safety gear (`gear`: cw-gear.ts cwGearOf), none without. */
export const cwRails = (L: Layout, Mcw: number, gear: SafetyGear | null, Pl: Plant): ShaftCheck[] => (gear ? cwRailChecks(cwRailCheck(L, Mcw, gear, Pl)) : []);
