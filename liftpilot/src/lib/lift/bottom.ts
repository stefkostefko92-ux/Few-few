// The machine below: the three rope schemes the engineer picks from the installation (research, funi in basso,
// capitoli 3–5). In all three the two runs to the machine go up and down in the gap behind the counterweight, close to
// the wall, the sheave's plane parallel to that wall (the machine's slow shaft through it, or the machine under the
// pit); over each drop the head turns the rope down to its run: one pulley at 180° when the run is no farther than
// Dp from the drop in plan, else two at 90° with a level run between (each pulley in the vertical plane of the two
// verticals it joins). They differ in where the head pulleys and the machine are:
//   head  — pulleys hung under the shaft's slab, the machine in a room at the lowest floor past the wall;
//   room  — pulleys in a pulley room over the slab, the machine as in head;
//   under — pulleys as in head, the machine in a room under the pit (an accessible space below the shaft).
// The calculation counts the bottom layout's two head pulleys; the scheme's others are extra simple bends. Plan [mm]
// in the shaft's coordinates, heights [mm] from the lowest floor. Pure.
import { layout, section, type Layout, type RoomInputs, type ShaftCheck, type ShaftInputs, type Wall } from '@/shaft';
import { check } from '@/shaft/checks';
import { MACHINE_TOP } from '@/shaft/machine-outline';
import { ropeWidths, type MachineSpec } from '@/shaft/machine-room';
import { bodyBox, machineFrame, type MachineFrame, type MachineShape } from '@/shaft/machine-shape';
import { bracketSpan } from '@/shaft/plan-staffe';
import { fallsOf } from '@/shaft/falls';
import { KL } from './norme';

export type BottomScheme = 'head' | 'room' | 'under';
export const BOTTOM_SCHEMES: readonly BottomScheme[] = ['head', 'room', 'under'];

type P2 = readonly [number, number];

export interface BottomGeo {
  scheme: BottomScheme;
  /** the drops of the car and of the counterweight; the direction square to the wall behind the counterweight, toward
   *  it (the drops' own when their line runs square to it; askew the runs and the machine keep to the wall, the head
   *  pulleys turn each rope in its own plane) and the one across it, its left — along that wall */
  car: P2;
  cw: P2;
  dir: P2;
  across: P2;
  /** the runs to the machine in plan: the car's and the counterweight's */
  mc: P2;
  mw: P2;
  /** the head pulleys' axes, the sheave's axis, the floor of the machine's room [mm] */
  zHead: number;
  zSheave: number;
  roomFloor: number;
  /** distance in plan from each rope's rise (the drop, or a 2:1 pulley's side) to its run; pulleys on each side */
  sCar: number;
  sCw: number;
  carPulleys: 1 | 2;
  cwPulleys: 1 | 2;
  /** where the wall behind the counterweight is along dir from the car's drop [mm] */
  wallAt: number;
  /** the runs clear the counterweight's back, the wall, the counterweight rails' brackets and the side walls by
   *  KL.bottomClear (`clear`: the least margin, below 0 by how much they do not — the check m_runs); the gap between
   *  the counterweight's back and the wall [mm] */
  fits: boolean;
  clear: number;
  gap: number;
}

/** Where a ray from p along d leaves the rectangle [0, W] × [0, D] (distance). */
export function exitAlong(p: P2, d: P2, W: number, D: number): number {
  const ts: number[] = [];
  if (d[0] > 1e-9) ts.push((W - p[0]) / d[0]);
  if (d[0] < -1e-9) ts.push(-p[0] / d[0]);
  if (d[1] > 1e-9) ts.push((D - p[1]) / d[1]);
  if (d[1] < -1e-9) ts.push(-p[1] / d[1]);
  return ts.length ? Math.min(...ts) : 0;
}

/** The geometry of scheme `s` for a sheave D, pulleys Dp, n ropes of d, roping r [mm]. The runs stand behind the
 *  counterweight as near the wall as the rope pack allows; the counterweight's run as far from its drop along the
 *  wall as a 180° pulley needs (none when the gap is deep enough), on the side with more room, the car's run D
 *  further toward the drop line (the sheave's plane along the wall). */
