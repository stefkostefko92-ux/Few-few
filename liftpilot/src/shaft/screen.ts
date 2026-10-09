// The counterweight's screen in the pit (UNI EN 81-20:2020, 5.2.5.5.1; registries contrappeso.schermo and
// contrappeso.schermo.pianta): a sheet between the car and the counterweight's run, from its lower edge at most 300 mm
// over the pit floor (c)) up to its top (b), screenOf), along the counterweight's wall across the counterweight and its
// rails and 40 mm past them (d)), on to the wall — or to a car rail standing between — wherever more than 300 mm would
// be left open there (e)) — short of a landing on that wall where the sheet would meet what it puts in front of the wall
// (landing.ts landingZone: the frame with the panels stacked, the sill with the plate under it), I.landingDepth + CLEAR
// from it. The plan of the pit, section A-A, their dimensions, the informations of its lower edge and width and the 3D
// (lift3d/pit.ts) take it from here. Pure.
import { chain, path, type Box, type Entity, type Pt } from '../drawing';
import { landingZone } from './landing';
import { firstClear } from './lettering-place';
import { KV_VERT } from './norme-vert';
import { onWall, quad } from './plan-walls';
import { RAILS } from './rails';
import { screenOf } from './section';
import { TAG_SCALE } from './tag-place';
import { levels } from './vertical';
import type { Layout, Rail, ShaftCheck, Wall } from './types';

/** The sheet's distance in front of the counterweight's face toward the car: from, to [mm] (as section A-A draws it). */
const SHEET: readonly [number, number] = [15, 25];
/** How far the sheet keeps from a landing it stops short of (the software's, as pit-kit.ts keeps its items) [mm]. */
const CLEAR = 15;
/** In the plan at 1:25, the sheet's name and its width's row this far off it, and the next row of both that much
 *  further [mm] (as much paper at a larger scale). */
const NAME_AT = 70, DIM_AT = 190, ROW = 150;

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

/** How far from the wall at the end `end` of the screen along its wall `wall` (the one at u = 0, or at `len`) the sheet
 *  stops: past what a landing on that wall puts in front of it (landingZone) where the sheet's line, `v0`…`v1` from
 *  `wall`, meets it and the sheet, up to `top` over the lowest landing, reaches up to it [mm]; 0 when none does. */
function landingClear(L: Layout, wall: Wall, end: 0 | 1, len: number, v0: number, v1: number, top: number): number {
  const I = L.inputs, at: Wall = wall === 'rear' ? (end ? 'right' : 'left') : end ? 'rear' : 'front', lv = levels(I.vertical.floors);
  // the sheet's line along that wall (its u), CLEAR each side
  const us = [v0, v1].map((v) => onWall(L, wall, end * len, v)[at === 'front' || at === 'rear' ? 0 : 1]);
  const lo = Math.min(...us) - CLEAR, hi = Math.max(...us) + CLEAR, meets = (r: readonly [number, number]): boolean => r[0] < hi && lo < r[1];
  const hit = I.vertical.floors.some((f, i) => L.doors.some((d) => {
    if (d.wall !== at || !f.door.includes(d.side)) return false;
    const z = landingZone(I, d), zf = lv[i] ?? 0;
    return (top > zf && meets(z.over)) || (top > zf - z.down && meets(z.under));
  }));
  return hit ? I.landingDepth + CLEAR : 0;
}

export function cwScreen(L: Layout): CwScreen {
  const I = L.inputs, K = KV_VERT, c = L.cw, wall: Wall = L.cwSide, along = wall === 'rear', high = screenOf(I.vertical);
  // the counterweight's face toward the car, from its wall's face
  const face = wall === 'rear' ? I.D - c.y : wall === 'left' ? c.x + c.w : I.W - c.x;
  const [c0, c1] = along ? [c.x, c.x + c.w] : [c.y, c.y + c.h], len = along ? I.W : I.D;
  const cwRails = L.rails.filter((r) => r.kind === 'cw').map((r) => railExtent(L, r, wall));
  const a = Math.min(c0, ...cwRails.map((e) => e.u[0])) - K.cwScreenPast, b = Math.max(c1, ...cwRails.map((e) => e.u[1])) + K.cwScreenPast;
  // what closes the run toward each end along the wall: the wall, or a car rail standing in the sheet's line between
  const v0 = face + SHEET[0], v1 = face + SHEET[1], inLine = L.rails.filter((r) => r.kind === 'car').map((r) => railExtent(L, r, wall)).filter((e) => e.v[0] <= v1 + 1);
  const stop0 = Math.max(0, ...inLine.filter((e) => e.u[1] <= a).map((e) => e.u[1])), stop1 = Math.min(len, ...inLine.filter((e) => e.u[0] >= b).map((e) => e.u[0]));
  // closed to a wall, the sheet stops short of a landing on it (what stays open there is the landing's depth)
  const top = high - I.vertical.pit, end0 = Math.max(stop0, landingClear(L, wall, 0, len, v0, v1, top)), end1 = Math.min(stop1, len - landingClear(L, wall, 1, len, v0, v1, top));
  const u0 = Math.max(0, a - stop0 > K.cwScreenWall ? end0 : a), u1 = Math.min(len, stop1 - b > K.cwScreenWall ? end1 : b);
  return { wall, u0, u1, v0, v1, low: K.cwScreenLow, high, cwLen: c1 - c0, bare: [Math.max(0, a), Math.min(len, b)] };
}

