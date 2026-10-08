// The check of the beams (putrelle) under the machine, registry locale.putrelle: one under each iron of the machine's
// frame — three, the sheave between the last two (machine-shape.ts) —, along the rope drop line from wall to wall. The
// machine's load (the machine with its bedframe at the middle of its outline, the static load on its axis times the
// dynamic coefficient on the ropes' falls, in the sheave's plane) shares out across them linearly (the frame rigid on
// beams equally stiff); each carries its share as one force at mid-span, with its own weight, over the span between the
// bearings' centres in the walls. Stress σ = M/Wel,y ≤ fyk/γM0 and elastic deflection ≤ 1/1500 of the clear span, on
// the beam where each is largest. Pure.
import { check } from './checks';
import { dropSpan, machineCorners, machineRun, machineV, supportRunIn, type MachineSpec, type RoomGeo } from './machine-room';
import { MACHINE_TOP } from './machine-outline';
import { IRON } from './machine-shape';
import { KV_VERT } from './norme-vert';
import { PROFILES } from './profiles';
import { rinvioRun, standBox } from './rinvio';
import { profileOf, supportOf } from './support';
import { outlineBox, outlineGap, panelBox, switchBox, type Box, type Outline } from './room-floor';
import { panelChecks, placePanel, type PanelSpot } from './room-panel';
import type { RoomInputs } from './room';
import type { ShaftCheck } from './types';

const G = 9.81;

/** The machine's load on its support [kg]: the machine with its bedframe, the static load on its axis, the dynamic
 *  coefficient on the latter. */
export interface SupportLoad {
  machine: number;
  static: number;
  dyn: number;
  /** of the static load, what hangs on the car's fall (the car, the rated load, half the ropes, the cables); missing:
   *  half of it (heb.ts takes where the load acts from it) */
  car?: number;
}

export interface BeamResult {
  /** clear span between the walls and span between the bearings' centres [mm], force on the more loaded beam [N],
   *  stress [MPa] and its limit, deflection and its limit [mm], of the beam where each is largest */
  clear: number;
  L: number;
  F: number;
  sigma: number;
  sigmaMax: number;
  f: number;
  fMax: number;
}

/** The machine's load [kg] and where it acts, along the rope drop line from the car's drop (u) and across it (v) [mm]:
 *  the machine with its bedframe at the middle of its outline, the static load times the dynamic coefficient on the
 *  fall of the car (`load.car`, else half of it) and on the counterweight's (2:1: the falls toward the machine). */
export function loadCentre(Gm: RoomGeo, M: MachineSpec, load: SupportLoad): { u: number; v: number; F: number } {
  const car = load.car ?? load.static / 2;
  const parts: readonly (readonly [number, number, number])[] = [
    [(Gm.frame0 + Gm.frame1) / 2, (Gm.across[0] + Gm.across[1]) / 2, load.machine],
    [M.ropeIn, 0, car * load.dyn],
    [Gm.calata - M.ropeIn, 0, (load.static - car) * load.dyn],
  ];
  const F = parts.reduce((t, p) => t + p[2], 0) || 1;
  return { u: parts.reduce((t, p) => t + p[0] * p[2], 0) / F, v: parts.reduce((t, p) => t + p[1] * p[2], 0) / F, F };
}

/** The shares of a load acting at `v` across the beams at `rows` (across the drop line) [mm]: a rigid frame on beams
 *  equally stiff — linear across them, the lever rule for two. With the sheave between the frame's irons the load acts
 *  between the outer ones and every share stays above 0. */
export function rowShares(rows: readonly number[], v: number): number[] {
  const n = rows.length, m = rows.reduce((t, r) => t + r, 0) / n, S = rows.reduce((t, r) => t + (r - m) ** 2, 0);
  return rows.map((r) => (S > 1 ? 1 / n + ((v - m) * (r - m)) / S : 1 / n));
}

/** The beams under the machine `M` at this load; null when the machine does not stand on beams. Each over its own span
 *  between the walls (askew, they meet the walls at other u; on an axis all alike). */
