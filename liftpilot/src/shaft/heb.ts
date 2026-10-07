// HEB beams on the shaft's walls under the machine's support (registry locale.putrelle.vano): when the slab between the
// room and the shaft has no structural check, two HEB 120, 140 or 160 carry the support, each bearing on two opposite
// walls of the shaft — spanning its width (along x) or its depth (along y), KV_VERT.hebBearing into each wall. They run
// under the support's feet (the machine's mounts, a frame's ends, the legs of the bedplate with the diverting pulley,
// the pulley's own stand), at the outermost of them across their direction. Each is a simple beam between the bearings'
// centres under its share of the machine's load (lever rule), at the resultant of the machine's weight and of its two
// rope falls, and its own weight: σ = M/Wel,y ≤ fyk/γM0, the deflection ≤ 1/1500 of the clear span (as
// locale.putrelle); the resultant between the beams, the feet on their flanges and along them, the ropes through the
// slab (and the governor's) KV_VERT.hebRopeGap clear of them, the walls as thick as the bearing. Of the six (two
// directions, three profiles) the software takes the shortest that pass, then the lightest — the easiest to carry in;
// the engineer may take another. Room axes [mm]; pure.
import { check } from './checks';
import { ropeWidths, type MachineSpec, type RoomGeo } from './machine-room';
import { KV_VERT } from './norme-vert';
import { PROFILES } from './profiles';
import { rinvioAcross, rinvioRun, standBox } from './rinvio';
import type { RoomInputs } from './room';
import { HEB_PROFILES, onHeb, supportOf, supportSpan, type HebDir, type HebProfile } from './support';
import type { SupportLoad } from './support-check';
import type { ShaftCheck } from './types';

type Pt = readonly [number, number];
const G_ACC = 9.81;

/** A rope through the slab, or the governor's: its centre and radius (room axes) [mm]. */
export interface Rope {
  at: Pt;
  r: number;
}

/** The shaft under the room: its inner width and depth, its walls [mm]. */
export interface HebShaft {
  W: number;
  D: number;
  wall: number;
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
    const [u0, u1] = rinvioRun(M, G), [v0, v1] = rinvioAcross(M, G, rf), h = KV_VERT.rinvioLeg / 2;
    for (const u of [u0 + h, u1 - h]) for (const v of [v0 + h, v1 - h]) out.push(onDrop(G, u, v));
    return out;
  }
  const span = supportSpan(s, M.D, F.shape);
  const us = s.kind === 'frame' && span ? [G.sheaveAt + span[0], G.sheaveAt + span[1]] : F.mounts.map((x) => G.sheaveAt + x);
  for (const u of us) for (const z of F.beams) out.push(onDrop(G, u, F.zSheave - z));
  if (rf?.on === 'stand' && M.Dp > 0) {
    const [u0, v0, u1, v1] = standBox(M, G);
    for (const u of [u0, u1]) for (const v of [v0, v1]) out.push(onDrop(G, u, v));
  }
  return out;
}

/** The ropes through the slab (room axes): the falls of the car's and of the counterweight's drops (2:1: either side of
 *  their pulleys), with the band of ropes side by side. */
export function dropRopes(G: RoomGeo, M: MachineSpec): Rope[] {
  const r = ropeWidths(M.n, M.d).ropes, falls = M.ropeIn > 0 ? [-M.ropeIn, M.ropeIn, G.calata - M.ropeIn, G.calata + M.ropeIn] : [0, G.calata];
  return falls.map((u) => ({ at: onDrop(G, u, 0), r }));
}

/** The machine's load on the beams [N] and where it acts (room axes): the machine with its bedframe at the middle of its
 *  outline, the static load times the dynamic coefficient on the fall of the car (`load.car`, else half of it) and on
 *  the counterweight's (2:1: the falls toward the machine). */
export function hebResultant(G: RoomGeo, M: MachineSpec, load: SupportLoad): { at: Pt; F: number } {
  const car = load.car ?? load.static / 2;
  const parts: readonly (readonly [number, number, number])[] = [
    [(G.frame0 + G.frame1) / 2, (G.across[0] + G.across[1]) / 2, load.machine],
    [M.ropeIn, 0, car * load.dyn],
    [G.calata - M.ropeIn, 0, (load.static - car) * load.dyn],
  ];
  const F = parts.reduce((t, p) => t + p[2], 0) || 1;
  const u = parts.reduce((t, p) => t + p[0] * p[2], 0) / F, v = parts.reduce((t, p) => t + p[1] * p[2], 0) / F;
  return { at: onDrop(G, u, v), F: F * G_ACC };
}

/** Whether the support is our low frame alone, lying on what is under it along its members: it rests on beams across
 *  it wherever it crosses them and may run past them. A machine on shims or plates, the bedplate with the diverting
 *  pulley on its legs, a pulley on its own stand: they stand on their feet. */
function frameOnly(G: RoomGeo, M: MachineSpec): boolean {
  const s = supportOf(G.room, M.Dp > 0), rf = M.rinvio ?? null;
  return s.kind === 'frame' && !(rf?.on === 'stand' && M.Dp > 0);
}

/** Whether beams along `dir` cross the frame, whose members run along the rope drop line (within 45° of square to it). */
const crossing = (G: RoomGeo, dir: HebDir): boolean => Math.abs(dir === 'x' ? G.ux : G.uy) < Math.SQRT1_2;

/** The two beams of `profile` along `dir` under `feet` over the shaft `S` lying in the room (room axes): under the
 *  outermost feet across them; under a frame crossing them (`bridge`) as far apart under it as the walls let them. */
