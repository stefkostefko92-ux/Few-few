// The check of the two beams (putrelle) under the machine, registry locale.putrelle: each carries half the machine's
// load (the machine with its bedframe plus the static load on its axis times the dynamic coefficient) as one force at
// mid-span, with its own weight, over the span between the bearings' centres in the walls along the rope drop line.
// Stress σ = M/Wel,y ≤ fyk/γM0 and elastic deflection ≤ 1/1500 of the clear span. Pure.
import { check } from './checks';
import { dropSpan, type MachineSpec, type RoomGeo } from './machine-room';
import { MACHINE_TOP } from './machine-outline';
import { KV_VERT } from './norme-vert';
import { PROFILES } from './profiles';
import { rinvioAcross, rinvioRun, standBox } from './rinvio';
import { padsOf, profileOf, supportOf } from './support';
import type { RoomInputs } from './room';
import type { ShaftCheck } from './types';

const G = 9.81;

/** The machine's load on its support [kg]: the machine with its bedframe, the static load on its axis, the dynamic
 *  coefficient on the latter. */
export interface SupportLoad {
  machine: number;
  static: number;
  dyn: number;
}

export interface BeamResult {
  /** clear span between the walls and span between the bearings' centres [mm], force on each beam [N], stress [MPa]
   *  and its limit, deflection and its limit [mm] */
  clear: number;
  L: number;
  F: number;
  sigma: number;
  sigmaMax: number;
  f: number;
  fMax: number;
}

/** The beams under the machine at this load; null when the machine does not stand on beams. */
export function beamResult(Gm: RoomGeo, load: SupportLoad): BeamResult | null {
  const s = supportOf(Gm.room);
  if (s.kind !== 'beams') return null;
  const P = PROFILES[profileOf(s)], [r0, r1] = dropSpan(Gm, 0, 0, Gm.room.W, Gm.room.D);
  const clear = r1 - r0, L = clear + KV_VERT.supportBearing, F = ((load.machine + load.static * load.dyn) * G) / 2;
  // own weight [N/mm]; Wel,y [cm³] and Iy [cm⁴] in mm
  const q = (P.mass * G) / 1000, W = P.Wy * 1e3, I = P.Iy * 1e4, E = KV_VERT.steelE;
  const M = (F * L) / 4 + (q * L * L) / 8;
  const f = (F * L ** 3) / (48 * E * I) + (5 * q * L ** 4) / (384 * E * I);
  return { clear, L, F, sigma: M / W, sigmaMax: KV_VERT.steelFyk / KV_VERT.steelGammaM0, f, fMax: clear / KV_VERT.beamDeflection };
}

/** The check m_rinvio (registry locale.rinvio), soft: on a maker's bedplate the counterweight's rope drop within its
 *  reach — from the sheave's car side to the pulley's far side at most the maker's L max (a longer bedplate is made to
 *  measure); none on ours or without one. */
export function rinvioChecks(Gm: RoomGeo | null, M: MachineSpec): ShaftCheck[] {
  const mk = M.rinvio?.on === 'frame' ? M.rinvio.maker : null;
  if (!Gm || !mk || M.Dp <= 0) return [];
  const need = Gm.pulleyAt + M.Dp / 2 - M.ropeIn;
  return [check('m_rinvio', need <= mk.fall.max, need, mk.fall.max, 0, 'mm', true)];
}

/** The checks m_beam (stress) and m_beamf (deflection); none when the machine does not stand on beams. */
export function beamChecks(Gm: RoomGeo | null, load: SupportLoad): ShaftCheck[] {
  const b = Gm ? beamResult(Gm, load) : null;
  if (!b) return [];
  return [
    check('m_beam', b.sigma <= b.sigmaMax, b.sigma, b.sigmaMax, 0, 'MPa'),
    check('m_beamf', b.f <= b.fMax, b.f, b.fMax, 1, 'mm'),
  ];
}

/** The top of the machine over the room's floor [mm]: a maker's by its sheet (its height over the feet), the generic
 *  one by its elevation scaled to the sheave. */
export function machineTop(M: MachineSpec, G: RoomGeo): number {
  const F = G.frame, S = F.shape;
  return S ? M.axis - S.yWheel + S.overall[2] : M.axis - F.axis + MACHINE_TOP * 1000 * F.s;
}

/** The diverting pulley on its own stand under the machine (registry locale.ingombro): what is left between the pulley's
 *  rim and the underside of the machine's support over it [mm] — raised beams span over it, the other supports stand on
 *  the floor (0); null when the stand is beside the machine or there is none. */
