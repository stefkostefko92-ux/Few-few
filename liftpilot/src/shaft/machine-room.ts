// Machine room above the shaft: where the machine sits (its sheave's car side over the car's rope drop, the diverting
// pulley where the counterweight's drop leaves it), the checks of the room (height, free area in front of the control
// panel, door), and the geometry both drawings of the room share: the ropes' straight runs between the wheels and the
// slab's openings round them, as the 3D cuts them (components/lift3d/slab.ts). The machine is the 3D's (machine-outline) or a
// maker's as it is (machine-shape).
import { check } from './checks';
import { MACHINE_A } from './machine-outline';
import { machineFrame, type MachineFrame, type MachineShape } from './machine-shape';
import { KV_VERT } from './norme-vert';
import { panelFree, type Outline } from './room-floor';
import { fallsOf } from './falls';
import { rinvioAcross, rinvioRun, standBox, type RinvioFrame } from './rinvio';
import { PROFILES } from './profiles';
import { cwPlateAt, section } from './section';
import { profileOf, supportOf, supportSpanIn } from './support';
import type { Layout, ShaftCheck } from './types';
import type { RoomInputs } from './room';

export { ropeWidths } from './ropes';

/** The machine as the calculation describes it [mm, kg]. */
export interface MachineSpec {
  /** sheave pitch diameter; diverting pulley diameter (0: none) */
  D: number;
  Dp: number;
  /** ropes: number and diameter */
  n: number;
  d: number;
  /** machine and bedframe mass */
  mass: number;
  /** label, e.g. "M73 Sx" */
  label: string;
  /** the sheave's axis over the room's floor */
  axis: number;
  /** diverting pulley: its axis below the sheave's, and whether the ropes wrap it the other way (reverse bend) */
  h: number;
  reverse: boolean;
  /** a surveyed 2:1 (the replacement: the drops as measured): the ropes rise to the machine half a pulley in from them
   *  along their line; 0 where the drops are the falls themselves (1:1, and the full project: falls.ts) */
  ropeIn: number;
  /** the full project's 2:1: the car's and the counterweight's pulleys' diameter, each turning between its guide rails
   *  (falls.ts); missing or 0: 1:1, or the drops as surveyed */
  pulley2?: number;
  /** the maker's machine as it is (machine-shape.ts); missing or null: the generic machine scaled to the sheave */
  shape?: MachineShape | null;
  /** where the diverting pulley turns in the room (rinvio.ts); missing or null: no pulley, or no room */
  rinvio?: RinvioFrame | null;
  /** the HEB beams on the shaft's walls the support stands on: their height over the floor (missing or 0: none) */
  base?: number;
}

export interface RoomGeo {
  room: RoomInputs;
  /** plan: rope drops of the car and of the counterweight, in room coordinates (x, y) */
  carDrop: readonly [number, number];
  cwDrop: readonly [number, number];
  /** unit vector from the car drop to the counterweight drop, and the drop spacing (calata) */
  ux: number;
  uy: number;
  calata: number;
  /** centres of the sheave and of the diverting pulley on the drop line, from the car drop; the pulley's axis over the
   *  room's floor [mm] */
  sheaveAt: number;
  pulleyAt: number;
  pulleyZ: number;
  /** the machine's bedframe along the drop line, from the car drop, and the machine across it (v: toward the left of
   *  the drop line, the sheave on it) [mm] */
  frame0: number;
  frame1: number;
  across: readonly [number, number];
  /** the machine's worm (its +X, toward the motor) along +u, toward the counterweight's drop (1), or turned round about
   *  the sheave's vertical axis toward the car's (−1): its gearbox then on the drop line's right */
  dir: 1 | -1;
  /** the machine's scale on the 3D's Ø 560 */
  s: number;
  /** where the machine is in its own frame: its axis, its sheave, its bedplate (machine-shape.ts) */
  frame: MachineFrame;
  /** 2:1: the dead ends hanging from the slab (Drops.dead); none at 1:1 */
  deadEnds: readonly DeadEnd[];
}