export function bottomGeo(L: Layout, s: BottomScheme, D: number, Dp: number, n: number, d: number, r: number, axis: number = KL.sheaveAxisPerD * D): BottomGeo {
  const I = L.inputs, S = section(L), car: P2 = [L.car.x + L.car.w / 2, L.car.y + L.car.h / 2], cw: P2 = [L.cw.x + L.cw.w / 2, L.cw.y + L.cw.h / 2];
  // the wall behind the counterweight, the one the drops' line runs toward; the frame square to it from the car's drop
  const dx = cw[0] - car[0], dy = cw[1] - car[1], alongX = Math.abs(dx) <= Math.abs(dy);
  const wall = alongX ? (dy > 0 ? 'rear' : 'front') : dx > 0 ? 'right' : 'left';
  const dir: P2 = alongX ? [0, dy > 0 ? 1 : -1] : [dx > 0 ? 1 : -1, 0], across: P2 = [-dir[1], dir[0]];
  // the rises: the parts' centres, or with 2:1 a side of each one's pulley, which turns between its guide rails (falls.ts)
  const F = fallsOf(L, r, Dp), rise = (p: P2): P2 => [(p[0] - car[0]) * dir[0] + (p[1] - car[1]) * dir[1], (p[0] - car[0]) * across[0] + (p[1] - car[1]) * across[1]];
  const cal = dx * dir[0] + dy * dir[1], vc = rise(F.cw)[1];
  const wallAt = exitAlong(car, dir, I.W, I.D), ropes = ropeWidths(n, d).ropes, c = KL.bottomClear;
  const half = Math.abs(dir[0]) * L.cw.w / 2 + Math.abs(dir[1]) * L.cw.h / 2, gap = wallAt - cal - half, um = wallAt - c - ropes;
  const at = (u: number, v: number): P2 => [car[0] + u * dir[0] + v * across[0], car[1] + u * dir[1] + v * across[1]];
  // what stands along the wall behind the counterweight: the rails' brackets and the side walls
  const wallU = (v: number): number => {
    const p = at(um, v);
    return alongX ? p[0] : p[1];
  };
  const spans = L.rails.flatMap((rl) => {
    const b = bracketSpan(L, rl);
    return b && b.wall === wall ? [b] : [];
  }), width = alongX ? I.W : I.D;
  // room left round a run at v [mm]: to each bracket's span along the wall and to the side walls, less the rope pack
  const room = (v: number): number => {
    const u = wallU(v), walls = Math.min(u, width - u);
    return Math.min(walls, ...spans.map((b) => Math.max(b.u0 - u, u - b.u1, 0) || -Math.min(u - b.u0, b.u1 - u))) - ropes - c;
  };
  // the counterweight's run Dp from its rise in plan: behind it when the gap allows, else along the wall
  const gu = half + gap - c - ropes - (rise(F.cw)[0] - cal), need = Dp, vw = gu >= need ? 0 : Math.sqrt(need * need - gu * gu);
  const pick = [1, -1].map((sg) => ({ sg, score: Math.min(room(vc + sg * vw), room(vc + sg * vw - sg * D)) })).sort((p, q) => q.score - p.score)[0];
  const mw = at(um, vc + pick.sg * vw), mc = at(um, vc + pick.sg * (vw - D)), clear = Math.min(pick.score, gap - 2 * (ropes + c)), fits = clear >= 0;
  const sCar = Math.hypot(mc[0] - F.car[0], mc[1] - F.car[1]), sCw = Math.hypot(mw[0] - F.cw[0], mw[1] - F.cw[1]);
  const zHead = s === 'room' ? S.ceiling + (I.room?.slab ?? KL.slab) + KL.pulleyRoomAxis : S.ceiling - Dp / 2 - KL.headFrame;
  const roomFloor = s === 'under' ? S.pitFloor - KL.underSlab - (I.below?.H ?? KL.underRoomH) : 0;
  return {
    scheme: s, car, cw, dir, across, mc, mw, zHead, zSheave: roomFloor + axis, roomFloor,
    sCar, sCw, carPulleys: sCar > Dp + 1 ? 2 : 1, cwPulleys: sCw > Dp + 1 ? 2 : 1, wallAt, fits, clear, gap,
  };
}

/** The least gap between the counterweight and the wall behind it [mm] with which the runs of scheme `s` clear
 *  everything (the shaft laid out again with each gap tried, up to 1,5 m); null when none does. */
