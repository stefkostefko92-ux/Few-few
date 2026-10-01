// The machine's support in the room above the shaft (registry locale.basamento): levelling shims under its mounts (the
// sheave's axis where the software puts it), a frame of two rolled profiles on the floor, two beams (putrelle) from wall
// to wall that may stand clear of the floor, steel plates under the mounts, or a concrete plinth; anti-vibration pads
// under the mounts on all but the shims. Its height sets the sheave's axis over the room's floor (the calculation's rope
// beyond the travel and the 3D follow it); a frame and a plinth run along the rope drop line past the machine's
// bedplate. Millimetres; the machine is the one of the drawings, scaled to the sheave (machine-outline.ts). Pure.
import { MACHINE_A, MACHINE_X } from './machine-outline';
import { KV_VERT } from './norme-vert';
import { PROFILES, type ProfileName } from './profiles';
import type { RoomInputs } from './room';

export const SUPPORT_KINDS = ['shims', 'frame', 'beams', 'plates', 'plinth'] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number];

export interface MachineSupport {
  kind: SupportKind;
  /** a frame's or the beams' profile (missing: the typical one) */
  profile?: ProfileName;
  /** the support's top over the room's floor, where the mounts (on their pads) stand: the profiles' top (beams raised
   *  clear of the floor: higher than the profile), the plates' thickness, the plinth's height; with shims, the
   *  mounts' underside (missing: what the typical one or the software's axis gives) [mm] */
  height?: number;
  /** a frame's or a plinth's length along the rope drop line (missing: the bedplate's plus the overhang at each end) */
  length?: number;
}

const SHIMS: MachineSupport = { kind: 'shims' };

export const supportOf = (R: RoomInputs | null): MachineSupport => R?.support ?? SHIMS;
export const profileOf = (s: MachineSupport): ProfileName => s.profile ?? (s.kind === 'beams' ? KV_VERT.supportBeam : KV_VERT.supportFrame);
/** The support has profiles (a frame or beams). */
export const hasProfile = (s: MachineSupport): boolean => s.kind === 'frame' || s.kind === 'beams';

/** The machine's scale on the drawings' Ø 560, its sheave's axis over its bedplate's underside and the bedplate's ends
 *  along the drop line from the sheave's centre [mm], at the sheave D. */
const scale = (D: number): number => D / (2000 * MACHINE_A.rp);
export const ownAxis = (D: number): number => MACHINE_A.yWheel * 1000 * scale(D);
export const bedplate = (D: number): readonly [number, number] => [MACHINE_X[0] * 1000 * scale(D), MACHINE_X[1] * 1000 * scale(D)];

/** The pads under the mounts [mm]: none on the shims. */
export const padsOf = (s: MachineSupport): number => (s.kind === 'shims' ? 0 : KV_VERT.supportPads);

/** The support's top over the room's floor [mm]; `shimsAxis`: the sheave's axis the software takes on shims. */
export function supportHeight(s: MachineSupport, D: number, shimsAxis: number): number {
  if (s.height !== undefined) return s.height;
  if (s.kind === 'shims') return shimsAxis - ownAxis(D);
  if (hasProfile(s)) return PROFILES[profileOf(s)].h;
  return s.kind === 'plates' ? KV_VERT.supportPlate : KV_VERT.supportPlinth;
}

/** The sheave's axis over the room's floor on this support [mm]. */
export const sheaveAxisOn = (s: MachineSupport, D: number, shimsAxis: number): number => supportHeight(s, D, shimsAxis) + padsOf(s) + ownAxis(D);

/** A frame's or a plinth's length along the drop line [mm]; null for the others. */
export function supportLength(s: MachineSupport, D: number): number | null {
  if (s.kind !== 'frame' && s.kind !== 'plinth') return null;
  const [a, b] = bedplate(D);
  return s.length ?? Math.round(b - a + 2 * KV_VERT.supportOverhang);
}

/** Where a frame or a plinth runs along the drop line, from the sheave's centre: centred on the bedplate [mm]. */
export function supportSpan(s: MachineSupport, D: number): readonly [number, number] | null {
  const len = supportLength(s, D);
  if (len === null) return null;
  const [a, b] = bedplate(D), mid = (a + b) / 2;
  return [mid - len / 2, mid + len / 2];
}