/** Where the drop line — or the line along it `v` to its left (a beam under an iron of the machine's frame) — runs
 *  inside the rectangle [x0, x1] × [y0, y1] of the room: the range of u. */
export function dropSpan(G: RoomGeo, x0: number, y0: number, x1: number, y1: number, v = 0): [number, number] {
  let lo = -Infinity, hi = Infinity;
  for (const [p, d, a, b] of [[G.carDrop[0] - v * G.uy, G.ux, x0, x1], [G.carDrop[1] + v * G.ux, G.uy, y0, y1]] as const) {
    if (Math.abs(d) < 1e-9) continue;
    const t0 = (a - p) / d, t1 = (b - p) / d;
    lo = Math.max(lo, Math.min(t0, t1));
    hi = Math.min(hi, Math.max(t0, t1));
  }
  return [lo, hi];
}

/** The rope drops in the room (room coordinates): the car's and the counterweight's, the unit vector from the one to the
 *  other and their spacing (calata) [mm]. */
export interface Drops {
  car: readonly [number, number];
  cw: readonly [number, number];
  ux: number;
  uy: number;
  calata: number;
  /** 2:1: where the dead ends hang and the unit direction each one's pulley turns in, toward its fall (falls.ts);
   *  missing: half a pulley past the surveyed drops along their line (MachineSpec.ropeIn), none at 1:1 */
  dead?: readonly DeadEnd[];
}

/** A 2:1 roping's dead end in plan (room axes): where it hangs and the unit direction its pulley turns in. */
export interface DeadEnd {
  at: readonly [number, number];
  dir: readonly [number, number];
}

/** The machine over the drops `P`: the sheave's car side over the car's drop (`sheaveAt`: its centre elsewhere on the
 *  drop line, as a direct pull centred between drops wider than the sheave hangs it), the diverting pulley where the
 *  counterweight's drop leaves it; its motor toward the counterweight's drop (`dir` 1) or the car's (−1). */
export function geoOn(R: RoomInputs, P: Drops, M: MachineSpec, sheaveAt = M.ropeIn + M.D / 2, dir: 1 | -1 = 1): RoomGeo {
  const calata = P.calata, s = M.D / (2000 * MACHINE_A.rp), u1 = calata - M.ropeIn;
  const pulleyAt = M.Dp > 0 ? (M.reverse ? u1 + M.Dp / 2 : u1 - M.Dp / 2) : sheaveAt;
  // the machine on its frame, the third iron past the sheave with it; turned round, the same about the sheave's axis
  const F = machineFrame(M.D, M.shape ?? null, M.rinvio?.bed ?? null), us = [sheaveAt + dir * F.x[0], sheaveAt + dir * F.x[1]];
  const vs = [dir * (F.zSheave - F.z[1]), dir * (F.zSheave - F.z[0])], across: readonly [number, number] = [Math.min(...vs), Math.max(...vs)];
  return {
    room: R, carDrop: P.car, cwDrop: P.cw, ux: P.ux, uy: P.uy, calata, sheaveAt, pulleyAt, pulleyZ: M.axis - M.h, frame0: Math.min(...us), frame1: Math.max(...us),
    across, dir, s, frame: F, deadEnds: P.dead ?? (M.ropeIn > 0 ? [
      { at: [P.car[0] - M.ropeIn * P.ux, P.car[1] - M.ropeIn * P.uy], dir: [P.ux, P.uy] },
      { at: [P.cw[0] + M.ropeIn * P.ux, P.cw[1] + M.ropeIn * P.uy], dir: [-P.ux, -P.uy] },
    ] : []),
  };
}

/** Where a point of the machine stands on the drop line: along it (u) from its x along the worm from the sheave's axis,
 *  across it (v) from its z across from the worm's plane (machine-shape.ts), as the machine is turned. */
