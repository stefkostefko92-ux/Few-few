// Where the ropes run, for the 3D: the rope in pieces, each in its vertical plane (u along it, y up, metres): the
// sheave of the machine, the diverting pulley, the head pulleys of a machine below, the car and counterweight pulleys
// of a 2:1 roping, as belt elements for a car floor at s and a counterweight plate at w. Machine above: one piece in
// the plane through the car's and the counterweight's rope drops, the sheave's car side right over the car drop (as in
// the drawings of the machine room). Machine below (bottom.ts): a piece from the car over its head pulleys down to the
// machine, one round the sheave in the plane along the wall behind the counterweight, one from the sheave over the
// counterweight's head pulleys down to it; they meet on the vertical runs to the machine. Pure.
import { deflectorAngle } from '@/calc/geometry';
import { section, type Layout } from '@/shaft';
import { sheaveAxisBelow } from './machine';
import { KL } from './norme';
import type { BeltEl } from './belt';
import { bottomGeo, exitAlong, type BottomGeo, type BottomScheme } from './bottom';
import type { LiftDerived } from './derive';

type P2 = readonly [number, number];

/** A vertical plane: a point in plan [mm] and the unit direction along it; u [m] runs along it from the point. */
export interface RopePlane {
  origin: P2;
  dir: P2;
}

export interface Wheel {
  role: 'sheave' | 'deflector' | 'top' | 'carPulley' | 'cwPulley';
  u: number;
  y: number;
  r: number;
  /** the vertical plane it turns in */
  plane: RopePlane;
}

/** A stretch of the rope in one vertical plane; consecutive pieces meet on a vertical run: the last point of one is
 *  the first of the next. */
export interface RopePiece {
  plane: RopePlane;
  els: BeltEl[];
}

export interface RopeRig {
  /** car drop in plan [mm], unit direction toward the counterweight drop, spacing of the drops [m] */
  origin: P2;
  dir: P2;
  calata: number;
  /** the machine: its sheave (centre, radius) and whether it stands below, with the scheme's geometry */
  sheave: Wheel;
  bottom: boolean;
  scheme: BottomGeo | null;
  /** wheels at rest (the car and counterweight pulleys move with s and w: see pieces) */
  wheels: readonly Wheel[];
  /** height of the machine room floor, or of the bottom room floor [m] */
  roomFloor: number;
  /** where the wall behind the counterweight is along the drop line [m] */
  wallAt: number;
  pieces(s: number, w: number): RopePiece[];
}

/** A point of a plane in plan [mm]: u [m] along it. */
export const planeAt = (p: RopePlane, u: number): P2 => [p.origin[0] + u * 1000 * p.dir[0], p.origin[1] + u * 1000 * p.dir[1]];