export function hebLayout(R: RoomInputs, S: HebShaft, feet: readonly Pt[], dir: HebDir, profile: HebProfile, bridge = false): HebLayout {
  const along = dir === 'x' ? 0 : 1, across = 1 - along, b = KV_VERT.hebBearing, half = PROFILES[profile].b / 2;
  const s0 = along ? R.shaftY : R.shaftX, s1 = s0 + (along ? S.D : S.W), cs = feet.map((p) => p[across]), lo = Math.min(...cs), hi = Math.max(...cs);
  // the walls it bears on run across it from one outer face of the shaft to the other
  const c0 = across ? R.shaftY : R.shaftX, c1 = c0 + (across ? S.D : S.W), walls = [c0 - S.wall, c1 + S.wall] as const;
  const a = Math.max(lo, walls[0] + half), z = Math.min(hi, walls[1] - half), fits = bridge && z - a >= 2 * half;
  return { dir, profile, at: fits ? [a, z] : [lo, hi], span: [s0, s1], ends: [s0 - b, s1 + b], walls, bridge: fits, length: s1 - s0 + 2 * b };
}

/** The signed distance of a point from a beam's outline in plan (negative inside) [mm]. */
function fromBeam(p: Pt, lay: HebLayout, axis: number): number {
  const along = lay.dir === 'x' ? 0 : 1, half = PROFILES[lay.profile].b / 2;
  const dA = Math.max(lay.ends[0] - p[along], 0, p[along] - lay.ends[1]), dC = Math.abs(p[1 - along] - axis) - half;
  return dA > 0 ? Math.hypot(dA, Math.max(dC, 0)) : dC;
}

/** The beams of `lay` under the load `F` [N] acting at `at`, the support's feet and the ropes, on walls `wall` thick. */
export function hebResult(lay: HebLayout, res: { at: Pt; F: number }, feet: readonly Pt[], ropes: readonly Rope[], wall: number): HebResult {
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
  // the feet on the flanges, within the beams' ends; a frame crossing the beams only over their length
  for (const p of feet) {
    onBeams = Math.min(onBeams, p[along] - lay.ends[0], lay.ends[1] - p[along]);
    if (!lay.bridge) onBeams = Math.min(onBeams, half - Math.min(Math.abs(p[across] - a), Math.abs(p[across] - b)));
  }
  const rope = Math.min(...ropes.flatMap((x) => lay.at.map((ax) => fromBeam(x.at, lay, ax) - x.r)));
  // a beam past the walls' outer faces (under feet beyond the shaft) rests on nothing
  const onWalls = Math.min(wall - bear, a - half - lay.walls[0], lay.walls[1] - b - half);
  return { sigma, sigmaMax: KV_VERT.steelFyk / KV_VERT.steelGammaM0, f, fMax: clear / KV_VERT.beamDeflection, feet: onBeams, rope, wall: onWalls, reaction };
}

/** The checks m_heb (stress), m_hebf (deflection), m_hebfeet (the load between the beams, the feet on them), m_hebrope
 *  (the ropes clear of them), m_hebwall (on the walls: the bearing in them, the beams within their outer faces). */
export function hebChecks(r: HebResult | null): ShaftCheck[] {
  if (!r) return [];
  return [
    check('m_heb', r.sigma <= r.sigmaMax, r.sigma, r.sigmaMax, 0, 'MPa'),
    check('m_hebf', r.f <= r.fMax, r.f, r.fMax, 1, 'mm'),
    check('m_hebfeet', r.feet >= 0, Math.round(r.feet), 0, 0, 'mm'),
    check('m_hebrope', r.rope >= KV_VERT.hebRopeGap, Math.round(r.rope), KV_VERT.hebRopeGap, 0, 'mm'),
    check('m_hebwall', r.wall >= 0, Math.round(r.wall), 0, 0, 'mm'),
  ];
}

/** The six beams (two directions, three profiles) under the machine `M` in the room of `G`, the shortest first, then the
 *  lightest. */
export function hebLayouts(G: RoomGeo, M: MachineSpec, S: HebShaft): HebLayout[] {
  const feet = supportFeet(G, M), frame = frameOnly(G, M);
  return (['x', 'y'] as const).flatMap((dir) => HEB_PROFILES.map((profile) => hebLayout(G.room, S, feet, dir, profile, frame && crossing(G, dir))))
    .sort((p, q) => p.length - q.length || PROFILES[p.profile].mass - PROFILES[q.profile].mass);
}

/** The six beams the software weighs, in the order of hebLayouts, each with how it does at `load`. */
export function hebOptions(G: RoomGeo, M: MachineSpec, S: HebShaft, load: SupportLoad, ropes: readonly Rope[]): HebOption[] {
  const feet = supportFeet(G, M), res = hebResultant(G, M, load);
  return hebLayouts(G, M, S).map((lay): HebOption => {
    const result = hebResult(lay, res, feet, ropes, S.wall);
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
  const options = hebOptions(G, M, S, load, [...dropRopes(G, M), ...extra]);
  return { options, chosen: hebPick(options, set) };
}

/** The beams as the drawings take them: those the room names (profile and direction, the derivation's choice in place),
 *  else the tallest along the shaft's shorter side; null without them. */
export function hebDrawn(G: RoomGeo, M: MachineSpec, S: HebShaft): HebLayout | null {
  const set = G.room.heb;
  if (!set || !onHeb(G.room, M.Dp > 0)) return null;
  const dir = set.dir ?? (S.W <= S.D ? 'x' : 'y');
  return hebLayout(G.room, S, supportFeet(G, M), dir, set.profile ?? HEB_PROFILES[HEB_PROFILES.length - 1], frameOnly(G, M) && crossing(G, dir));
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
