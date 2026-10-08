// HEB beams on the shaft's walls under the machine's support (registry locale.putrelle.vano): when the slab between the
// room and the shaft has no structural check, two HEB 120, 140 or 160 carry the support, each bearing on two opposite
// walls of the shaft — spanning its width (along x) or its depth (along y), KV_VERT.hebBearing into each wall. They run
// under the support's feet (the machine's mounts, a frame's ends, the legs of the bedplate with the diverting pulley,
// the pulley's own stand), at the outermost of them across their direction. Each is a simple beam between the bearings'
// centres under its share of the machine's load (lever rule), at the resultant of the machine's weight and of its two
// rope falls, and its own weight: σ = M/Wel,y ≤ fyk/γM0, the deflection ≤ 1/1500 of the clear span (as
// locale.putrelle); the resultant between the beams, the feet on their flanges and along them, the ropes through the
// slab (and the governor's) KV_VERT.hebRopeGap clear of them, off the upstands round their openings (registry
// locale.fori: the beams stand HEB_PAD over the slab, lower than an upstand), the walls as thick as the bearing. Of the six (two
// directions, three profiles) the software takes the shortest that pass, then the lightest — the easiest to carry in;
// the engineer may take another. Room axes [mm]; pure.
import { check } from './checks';
import { machineU, machineV, ropeWidths, supportRunIn, type MachineSpec, type RoomGeo } from './machine-room';
import { KV_VERT } from './norme-vert';
import { PROFILES } from './profiles';
import { rinvioAcross, rinvioRun, standBox } from './rinvio';
import { extentOf, fromBeam, outlineFromBeam, upstands } from './heb-clear';
import type { RoomInputs } from './room';
import { HEB_PROFILES, onHeb, supportOf, type HebDir, type HebProfile } from './support';
import { loadCentre, type SupportLoad } from './support-check';
import type { ShaftCheck } from './types';

type Pt = readonly [number, number];
const G_ACC = 9.81;

/** A rope through the slab, or the governor's: its centre and radius (room axes) [mm]. */
export interface Rope {
  at: Pt;
  r: number;
}

/** The shaft under the room: its inner width and depth, its walls [mm]; how deep the hitches hang at the ends of the
 *  travel (RoomSite.ends): the slab's openings, whose upstands the beams keep clear of. */
export interface HebShaft {
  W: number;
  D: number;
  wall: number;
  ends: readonly (readonly [number, number])[];
}

export interface HebLayout {
  dir: HebDir;
  profile: HebProfile;
  /** the two beams' axes across their direction (room axes) */
  at: readonly [number, number];
  /** along their direction: the shaft's inner faces (the clear span) and the beams' ends in the walls (room axes) */
  span: readonly [number, number];
  ends: readonly [number, number];
  /** across their direction: the outer faces of the walls they rest on — each beam lies within them (room axes) */
  walls: readonly [number, number];
  /** the support is one frame crossing them: it rests on them where it crosses them and may run past them (its feet
   *  need not be on their flanges); else its feet stand on them */
  bridge: boolean;
  /** each beam's length [mm] */
  length: number;
}

export interface HebResult {
  /** stress [MPa] and its limit, deflection [mm] and its limit, of the more loaded beam */
  sigma: number;
  sigmaMax: number;
  f: number;
  fMax: number;
  /** the least margin of the resultant between the beams and of the feet on them [mm] */
  feet: number;
  /** the least distance of the ropes from the beams [mm] */
  rope: number;
  /** the least distance in plan of the upstands round the slab's openings from the beams (negative: a beam over one;
   *  registry locale.fori) [mm]; null without openings */
  kerb: number | null;
  /** the walls' thickness less the bearing, and each beam's flange within the walls' outer faces: the least [mm] */
  wall: number;
  /** the largest force on a bearing [N] */
  reaction: number;
}

/** One of the six beams the software weighs: where it runs, how it does, whether it passes. */
export interface HebOption extends HebLayout {
  result: HebResult;
  ok: boolean;
}

/** The room's point at u along the rope drop line from the car's drop and v across it. */
const onDrop = (G: RoomGeo, u: number, v: number): Pt => [G.carDrop[0] + u * G.ux - v * G.uy, G.carDrop[1] + u * G.uy + v * G.ux];

