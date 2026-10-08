// The machine's support drawn in the machine room (support.ts): in section B-B along the rope drop line (u) over the
// room's floor (z) and in plan, under the machine's bedplate of the drawings (machine-outline.ts: its mounts at x
// −0,36 and 0,95 m at Ø 560; a maker's machine: its bedframe's; the three irons of either, machine-shape.ts): levelling
// shims, a frame of three profiles, three beams from wall to wall (raised clear of the floor when higher than their
// profile) — one under each iron, the sheave between the last two —, plates under the mounts, a concrete plinth in a
// block on each side of the ropes; the bedplate with the
// diverting pulley (rinvio-view.ts); all of them on the HEB beams over the shaft's walls when the room puts them there
// (heb-view.ts: every height over the floor raised by theirs). With its dimensions: the support's height (it carries the
// sheave's axis), a profile by choice from the catalogue, the length of a frame or a plinth, the beams' span between the
// walls, the HEB beams' height. Model entities.
import { chain, edit as E, path, pickEdit, rect, type Edit, type Entity, type Pt } from '../drawing';
import type { HebLayout } from './heb';
import { hebSection } from './heb-view';
import { dropSpan, machineRun, machineU, machineV, supportRunIn, type MachineSpec, type RoomGeo } from './machine-room';
import { KV_VERT } from './norme-vert';
import { PROFILES, PROFILE_NAMES } from './profiles';
import { rinvioRun } from './rinvio';
import { rinvioPlan, rinvioSection } from './rinvio-view';
import { hasProfile, ownAxis, profileOf, supportOf, type MachineSupport } from './support';

const MOUNTS = [-0.36, 0.95] as const;
/** The steel packs under a frame set higher than its profile, along the drop line at each end [mm] (the 3D's). */
const FRAME_PACK = 100;
const NAME: Record<MachineSupport['kind'], string> = { shims: 'Spessori', frame: 'Telaio', beams: 'Putrelle', plates: 'Piastre', plinth: 'Plinto', rinvio: 'Telaio con rinvio' };

/** The clear span of each beam from wall to wall, under each iron of the machine's frame, along the drop line [u0, u1]
 *  (askew, each meets the walls at its own u), and the beam itself borne in the walls at each end. */
export const beamClear = (G: RoomGeo): [number, number][] => G.frame.beams.map((z) => dropSpan(G, 0, 0, G.room.W, G.room.D, machineV(G, z)));
export const beamSpans = (G: RoomGeo): [number, number][] => beamClear(G).map(([a, b]) => [a - KV_VERT.supportBearing, b + KV_VERT.supportBearing]);

/** A profile changed by choosing another of the catalogue: the dimension shows its height. */
const profilePick = (s: MachineSupport): Edit => pickEdit('sup.profile', PROFILE_NAMES.map((n) => ({ label: `${n} · h ${PROFILES[n].h} mm`, set: n })), PROFILE_NAMES.indexOf(profileOf(s)));

/** The support's top over the room's floor: the sheave's axis less the machine's own height; the
 *  bedplate with the pulley, its own top [mm]. */
export const supportTop = (M: MachineSpec, s: MachineSupport): number =>
  (s.kind === 'rinvio' && M.rinvio?.on === 'frame' ? M.rinvio.top : M.axis - ownAxis(M.D, M.shape ?? null));

/** The u of the support's height chain right of the machine in section B-B (its profile's 260 past it): `run` the
 *  frame's or the plinth's along the drop line; `sk` the section's scale on 1:25 (its offsets kept on paper). */
const dimsRight = (G: RoomGeo, run: readonly [number, number] | null, sk: number): number => Math.max(G.frame1, run ? run[1] : -Infinity) + 220 * sk;