export function bottomGapNeeded(I: ShaftInputs, s: BottomScheme, D: number, Dp: number, n: number, d: number, r: number): number | null {
  const fitsWith = (more: number): boolean => bottomGeo(layout({ ...I, cwWallGap: I.cwWallGap + more }), s, D, Dp, n, d, r).fits;
  if (fitsWith(0)) return I.cwWallGap;
  let lo = 0, hi = 10;
  while (!fitsWith(hi)) {
    lo = hi;
    hi *= 2;
    if (hi > 1500) return null;
  }
  while (hi - lo > 5) {
    const m = (lo + hi) / 2;
    if (fitsWith(m)) hi = m;
    else lo = m;
  }
  return Math.ceil((I.cwWallGap + hi) / 5) * 5;
}

/** The wall across the room from each one. */
export const OPPOSITE: Readonly<Record<Wall, Wall>> = { front: 'rear', rear: 'front', left: 'right', right: 'left' };
/** The side of a plan rectangle whose outward normal is (nx, ny): the larger component's. */
const facing = (nx: number, ny: number): Wall => (Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? 'right' : 'left') : ny > 0 ? 'rear' : 'front');
const alongX = (s: Wall): boolean => s === 'front' || s === 'rear';

/** The machine below where the 3D stands it (components/lift3d/room.ts machinePose): its worm (X) along the wall, its
 *  slow shaft (local Z) toward the sheave between the two runs, the motor across the ropes' plane — away from the shaft
 *  beside it, toward the car under the pit; beside the shaft the slow shaft longer by `ext` to reach through the wall into
 *  the gap behind the counterweight; the corners of what stands in the room in plan: the body, and under the pit the
 *  sheave with it [mm]. */
export function belowMachine(L: Layout, g: BottomGeo, D: number, n: number, d: number, shape: MachineShape | null):
  { F: MachineFrame; xDir: P2; zDir: P2; C: P2; ext: number; body: P2[] } {
  // beside the shaft the sheave reaches through the wall: the machine's frame stops at it, no iron past the sheave
  const F = machineFrame(D, shape, null, g.scheme !== 'under'), xDir: P2 = g.scheme === 'under' ? g.across : [-g.across[0], -g.across[1]], zDir: P2 = [xDir[1], -xDir[0]];
  const ext = g.scheme !== 'under' ? Math.max(0, KL.bottomClear + ropeWidths(n, d).ropes + L.inputs.wall + 50 - (F.zSheave - F.face)) : 0;
  const C: P2 = [(g.mc[0] + g.mw[0]) / 2, (g.mc[1] + g.mw[1]) / 2];
  const at = (x: number, z: number): P2 => [C[0] + x * xDir[0] + (z - F.zSheave - ext) * zDir[0], C[1] + x * xDir[1] + (z - F.zSheave - ext) * zDir[1]];
  const z1 = g.scheme === 'under' ? F.z[1] : F.face;
  return { F, xDir, zDir, C, ext, body: [at(F.x[0], F.z[0]), at(F.x[1], F.z[0]), at(F.x[1], z1), at(F.x[0], z1)] };
}

/** The machine's room below as the 3D and the drawings show it, in the room's own axes (RoomInputs: the shaft's inner
 *  corner of entrance A at shaftX, shaftY) with its floor `z0` over the lowest floor [mm]. Beside the shaft (head,
 *  room): past the wall behind the counterweight, KL.belowRoomLen along the drops' direction and twice
 *  KL.belowRoomHalf across it, open on the shaft's side (`open`: the shaft's wall closes it), the controller on the far
 *  wall at the end on the motor's side, the door in the side wall across the ropes from the machine. Under the pit: as
 *  large as the shaft, the door on the entrances' wall, the controller on the side away from the counterweight. Either
 *  grows to keep KL.belowRoomClear past the machine's `body` (belowMachine) where the body reaches out of it. The sizes set
 *  on its drawings (ShaftInputs.below) take the place of the software's: beside the shaft its size along the drops'
 *  direction from the wall it stands past, across it from its side nearest the origin; under the pit both from its
 *  corner nearest the origin; its height, its door. */