/** Where the support bears on what is under it (room axes): the legs of the bedplate with the diverting pulley, else
 *  the machine's mounts or a frame's ends under its beams, and the pulley's own stand. */
export function supportFeet(G: RoomGeo, M: MachineSpec): Pt[] {
  const s = supportOf(G.room, M.Dp > 0), F = G.frame, rf = M.rinvio ?? null, out: Pt[] = [];
  if (s.kind === 'rinvio' && rf?.on === 'frame') {
    const [u0, u1] = rinvioRun(M, G), [v0, v1] = rinvioAcross(G, rf), h = KV_VERT.rinvioLeg / 2;
    for (const u of [u0 + h, u1 - h]) for (const v of [v0 + h, v1 - h]) out.push(onDrop(G, u, v));
    return out;
  }
  const span = supportRunIn(G, M);
  const us = (s.kind === 'frame' && span ? span : F.mounts).map((x) => machineU(G, x));
  for (const u of us) for (const z of F.beams) out.push(onDrop(G, u, machineV(G, z)));
  if (rf?.on === 'stand' && M.Dp > 0) {
    const [u0, v0, u1, v1] = standBox(M, G);
    for (const u of [u0, u1]) for (const v of [v0, v1]) out.push(onDrop(G, u, v));
  }
  return out;
}

/** The ropes through the slab (room axes): the falls of the car's and of the counterweight's drops (2:1: either side of
 *  their pulleys), with the band of ropes side by side. */
export function dropRopes(G: RoomGeo, M: MachineSpec): Rope[] {
  const r = ropeWidths(M.n, M.d).ropes;
  return [...[M.ropeIn, G.calata - M.ropeIn].map((u) => ({ at: onDrop(G, u, 0), r })), ...G.deadEnds.map((d) => ({ at: d.at, r }))];
}

/** The machine's load on the beams [N] and where it acts (room axes): the machine with its bedframe at the middle of its
 *  outline, the static load times the dynamic coefficient on the fall of the car (`load.car`, else half of it) and on
 *  the counterweight's (2:1: the falls toward the machine). */
export function hebResultant(G: RoomGeo, M: MachineSpec, load: SupportLoad): { at: Pt; F: number } {
  const c = loadCentre(G, M, load);
  return { at: onDrop(G, c.u, c.v), F: c.F * G_ACC };
}

/** Whether the support may bridge beams across it, resting on them wherever it crosses them and running past them: our
 *  low frame alone (lying on them along its members), our bedplate with the diverting pulley (its legs set where its
 *  sides cross them: rinvio.ts bedplateLegs). A machine on shims or plates, a maker's bedplate, a pulley on its own
 *  stand: they stand on their feet. */
function bridges(G: RoomGeo, M: MachineSpec): boolean {
  const s = supportOf(G.room, M.Dp > 0), rf = M.rinvio ?? null;
  if (s.kind === 'frame') return !(rf?.on === 'stand' && M.Dp > 0);
  return s.kind === 'rinvio' && rf?.on === 'frame' && !rf.maker;
}

/** Whether beams along `dir` cross the frame, whose members run along the rope drop line (within 45° of square to it). */
const crossing = (G: RoomGeo, dir: HebDir): boolean => Math.abs(dir === 'x' ? G.ux : G.uy) < Math.SQRT1_2;

/** A frame's irons by their two ends across beams along `dir`: the feet of a frame (supportFeet) pair up, each iron's
 *  end at one u with its other end at the other — [the least, the most] of each across the beams. */
function ironSpans(feet: readonly Pt[], across: number): [number, number][] {
  const n = feet.length / 2;
  return Array.from({ length: n }, (_, i) => {
    const p = feet[i][across], q = feet[i + n][across];
    return [Math.min(p, q), Math.max(p, q)];
  });
}