export const machineU = (G: RoomGeo, x: number): number => G.sheaveAt + G.dir * x;
export const machineV = (G: RoomGeo, z: number): number => G.dir * (G.frame.zSheave - z);
/** A stretch of the machine's x [a, b] along the drop line, in order. */
export const machineRun = (G: RoomGeo, a: number, b: number): [number, number] => {
  const p = machineU(G, a), q = machineU(G, b);
  return [Math.min(p, q), Math.max(p, q)];
};

type P2 = readonly [number, number];

/** A frame's or a plinth's run along the machine's x as the room lets it run (support.ts supportSpanIn) [mm]; null for
 *  the others. */
export function supportRunIn(G: RoomGeo, M: MachineSpec): readonly [number, number] | null {
  const d = G.dir, vx = -G.uy, vy = G.ux, zS = G.frame.zSheave;
  const o: P2 = [G.carDrop[0] + G.sheaveAt * G.ux + d * zS * vx, G.carDrop[1] + G.sheaveAt * G.uy + d * zS * vy];
  return supportSpanIn(supportOf(G.room, M.Dp > 0), M.D, G.frame.shape, G.room.W, G.room.D, o, [d * G.ux, d * G.uy], [-d * vx, -d * vy]);
}

/** The machine on its bedframe in plan [u0, v0, u1, v1], with what its support spreads past it: a frame's profiles and a
 *  plinth's blocks under the irons, along the drop line as long as they run (the beams bear in the walls, plates and
 *  shims stay under the mounts). */
function machineOutline(G: RoomGeo, M: MachineSpec): readonly [number, number, number, number] {
  const s = supportOf(G.room, M.Dp > 0), F = G.frame, span = supportRunIn(G, M);
  if (!span || (s.kind !== 'frame' && s.kind !== 'plinth')) return [G.frame0, G.across[0], G.frame1, G.across[1]];
  const [u0, u1] = machineRun(G, span[0], span[1]), half = s.kind === 'frame' ? PROFILES[profileOf(s)].b / 2 : 0;
  const vs = (s.kind === 'plinth' ? F.plinth.flat() : F.beams.flatMap((z) => [z - half, z + half])).map((z) => machineV(G, z));
  return [Math.min(G.frame0, u0), Math.min(G.across[0], ...vs), Math.max(G.frame1, u1), Math.max(G.across[1], ...vs)];
}

/** The corners, in room axes, of the machine on its support with the bedplate of the diverting pulley or the pulley's own
 *  stand: four for each part (`stand` false: without the stand, which does not turn with the machine). */
export function machineCorners(G: RoomGeo, M: MachineSpec, stand = true): [number, number][] {
  const R = G.room, rf = M.rinvio ?? null;
  const boxes: (readonly [number, number, number, number])[] = [machineOutline(G, M)];
  if (rf?.on === 'frame') {
    const [u0, u1] = rinvioRun(M, G), [v0, v1] = rinvioAcross(G, rf);
    boxes.push([u0, v0, u1, v1]);
  } else if (stand && M.Dp > 0 && G.pulleyZ > -R.slab) boxes.push(standBox(M, G));
  return boxes.flatMap(([u0, v0, u1, v1]) => ([[u0, v0], [u1, v0], [u1, v1], [u0, v1]] as const)
    .map(([u, v]): [number, number] => [G.carDrop[0] + u * G.ux - v * G.uy, G.carDrop[1] + u * G.uy + v * G.ux]));
}

/** The least distance in plan of the machine on its support, with the bedplate of the diverting pulley, from the room's
 *  walls [mm]: below 0 it goes into a wall (as m_fit counts it, support-check.ts fitChecks). */
export function planClear(G: RoomGeo, M: MachineSpec): number {
  const R = G.room;
  let clear = Infinity;
  for (const [x, y] of machineCorners(G, M, false)) clear = Math.min(clear, x, R.W - x, y, R.D - y);
  return clear;
}