export function beamResult(Gm: RoomGeo, M: MachineSpec, load: SupportLoad): BeamResult | null {
  const s = supportOf(Gm.room);
  if (s.kind !== 'beams') return null;
  const P = PROFILES[profileOf(s)], rows = Gm.frame.beams.map((z) => machineV(Gm, z)), c = loadCentre(Gm, M, load);
  // each beam's force [N]: under the frame's irons, the load's share by where it acts across them
  const forces = rowShares(rows, c.v).map((k) => k * c.F * G);
  // own weight [N/mm]; Wel,y [cm³] and Iy [cm⁴] in mm
  const q = (P.mass * G) / 1000, W = P.Wy * 1e3, I = P.Iy * 1e4, E = KV_VERT.steelE, sigmaMax = KV_VERT.steelFyk / KV_VERT.steelGammaM0;
  const each = rows.map((v, i) => {
    const [r0, r1] = dropSpan(Gm, 0, 0, Gm.room.W, Gm.room.D, v), clear = r1 - r0, L = clear + KV_VERT.supportBearing, F = forces[i];
    return { clear, L, F, sigma: Math.abs((F * L) / 4 + (q * L * L) / 8) / W, f: Math.abs((F * L ** 3) / (48 * E * I) + (5 * q * L ** 4) / (384 * E * I)) };
  });
  // the beam most stressed, the one most deflected for its span
  const b = each.reduce((a, x) => (x.sigma > a.sigma ? x : a)), d = each.reduce((a, x) => (x.f / x.clear > a.f / a.clear ? x : a));
  return { clear: b.clear, L: b.L, F: Math.max(...forces), sigma: b.sigma, sigmaMax, f: d.f, fMax: d.clear / KV_VERT.beamDeflection };
}

/** How far the beams' ends stay off the opening of the room's door, along its wall [mm]: the least over the ends that bear
 *  in the door's wall (each flange as wide along the wall as the beam meets it askew); < 0 an end in the opening, with no
 *  wall to bear on. null when no end bears in that wall, or the machine does not stand on beams. */
export function beamDoorGap(Gm: RoomGeo): number | null {
  const R = Gm.room, s = supportOf(R);
  if (s.kind !== 'beams') return null;
  const b = PROFILES[profileOf(s)].b, wall = R.doorWall, alongX = wall === 'front' || wall === 'rear', face = wall === 'front' || wall === 'left' ? 0 : alongX ? R.D : R.W;
  // the beam's width along the wall: b over the cosine of its angle to the wall's normal
  const cos = Math.abs(alongX ? Gm.uy : Gm.ux), half = cos > 1e-6 ? b / 2 / cos : Infinity;
  let gap: number | null = null;
  for (const z of Gm.frame.beams) {
    const v = machineV(Gm, z);
    for (const u of dropSpan(Gm, 0, 0, R.W, R.D, v)) {
      const x = Gm.carDrop[0] + u * Gm.ux - v * Gm.uy, y = Gm.carDrop[1] + u * Gm.uy + v * Gm.ux;
      if (Math.abs((alongX ? y : x) - face) > 1) continue;
      const c = alongX ? x : y, g = Math.max(R.doorAt - (c + half), c - half - (R.doorAt + R.doorW));
      gap = gap === null ? g : Math.min(gap, g);
    }
  }
  return gap;
}

/** The checks of a maker's bedplate (registry locale.rinvio): m_rinvio, soft, the counterweight's rope drop within its
 *  reach — from the sheave's car side to the pulley's far side at most the maker's L max (a longer bedplate is made to
 *  measure); m_bedplate, the machine's bedframe and the pulley within its catalogue length (rinvio.ts rinvioRun: the
 *  maker builds it so, a machine turned on it overhangs its end — ours is then made to measure): the least margin to its
 *  ends [mm]. None on ours or without one. */
export function rinvioChecks(Gm: RoomGeo | null, M: MachineSpec): ShaftCheck[] {
  const mk = M.rinvio?.on === 'frame' ? M.rinvio.maker : null;
  if (!Gm || !mk || M.Dp <= 0) return [];
  const need = Gm.pulleyAt + M.Dp / 2 - M.ropeIn, [u0, u1] = rinvioRun(M, Gm), r = M.Dp / 2;
  const margin = Math.min(Gm.frame0 - u0, u1 - Gm.frame1, Gm.pulleyAt - r - u0, u1 - (Gm.pulleyAt + r));
  return [check('m_rinvio', need <= mk.fall.max, need, mk.fall.max, 0, 'mm', true), check('m_bedplate', margin >= 0, Math.round(margin), 0, 0, 'mm')];
}