export function ropeRig(dv: LiftDerived, scheme: BottomScheme = dv.bottom ?? 'head'): RopeRig {
  const L: Layout = dv.layout, S = section(L), V = L.inputs.vertical, { I, N } = dv.analysis.ctx;
  const car = [L.car.x + L.car.w / 2, L.car.y + L.car.h / 2] as const, cw = [L.cw.x + L.cw.w / 2, L.cw.y + L.cw.h / 2] as const;
  const cal = Math.hypot(cw[0] - car[0], cw[1] - car[1]) || 1, dir = [(cw[0] - car[0]) / cal, (cw[1] - car[1]) / cal] as const;
  const cm = cal / 1000, R0 = N.D / 2000, Rp = I.Dp / 2000, two = I.r === 2;
  const ceiling = S.ceiling / 1000, slab = (L.inputs.room?.slab ?? KL.slab) / 1000, bottom = I.layout === 'bottom';
  const deadY = ceiling - 0.05;
  const carHitch = (s: number): number => s + V.frameTop / 1000;
  const cwHitch = (w: number): number => w + V.cwH / 1000 + 0.06;
  const wallAt = exitAlong(car, dir, L.inputs.W, L.inputs.D) / 1000, drop: RopePlane = { origin: car, dir };

  if (!bottom) {
    // the car side of the rope rises at u0, the counterweight side comes down at u1
    const u0 = two ? Rp : 0, u1 = two ? cm - Rp : cm;
    const roomFloor = ceiling + slab;
    const sheave: Wheel = { role: 'sheave', u: u0 + R0, y: roomFloor + dv.machine.axis / 1000, r: R0, plane: drop };
    const fixed: Wheel[] = [sheave], mid: BeltEl[] = [{ kind: 'wheel', u: sheave.u, y: sheave.y, r: R0, cw: true }];
    if (I.layout === 'topDefl') {
      const rev = deflectorAngle(N.D, I.Dp, I.dx, I.h)?.reverse ?? false;
      const pulley: Wheel = { role: 'deflector', u: rev ? u1 + Rp : u1 - Rp, y: sheave.y - I.h, r: Rp, plane: drop };
      fixed.push(pulley);
      mid.push({ kind: 'wheel', u: pulley.u, y: pulley.y, r: Rp, cw: !rev });
    }
    const start = (s: number): BeltEl[] => (two
      ? [{ kind: 'pt', u: -Rp, y: deadY }, { kind: 'wheel', u: 0, y: carHitch(s) + Rp + 0.03, r: Rp, cw: false }]
      : [{ kind: 'pt', u: 0, y: carHitch(s) }]);
    const end = (w: number): BeltEl[] => (two
      ? [{ kind: 'wheel', u: cm, y: cwHitch(w) + Rp, r: Rp, cw: false }, { kind: 'pt', u: cm + Rp, y: deadY }]
      : [{ kind: 'pt', u: cm, y: cwHitch(w) }]);
    return {
      origin: car, dir, calata: cm, sheave, bottom, scheme: null, wheels: fixed, roomFloor, wallAt,
      pieces: (s, w) => [{ plane: drop, els: [...start(s), ...mid, ...end(w)] }],
    };
  }

  // machine below: the car's plane toward its run to the machine, the sheave's along the wall, the counterweight's
  const g = bottomGeo(L, scheme, N.D, I.Dp, N.n, N.d, I.r, sheaveAxisBelow(N.D, dv.machine.shape ?? null)), unit = (a: P2, b: P2): P2 => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  const pc: RopePlane = { origin: car, dir: unit(car, g.mc) }, pw: RopePlane = { origin: cw, dir: unit(cw, g.mw) }, ps: RopePlane = { origin: g.mc, dir: unit(g.mc, g.mw) };
  const sc = Math.hypot(g.mc[0] - car[0], g.mc[1] - car[1]) / 1000, sw = Math.hypot(g.mw[0] - cw[0], g.mw[1] - cw[1]) / 1000;
  const yH = g.zHead / 1000, ys = g.zSheave / 1000, yb = ys + R0 + 0.05, side = two ? Rp : 0;
  const sheave: Wheel = { role: 'sheave', u: R0, y: ys, r: R0, plane: ps };
  // the head: over the car's rise and over its run (two at 90°), or one at 180°; the same on the counterweight's side
  const carHead: Wheel[] = g.carPulleys === 2
    ? [{ role: 'top', u: side + Rp, y: yH, r: Rp, plane: pc }, { role: 'top', u: sc - Rp, y: yH, r: Rp, plane: pc }]
    : [{ role: 'top', u: side + Rp, y: yH, r: Rp, plane: pc }];
  const cwHead: Wheel[] = g.cwPulleys === 2
    ? [{ role: 'top', u: sw - Rp, y: yH, r: Rp, plane: pw }, { role: 'top', u: side + Rp, y: yH, r: Rp, plane: pw }]
    : [{ role: 'top', u: side + Rp, y: yH, r: Rp, plane: pw }];
  const wheel = (h: Wheel, cwise: boolean): BeltEl => ({ kind: 'wheel', u: h.u, y: h.y, r: h.r, cw: cwise });
  const start = (s: number): BeltEl[] => (two
    ? [{ kind: 'pt', u: -Rp, y: deadY }, { kind: 'wheel', u: 0, y: carHitch(s) + Rp + 0.03, r: Rp, cw: false }]
    : [{ kind: 'pt', u: 0, y: carHitch(s) }]);
  // toward the sheave the counterweight's plane runs backwards (u grows toward the run): its wheels turn the other way
  const end = (w: number): BeltEl[] => (two
    ? [{ kind: 'wheel', u: 0, y: cwHitch(w) + Rp, r: Rp, cw: true }, { kind: 'pt', u: -Rp, y: deadY }]
    : [{ kind: 'pt', u: 0, y: cwHitch(w) }]);
  return {
    origin: car, dir, calata: cm, sheave, bottom, scheme: g, wheels: [sheave, ...carHead, ...cwHead], roomFloor: g.roomFloor / 1000, wallAt,
    pieces: (s, w) => [
      { plane: pc, els: [...start(s), ...carHead.map((h) => wheel(h, true)), { kind: 'pt', u: sc, y: yb }] },
      { plane: ps, els: [{ kind: 'pt', u: 0, y: yb }, { kind: 'wheel', u: R0, y: ys, r: R0, cw: false }, { kind: 'pt', u: 2 * R0, y: yb }] },
      { plane: pw, els: [{ kind: 'pt', u: sw, y: yb }, ...cwHead.map((h) => wheel(h, false)), ...end(w)] },
    ],
  };
}
