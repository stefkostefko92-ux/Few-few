// The machine room's light, switches, sockets, ventilation and trunking in plan (registry locale.impianti; UNI EN
// 81-20:2020, 5.2.1.4.2, 5.2.1.5.2 a)–b), 5.10.7.2, 5.10.8.2, 5.2.1.3, 5.2.6.3.2.5): a light over each work area (the
// free areas in front of the panel and beside the machine), the light's switch by the access next to the main switch
// within KV_VERT.lightSwitchMax of the door, a 2P+PE socket by each work area on its nearest wall, the ventilation grille
// on the longest wall without the door or the panel, the trunking from the panel to the machine and to the shaft. The
// software's proposal, its symbols in the sheet's legend; the places (electricSpots) are the 3D's too (lift3d/roomshell.ts).
// Model entities, room axes [mm]; pure.
import { line, type Entity, type Pt } from '../drawing';
import { KV_VERT } from './norme-vert';
import type { MachineSpec, RoomGeo } from './machine-room';
import { WALLS, alongX, panelArea, switchSpan, wallLength, type Box, type Wall } from './room-floor';
import type { RoomInputs } from './room';
import type { RoomSite } from './room-site';
import { floorOthers, freeAreas } from './room-ways';

/** A point `d` into the room from wall `w` at `a` along it. */
const onWall = (R: RoomInputs, w: Wall, a: number, d: number): Pt => (w === 'front' ? [a, d] : w === 'rear' ? [a, R.D - d] : w === 'left' ? [d, a] : [R.W - d, a]);

/** The walls nearest first from a point, and the point's place along each. */
function nearestWalls(R: RoomInputs, p: Pt): { w: Wall; a: number }[] {
  const gaps: [Wall, number, number][] = [['front', p[1], p[0]], ['rear', R.D - p[1], p[0]], ['left', p[0], p[1]], ['right', R.W - p[0], p[1]]];
  return gaps.sort((g, h) => g[1] - h[1]).map(([w, , a]) => ({ w, a }));
}

/** Half a wall fitting's width along its wall (the grille's: VENT_HALF), the door's frame each side of its opening
 *  [mm] (the software's). */
export const FIT_HALF = 40, VENT_HALF = 200, DOOR_JAMB = 100;

/** A fitting's place (`half` its half width) on wall `w` near `at`, within `end` of the wall's ends and clear of the
 *  door's opening with its frame: past the nearer jamb when it would stand in it; null when the wall has no such place. */
function offDoor(R: RoomInputs, w: Wall, at: number, end: number, half = FIT_HALF): number | null {
  const len = wallLength(R, w), a = Math.min(Math.max(at, end), len - end);
  const d0 = R.doorAt - DOOR_JAMB - half, d1 = R.doorAt + R.doorW + DOOR_JAMB + half;
  if (w !== R.doorWall || a <= d0 || a >= d1) return a;
  const sides = [d0, d1].filter((x) => x >= end && x <= len - end).sort((x, y) => Math.abs(x - at) - Math.abs(y - at));
  return sides[0] ?? null;
}

const mid = ([x0, y0, x1, y1]: Box): Pt => [(x0 + x1) / 2, (y0 + y1) / 2];

/** The light fitting over a work area (the software's, as the 3D builds it): long and wide [mm]. */
export const LAMP = { l: 600, w: 120 } as const;

/** A light over a work area: its middle, and whether its fitting runs along x. */
export interface RoomLight {
  at: Pt;
  alongX: boolean;
}

/** Half the light fitting along x and along y, running along x or along y [mm]. */
export const lampHalf = (alongX: boolean): readonly [number, number] => (alongX ? [LAMP.l / 2, LAMP.w / 2] : [LAMP.w / 2, LAMP.l / 2]);

/** The light over the work area `b`: in its middle, the fitting along the area's longer side — across it where only
 *  that way it stays inside the room —, moved in from the walls where neither way does. */
function lightOver(R: RoomInputs, b: Box): RoomLight {
  const [x, y] = mid(b), long = b[2] - b[0] >= b[3] - b[1], fits = (alongX: boolean): boolean => {
    const [hx, hy] = lampHalf(alongX);
    return x - hx >= 0 && x + hx <= R.W && y - hy >= 0 && y + hy <= R.D;
  };
  const alongX = fits(long) || !fits(!long) ? long : !long, [hx, hy] = lampHalf(alongX);
  return { at: [Math.min(Math.max(x, hx), R.W - hx), Math.min(Math.max(y, hy), R.D - hy)], alongX };
}

/** A fitting on a wall of the room: the wall and its place along it [mm]. */
export interface WallSpot {
  wall: Wall;
  at: number;
}

