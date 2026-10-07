// The machine's support in the room above the shaft (registry locale.basamento): levelling shims under its mounts (the
// sheave's axis where the software puts it), a frame of two rolled profiles on the floor, two beams (putrelle) from wall
// to wall that may stand clear of the floor, steel plates under the mounts, a concrete plinth, or the bedplate with the
// diverting pulley (rinvio.ts, registry locale.rinvio: what the machine stands on when it has one, unless another is
// chosen); anti-vibration pads under the mounts on all but the shims and the bedplate (its dampers are under its legs). Its height sets the sheave's axis over the room's floor (the calculation's rope
// beyond the travel and the 3D follow it); a frame and a plinth run along the rope drop line past the machine's
// bedplate. Millimetres; the machine is the one of the drawings scaled to the sheave (machine-outline.ts) or a maker's on our
// bedframe (machine-shape.ts). Pure.
import { machineFrame, type MachineShape } from './machine-shape';
import { rinvioTopOf } from './rinvio';
import { KV_VERT } from './norme-vert';
import { PROFILES, type ProfileName } from './profiles';
import type { RoomInputs } from './room';

export const SUPPORT_KINDS = ['shims', 'frame', 'beams', 'plates', 'plinth', 'rinvio'] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number];

/** The HEB beams on the shaft's walls the support may stand on (heb.ts, registry locale.putrelle.vano): the profiles
 *  the software chooses among, and the direction they span — the shaft's width (x) or its depth (y). */
export const HEB_PROFILES = ['HEB 120', 'HEB 140', 'HEB 160'] as const;
export type HebProfile = (typeof HEB_PROFILES)[number];
export type HebDir = 'x' | 'y';

/** Two HEB beams bearing on the shaft's opposite walls under the support, when the slab is not checked: the profile and
 *  the direction (each missing: the software's choice, the shortest beams that pass). */
export interface ShaftBeams {
  profile?: HebProfile;
  dir?: HebDir;
}

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

const SHIMS: MachineSupport = { kind: 'shims' }, RINVIO: MachineSupport = { kind: 'rinvio' };

/** The support chosen; without a choice, the bedplate with the pulley when the machine has a diverting pulley
 *  (`deflector`), else shims. */
export const supportOf = (R: RoomInputs | null, deflector = false): MachineSupport => R?.support ?? (deflector ? RINVIO : SHIMS);
export const profileOf = (s: MachineSupport): ProfileName => s.profile ?? (s.kind === 'beams' ? KV_VERT.supportBeam : KV_VERT.supportFrame);
/** The support has profiles (a frame or beams). */
export const hasProfile = (s: MachineSupport): boolean => s.kind === 'frame' || s.kind === 'beams';

/** The machine's sheave axis over its bedplate's underside and the bedplate's ends along the drop line from the sheave's
 *  centre [mm], at the sheave D: the generic machine scaled to it, or the maker's on our bedframe (machine-shape.ts). */
export const ownAxis = (D: number, shape: MachineShape | null = null): number => machineFrame(D, shape).axis;
export const bedplate = (D: number, shape: MachineShape | null = null): readonly [number, number] => machineFrame(D, shape).run;

/** Whether the support stands on HEB beams over the shaft's walls: chosen, under a support that can (not the beams from
 *  wall to wall of the room, not a concrete plinth). */
export const onHeb = (R: RoomInputs | null | undefined, deflector = false): boolean =>
  !!R?.heb && supportOf(R, deflector).kind !== 'beams' && supportOf(R, deflector).kind !== 'plinth';

/** The HEB beams' height under the support [mm]: the profile chosen, else the tallest of them (the derivation puts its
 *  choice in its place); 0 without them. */
export const hebBase = (R: RoomInputs | null | undefined, deflector = false): number =>
  (R?.heb && onHeb(R, deflector) ? PROFILES[R.heb.profile ?? HEB_PROFILES[HEB_PROFILES.length - 1]].h : 0);

/** The pads under the mounts [mm]: none on the shims and on the bedplate with the pulley. */
export const padsOf = (s: MachineSupport): number => (s.kind === 'shims' || s.kind === 'rinvio' ? 0 : KV_VERT.supportPads);

/** The support's top over the room's floor [mm]; `shimsAxis`: the sheave's axis the software takes on shims (a maker's
 *  machine whose own axis is higher stands on its bedframe with no shims); `Dp`: the diverting pulley under the
 *  bedplate's beams. */
export function supportHeight(s: MachineSupport, D: number, shimsAxis: number, shape: MachineShape | null = null, Dp = 0): number {
  if (s.height !== undefined) return s.height;
  if (s.kind === 'rinvio') return rinvioTopOf(Dp);
  if (s.kind === 'shims') return shape ? Math.max(0, shimsAxis - ownAxis(D, shape)) : shimsAxis - ownAxis(D);
  if (hasProfile(s)) return PROFILES[profileOf(s)].h;
  return s.kind === 'plates' ? KV_VERT.supportPlate : KV_VERT.supportPlinth;
}

/** The sheave's axis over the room's floor on this support standing `base` over the floor (the HEB beams) [mm]. */
export const sheaveAxisOn = (s: MachineSupport, D: number, shimsAxis: number, shape: MachineShape | null = null, Dp = 0, base = 0): number =>
  base + supportHeight(s, D, shimsAxis, shape, Dp) + padsOf(s) + ownAxis(D, shape);

/** A frame's or a plinth's length along the drop line [mm]; null for the others. */
export function supportLength(s: MachineSupport, D: number, shape: MachineShape | null = null): number | null {
  if (s.kind !== 'frame' && s.kind !== 'plinth') return null;
  const [a, b] = bedplate(D, shape);
  return s.length ?? Math.round(b - a + 2 * KV_VERT.supportOverhang);
}

/** Where a frame or a plinth runs along the drop line, from the sheave's centre: centred on the bedplate [mm]. */
export function supportSpan(s: MachineSupport, D: number, shape: MachineShape | null = null): readonly [number, number] | null {
  const len = supportLength(s, D, shape);
  if (len === null) return null;
  const [a, b] = bedplate(D, shape), mid = (a + b) / 2;
  return [mid - len / 2, mid + len / 2];
}