/** The two beams of `profile` along `dir` under `feet` over the shaft `S` lying in the room (room axes): under the
 *  outermost feet across them; under a support bridging them (`bridge`: a frame's irons, our bedplate's sides) as far
 *  apart under it as the walls let them, each iron lying on both with the whole flange (askew the irons' ends stand at
 *  other places: where all of them reach), each KV_VERT.hebRopeGap clear of the `ropes` through the slab and off the
 *  upstands `kerbs` round their openings (heb-clear.ts upstands). */
export function hebLayout(R: RoomInputs, S: Pick<HebShaft, 'W' | 'D' | 'wall'>, feet: readonly Pt[], dir: HebDir, profile: HebProfile, bridge = false, ropes: readonly Rope[] = [],
  kerbs: readonly (readonly Pt[])[] = []): HebLayout {
  const along = dir === 'x' ? 0 : 1, across = 1 - along, b = KV_VERT.hebBearing, half = PROFILES[profile].b / 2;
  const s0 = along ? R.shaftY : R.shaftX, s1 = s0 + (along ? S.D : S.W), cs = feet.map((p) => p[across]), lo = Math.min(...cs), hi = Math.max(...cs);
  // the walls it bears on run across it from one outer face of the shaft to the other
  const c0 = across ? R.shaftY : R.shaftX, c1 = c0 + (across ? S.D : S.W), walls = [c0 - S.wall, c1 + S.wall] as const;
  const irons = bridge ? ironSpans(feet, across) : [];
  const reach0 = irons.length ? Math.max(...irons.map((r) => r[0])) : lo, reach1 = irons.length ? Math.min(...irons.map((r) => r[1])) : hi;
  // where a beam's axis may lie: within the irons' reach and the walls, off every rope by the gap (the nearest such place
  // to each end of that stretch)
  const A = Math.max(reach0 + half, walls[0] + half), Z = Math.min(reach1 - half, walls[1] - half);
  const g = KV_VERT.hebRopeGap, banned = ropes.map((x): [number, number] => [x.at[across] - x.r - g - half, x.at[across] + x.r + g + half]);
  // an upstand under the beams' length (between their ends) bans its extent across them
  for (const k of kerbs) {
    const e = extentOf(k, along);
    if (e.a[1] > s0 - b && e.a[0] < s1 + b) banned.push([e.c[0] - half, e.c[1] + half]);
  }
  const free = (c: number): boolean => c >= A - 1e-9 && c <= Z + 1e-9 && banned.every(([p, q]) => c <= p || c >= q);
  const edges = [A, Z, ...banned.flat()].filter(free).sort((p, q) => p - q), a = edges[0] ?? A, z = edges[edges.length - 1] ?? Z;
  const fits = bridge && edges.length > 0 && z - a >= 2 * half;
  return { dir, profile, at: fits ? [a, z] : [lo, hi], span: [s0, s1], ends: [s0 - b, s1 + b], walls, bridge: fits, length: s1 - s0 + 2 * b };
}

/** The beams of `lay` under the load `F` [N] acting at `at`, the support's feet, the ropes and the upstands round their
 *  openings (`kerbs`), on walls `wall` thick. */