/** Section B-B: the support under the machine, its dimensions. `r0`, `r1`: the room's walls along u; `after`: a chain
 *  right of the machine (the pulley's h, room-section-view.ts) the support's heights stand past; `heb`: the HEB beams it
 *  stands on (M.base their height), their height on the line of the support's own; `sk`: the section's scale on 1:25,
 *  the dimensions' offsets kept on paper (room-section-view.ts moves them out of the room where they do not fit). */
export function supportSection(M: MachineSpec, G: RoomGeo, r0: number, r1: number, after: number | null = null, heb: HebLayout | null = null, sk = 1): Entity[] {
  const s = supportOf(G.room, M.Dp > 0), k = 1000 * G.s, top = supportTop(M, s), out: Entity[] = [], F = G.frame, base = M.base ?? 0;
  const span = supportRunIn(G, M), run = span ? machineRun(G, span[0], span[1]) : null;
  if (s.kind === 'rinvio' && M.rinvio?.on === 'frame') return [...(heb ? hebSection(heb, G, rinvioRun(M, G)[0] - 420 * sk) : []), ...rinvioSection(M, G, M.rinvio, sk)];
  // the mounts along the drop line and their half sizes: the generic machine's scaled, a maker's on our bedframe
  const mounts = (F.shape ? F.mounts : MOUNTS.map((x) => x * k)).map((x) => machineU(G, x)), hm = F.shape ? 60 : 0.06 * k, hp = F.shape ? 90 : 0.09 * k;
  if (s.kind === 'shims') {
    if (top - base > 0.5) for (const u of mounts) out.push(rect(u - hm, base, u + hm, top, 'thin', 'steel'));
  } else {
    if (s.kind === 'plates') for (const u of mounts) out.push(rect(u - hp, base, u + hp, top, 'outline', 'steel'));
    // the plinth's blocks stand on each side of the rope plane the section cuts along: seen beyond it, not hatched
    if (s.kind === 'plinth' && run) out.push(rect(run[0], base, run[1], top, 'outline'));
    if (hasProfile(s)) {
      // seen beside the cut along the drop line: drawn, not hatched, so the pulleys and ropes in front stay readable;
      // beams from wall to wall each between its own walls (askew they meet the walls at other u), one drawn when alike
      const P = PROFILES[profileOf(s)], spans = s.kind === 'beams' ? beamSpans(G) : [run ?? [r0, r1]];
      for (const [u0, u1] of spans.filter((p, i) => spans.findIndex((q) => Math.abs(q[0] - p[0]) < 0.5 && Math.abs(q[1] - p[1]) < 0.5) === i)) {
        out.push(rect(u0, top - P.h, u1, top, 'outline'));
        for (const z of [top - P.tf, top - P.h + P.tf]) out.push(path([[u0, z], [u1, z]] as Pt[], false, 'thin'));
        if (s.kind !== 'frame') continue;
        // a frame: its end cross members of the same profile seen from the side, and the steel packs it stands on at
        // its ends when set higher than its profile (100 mm, from the floor to the profile's underside, as the 3D)
        for (const u of [u0 + P.b, u1 - P.b]) out.push(path([[u, top - P.h], [u, top]] as Pt[], false, 'thin'));
        if (top - P.h - base > 0.5) for (const u of [u0, u1 - FRAME_PACK]) out.push(rect(u, base, u + FRAME_PACK, top - P.h, 'outline', 'steel'));
      }
    }
  }
  // dimensions: the support's height (the sheave's axis follows it), a profile, a frame's or a plinth's length, the
  // beams' span between the walls
  const right = Math.max(dimsRight(G, run, sk), after === null ? -Infinity : after + 260 * sk);
  // from the support's end nearest them: the last mount's shims or plate, a frame's or a plinth's end (beams from wall
  // to wall run under them)
  const end = s.kind === 'beams' ? null : run ? run[1] : Math.max(...mounts) + (s.kind === 'plates' ? hp : hm);
  if (top - base > 0.5) out.push(chain({ dir: 'y', pts: [base, top], at: right, from: [end, end], text: [`{v} ${NAME[s.kind]}`], edit: [E('sup.height')] }));
  if (heb) out.push(...hebSection(heb, G, right));
  if (hasProfile(s)) {
    const h = PROFILES[profileOf(s)].h;
    out.push(chain({ dir: 'y', pts: [top - h, top], at: right + 260 * sk, from: [end, end], text: [`${profileOf(s)} {v}`], edit: [profilePick(s)] }));
  }
  // over the room past the machine's frame, and past dx with a diverting pulley (room-section-view.ts)
  const row = M.Dp > 0 ? 2 : 1;
  if (run) out.push(chain({ dir: 'x', pts: run, side: 'top', row, from: [top, top], text: [`{v} ${NAME[s.kind]}`], edit: [E('sup.length')] }));
  if (s.kind === 'beams') {
    // the clear span of the longest beam (on an axis, of each)
    const along = Math.abs(G.uy) > 0.999 ? 'room.D' : Math.abs(G.ux) > 0.999 ? 'room.W' : null;
    const [c0, c1] = beamClear(G).reduce((a, b) => (b[1] - b[0] > a[1] - a[0] + 0.5 ? b : a));
    out.push(chain({ dir: 'x', pts: [c0, c1], side: 'top', row, text: ['Luce putrelle {v}'], edit: [along ? E(along) : null] }));
  }
  return out;
}

