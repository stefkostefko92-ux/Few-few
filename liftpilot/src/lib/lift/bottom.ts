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
import { layout, section, type Layout, type ShaftInputs } from '@/shaft';
import { ropeWidths } from '@/shaft/machine-room';
import { bracketSpan } from '@/shaft/plan-staffe';
import { KL } from './norme';

export type BottomScheme = 'head' | 'room' | 'under';
export const BOTTOM_SCHEMES: readonly BottomScheme[] = ['head', 'room', 'under'];

type P2 = readonly [number, number];

export interface BottomGeo {
  scheme: BottomScheme;
  /** the drops of the car and of the counterweight, the unit direction between them and the one across it (its left) */
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
   *  KL.bottomClear; the gap between the counterweight's back and the wall [mm] */
  fits: boolean;
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
  const cal = Math.hypot(cw[0] - car[0], cw[1] - car[1]) || 1, dir: P2 = [(cw[0] - car[0]) / cal, (cw[1] - car[1]) / cal], across: P2 = [-dir[1], dir[0]];
  const wallAt = exitAlong(car, dir, I.W, I.D), ropes = ropeWidths(n, d).ropes, c = KL.bottomClear, side = r === 2 ? Dp / 2 : 0;
  const half = Math.abs(dir[0]) * L.cw.w / 2 + Math.abs(dir[1]) * L.cw.h / 2, gap = wallAt - cal - half, um = wallAt - c - ropes;
  const at = (u: number, v: number): P2 => [car[0] + u * dir[0] + v * across[0], car[1] + u * dir[1] + v * across[1]];
  // what stands along the wall behind the counterweight: the rails' brackets and the side walls
  const alongX = Math.abs(dir[0]) <= Math.abs(dir[1]), wallU = (v: number): number => {
    const p = at(um, v);
    return alongX ? p[0] : p[1];
  };
  const wall = alongX ? (dir[1] > 0 ? 'rear' : 'front') : dir[0] > 0 ? 'right' : 'left';
  const spans = L.rails.flatMap((rl) => {
    const b = bracketSpan(L, rl);
    return b && b.wall === wall ? [b] : [];
  }), width = alongX ? I.W : I.D;
  // room left round a run at v [mm]: to each bracket's span along the wall and to the side walls, less the rope pack
  const room = (v: number): number => {
    const u = wallU(v), walls = Math.min(u, width - u);
    return Math.min(walls, ...spans.map((b) => Math.max(b.u0 - u, u - b.u1, 0) || -Math.min(u - b.u0, b.u1 - u))) - ropes - c;
  };
  // the counterweight's run Dp + side from its drop in plan: behind it when the gap allows, else along the wall
  const gu = half + gap - c - ropes, need = Dp + side, vw = gu >= need ? 0 : Math.sqrt(need * need - gu * gu);
  const pick = [1, -1].map((sg) => ({ sg, score: Math.min(room(sg * vw), room(sg * vw - sg * D)) })).sort((p, q) => q.score - p.score)[0];
  const mw = at(um, pick.sg * vw), mc = at(um, pick.sg * (vw - D)), fits = pick.score >= 0 && gap >= 2 * (ropes + c);
  const sCar = Math.hypot(mc[0] - car[0], mc[1] - car[1]) - side, sCw = Math.hypot(mw[0] - cw[0], mw[1] - cw[1]) - side;
  const zHead = s === 'room' ? S.ceiling + (I.room?.slab ?? KL.slab) + KL.pulleyRoomAxis : S.ceiling - Dp / 2 - KL.headFrame;
  const roomFloor = s === 'under' ? S.pitFloor - KL.underSlab - KL.underRoomH : 0;
  return {
    scheme: s, car, cw, dir, across, mc, mw, zHead, zSheave: roomFloor + axis, roomFloor,
    sCar, sCw, carPulleys: sCar > Dp + 1 ? 2 : 1, cwPulleys: sCw > Dp + 1 ? 2 : 1, wallAt, fits, gap,
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

/** The head pulleys the scheme has beyond the two the calculation counts for the bottom layout: extra simple bends. */
export const extraBends = (g: Pick<BottomGeo, 'carPulleys' | 'cwPulleys'>): number => g.carPulleys + g.cwPulleys - 2;