/** The checks m_beam (stress) and m_beamf (deflection), of the beam where each is largest, and m_beamwall (no beam's end
 *  in the door's opening: there is no wall to bear on); none when the machine does not stand on beams. */
export function beamChecks(Gm: RoomGeo | null, M: MachineSpec, load: SupportLoad): ShaftCheck[] {
  const b = Gm ? beamResult(Gm, M, load) : null, door = Gm ? beamDoorGap(Gm) : null;
  if (!b) return [];
  return [check('m_beam', b.sigma <= b.sigmaMax, b.sigma, b.sigmaMax, 0, 'MPa'), check('m_beamf', b.f <= b.fMax, b.f, b.fMax, 1, 'mm'),
    ...(door === null ? [] : [check('m_beamwall', door >= 0, Math.round(door), 0, 0, 'mm')])];
}

/** The top of the machine over the room's floor [mm]: a maker's by its sheet (its height over the feet), the generic
 *  one by its elevation scaled to the sheave. */
export function machineTop(M: MachineSpec, G: RoomGeo): number {
  const F = G.frame, S = F.shape;
  return S ? M.axis - S.yWheel + S.overall[2] : M.axis - F.axis + MACHINE_TOP * 1000 * F.s;
}

/** The diverting pulley on its own stand under the machine (registry locale.ingombro): what is left between the stand,
 *  standing on the floor in the ropes' plane between the machine's irons, and the members of the machine's support
 *  beside it — the frame's profiles, the beams, the plates or the shims under the irons, the plinth's blocks either side
 *  of the ropes; raised beams over the pulley's rim span it —, and between the rim and the machine's bedframe over it
 *  (its end cross members) [mm]; null when the stand is beside the machine or there is none. */
export function standClearance(Gm: RoomGeo, M: MachineSpec): number | null {
  const R = Gm.room, rf = M.rinvio ?? null;
  if (rf?.on !== 'stand' || M.Dp <= 0 || Gm.pulleyZ <= -R.slab) return null;
  const [a0, b0, a1, b1] = standBox(M, Gm);
  if (!(a0 < Gm.frame1 && Gm.frame0 < a1 && b0 < Gm.across[1] && Gm.across[0] < b1)) return null;
  const s = supportOf(R, true), F = Gm.frame, top = M.axis - F.axis, rim = Gm.pulleyZ + M.Dp / 2, k = F.shape ? 1 : F.s;
  // the members in plan along the drop line [u0, u1] and across it [v0, v1], from their stretches of the machine's x and z
  const members: (readonly [number, number, number, number])[] = [];
  const add = (x0: number, x1: number, z0: number, z1: number): void => {
    const [u0, u1] = machineRun(Gm, x0, x1), v0 = machineV(Gm, z0), v1 = machineV(Gm, z1);
    members.push([u0, u1, Math.min(v0, v1), Math.max(v0, v1)]);
  };
  let clear = Infinity;
  if (s.kind === 'shims' || s.kind === 'plates') {
    const [hx, hz] = s.kind === 'shims' ? [60 * k, 50 * k] : [90 * k, 60 * k];
    for (const x of F.mounts) for (const z of F.beams) add(x - hx, x + hx, z - hz, z + hz);
  } else if (s.kind === 'plinth') {
    const span = supportRunIn(Gm, M);
    if (span) for (const [z0, z1] of F.plinth) add(span[0], span[1], z0, z1);
  } else if (s.kind === 'frame' || s.kind === 'beams') {
    const P = PROFILES[profileOf(s)], under = top - P.h, span = supportRunIn(Gm, M);
    if (s.kind === 'beams' && under >= rim) clear = under - rim;
    else for (const z of F.beams) {
      if (s.kind === 'frame' && span) add(span[0], span[1], z - P.b / 2, z + P.b / 2);
      else {
        const v = machineV(Gm, z), [u0, u1] = dropSpan(Gm, 0, 0, R.W, R.D, v);
        members.push([u0 - KV_VERT.supportBearing, u1 + KV_VERT.supportBearing, v - P.b / 2, v + P.b / 2]);
      }
    }
  }
  // the gap in plan between the stand and each member (< 0: into it, by the least it would have to move)
  for (const [u0, u1, v0, v1] of members) {
    const du = Math.max(u0 - a1, a0 - u1), dv = Math.max(v0 - b1, b0 - v1);
    clear = Math.min(clear, du > 0 && dv > 0 ? Math.hypot(du, dv) : Math.max(du, dv));
  }
  // over it: the bedframe's end cross members, where the pulley's rim reaches above the bedframe's underside
  const r = M.Dp / 2;
  if (rim > top) for (const x of [F.run[0], F.run[1]]) {
    const [u0, u1] = machineRun(Gm, x - IRON / 2, x + IRON / 2);
    if (u0 < Gm.pulleyAt + r && Gm.pulleyAt - r < u1) clear = Math.min(clear, top - rim);
  }
  return Number.isFinite(clear) ? clear : null;
}

