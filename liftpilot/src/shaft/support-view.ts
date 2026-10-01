// The machine's support drawn in the machine room (support.ts): in section B-B along the rope drop line (u) over the
// room's floor (z) and in plan, under the machine's bedplate of the drawings (machine-outline.ts: its mounts at x
// −0,36 and 0,95 m, its two beams at z ±0,16 m at Ø 560): levelling shims, a frame of two profiles, two beams from wall
// to wall (raised clear of the floor when higher than their profile), plates under the mounts, a concrete plinth; the
// pads under the mounts. With its dimensions: the support's height (it carries the sheave's axis), a profile by choice
// from the catalogue, the length of a frame or a plinth, the beams' span between the walls. Model entities.
import { chain, edit as E, path, pickEdit, rect, type Edit, type Entity, type Pt } from '../drawing';
import { MACHINE_A } from './machine-outline';
import type { MachineSpec, RoomGeo } from './machine-room';
import { KV_VERT } from './norme-vert';
import { PROFILES, PROFILE_NAMES } from './profiles';
import { hasProfile, ownAxis, padsOf, profileOf, supportOf, supportSpan, type MachineSupport } from './support';

const MOUNTS = [-0.36, 0.95] as const, BEAMS = [-0.16, 0.16] as const;
const NAME: Record<MachineSupport['kind'], string> = { shims: 'Spessori', frame: 'Telaio', beams: 'Putrelle', plates: 'Piastre', plinth: 'Plinto' };

/** A profile changed by choosing another of the catalogue: the dimension shows its height. */
const profilePick = (s: MachineSupport): Edit => pickEdit('sup.profile', PROFILE_NAMES.map((n) => ({ label: `${n} · h ${PROFILES[n].h} mm`, set: n })), PROFILE_NAMES.indexOf(profileOf(s)));

/** The support's top over the room's floor: the sheave's axis less the pads and the machine's own height [mm]. */
export const supportTop = (M: MachineSpec, s: MachineSupport): number => M.axis - padsOf(s) - ownAxis(M.D);

/** Section B-B: the support under the machine, its pads, its dimensions. `r0`, `r1`: the room's walls along u. */
export function supportSection(M: MachineSpec, G: RoomGeo, r0: number, r1: number): Entity[] {
  const s = supportOf(G.room), k = 1000 * G.s, top = supportTop(M, s), pads = padsOf(s), out: Entity[] = [];
  const at = (x: number): number => G.sheaveAt + x * k, span = supportSpan(s, M.D);
  if (s.kind === 'shims') {
    if (top > 0.5) for (const x of MOUNTS) out.push(rect(at(x) - 0.06 * k, 0, at(x) + 0.06 * k, top, 'thin', 'steel'));
  } else {
    for (const x of MOUNTS) out.push(rect(at(x) - 0.06 * k, top, at(x) + 0.06 * k, top + pads, 'thin', 'paper'));
    if (s.kind === 'plates') for (const x of MOUNTS) out.push(rect(at(x) - 0.09 * k, 0, at(x) + 0.09 * k, top, 'outline', 'steel'));
    if (s.kind === 'plinth' && span) out.push(rect(G.sheaveAt + span[0], 0, G.sheaveAt + span[1], top, 'outline', 'concrete'));
    if (hasProfile(s)) {
      const P = PROFILES[profileOf(s)], [u0, u1] = s.kind === 'beams' ? [r0 - KV_VERT.supportBearing, r1 + KV_VERT.supportBearing] : span ? [G.sheaveAt + span[0], G.sheaveAt + span[1]] : [r0, r1];
      // seen beside the cut along the drop line: drawn, not hatched, so the pulleys and ropes in front stay readable
      out.push(rect(u0, top - P.h, u1, top, 'outline'));
      for (const z of [top - P.tf, top - P.h + P.tf]) out.push(path([[u0, z], [u1, z]] as Pt[], false, 'thin'));
    }
  }
  // dimensions: the support's height (the sheave's axis follows it), a profile, a frame's or a plinth's length, the
  // beams' span between the walls
  const right = Math.max(at(1.12), span ? G.sheaveAt + span[1] : -Infinity) + 220;
  if (top > 0.5) out.push(chain({ dir: 'y', pts: [0, top], at: right, text: [`{v} ${NAME[s.kind]}`], edit: [E('sup.height')] }));
  if (hasProfile(s)) {
    const h = PROFILES[profileOf(s)].h;
    out.push(chain({ dir: 'y', pts: [top - h, top], at: right + 260, text: [`${profileOf(s)} {v}`], edit: [profilePick(s)] }));
  }
  if (span) out.push(chain({ dir: 'x', pts: [G.sheaveAt + span[0], G.sheaveAt + span[1]], side: 'top', row: 1, text: [`{v} ${NAME[s.kind]}`], edit: [E('sup.length')] }));
  if (s.kind === 'beams') {
    const along = Math.abs(G.uy) > 0.999 ? 'room.D' : Math.abs(G.ux) > 0.999 ? 'room.W' : null;
    out.push(chain({ dir: 'x', pts: [r0, r1], side: 'top', row: 1, text: ['Luce putrelle {v}'], edit: [along ? E(along) : null] }));
  }
  return out;
}

/** Plan: the support under the machine's bedplate (the drop line's u, across it v as the machine's plan is drawn). */
export function supportPlan(M: MachineSpec, G: RoomGeo, onDrop: (u: number, v: number) => Pt, r0: number, r1: number): Entity[] {
  const s = supportOf(G.room), k = 1000 * G.s, out: Entity[] = [], zs = MACHINE_A.zSheave, span = supportSpan(s, M.D);
  const quad = (u0: number, v0: number, u1: number, v1: number): Pt[] => [onDrop(u0, v0), onDrop(u1, v0), onDrop(u1, v1), onDrop(u0, v1)];
  const at = (x: number): number => G.sheaveAt + x * k, v = (z: number): number => (zs - z) * k;
  if (s.kind === 'plates') for (const x of MOUNTS) for (const z of BEAMS) out.push(path(quad(at(x) - 0.09 * k, v(z) - 0.06 * k, at(x) + 0.09 * k, v(z) + 0.06 * k), true, 'outline', 'steel'));
  if (s.kind === 'plinth' && span) out.push(path(quad(G.sheaveAt + span[0], v(0.2) - 100, G.sheaveAt + span[1], v(-0.2) + 100), true, 'outline', 'concrete'));
  if (hasProfile(s)) {
    const b = PROFILES[profileOf(s)].b, [u0, u1] = s.kind === 'beams' ? [r0 - KV_VERT.supportBearing, r1 + KV_VERT.supportBearing] : span ? [G.sheaveAt + span[0], G.sheaveAt + span[1]] : [r0, r1];
    for (const z of BEAMS) out.push(path(quad(u0, v(z) - b / 2, u1, v(z) + b / 2), true, 'hidden'));
  }
  return out;
}