/** The screen's lower edge (c)) and its width with the space beside the rails (d), e)) as the drawings give them, beside
 *  the standard's figures: informations, not checks — the software sizes the screen to the standard, nothing of the
 *  design's could fall short of it (the screen the installer fits is checked at the acceptance test). */
export function screenChecks(L: Layout): ShaftCheck[] {
  const s = cwScreen(L), K = KV_VERT;
  return [
    { id: 'p_screenlo', status: 'info', value: s.low, limit: K.cwScreenLow, dec: 0, unit: 'mm' },
    { id: 'p_screenw', status: 'info', value: Math.round(s.u1 - s.u0), limit: Math.round(s.cwLen), dec: 0, unit: 'mm' },
  ];
}

/** The screen's lower edge over the pit floor in the pit's detail of section A-A, beside the screen, with its limit (a
 *  reference: the standard's figure, no input changes it); `P` maps the section's (x, z). */
export function screenLowDim(L: Layout, P: (x: number, z: number) => Pt, pitFloor: number): Entity[] {
  const s = cwScreen(L), [x, at] = L.cwSide === 'rear' ? [L.cw.y - 25, L.cw.y - 150] : [s.u1, s.u1 + 120];
  return [chain({ dir: 'y', at, pts: [P(x, pitFloor)[1], P(x, pitFloor + s.low)[1]], text: ['{v} max'], from: [null, x] })];
}

/** The screen in the plan of the pit: the sheet, its name with its height, its width from end to end (a reference: what
 *  the counterweight and its rails set) — the name and the width in the first row off the sheet clear of the plan's
 *  lettering already there (`taken`, at the plan's `scale`: lettering-place.ts; its names, `hard`, above all). */
export function screenPlan(L: Layout, taken: Box[] = [], scale: number = TAG_SCALE, hard: readonly Box[] = []): Entity[] {
  const s = cwScreen(L), P = (u: number, v: number): Pt => onWall(L, s.wall, u, v), along = s.wall === 'front' || s.wall === 'rear';
  const k = Math.max(TAG_SCALE, scale) / TAG_SCALE, row = (r: number, u: number, align: 'c' | 'l' | 'r'): Entity[] => {
    const mid = P(u, s.v1 + (NAME_AT + r * ROW) * k), dimAt = P(s.u0, s.v1 + (DIM_AT + r * ROW) * k);
    return [
      { e: 'text', at: mid, text: `PROTEZIONE CONTRAPPESO H ${Math.round(s.high)}`, size: 1.6, align, angle: along ? 0 : 90, halo: true, fit: s.u1 - s.u0 - 60 },
      chain({ dir: along ? 'x' : 'y', pts: [s.u0, s.u1], at: along ? dimAt[1] : dimAt[0], from: along ? P(0, s.v1)[1] : P(0, s.v1)[0], text: ['Protezione {v}'] }),
    ];
  };
  // (over the sheet's middle, else from either of its ends; its name inside the shaft)
  const options = [0, 1].flatMap((r) => [row(r, (s.u0 + s.u1) / 2, 'c'), row(r, s.u0 + 30, 'l'), row(r, s.u1 - 30, 'r')]);
  return [path(quad(L, s.wall, s.u0, s.v0, s.u1, s.v1), true, 'outline', 'paper'), ...firstClear(options, taken, scale, { x0: 0, y0: 0, x1: L.inputs.W, y1: L.inputs.D }, [hard])];
}
