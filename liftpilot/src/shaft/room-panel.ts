// The control panel on the machine room's floor: its checks — clear of what stands on the floor, the ways from the door
// to the free areas — and the place the software gives it (registry locale.quadro, locale.quadro.posto). Room axes as
// in room-floor.ts [mm]. Pure.
import { check } from './checks';
import { KV_VERT } from './norme-vert';
import { WALLS, alongX, boxGap, doorZone, meets, outlineGap, panelArea, panelBox, panelFree, wallLength, type Box, type Outline, type Wall } from './room-floor';
import { bestIn, grid, leastIn, reachOf, routeWidths, walkOf, widthTo } from './room-route';
import type { RoomInputs } from './room';
import type { ShaftCheck } from './types';

/** The checks of the control panel on the floor: m_quadro (registry locale.quadro) — the panel inside the room and clear
 *  of `gear` (the machine with its support, the governor, the main switch): the least gap [mm], at least 0; m_route
 *  (registry locale.macchina) — the ways from the door into the free area in front of the panel and into `machineArea`,
 *  the one beside the machine (null: none to reach), at least KV_VERT.routeW wide [mm], by defect to 10 mm. */
export function panelChecks(R: RoomInputs, gear: readonly Outline[], machineArea: Box | null): ShaftCheck[] {
  const P = panelBox(R), out = Math.min(R.panelAt, wallLength(R, R.panelWall) - R.panelAt - R.panelW, (alongX(R.panelWall) ? R.D : R.W) - R.panelD);
  const gap = Math.min(gear.reduce((m, b) => Math.min(m, outlineGap(P, b)), Infinity), out < 0 ? out : Infinity);
  const route = Math.floor(Math.min(...routeWidths(R, [...gear, P], [panelArea(R), ...(machineArea ? [machineArea] : [])])) / 10) * 10;
  return [
    check('m_quadro', gap >= 0, Number.isFinite(gap) ? Math.round(gap) : null, 0, 0, 'mm'),
    check('m_route', route >= KV_VERT.routeW, route, KV_VERT.routeW, 0, 'mm'),
  ];
}

/** The free area beside the machine (support-check.ts freeBeside) with the panel standing at `panel` (null: none):
 *  whether it is as deep as it needs, and where it is (null: nowhere to stand). */
export type FreeOf = (panel: Box | null) => { ok: boolean; area: Box | null };

export interface PanelSpot {
  wall: Wall;
  at: number;
}

interface Candidate extends PanelSpot {
  spaced: boolean;
  walk: number;
  depth: number;
}

/**
 * Where the software puts the control panel (registry locale.quadro.posto): against a wall, clear of `gear` (the
 * machine with its support, the governor, the main switch) and of the way through the door, with its free area as deep
 * as the standard asks clear of them; the free area beside the machine kept (`free`); a way at least KV_VERT.routeW
 * wide from the door into the panel's free area and into the machine's. Of the places that do — tried every
 * KV_VERT.panelStep along the walls — those KV_VERT.panelSideGap clear of the gear and of the door's opening (its
 * frame) first, then the shortest walk from the door, the deepest free area, the order of WALLS, the start of the wall;
 * none fitting: the place with the fewest shortcomings (the checks say which).
 */
export function placePanel(R: RoomInputs, gear: readonly Outline[], free: FreeOf | null = null): PanelSpot {
  const K = KV_VERT, g = grid(R, gear), reach = reachOf(g), steps = walkOf(g, K.routeW / 2), zone = doorZone(R);
  const free0 = free?.(null) ?? null, keepFree = !!free0?.ok;
  // the machine's free area reached from the door before the panel stands anywhere: the panel must not cut it off
  const machineReach = free0?.area ? widthTo(g, free0.area) : 0;
  const all: (Candidate & { flaws: number })[] = [];
  for (const wall of WALLS) {
    const len = wallLength(R, wall), last = len - R.panelW;
    if (last < 0) continue;
    const ats = Array.from({ length: Math.floor(last / K.panelStep) + 1 }, (_, k) => k * K.panelStep);
    if (ats[ats.length - 1] !== last) ats.push(last);
    for (const at of ats) {
      const S: RoomInputs = { ...R, panelWall: wall, panelAt: at }, P = panelBox(S), A = panelArea(S);
      const gap = gear.reduce((m, b) => Math.min(m, outlineGap(P, b)), Infinity), depth = panelFree(S, gear);
      const wide = bestIn(g, reach, A), near = leastIn(g, steps, A);
      const kept = !keepFree || !!free?.(P).ok;
      const flaws = (gap < 0 ? 4 : 0) + (meets(P, zone) || meets(A, zone) ? 2 : 0) + (depth < K.panelFreeDepth || len < Math.max(K.panelFreeWidth, R.panelW) ? 2 : 0)
        + (kept ? 0 : 1) + (2 * wide < K.routeW ? 1 : 0);
      all.push({ wall, at, spaced: gap >= K.panelSideGap && boxGap(P, zone) >= K.panelSideGap, walk: near < 0 ? Infinity : near, depth, flaws });
    }
  }
  const order = (a: Candidate & { flaws: number }, b: Candidate & { flaws: number }): number => a.flaws - b.flaws || Number(b.spaced) - Number(a.spaced)
    || a.walk - b.walk || b.depth - a.depth || WALLS.indexOf(a.wall) - WALLS.indexOf(b.wall) || a.at - b.at;
  all.sort(order);
  if (!all.length) return { wall: R.panelWall, at: R.panelAt };
  // the first that, standing there, leaves the ways from the door to both free areas wide enough
  for (const c of all.slice(0, 8)) {
    if (c.flaws) break;
    const S: RoomInputs = { ...R, panelWall: c.wall, panelAt: c.at }, P = panelBox(S), g1 = grid(S, [...gear, P]), area = free?.(P).area ?? null;
    if (widthTo(g1, panelArea(S)) >= K.routeW && (!area || machineReach < K.routeW || widthTo(g1, area) >= K.routeW)) return { wall: c.wall, at: c.at };
  }
  return { wall: all[0].wall, at: all[0].at };
}