/** The free area beside the machine for its maintenance and the manual emergency operation (registry locale.macchina):
 *  on the side of the machine's outline `box` [x0, y0, x1, y1] (room axes, its bedplate and pulley stand with it) with
 *  the most room, the strip to the wall or to the nearest of `obstacles` beside it (the control panel; the governor and
 *  the main switch when given) — as deep as the area's longer side along a side at least as long as its shorter, or the
 *  other way round. Its depth, the depth it needs there [mm], and the strip as deep as it needs (or as it is). */
export function freeBeside(R: RoomInputs, box: Box, obstacles: readonly Box[] = [panelBox(R)]): { depth: number; need: number; area: Box } {
  const [x0, y0, x1, y1] = box, K = KV_VERT, [a, b] = [Math.min(K.maintW, K.maintD), Math.max(K.maintW, K.maintD)];
  // how far each side is from the wall, or from what stands beside it
  let left = x0, right = R.W - x1, front = y0, rear = R.D - y1;
  for (const [px0, py0, px1, py1] of obstacles) {
    const overX = px0 < x1 && x0 < px1, overY = py0 < y1 && y0 < py1;
    if (overY && px1 <= x0) left = Math.min(left, x0 - px1);
    if (overY && px0 >= x1) right = Math.min(right, px0 - x1);
    if (overX && py1 <= y0) front = Math.min(front, y0 - py1);
    if (overX && py0 >= y1) rear = Math.min(rear, py0 - y1);
  }
  const sides: { depth: number; len: number; strip: (d: number) => Box }[] = [
    { depth: left, len: y1 - y0, strip: (d) => [x0 - d, y0, x0, y1] },
    { depth: right, len: y1 - y0, strip: (d) => [x1, y0, x1 + d, y1] },
    { depth: front, len: x1 - x0, strip: (d) => [x0, y0 - d, x1, y0] },
    { depth: rear, len: x1 - x0, strip: (d) => [x0, y1, x1, y1 + d] },
  ];
  const ways = sides.flatMap((s) => [...(s.len >= a ? [{ s, need: b }] : []), ...(s.len >= b ? [{ s, need: a }] : [])]);
  const all = ways.length ? ways : sides.map((s) => ({ s, need: b }));
  const best = all.reduce((p, w) => (w.s.depth - w.need > p.s.depth - p.need ? w : p));
  return { depth: best.s.depth, need: best.need, area: best.s.strip(Math.max(0, Math.min(best.s.depth, best.need))) };
}