export function hebResult(lay: HebLayout, res: { at: Pt; F: number }, feet: readonly Pt[], ropes: readonly Rope[], wall: number, kerbs: readonly (readonly Pt[])[] = []): HebResult {
  const P = PROFILES[lay.profile], along = lay.dir === 'x' ? 0 : 1, across = 1 - along, [a, b] = lay.at, bear = KV_VERT.hebBearing, half = P.b / 2;
  const c = res.at, d = b - a, shares = d > 1 ? [(b - c[across]) / d, (c[across] - a) / d] : [1, 1];
  // between the bearings' centres; the load's place from the first
  const clear = lay.span[1] - lay.span[0], L = clear + bear, t = Math.min(Math.max(c[along] - (lay.span[0] - bear / 2), 0), L), s = Math.min(t, L - t);
  const q = (P.mass * G_ACC) / 1000, W = P.Wy * 1e3, I = P.Iy * 1e4, E = KV_VERT.steelE;
  let sigma = 0, f = 0, reaction = 0;
  for (const share of shares) {
    // a share below 0 lifts its beam off (the load outside the beams: the feet's check says so), the other takes more
    const F = res.F * Math.max(share, 0), M = (F * t * (L - t)) / L + (q * L * L) / 8;
    const fp = s > 0 ? (F * s * (L * L - s * s) ** 1.5) / (9 * Math.sqrt(3) * L * E * I) : 0;
    sigma = Math.max(sigma, M / W);
    f = Math.max(f, fp + (5 * q * L ** 4) / (384 * E * I));
    reaction = Math.max(reaction, (F * (L - s)) / L + (q * L) / 2);
  }
  let onBeams = d > 1 ? Math.min(c[across] - a, b - c[across]) : 0;
  // the feet on the flanges, within the beams' ends; a frame crossing the beams only over their length, each of its
  // irons over both beams with the whole flange (short of it: by how much)
  for (const p of feet) {
    onBeams = Math.min(onBeams, p[along] - lay.ends[0], lay.ends[1] - p[along]);
    if (!lay.bridge) onBeams = Math.min(onBeams, half - Math.min(Math.abs(p[across] - a), Math.abs(p[across] - b)));
  }
  if (lay.bridge) {
    const irons = ironSpans(feet, across), short = Math.min(...irons.flatMap(([i0, i1]) => lay.at.map((ax) => Math.min(ax - half - i0, i1 - ax - half))));
    if (short < 0) onBeams = Math.min(onBeams, short);
  }
  const rope = Math.min(...ropes.flatMap((x) => lay.at.map((ax) => fromBeam(x.at, lay, ax) - x.r)));
  const kerb = kerbs.length ? Math.min(...kerbs.flatMap((k) => lay.at.map((ax) => outlineFromBeam(k, lay, ax)))) : null;
  // a beam past the walls' outer faces (under feet beyond the shaft) rests on nothing
  const onWalls = Math.min(wall - bear, a - half - lay.walls[0], lay.walls[1] - b - half);
  return { sigma, sigmaMax: KV_VERT.steelFyk / KV_VERT.steelGammaM0, f, fMax: clear / KV_VERT.beamDeflection, feet: onBeams, rope, kerb, wall: onWalls, reaction };
}

/** The checks m_heb (stress), m_hebf (deflection), m_hebfeet (the load between the beams, the feet on them), m_hebrope
 *  (the ropes clear of them), m_hebkerb (off the openings' upstands: they stand lower than an upstand), m_hebwall (on the walls: the bearing in them, the beams within their outer faces). */
export function hebChecks(r: HebResult | null): ShaftCheck[] {
  if (!r) return [];
  return [
    check('m_heb', r.sigma <= r.sigmaMax, r.sigma, r.sigmaMax, 0, 'MPa'),
    check('m_hebf', r.f <= r.fMax, r.f, r.fMax, 1, 'mm'),
    check('m_hebfeet', r.feet >= 0, Math.round(r.feet), 0, 0, 'mm'),
    check('m_hebrope', r.rope >= KV_VERT.hebRopeGap, Math.round(r.rope), KV_VERT.hebRopeGap, 0, 'mm'),
    // (a beam touching an upstand is off it: the layout puts it there exactly)
    ...(r.kerb === null ? [] : [check('m_hebkerb', r.kerb >= -1e-6, Math.round(r.kerb) + 0, 0, 0, 'mm')]),
    check('m_hebwall', r.wall >= 0, Math.round(r.wall), 0, 0, 'mm'),
  ];
}

/** The six beams (two directions, three profiles) under the machine `M` in the room of `G`, the shortest first, then the
 *  lightest; bridging beams clear of the ropes through the slab (`extra`: the governor's), off their openings' upstands. */
export function hebLayouts(G: RoomGeo, M: MachineSpec, S: HebShaft, extra: readonly Rope[] = []): HebLayout[] {
  const feet = supportFeet(G, M), bridge = bridges(G, M), ropes = [...dropRopes(G, M), ...extra], kerbs = upstands(G, M, S);
  return (['x', 'y'] as const).flatMap((dir) => HEB_PROFILES.map((profile) => hebLayout(G.room, S, feet, dir, profile, bridge && crossing(G, dir), ropes, kerbs)))
    .sort((p, q) => p.length - q.length || PROFILES[p.profile].mass - PROFILES[q.profile].mass);
}