/** Where the room's fittings go (room axes [mm]): a light over each work area (its fitting along the area's longer
 *  side), the light's switch, a socket by each work area, the ventilation grille. */
export interface ElectricSpots {
  lights: RoomLight[];
  lightSwitch: WallSpot;
  sockets: WallSpot[];
  vent: WallSpot;
}

/** The places of the fittings: `machineArea` the free area beside the machine (null: none). */
export function electricSpots(R: RoomInputs, machineArea: Box | null): ElectricSpots {
  const areas = [panelArea(R), ...(machineArea ? [machineArea] : [])];
  // the light's switch by the access, past the main switch on the door's wall (before the door when the wall ends)
  const [s0, s1] = switchSpan(R), len = wallLength(R, R.doorWall), past = s1 + 150 <= len - 60, at = past ? s1 + 150 : Math.max(60, s0 - 150);
  const sw = Math.min(at, R.doorAt + R.doorW + KV_VERT.lightSwitchMax);
  // a socket by each work area, on its nearest wall (beside the panel past its end, else before it), each clear of the
  // door's opening (the machine's on the next nearest wall when the door leaves its wall none)
  const pw = R.panelWall, plen = wallLength(R, pw), pa = R.panelAt + R.panelW + 200 <= plen - 60 ? R.panelAt + R.panelW + 200 : Math.max(60, R.panelAt - 200);
  const sockets: WallSpot[] = [{ wall: pw, at: offDoor(R, pw, pa, 60) ?? pa }];
  if (machineArea) {
    const near = nearestWalls(R, mid(machineArea)), spot = near.flatMap((n) => {
      const a = offDoor(R, n.w, n.a, 100);
      return a === null ? [] : [{ wall: n.w, at: a }];
    })[0];
    if (spot) sockets.push(spot);
  }
  // the ventilation grille on the longest wall without the door or the panel, in its middle
  const free = WALLS.filter((w) => w !== R.doorWall && w !== pw), vw = (free.length ? free : WALLS).reduce((b, w) => (wallLength(R, w) > wallLength(R, b) ? w : b));
  return {
    lights: areas.map((b) => lightOver(R, b)), lightSwitch: { wall: R.doorWall, at: offDoor(R, R.doorWall, sw, 60) ?? sw }, sockets,
    vent: { wall: vw, at: offDoor(R, vw, wallLength(R, vw) / 2, VENT_HALF, VENT_HALF) ?? wallLength(R, vw) / 2 },
  };
}

/** The places of the fittings of the room of a site, with the free area beside the machine its plan draws
 *  (room-view.ts): the 3D's. */
export function roomElectrics(S: RoomSite, M: MachineSpec, G: RoomGeo): ElectricSpots {
  return electricSpots(G.room, freeAreas(G, M, floorOthers(S, G.room), S.govFoot ?? null).machine);
}

/** The fittings over the room's floor: `machineArea` the free area beside the machine (null: none), `machine` the
 *  machine's outline (room axes), `shaft` the shaft's outline under the room. */
export function electricPlan(R: RoomInputs, machineArea: Box | null, machine: Box, shaft: Box): Entity[] {
  const out: Entity[] = [], e = electricSpots(R, machineArea);
  for (const l of e.lights) out.push({ e: 'mark', at: l.at, sym: 'light' });
  out.push({ e: 'mark', at: onWall(R, e.lightSwitch.wall, e.lightSwitch.at, 70), sym: 'switch' });
  for (const k of e.sockets) out.push({ e: 'mark', at: onWall(R, k.wall, k.at, 70), sym: 'socket' });
  out.push({ e: 'mark', at: onWall(R, e.vent.wall, e.vent.at, 90), sym: 'vent' });
  // the trunking from the panel's front: out from its wall, then across to the machine's nearest side, and to the shaft
  const pw = R.panelWall, p0 = onWall(R, pw, R.panelAt + R.panelW / 2, R.panelD), out1 = onWall(R, pw, R.panelAt + R.panelW / 2, R.panelD + 120);
  const run = (to: Box): Pt[] => {
    const tx = Math.min(Math.max(out1[0], to[0]), to[2]), ty = Math.min(Math.max(out1[1], to[1]), to[3]);
    return alongX(pw) ? [p0, out1, [tx, out1[1]], [tx, ty]] : [p0, out1, [out1[0], ty], [tx, ty]];
  };
  for (const to of [machine, shaft]) {
    const pts = run(to);
    for (let i = 0; i + 1 < pts.length; i++) if (Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) > 1) out.push(line(pts[i], pts[i + 1], 'hidden'));
  }
  return out;
}