/** Plan: the support under the machine's bedplate (the drop line's u, across it v as the machine's plan is drawn). */
export function supportPlan(M: MachineSpec, G: RoomGeo, onDrop: (u: number, v: number) => Pt, r0: number, r1: number): Entity[] {
  const s = supportOf(G.room, M.Dp > 0), k = 1000 * G.s, out: Entity[] = [], F = G.frame, span = supportRunIn(G, M);
  if (s.kind === 'rinvio' && M.rinvio?.on === 'frame') return rinvioPlan(M, G, M.rinvio, onDrop);
  const quad = (u0: number, v0: number, u1: number, v1: number): Pt[] => [onDrop(u0, v0), onDrop(u1, v0), onDrop(u1, v1), onDrop(u0, v1)];
  // the mounts (the generic machine's scaled, a maker's on our bedframe), the irons' lines across and the plinth's blocks
  // on each side of the ropes [u, v], as the machine is turned
  const mounts = (F.shape ? F.mounts : MOUNTS.map((x) => x * k)).map((x) => machineU(G, x)), beams = F.beams.map((z) => machineV(G, z));
  const [hx, hz] = F.shape ? [90, 60] : [0.09 * k, 0.06 * k], run = span ? machineRun(G, span[0], span[1]) : null;
  const bands = F.plinth.map(([z0, z1]) => [Math.min(machineV(G, z0), machineV(G, z1)), Math.max(machineV(G, z0), machineV(G, z1))] as const);
  if (s.kind === 'plates') for (const u of mounts) for (const vb of beams) out.push(path(quad(u - hx, vb - hz, u + hx, vb + hz), true, 'outline', 'steel'));
  if (s.kind === 'plinth' && run) for (const [w0, w1] of bands) out.push(path(quad(run[0], w0, run[1], w1), true, 'outline', 'concrete'));
  if (hasProfile(s)) {
    const b = PROFILES[profileOf(s)].b, spans = s.kind === 'beams' ? beamSpans(G) : beams.map(() => run ?? [r0, r1]);
    beams.forEach((vb, i) => out.push(path(quad(spans[i][0], vb - b / 2, spans[i][1], vb + b / 2), true, 'hidden')));
    // a frame welded: its two end cross members of the same profile across the outer ones
    if (s.kind === 'frame' && run) {
      const v0 = Math.min(...beams) - b / 2, v1 = Math.max(...beams) + b / 2;
      for (const u of [run[0], run[1] - b]) out.push(path(quad(u, v0, u + b, v1), true, 'hidden'));
    }
  }
  return out;
}