/** The machine over the drops as the room takes it (registry locale.ingombro): its motor where the room's input puts it,
 *  else toward the counterweight's drop — turned round toward the car's when only so it keeps clear of the walls, or
 *  goes less into them; on a maker's bedplate with the diverting pulley, as the maker seats it (turned only by hand). */
export function orientedGeo(R: RoomInputs, P: Drops, M: MachineSpec, sheaveAt = M.ropeIn + M.D / 2): RoomGeo {
  if (R.motor) return geoOn(R, P, M, sheaveAt, R.motor === 'car' ? -1 : 1);
  const G = geoOn(R, P, M, sheaveAt, 1), c = planClear(G, M);
  if (c >= 0 || M.rinvio?.maker) return G;
  const T = geoOn(R, P, M, sheaveAt, -1);
  return planClear(T, M) > c ? T : G;
}

/** Room coordinates: origin at the room's inner corner; the shaft's inner corner of entrance A lies at (shaftX, shaftY).
 *  The drops are the car's and the counterweight's centres of the design's layout. */
export function roomGeo(L: Layout, M: MachineSpec): RoomGeo | null {
  const R = L.inputs.room;
  if (!R) return null;
  // the falls: the parts' centres, or with 2:1 a side of each one's pulley (falls.ts)
  const f = M.pulley2 ? fallsOf(L, 2, M.pulley2) : null, room = (p: readonly [number, number]): [number, number] => [R.shaftX + p[0], R.shaftY + p[1]];
  const car: [number, number] = f ? room(f.car) : [R.shaftX + L.car.x + L.car.w / 2, R.shaftY + L.car.y + L.car.h / 2];
  const cw: [number, number] = f ? room(f.cw) : [R.shaftX + L.cw.x + L.cw.w / 2, R.shaftY + L.cw.y + L.cw.h / 2];
  const dx = cw[0] - car[0], dy = cw[1] - car[1], calata = Math.hypot(dx, dy) || 1;
  return orientedGeo(R, { car, cw, ux: dx / calata, uy: dy / calata, calata, ...(f ? { dead: f.dead.map((d) => ({ at: room(d.at), dir: d.dir })) } : {}) }, M);
}


/** The straight runs of a rope over wheels in order (centre, radius signed: > 0 wrapped clockwise seen with y up, 0 a
 *  point), each from where it leaves a wheel to where it meets the next. */
export function ropeRuns(els: readonly { c: P2; rho: number }[]): [P2, P2][] {
  const out: [P2, P2][] = [];
  for (let i = 0; i + 1 < els.length; i++) {
    const { c: a, rho: ra } = els[i], { c: b, rho: rb } = els[i + 1];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, th = Math.atan2(b[1] - a[1], b[0] - a[0]) - Math.asin(Math.max(-1, Math.min(1, (ra - rb) / d)));
    const nx = -Math.sin(th), ny = Math.cos(th);
    out.push([[a[0] + ra * nx, a[1] + ra * ny], [b[0] + rb * nx, b[1] + rb * ny]]);
  }
  return out;
}

/** The ropes in section B-B (u along the drop line, z over the room's floor), from the car's drop over the sheave and
 *  the diverting pulley to the counterweight's, their hitches `car` and `cw` mm below the floor. */
export function roomRopes(M: MachineSpec, G: RoomGeo, car: number, cw: number): [P2, P2][] {
  const els: { c: P2; rho: number }[] = [{ c: [M.ropeIn, -car], rho: 0 }, { c: [G.sheaveAt, M.axis], rho: M.D / 2 }];
  if (M.Dp > 0) els.push({ c: [G.pulleyAt, G.pulleyZ], rho: M.reverse ? -M.Dp / 2 : M.Dp / 2 });
  els.push({ c: [G.calata - M.ropeIn, -cw], rho: 0 });
  return ropeRuns(els);
}

