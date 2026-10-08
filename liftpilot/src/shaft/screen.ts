// The counterweight's screen in the pit (UNI EN 81-20:2020, 5.2.5.5.1; registries contrappeso.schermo and
// contrappeso.schermo.pianta): a sheet between the car and the counterweight's run, from its lower edge at most 300 mm
// over the pit floor (c)) up to its top (b), screenOf), along the counterweight's wall across the counterweight and its
// rails and 40 mm past them (d)), on to the wall — or to a car rail standing between — wherever more than 300 mm would
// be left open there (e)). The plan of the pit, section A-A, their dimensions and the checks take it from here. Pure.
import { chain, path, type Entity, type Pt } from '../drawing';
import { check } from './checks';
import { KV_VERT } from './norme-vert';
import { onWall, quad } from './plan-walls';
import { RAILS } from './rails';
import { screenOf } from './section';
import type { Layout, Rail, ShaftCheck, Wall } from './types';

/** The sheet's distance in front of the counterweight's face toward the car: from, to [mm] (as section A-A draws it). */
const SHEET: readonly [number, number] = [15, 25];

export interface CwScreen {
  /** the wall the counterweight runs by; along it (its own u) the sheet's ends */
  wall: Wall;
  u0: number;
  u1: number;
  /** the sheet from that wall's face toward the car [mm] */
  v0: number;
  v1: number;
  /** its lower edge and its top over the pit floor [mm] */
  low: number;
  high: number;
  /** the counterweight's length along the wall, and where the sheet would end without e) [mm] */
  cwLen: number;
  bare: readonly [number, number];
}

/** A rail's extent along a wall's u (from the back of its foot to its tip) and from the wall's face (v) [mm]. */
function railExtent(L: Layout, r: Rail, wall: Wall): { u: [number, number]; v: [number, number] } {
  const s = RAILS[r.kind === 'car' ? L.inputs.carRail : L.inputs.cwRail], { W, D } = L.inputs;
  const [dx, dy] = r.dir === 'right' ? [1, 0] : r.dir === 'left' ? [-1, 0] : r.dir === 'back' ? [0, 1] : [0, -1];
  const xs = [r.x, r.x - dx * s.h, r.x - dy * (s.b / 2), r.x + dy * (s.b / 2)], ys = [r.y, r.y - dy * s.h, r.y - dx * (s.b / 2), r.y + dx * (s.b / 2)];
  const along = wall === 'front' || wall === 'rear' ? xs : ys;
  const from = wall === 'front' ? ys : wall === 'rear' ? ys.map((y) => D - y) : wall === 'left' ? xs : xs.map((x) => W - x);
  return { u: [Math.min(...along), Math.max(...along)], v: [Math.min(...from), Math.max(...from)] };
}

export function cwScreen(L: Layout): CwScreen {
  const I = L.inputs, K = KV_VERT, c = L.cw, wall: Wall = L.cwSide, along = wall === 'rear';
  // the counterweight's face toward the car, from its wall's face
  const face = wall === 'rear' ? I.D - c.y : wall === 'left' ? c.x + c.w : I.W - c.x;
  const [c0, c1] = along ? [c.x, c.x + c.w] : [c.y, c.y + c.h], len = along ? I.W : I.D;
  const cwRails = L.rails.filter((r) => r.kind === 'cw').map((r) => railExtent(L, r, wall));
  const a = Math.min(c0, ...cwRails.map((e) => e.u[0])) - K.cwScreenPast, b = Math.max(c1, ...cwRails.map((e) => e.u[1])) + K.cwScreenPast;
  // what closes the run toward each end along the wall: the wall, or a car rail standing in the sheet's line between
  const v1 = face + SHEET[1], inLine = L.rails.filter((r) => r.kind === 'car').map((r) => railExtent(L, r, wall)).filter((e) => e.v[0] <= v1 + 1);
  const stop0 = Math.max(0, ...inLine.filter((e) => e.u[1] <= a).map((e) => e.u[1])), stop1 = Math.min(len, ...inLine.filter((e) => e.u[0] >= b).map((e) => e.u[0]));
  const u0 = Math.max(0, a - stop0 > K.cwScreenWall ? stop0 : a), u1 = Math.min(len, stop1 - b > K.cwScreenWall ? stop1 : b);
  return { wall, u0, u1, v0: face + SHEET[0], v1, low: K.cwScreenLow, high: screenOf(I.vertical), cwLen: c1 - c0, bare: [Math.max(0, a), Math.min(len, b)] };
}

/** The checks of the screen's lower edge (c)) and of its width with the space beside the rails (d), e)). */
export function screenChecks(L: Layout): ShaftCheck[] {
  const s = cwScreen(L), K = KV_VERT;
  return [
    check('p_screenlo', s.low <= K.cwScreenLow, s.low, K.cwScreenLow, 0, 'mm'),
    check('p_screenw', s.u1 - s.u0 >= s.cwLen - 1e-9, Math.round(s.u1 - s.u0), Math.round(s.cwLen), 0, 'mm'),
  ];
}

/** The screen's lower edge over the pit floor in the pit's detail of section A-A, beside the screen, with its limit (a
 *  reference: the standard's figure, no input changes it); `P` maps the section's (x, z). */
export function screenLowDim(L: Layout, P: (x: number, z: number) => Pt, pitFloor: number): Entity[] {
  const s = cwScreen(L), [x, at] = L.cwSide === 'rear' ? [L.cw.y - 25, L.cw.y - 150] : [s.u1, s.u1 + 120];
  return [chain({ dir: 'y', at, pts: [P(x, pitFloor)[1], P(x, pitFloor + s.low)[1]], text: ['{v} max'], from: [null, x] })];
}

/** The screen in the plan of the pit: the sheet, its name with its height, its width from end to end (a reference: what
 *  the counterweight and its rails set). */
export function screenPlan(L: Layout): Entity[] {
  const s = cwScreen(L), P = (u: number, v: number): Pt => onWall(L, s.wall, u, v), along = s.wall === 'front' || s.wall === 'rear';
  const mid = P((s.u0 + s.u1) / 2, s.v1 + 70), dimAt = P(s.u0, s.v1 + 190);
  return [
    path(quad(L, s.wall, s.u0, s.v0, s.u1, s.v1), true, 'outline', 'paper'),
    { e: 'text', at: mid, text: `PROTEZIONE CONTRAPPESO H ${Math.round(s.high)}`, size: 1.6, align: 'c', angle: along ? 0 : 90, halo: true, fit: s.u1 - s.u0 - 60 },
    chain({ dir: along ? 'x' : 'y', pts: [s.u0, s.u1], at: along ? dimAt[1] : dimAt[0], from: along ? P(0, s.v1)[1] : P(0, s.v1)[0], text: ['Protezione {v}'] }),
  ];
}