export function belowRoom(L: Layout, g: BottomGeo, body: readonly P2[] | null = null): { room: RoomInputs; open: Wall | null; z0: number } {
  const I = L.inputs, c = KL.belowRoomClear, B = I.below ?? {};
  if (g.scheme === 'under') {
    const xs = (body ?? []).map((p) => p[0]), ys = (body ?? []).map((p) => p[1]);
    const x0 = Math.min(0, ...xs.map((x) => x - c)), y0 = Math.min(0, ...ys.map((y) => y - c));
    const x1 = Math.max(I.W, ...xs.map((x) => x + c)), y1 = Math.max(I.D, ...ys.map((y) => y + c));
    return {
      room: {
        W: B.W ?? x1 - x0, D: B.D ?? y1 - y0, shaftX: -x0, shaftY: -y0, H: B.H ?? KL.underRoomH, ridge: 0, slab: 0, doorWall: 'front',
        doorAt: B.doorAt ?? 150, doorW: B.doorW ?? 800, doorH: B.doorH ?? 2000,
        panelWall: L.cwSide === 'left' ? 'right' : 'left', panelAt: 150, panelW: 800, panelD: 300, panelH: 1800,
      },
      open: null, z0: g.roomFloor,
    };
  }
  const [dx, dy] = g.dir, [ox, oy] = g.car, u0 = g.wallAt + I.wall;
  // the body in the room's frame: square to the wall from the car's drop (u) and along the wall (v), the room centred on
  // the counterweight's drop along it
  const us = (body ?? []).map((p) => (p[0] - ox) * dx + (p[1] - oy) * dy), vs = (body ?? []).map((p) => -(p[0] - ox) * dy + (p[1] - oy) * dx);
  const vc = -(g.cw[0] - ox) * dy + (g.cw[1] - oy) * dx, u1 = Math.max(u0 + KL.belowRoomLen, ...us.map((u) => u + c));
  const v0 = Math.min(vc - KL.belowRoomHalf, ...vs.map((v) => v - c)), v1 = Math.max(vc + KL.belowRoomHalf, ...vs.map((v) => v + c));
  const pts = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => [ox + u * dx - v * dy, oy + u * dy + v * dx]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  let x0 = Math.min(...xs), y0 = Math.min(...ys), W = Math.max(...xs) - x0, D = Math.max(...ys) - y0;
  // a size set on the drawings: along the drops' direction the side at the wall stays, across it the side nearest the origin
  const alongXdir = Math.abs(dx) > Math.abs(dy);
  if (B.W !== undefined) { if (alongXdir && dx < 0) x0 += W - B.W; W = B.W; }
  if (B.D !== undefined) { if (!alongXdir && dy < 0) y0 += D - B.D; D = B.D; }
  const open = facing(-dx, -dy), far = OPPOSITE[open];
  const len = (s: Wall): number => (alongX(s) ? W : D), doorWall = facing(dy, -dx);
  // the cabinet at the far wall's end on the motor's side, the door near the far end of the other side wall
  const toMotor = alongX(far) ? -dy : dx, toFar = alongX(doorWall) ? dx : dy;
  return {
    room: {
      W, D, shaftX: -x0, shaftY: -y0, H: B.H ?? KL.belowRoomH, ridge: 0, slab: 0,
      doorWall, doorAt: B.doorAt ?? (toFar > 0 ? len(doorWall) - 1000 : 200), doorW: B.doorW ?? 800, doorH: B.doorH ?? 2000,
      panelWall: far, panelAt: toMotor > 0 ? len(far) - 900 : 100, panelW: 800, panelD: 300, panelH: 1800,
    },
    open, z0: g.roomFloor,
  };
}

/** The check m_fit of the machine below (registry locale.ingombro): its body inside its room in plan, its top and its
 *  sheave's under the room's ceiling — the least distance left, at least 0 [mm]. */
export function belowFit(L: Layout, g: BottomGeo, M: MachineSpec): ShaftCheck[] {
  // (the runs' own clearances: m_runs in belowChecks)
  const m = belowMachine(L, g, M.D, M.n, M.d, M.shape ?? null), R = belowRoom(L, g, m.body).room, F = m.F, x0 = -R.shaftX, y0 = -R.shaftY;
  const top = g.zSheave - F.axis + (F.shape ? F.bed + bodyBox(F.shape)[4] : MACHINE_TOP * 1000 * F.s);
  let clear = R.H - (Math.max(top, g.zSheave + M.D / 2) - g.roomFloor);
  for (const [x, y] of m.body) clear = Math.min(clear, x - x0, x0 + R.W - x, y - y0, y0 + R.D - y);
  return [check('m_fit', clear >= 0, Math.round(clear), 0, 0, 'mm')];
}

/** The head pulleys the scheme has beyond the two the calculation counts for the bottom layout: extra simple bends. */
export const extraBends = (g: Pick<BottomGeo, 'carPulleys' | 'cwPulleys'>): number => g.carPulleys + g.cwPulleys - 2;