const boxAround = (c: readonly (readonly [number, number])[]): Box => {
  const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

/** The machine's parts in the room's plan (room axes) [mm]: the machine on its support, and the bedplate of the
 *  diverting pulley or the pulley's own stand — each a rectangle [x0, y0, x1, y1] on a drop line along the room's axes,
 *  its turned outline by its corners on one askew (the floor's checks measure what is there, not the box round it). */
export function machineParts(Gm: RoomGeo, M: MachineSpec): Outline[] {
  const c = machineCorners(Gm, M), square = Math.abs(Gm.ux) < 1e-9 || Math.abs(Gm.uy) < 1e-9;
  return Array.from({ length: c.length / 4 }, (_, k) => (square ? boxAround(c.slice(4 * k, 4 * k + 4)) : c.slice(4 * k, 4 * k + 4)));
}

/** The machine's outline in the room's plan, its support and pulley with it: [x0, y0, x1, y1] (room axes) [mm]. */
export function machineBox(Gm: RoomGeo, M: MachineSpec): [number, number, number, number] {
  const [x0, y0, x1, y1] = boxAround(machineCorners(Gm, M));
  return [x0, y0, x1, y1];
}

/** A frame or a plinth under the machine's mounts (registry locale.basamento, m_base): how far it runs past the outer
 *  edges of the mounts' pads along the drop line, the least of its two ends [mm] (< 0: a mount over nothing — a length set
 *  by hand too short); null for the other supports. */
export function baseUnderMounts(Gm: RoomGeo, M: MachineSpec): number | null {
  const span = supportRunIn(Gm, M), F = Gm.frame, hp = 60 * (F.shape ? 1 : F.s);
  if (!span) return null;
  return Math.min(Math.min(...F.mounts) - hp - span[0], span[1] - (Math.max(...F.mounts) + hp));
}

/** The checks m_base, m_fit and m_stand (registry locale.basamento, locale.ingombro): the machine on its support — with the bedplate of the
 *  diverting pulley or the pulley's own stand — inside the room in plan and under its ceiling: the least distance left to
 *  a wall or to the ceiling, at least 0 [mm]; the pulley on its stand under the machine clear of the support over it; the
 *  free area beside it up to the walls, the control panel and `others` (the governor, the main switch: m_free). */
export function fitChecks(Gm: RoomGeo | null, M: MachineSpec, others: readonly Box[] = []): ShaftCheck[] {
  if (!Gm) return [];
  const R = Gm.room;
  let clear = R.H - machineTop(M, Gm);
  for (const [x, y] of machineCorners(Gm, M)) clear = Math.min(clear, x, R.W - x, y, R.D - y);
  const stand = standClearance(Gm, M), free = freeBeside(R, machineBox(Gm, M), [panelBox(R), ...others]), base = baseUnderMounts(Gm, M);
  return [
    ...(base === null ? [] : [check('m_base', base >= 0, Math.round(base), 0, 0, 'mm')]),
    check('m_fit', clear >= 0, Math.round(clear), 0, 0, 'mm'), ...(stand === null ? [] : [check('m_stand', stand >= 0, Math.round(stand), 0, 0, 'mm')]),
    check('m_free', free.depth >= free.need, Math.round(free.depth), free.need, 0, 'mm'),
  ];
}

/** The free area beside the machine with the panel standing at `panel` (null: none) and `others` beside it: whether it is
 *  as deep as it needs, and the strip where it is (null when it is not). */
function freeWith(Gm: RoomGeo, M: MachineSpec, others: readonly Box[]): (panel: Box | null) => { ok: boolean; area: Box | null } {
  const box = machineBox(Gm, M);
  return (panel) => {
    const f = freeBeside(Gm.room, box, [...(panel ? [panel] : []), ...others]), ok = f.depth >= f.need;
    return { ok, area: ok ? f.area : null };
  };
}

/** The checks m_quadro and m_route of the control panel in the room (room-panel.ts panelChecks) among the machine's parts
 *  and `others` (the governor, the main switch): the ways from the door reach the free area beside the machine too. */
export function panelFloorChecks(Gm: RoomGeo, M: MachineSpec, others: readonly Box[]): ShaftCheck[] {
  const R = Gm.room;
  return panelChecks(R, [...machineParts(Gm, M), ...others], freeWith(Gm, M, others)(panelBox(R)).area);
}

/** Where the software puts the control panel in the room (room-panel.ts placePanel) among the machine's parts and
 *  `others` (the governor, the main switch). */
export function panelPlace(Gm: RoomGeo, M: MachineSpec, others: readonly Box[]): PanelSpot {
  return placePanel(Gm.room, [...machineParts(Gm, M), ...others], freeWith(Gm, M, others));
}

/** The checks of the governor on the room's floor (registry limitatore.posto), its outline `gov` [x0, y0, x1, y1] (room
 *  axes; null: none drawn): m_gov, the least distance to the machine's parts, the control panel, the main switch and the
 *  walls, at least 0; m_govfree, the free area beside it for its maintenance as deep as it needs (500 × 600 mm). */
export function governorRoomChecks(gov: Box | null, Gm: RoomGeo, M: MachineSpec): ShaftCheck[] {
  if (!gov) return [];
  const R = Gm.room, near = [...machineParts(Gm, M), panelBox(R), switchBox(R)];
  const gap = Math.min(gov[0], gov[1], R.W - gov[2], R.D - gov[3], ...near.map((b) => outlineGap(gov, b))), free = freeBeside(R, gov, near.map(outlineBox));
  return [check('m_gov', gap >= 0, Math.round(gap), 0, 0, 'mm'), check('m_govfree', free.depth >= free.need, Math.round(free.depth), free.need, 0, 'mm')];
}