export function standClearance(Gm: RoomGeo, M: MachineSpec): number | null {
  const R = Gm.room, rf = M.rinvio ?? null;
  if (rf?.on !== 'stand' || M.Dp <= 0 || Gm.pulleyZ <= -R.slab) return null;
  const [a0, b0, a1, b1] = standBox(M, Gm);
  if (!(a0 < Gm.frame1 && Gm.frame0 < a1 && b0 < Gm.across[1] && Gm.across[0] < b1)) return null;
  const s = supportOf(R, true), top = M.axis - padsOf(s) - Gm.frame.axis;
  return (s.kind === 'beams' ? top - PROFILES[profileOf(s)].h : 0) - (Gm.pulleyZ + M.Dp / 2);
}

/** The free area beside the machine for its maintenance and the manual emergency operation (registry locale.macchina):
 *  on the side of the machine's outline `box` [x0, y0, x1, y1] (room axes, its bedplate and pulley stand with it) with
 *  the most room, the strip to the wall or to the control panel — as deep as the area's longer side along a side at
 *  least as long as its shorter, or the other way round. Its depth and the depth it needs there [mm]. */
export function freeBeside(R: RoomInputs, box: readonly [number, number, number, number]): { depth: number; need: number } {
  const [x0, y0, x1, y1] = box, K = KV_VERT, [a, b] = [Math.min(K.maintW, K.maintD), Math.max(K.maintW, K.maintD)];
  const p = R.panelWall, pd = R.panelD, pa = R.panelAt, pe = R.panelAt + R.panelW;
  const [px0, py0, px1, py1] = p === 'front' ? [pa, 0, pe, pd] : p === 'rear' ? [pa, R.D - pd, pe, R.D] : p === 'left' ? [0, pa, pd, pe] : [R.W - pd, pa, R.W, pe];
  const overX = px0 < x1 && x0 < px1, overY = py0 < y1 && y0 < py1;
  const sides = [
    { depth: x0 - (overY && px1 <= x0 ? px1 : 0), len: y1 - y0 },
    { depth: (overY && px0 >= x1 ? px0 : R.W) - x1, len: y1 - y0 },
    { depth: y0 - (overX && py1 <= y0 ? py1 : 0), len: x1 - x0 },
    { depth: (overX && py0 >= y1 ? py0 : R.D) - y1, len: x1 - x0 },
  ];
  const ways = sides.flatMap((s) => [...(s.len >= a ? [{ depth: s.depth, need: b }] : []), ...(s.len >= b ? [{ depth: s.depth, need: a }] : [])]);
  const all = ways.length ? ways : sides.map((s) => ({ depth: s.depth, need: b }));
  return all.reduce((best, w) => (w.depth - w.need > best.depth - best.need ? w : best));
}

/** The corners, in room axes, of the machine on its support with the bedplate of the diverting pulley or the pulley's own
 *  stand. */
function machineCorners(Gm: RoomGeo, M: MachineSpec): [number, number][] {
  const R = Gm.room, rf = M.rinvio ?? null;
  const boxes: (readonly [number, number, number, number])[] = [[Gm.frame0, Gm.across[0], Gm.frame1, Gm.across[1]]];
  if (rf?.on === 'frame') {
    const [u0, u1] = rinvioRun(M, Gm), [v0, v1] = rinvioAcross(M, Gm, rf);
    boxes.push([u0, v0, u1, v1]);
  } else if (M.Dp > 0 && Gm.pulleyZ > -R.slab) boxes.push(standBox(M, Gm));
  return boxes.flatMap(([u0, v0, u1, v1]) => ([[u0, v0], [u1, v0], [u1, v1], [u0, v1]] as const)
    .map(([u, v]): [number, number] => [Gm.carDrop[0] + u * Gm.ux - v * Gm.uy, Gm.carDrop[1] + u * Gm.uy + v * Gm.ux]));
}

/** The machine's outline in the room's plan, its support and pulley with it: [x0, y0, x1, y1] (room axes) [mm]. */
export function machineBox(Gm: RoomGeo, M: MachineSpec): [number, number, number, number] {
  const c = machineCorners(Gm, M), xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** The checks m_fit and m_stand (registry locale.ingombro): the machine on its support — with the bedplate of the
 *  diverting pulley or the pulley's own stand — inside the room in plan and under its ceiling: the least distance left to
 *  a wall or to the ceiling, at least 0 [mm]; the pulley on its stand under the machine clear of the support over it; the
 *  free area beside it (m_free). */
export function fitChecks(Gm: RoomGeo | null, M: MachineSpec): ShaftCheck[] {
  if (!Gm) return [];
  const R = Gm.room;
  let clear = R.H - machineTop(M, Gm);
  for (const [x, y] of machineCorners(Gm, M)) clear = Math.min(clear, x, R.W - x, y, R.D - y);
  const stand = standClearance(Gm, M), free = freeBeside(R, machineBox(Gm, M));
  return [
    check('m_fit', clear >= 0, Math.round(clear), 0, 0, 'mm'), ...(stand === null ? [] : [check('m_stand', stand >= 0, Math.round(stand), 0, 0, 'mm')]),
    check('m_free', free.depth >= free.need, Math.round(free.depth), free.need, 0, 'mm'),
  ];
}