/** Where the slab is open along the drop line, from u0 to u1 [mm], as the 3D cuts it: round each run of the ropes
 *  between the slab's faces with the hitches at each of `depths` ([car, counterweight] below the floor: the ends of
 *  the travel) and round a pulley that dips into it, 30 mm clear, openings closer than 80 mm merged. */
export function slabHoles(M: MachineSpec, G: RoomGeo, slab: number, depths: readonly (readonly [number, number])[]): { u0: number; u1: number; wheel: boolean }[] {
  const spans: { lo: number; hi: number; wheel: boolean }[] = [], zb = -slab, inside = (z: number): boolean => z >= zb && z <= 0;
  for (const [car, cw] of depths) {
    for (const [[ua, za], [ub, zb2]] of roomRopes(M, G, car, cw)) {
      const us: number[] = [];
      if (inside(za)) us.push(ua);
      if (inside(zb2)) us.push(ub);
      for (const z of [zb, 0]) if ((za - z) * (zb2 - z) < 0) us.push(ua + ((ub - ua) * (z - za)) / (zb2 - za));
      if (us.length) spans.push({ lo: Math.min(...us), hi: Math.max(...us), wheel: false });
    }
  }
  if (M.Dp > 0 && G.pulleyZ - M.Dp / 2 < 0 && G.pulleyZ + M.Dp / 2 > zb) spans.push({ lo: G.pulleyAt - M.Dp / 2, hi: G.pulleyAt + M.Dp / 2, wheel: true });
  spans.sort((p, q) => p.lo - q.lo);
  const merged: typeof spans = [];
  for (const sp of spans) {
    const last = merged.at(-1);
    if (last && sp.lo - last.hi < 80) {
      last.hi = Math.max(last.hi, sp.hi);
      last.wheel ||= sp.wheel;
    } else merged.push({ ...sp });
  }
  return merged.map((m) => ({ u0: m.lo - 30, u1: m.hi + 30, wheel: m.wheel }));
}

/** How far below the room's floor the car's and the counterweight's hitches are [mm]: with the car at the lowest and at
 *  the top floor (the ends of the travel), and halfway. */
export function hitchDepths(L: Layout): { ends: [number, number][]; mid: [number, number] } {
  const S = section(L), V = L.inputs.vertical, floor = S.ceiling + (L.inputs.room?.slab ?? 0);
  const at = (zf: number): [number, number] => [floor - (zf + V.frameTop), floor - (cwPlateAt(S, zf) + V.cwH + 60)];
  return { ends: [at(0), at(S.top)], mid: at(S.top / 2) };
}

export const roomChecks = (L: Layout): ShaftCheck[] => (L.inputs.room ? roomChecksOf(L.inputs.room) : []);

/** The checks of the room itself: its height, the free area in front of the control panel — to the opposite wall, or to
 *  what stands on the floor when its outlines `gear` (room axes: the machine's parts, the governor, the main switch) are
 *  known (room-floor.ts) —, its door. */
export function roomChecksOf(R: RoomInputs, gear: readonly Outline[] = []): ShaftCheck[] {
  const along = R.panelWall === 'front' || R.panelWall === 'rear' ? R.W : R.D;
  // 5.2.6.3.2.1 a): in front of the panel ≥ 700 mm deep and as wide as the larger of 500 mm and the panel (the panel
  // itself may be narrower; until 2026-10-06 a panel under 500 mm failed here)
  const free = panelFree(R, gear), wide = along >= Math.max(KV_VERT.panelFreeWidth, R.panelW);
  return [
    check('m_height', R.H >= KV_VERT.roomH, R.H, KV_VERT.roomH, 0, 'mm'),
    check('m_panel', free >= KV_VERT.panelFreeDepth && wide, free, KV_VERT.panelFreeDepth, 0, 'mm'),
    check('m_door', R.doorW >= KV_VERT.doorMinW && R.doorH >= KV_VERT.doorMinH, Math.min(R.doorW - KV_VERT.doorMinW, R.doorH - KV_VERT.doorMinH), 0, 0, 'mm'),
  ];
}
