// The counterweight's guide rails under the grip of its safety gear (round 37; registry guide.contrappeso): a space
// people reach under the shaft gives the counterweight a safety gear (cw-gear.ts), whose operation loads its two rails
// with Fv = k1·g·Mcw/2 and the rail's own weight (UNI EN 81-20:2020, 5.7.2.3.5) — buckling by the omega method like the
// car's (rail-check.ts) — and with the guiding forces of the counterweight's mass off its centre by KV_VERT.cwEccWidth
// of its width and KV_VERT.cwEccDepth of its depth (5.7.2.3.3), at the same k1; the car's load cases do not apply.
// Round 49: the check's core on a geometry (cwRailCore), which the relazione tecnica di modifica also gives from a
// survey; cwRailGeometryOf takes the design's exactly as before. Units: N, mm, N/mm². Pure.
import { check } from '@/shaft/checks';
import { maxBracketSpan, railSpan } from '@/shaft/brackets';
import { KV_VERT } from '@/shaft/norme-vert';
import { RAILS, RAIL_SECTIONS, iMin, type RailSection } from '@/shaft/rails';
import { section } from '@/shaft/section';
import type { Layout, ShaftCheck } from '@/shaft/types';
import type { Plant } from '../plant';
import { impactFactor, type SafetyGear } from './forces';
import { omega, omegaRm, railLimits, type RailOpts } from './rail-check';

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

/** The counterweight on its rails as the check takes it: the rails' section with its mass per metre [kg/m] (and its
 *  least radius of gyration when typed by hand), the longest span between two brackets and the rails' length [mm], the
 *  counterweight's width between its rails and its depth across them, the distance of its shoes [m]. */
export interface CwRailGeometry {
  section: RailSection & { q: number; i?: number };
  l: number;
  len: number;
  width: number;
  depth: number;
  h: number;
}

/** The geometry of the design `L` with the bracket pitch of the data of the installation `Pl` (none: the rule's). */
export function cwRailGeometryOf(L: Layout, Pl: Plant): CwRailGeometry {
  const type = L.inputs.cwRail, [z0, z1] = railSpan(section(L)), l = maxBracketSpan(z0, z1, type, Pl.cwBracketPitch);
  // its width between its rails (along their line) and its depth across it [m]; its shoes the counterweight's height apart
  const rear = L.cwSide === 'rear', width = (rear ? L.cw.w : L.cw.h) / 1000, depth = L.inputs.cwDepth / 1000, h = L.inputs.vertical.cwH / 1000;
  return { section: { ...RAIL_SECTIONS[type], q: RAILS[type].q }, l, len: z1 - z0, width, depth, h };
}

/** The counterweight's rails of `L` under the grip of its safety gear `gear`, the counterweight of `Mcw` kg; the bracket
 *  pitch of the data of the installation `Pl` (none: the rule's). */
export function cwRailCheck(L: Layout, Mcw: number, gear: SafetyGear, Pl: Plant): CwRailCheck {
  return cwRailCore(cwRailGeometryOf(L, Pl), Mcw, gear);
}

/** cwRailCheck on a geometry; the steel's Rm of the relazione tecnica di modifica only when given (ω interpolated). */
export function cwRailCore(geo: CwRailGeometry, Mcw: number, gear: SafetyGear, o?: Pick<RailOpts, 'Rm'>): CwRailCheck {
  const K = KV_VERT, S = geo.section, { l, width, depth, h } = geo, own = (G * S.q * geo.len) / 1000;
  const lambda = l / (S.i ?? iMin(S)), w = o?.Rm === undefined ? omega(lambda) : omegaRm(lambda, o.Rm), k1 = impactFactor(gear), n = 2;
  const fx = (k1 * G * Mcw * K.cwEccDepth * depth) / (n * h), fy = (k1 * G * Mcw * K.cwEccWidth * width) / ((n / 2) * h);
  const sm = (K.railBend * fx * l) / S.Wy + (K.railBend * fy * l) / S.Wx;
  const fv = (k1 * G * Mcw) / n + own, sk = w === null ? null : (fv * w) / S.A;
  return { l, lambda, omega: w, k1, fv, fx, fy, sm, s: sm + fv / S.A, sk, sc: sk === null ? null : sk + K.railCombine * sm };
}

/** The check gr_cw: the larger of σ and σc within the permissible stress at a safety gear's operation (Rm/1,8; another
 *  for the relazione tecnica di modifica's steel: railLimits(o).gear); a slenderness beyond the table fails it. */
export function cwRailChecks(c: CwRailCheck, lim = railLimits().gear): ShaftCheck[] {
  const s = c.sc === null ? null : Math.max(c.s, c.sc);
  return [check('gr_cw', s !== null && s <= lim, s, lim, 1, 'MPa')];
}

/** gr_cw where the counterweight has a safety gear (`gear`: cw-gear.ts cwGearOf), none without. */
export const cwRails = (L: Layout, Mcw: number, gear: SafetyGear | null, Pl: Plant): ShaftCheck[] => (gear ? cwRailChecks(cwRailCheck(L, Mcw, gear, Pl)) : []);
