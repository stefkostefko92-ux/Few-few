// The machine's support drawn in the machine room (support.ts): in section B-B along the rope drop line (u) over the
// room's floor (z) and in plan, under the machine's bedplate of the drawings (machine-outline.ts: its mounts at x
// −0,36 and 0,95 m at Ø 560; a maker's machine: its bedframe's; the three irons of either, machine-shape.ts): levelling
// shims, a frame of three profiles, three beams from wall to wall (raised clear of the floor when higher than their
// profile) — one under each iron, the sheave between the last two —, plates under the mounts, a concrete plinth in a
// block on each side of the ropes; the pads under the mounts; the bedplate with the
// diverting pulley (rinvio-view.ts); all of them on the HEB beams over the shaft's walls when the room puts them there
// (heb-view.ts: every height over the floor raised by theirs). With its dimensions: the support's height (it carries the
// sheave's axis), a profile by choice from the catalogue, the length of a frame or a plinth, the beams' span between the
// walls, the HEB beams' height. Model entities.
import { chain, edit as E, path, pickEdit, rect, type Edit, type Entity, type Pt } from '../drawing';
import type { HebLayout } from './heb';
import { hebSection } from './heb-view';
import type { MachineSpec, RoomGeo } from './machine-room';
import { KV_VERT } from './norme-vert';
import { PROFILES, PROFILE_NAMES } from './profiles';
import { rinvioRun } from './rinvio';
import { rinvioPlan, rinvioSection } from './rinvio-view';
import { hasProfile, ownAxis, padsOf, profileOf, supportOf, supportSpan, type MachineSupport } from './support';

const MOUNTS = [-0.36, 0.95] as const;
const NAME: Record<MachineSupport['kind'], string> = { shims: 'Spessori', frame: 'Telaio', beams: 'Putrelle', plates: 'Piastre', plinth: 'Plinto', rinvio: 'Telaio con rinvio' };

/** A profile changed by choosing another of the catalogue: the dimension shows its height. */
const profilePick = (s: MachineSupport): Edit => pickEdit('sup.profile', PROFILE_NAMES.map((n) => ({ label: `${n} · h ${PROFILES[n].h} mm`, set: n })), PROFILE_NAMES.indexOf(profileOf(s)));

/** The support's top over the room's floor: the sheave's axis less the pads and the machine's own height; the
 *  bedplate with the pulley, its own top [mm]. */
export const supportTop = (M: MachineSpec, s: MachineSupport): number =>
  (s.kind === 'rinvio' && M.rinvio?.on === 'frame' ? M.rinvio.top : M.axis - padsOf(s) - ownAxis(M.D, M.shape ?? null));

/** The u of the support's height chain right of the machine in section B-B (its profile's 260 past it). */
const dimsRight = (G: RoomGeo, span: readonly [number, number] | null): number =>
  Math.max(G.frame.shape ? G.sheaveAt + G.frame.x[1] : G.sheaveAt + 1.12 * 1000 * G.s, span ? G.sheaveAt + span[1] : -Infinity) + 220;

/** Section B-B: the support under the machine, its pads, its dimensions. `r0`, `r1`: the room's walls along u; `after`:
 *  a chain right of the machine (the pulley's h, room-view.ts) the support's heights stand past; `heb`: the HEB beams it
 *  stands on (M.base their height), their height on the line of the support's own. */
