// Machine room above the shaft: where the machine sits (its sheave's car side over the car's rope drop, the diverting
// pulley where the counterweight's drop leaves it), the checks of the room (height, free area in front of the control
// panel, door), and the geometry both drawings of the room share: the ropes' straight runs between the wheels and the
// slab's openings round them, as the 3D cuts them (components/lift3d/slab.ts). The machine is the 3D's (machine-outline) or a
// maker's as it is (machine-shape).
import { check } from './checks';
import { MACHINE_A, MACHINE_X, MACHINE_Z } from './machine-outline';
import { machineFrame, type MachineFrame, type MachineShape } from './machine-shape';
import { KV_VERT } from './norme-vert';
import { panelFree } from './panel';
import type { RinvioFrame } from './rinvio';
import { cwPlateAt, section } from './section';
import type { Layout, ShaftCheck } from './types';
import type { RoomInputs } from './room';

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
  /** 2:1: the ropes rise to the machine half a pulley in from the car's and the counterweight's drops; 1:1: 0 */
  ropeIn: number;
  /** the maker's machine as it is (machine-shape.ts); missing or null: the generic machine scaled to the sheave */
  shape?: MachineShape | null;
  /** where the diverting pulley turns in the room (rinvio.ts); missing or null: no pulley, or no room */
  rinvio?: RinvioFrame | null;
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
  /** the machine's scale on the 3D's Ø 560 */
  s: number;
  /** where the machine is in its own frame: its axis, its sheave, its bedplate (machine-shape.ts) */
  frame: MachineFrame;
}

/** Where the drop line runs inside the rectangle [x0, x1] × [y0, y1] of the room: the range of u. */
export function dropSpan(G: RoomGeo, x0: number, y0: number, x1: number, y1: number): [number, number] {
  let lo = -Infinity, hi = Infinity;
  for (const [p, d, a, b] of [[G.carDrop[0], G.ux, x0, x1], [G.carDrop[1], G.uy, y0, y1]] as const) {
    if (Math.abs(d) < 1e-9) continue;
    const t0 = (a - p) / d, t1 = (b - p) / d;
    lo = Math.max(lo, Math.min(t0, t1));
    hi = Math.min(hi, Math.max(t0, t1));
  }
  return [lo, hi];
}

/** Half the width of the n ropes side by side, and of a pulley with its cheeks [mm]. */
export function ropeWidths(n: number, d: number): { ropes: number; pulley: number } {
  const pitch = Math.max(d + 6, 1.7 * d);
  return { ropes: ((n - 1) / 2) * pitch + d / 2, pulley: (n * pitch + 30) / 2 + 18 };
}

/** The rope drops in the room (room coordinates): the car's and the counterweight's, the unit vector from the one to the
 *  other and their spacing (calata) [mm]. */
export interface Drops {
  car: readonly [number, number];
  cw: readonly [number, number];
  ux: number;
  uy: number;
  calata: number;
}

/** The machine over the drops `P`: the sheave's car side over the car's drop (`sheaveAt`: its centre elsewhere on the
 *  drop line, as a direct pull centred between drops wider than the sheave hangs it), the diverting pulley where the
 *  counterweight's drop leaves it. */
export function geoOn(R: RoomInputs, P: Drops, M: MachineSpec, sheaveAt = M.ropeIn + M.D / 2): RoomGeo {
  const calata = P.calata, s = M.D / (2000 * MACHINE_A.rp), u1 = calata - M.ropeIn;
  const pulleyAt = M.Dp > 0 ? (M.reverse ? u1 + M.Dp / 2 : u1 - M.Dp / 2) : sheaveAt;
  const v = (z: number): number => (MACHINE_A.zSheave - z) * 1000 * s, F = machineFrame(M.D, M.shape ?? null, M.rinvio?.bed ?? null);
  // the generic machine's numbers as they have always been computed (a drawing set's hash covers them); a maker's from
  // its frame
  const [frame0, frame1, across]: [number, number, readonly [number, number]] = F.shape
    ? [sheaveAt + F.x[0], sheaveAt + F.x[1], [F.zSheave - F.z[1], F.zSheave - F.z[0]]]
    : [sheaveAt + MACHINE_X[0] * 1000 * s, sheaveAt + MACHINE_X[1] * 1000 * s, [v(MACHINE_Z[1]), v(MACHINE_Z[0])]];
  return {
    room: R, carDrop: P.car, cwDrop: P.cw, ux: P.ux, uy: P.uy, calata, sheaveAt, pulleyAt, pulleyZ: M.axis - M.h, frame0, frame1, across, s, frame: F,
  };
}

/** Room coordinates: origin at the room's inner corner; the shaft's inner corner of entrance A lies at (shaftX, shaftY).
 *  The drops are the car's and the counterweight's centres of the design's layout. */
export function roomGeo(L: Layout, M: MachineSpec): RoomGeo | null {
  const R = L.inputs.room;
  if (!R) return null;
  const car: [number, number] = [R.shaftX + L.car.x + L.car.w / 2, R.shaftY + L.car.y + L.car.h / 2];
  const cw: [number, number] = [R.shaftX + L.cw.x + L.cw.w / 2, R.shaftY + L.cw.y + L.cw.h / 2];
  const dx = cw[0] - car[0], dy = cw[1] - car[1], calata = Math.hypot(dx, dy) || 1;
  return geoOn(R, { car, cw, ux: dx / calata, uy: dy / calata, calata }, M);
}

type P2 = readonly [number, number];

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
 *  the machine when its outline `box` (room axes) is known (panel.ts) —, its door. */
export function roomChecksOf(R: RoomInputs, box?: readonly [number, number, number, number] | null): ShaftCheck[] {
  const along = R.panelWall === 'front' || R.panelWall === 'rear' ? R.W : R.D;
  // 5.2.6.3.2.1 a): in front of the panel ≥ 700 mm deep and as wide as the larger of 500 mm and the panel (the panel
  // itself may be narrower; until 2026-10-06 a panel under 500 mm failed here)
  const free = panelFree(R, box), wide = along >= Math.max(KV_VERT.panelFreeWidth, R.panelW);
  return [
    check('m_height', R.H >= KV_VERT.roomH, R.H, KV_VERT.roomH, 0, 'mm'),
    check('m_panel', free >= KV_VERT.panelFreeDepth && wide, free, KV_VERT.panelFreeDepth, 0, 'mm'),
    check('m_door', R.doorW >= KV_VERT.doorMinW && R.doorH >= KV_VERT.doorMinH, Math.min(R.doorW - KV_VERT.doorMinW, R.doorH - KV_VERT.doorMinH), 0, 0, 'mm'),
  ];
}