/** The six beams the software weighs, in the order of hebLayouts, each with how it does at `load`. */
export function hebOptions(G: RoomGeo, M: MachineSpec, S: HebShaft, load: SupportLoad, ropes: readonly Rope[], extra: readonly Rope[] = []): HebOption[] {
  const feet = supportFeet(G, M), res = hebResultant(G, M, load), kerbs = upstands(G, M, S);
  return hebLayouts(G, M, S, extra).map((lay): HebOption => {
    const result = hebResult(lay, res, feet, ropes, S.wall, kerbs);
    return { ...lay, result, ok: hebChecks(result).every((c) => c.status === 'ok') };
  });
}

/** How far an option is from passing: its failed checks, then its worst ratio of stress and deflection to their limits. */
const shortfall = (o: HebOption): number =>
  hebChecks(o.result).filter((c) => c.status !== 'ok').length * 10 + Math.max(o.result.sigma / o.result.sigmaMax, o.result.f / o.result.fMax);

/** The beams taken: as chosen where chosen (a profile, a direction or both), else the software's — the first that
 *  passes (the shortest, then the lightest), or the one closest to passing. */
export function hebPick(opts: readonly HebOption[], set: { profile?: HebProfile; dir?: HebDir }): HebOption {
  const fit = opts.filter((o) => (!set.profile || o.profile === set.profile) && (!set.dir || o.dir === set.dir));
  const pool = fit.length ? fit : opts;
  return pool.find((o) => o.ok) ?? [...pool].sort((p, q) => shortfall(p) - shortfall(q))[0];
}

/** The beams under the machine `M` in the room of `G` over the shaft `S` at `load`, with the ropes through the slab
 *  (`extra`: the governor's): the six weighed and the one taken (the room's choice, or the software's); null when the
 *  support does not stand on them. */
export function hebFor(G: RoomGeo, M: MachineSpec, S: HebShaft, load: SupportLoad, extra: readonly Rope[] = []): { options: HebOption[]; chosen: HebOption } | null {
  const set = G.room.heb;
  if (!set || !onHeb(G.room, M.Dp > 0)) return null;
  const options = hebOptions(G, M, S, load, [...dropRopes(G, M), ...extra], extra);
  return { options, chosen: hebPick(options, set) };
}

/** The beams as the drawings take them: those the room names (profile and direction, the derivation's choice in place),
 *  else the tallest along the shaft's shorter side, placed as the derivation places them (`extra`: the governor's ropes
 *  through the slab; the openings' upstands as deep as `S.ends` puts the hitches); null without them. */
export function hebDrawn(G: RoomGeo, M: MachineSpec, S: HebShaft, extra: readonly Rope[] = []): HebLayout | null {
  const set = G.room.heb;
  if (!set || !onHeb(G.room, M.Dp > 0)) return null;
  const dir = set.dir ?? (S.W <= S.D ? 'x' : 'y');
  return hebLayout(G.room, S, supportFeet(G, M), dir, set.profile ?? HEB_PROFILES[HEB_PROFILES.length - 1], bridges(G, M) && crossing(G, dir), [...dropRopes(G, M), ...extra],
    upstands(G, M, S));
}

/** The key of the drawings' choice of the beams: their profile and direction together (set `<dir>:<profile>`). */
export const HEB_KEYS = ['heb.option'] as const;

/** The beams on the shaft's walls as a derivation takes them: the six weighed, the one taken (the room it draws names
 *  it), whether its profile and its direction are the software's. */
export interface HebTaken {
  options: readonly HebOption[];
  chosen: HebOption;
  auto: { profile: boolean; dir: boolean };
}

/** The room with the beams chosen on a drawing; null for another key or a choice that is none. */
export function withHebChoice(R: RoomInputs, key: string, set: string | number): RoomInputs | null {
  if (key !== 'heb.option' || typeof set !== 'string') return null;
  const [dir, profile] = set.split(':'), p = HEB_PROFILES.find((x) => x === profile);
  return p && (dir === 'x' || dir === 'y') ? { ...R, heb: { profile: p, dir } } : null;
}