export function supportSection(M: MachineSpec, G: RoomGeo, r0: number, r1: number, after: number | null = null, heb: HebLayout | null = null): Entity[] {
  const s = supportOf(G.room, M.Dp > 0), k = 1000 * G.s, top = supportTop(M, s), pads = padsOf(s), out: Entity[] = [], F = G.frame, base = M.base ?? 0;
  const at = (x: number): number => G.sheaveAt + x * k, span = supportSpan(s, M.D, F.shape);
  if (s.kind === 'rinvio' && M.rinvio?.on === 'frame') return [...(heb ? hebSection(heb, G, rinvioRun(M, G)[0] - 420) : []), ...rinvioSection(M, G, M.rinvio)];
  // the mounts along the drop line and their half sizes: the generic machine's scaled, a maker's on our bedframe
  const mounts = F.shape ? F.mounts.map((x) => G.sheaveAt + x) : MOUNTS.map(at), hm = F.shape ? 60 : 0.06 * k, hp = F.shape ? 90 : 0.09 * k;
  if (s.kind === 'shims') {
    if (top - base > 0.5) for (const u of mounts) out.push(rect(u - hm, base, u + hm, top, 'thin', 'steel'));
  } else {
    for (const u of mounts) out.push(rect(u - hm, top, u + hm, top + pads, 'thin', 'paper'));
    if (s.kind === 'plates') for (const u of mounts) out.push(rect(u - hp, base, u + hp, top, 'outline', 'steel'));
    if (s.kind === 'plinth' && span) out.push(rect(G.sheaveAt + span[0], base, G.sheaveAt + span[1], top, 'outline', 'concrete'));
    if (hasProfile(s)) {
      const P = PROFILES[profileOf(s)], [u0, u1] = s.kind === 'beams' ? [r0 - KV_VERT.supportBearing, r1 + KV_VERT.supportBearing] : span ? [G.sheaveAt + span[0], G.sheaveAt + span[1]] : [r0, r1];
      // seen beside the cut along the drop line: drawn, not hatched, so the pulleys and ropes in front stay readable
      out.push(rect(u0, top - P.h, u1, top, 'outline'));
      for (const z of [top - P.tf, top - P.h + P.tf]) out.push(path([[u0, z], [u1, z]] as Pt[], false, 'thin'));
    }
  }
  // dimensions: the support's height (the sheave's axis follows it), a profile, a frame's or a plinth's length, the
  // beams' span between the walls
  const right = Math.max(dimsRight(G, span), after === null ? -Infinity : after + 260);
  // from the support's end nearest them: the last mount's shims or plate, a frame's or a plinth's end (beams from wall
  // to wall run under them)
  const end = s.kind === 'beams' ? null : span ? G.sheaveAt + span[1] : Math.max(...mounts) + (s.kind === 'plates' ? hp : hm);
  if (top - base > 0.5) out.push(chain({ dir: 'y', pts: [base, top], at: right, from: [end, end], text: [`{v} ${NAME[s.kind]}`], edit: [E('sup.height')] }));
  if (heb) out.push(...hebSection(heb, G, right));
  if (hasProfile(s)) {
    const h = PROFILES[profileOf(s)].h;
    out.push(chain({ dir: 'y', pts: [top - h, top], at: right + 260, from: [end, end], text: [`${profileOf(s)} {v}`], edit: [profilePick(s)] }));
  }
  // over the room past the machine's frame, and past dx with a diverting pulley (room-view.ts)
  const row = M.Dp > 0 ? 2 : 1;
  if (span) out.push(chain({ dir: 'x', pts: [G.sheaveAt + span[0], G.sheaveAt + span[1]], side: 'top', row, from: [top, top], text: [`{v} ${NAME[s.kind]}`], edit: [E('sup.length')] }));
  if (s.kind === 'beams') {
    const along = Math.abs(G.uy) > 0.999 ? 'room.D' : Math.abs(G.ux) > 0.999 ? 'room.W' : null;
    out.push(chain({ dir: 'x', pts: [r0, r1], side: 'top', row, text: ['Luce putrelle {v}'], edit: [along ? E(along) : null] }));
  }
  return out;
}

/** Plan: the support under the machine's bedplate (the drop line's u, across it v as the machine's plan is drawn). */
export function supportPlan(M: MachineSpec, G: RoomGeo, onDrop: (u: number, v: number) => Pt, r0: number, r1: number): Entity[] {
  const s = supportOf(G.room, M.Dp > 0), k = 1000 * G.s, out: Entity[] = [], F = G.frame, span = supportSpan(s, M.D, F.shape);
  if (s.kind === 'rinvio' && M.rinvio?.on === 'frame') return rinvioPlan(M, G, M.rinvio, onDrop);
  const quad = (u0: number, v0: number, u1: number, v1: number): Pt[] => [onDrop(u0, v0), onDrop(u1, v0), onDrop(u1, v1), onDrop(u0, v1)];
  const at = (x: number): number => G.sheaveAt + x * k;
  // the mounts (the generic machine's scaled, a maker's on our bedframe), the irons' lines across and the plinth's blocks
  // on each side of the ropes [u, v]
  const mounts = F.shape ? F.mounts.map((x) => G.sheaveAt + x) : MOUNTS.map(at), beams = F.beams.map((z) => F.zSheave - z);
  const [hx, hz] = F.shape ? [90, 60] : [0.09 * k, 0.06 * k];
  const bands = F.plinth.map(([z0, z1]) => [F.zSheave - z1, F.zSheave - z0] as const);
  if (s.kind === 'plates') for (const u of mounts) for (const vb of beams) out.push(path(quad(u - hx, vb - hz, u + hx, vb + hz), true, 'outline', 'steel'));
  if (s.kind === 'plinth' && span) for (const [w0, w1] of bands) out.push(path(quad(G.sheaveAt + span[0], w0, G.sheaveAt + span[1], w1), true, 'outline', 'concrete'));
  if (hasProfile(s)) {
    const b = PROFILES[profileOf(s)].b, [u0, u1] = s.kind === 'beams' ? [r0 - KV_VERT.supportBearing, r1 + KV_VERT.supportBearing] : span ? [G.sheaveAt + span[0], G.sheaveAt + span[1]] : [r0, r1];
    for (const vb of beams) out.push(path(quad(u0, vb - b / 2, u1, vb + b / 2), true, 'hidden'));
  }
  return out;
}
