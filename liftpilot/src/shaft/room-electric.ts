// The machine room's light, switches, sockets, ventilation and trunking in plan (registry locale.impianti; UNI EN
// 81-20:2020, 5.2.1.4.2, 5.2.1.5.2 a)–b), 5.10.7.2, 5.10.8.2, 5.2.1.3, 5.2.6.3.2.5): a light over each work area (the
// free areas in front of the panel and beside the machine), the light's switch by the access next to the main switch
// within KV_VERT.lightSwitchMax of the door, a 2P+PE socket by each work area on its nearest wall, the ventilation grille
// on the longest wall without the door or the panel, the trunking from the panel to the machine and to the shaft. The
// software's proposal, its symbols in the sheet's legend. Model entities, room axes [mm]; pure.
import { line, type Entity, type Pt } from '../drawing';
import { KV_VERT } from './norme-vert';
import { WALLS, alongX, panelArea, switchSpan, wallLength, type Box, type Wall } from './room-floor';
import type { RoomInputs } from './room';

/** A point `d` into the room from wall `w` at `a` along it. */
const onWall = (R: RoomInputs, w: Wall, a: number, d: number): Pt => (w === 'front' ? [a, d] : w === 'rear' ? [a, R.D - d] : w === 'left' ? [d, a] : [R.W - d, a]);

/** The wall nearest a point, and the point's place along it. */
function nearestWall(R: RoomInputs, p: Pt): { w: Wall; a: number } {
  const gaps: [Wall, number, number][] = [['front', p[1], p[0]], ['rear', R.D - p[1], p[0]], ['left', p[0], p[1]], ['right', R.W - p[0], p[1]]];
  const [w, , a] = gaps.reduce((b, g) => (g[1] < b[1] ? g : b));
  return { w, a };
}

const mid = ([x0, y0, x1, y1]: Box): Pt => [(x0 + x1) / 2, (y0 + y1) / 2];

/** The fittings over the room's floor: `machineArea` the free area beside the machine (null: none), `machine` the
 *  machine's outline (room axes), `shaft` the shaft's outline under the room. */
export function electricPlan(R: RoomInputs, machineArea: Box | null, machine: Box, shaft: Box): Entity[] {
  const out: Entity[] = [], areas = [panelArea(R), ...(machineArea ? [machineArea] : [])];
  // a light over each work area
  for (const a of areas) out.push({ e: 'mark', at: mid(a), sym: 'light' });
  // the light's switch by the access, past the main switch on the door's wall (before the door when the wall ends)
  const [s0, s1] = switchSpan(R), len = wallLength(R, R.doorWall), past = s1 + 150 <= len - 60, at = past ? s1 + 150 : Math.max(60, s0 - 150);
  out.push({ e: 'mark', at: onWall(R, R.doorWall, Math.min(at, R.doorAt + R.doorW + KV_VERT.lightSwitchMax), 70), sym: 'switch' });
  // a socket by each work area, on its nearest wall (beside the panel past its end, else before it)
  const pw = R.panelWall, plen = wallLength(R, pw), pa = R.panelAt + R.panelW + 200 <= plen - 60 ? R.panelAt + R.panelW + 200 : Math.max(60, R.panelAt - 200);
  out.push({ e: 'mark', at: onWall(R, pw, pa, 70), sym: 'socket' });
  if (machineArea) {
    const n = nearestWall(R, mid(machineArea));
    out.push({ e: 'mark', at: onWall(R, n.w, Math.min(Math.max(n.a, 100), wallLength(R, n.w) - 100), 70), sym: 'socket' });
  }
  // the ventilation grille on the longest wall without the door or the panel, in its middle
  const free = WALLS.filter((w) => w !== R.doorWall && w !== pw), vw = (free.length ? free : WALLS).reduce((b, w) => (wallLength(R, w) > wallLength(R, b) ? w : b));
  out.push({ e: 'mark', at: onWall(R, vw, wallLength(R, vw) / 2, 90), sym: 'vent' });
  // the trunking from the panel's front: out from its wall, then across to the machine's nearest side, and to the shaft
  const p0 = onWall(R, pw, R.panelAt + R.panelW / 2, R.panelD), out1 = onWall(R, pw, R.panelAt + R.panelW / 2, R.panelD + 120);
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
