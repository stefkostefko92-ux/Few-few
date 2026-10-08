// The machine room's free areas and ways drawn in plan (registry locale.macchina, locale.volantino, limitatore.posto;
// UNI EN 81-20:2020, 5.2.6.3.2.1 b) and 5.2.6.3.2.2): the free area beside the machine for its maintenance and the
// manual emergency operation where the checks find it (at the handwheel when it can be there), the one beside the
// governor, each hatched with its size; the ways from the door to them and to the area in front of the control panel
// as bands KV_VERT.routeW wide along the walk the route's grid finds (room-route.ts). Model entities, room axes [mm];
// pure.
import { line, path, type Entity, type Pt } from '../drawing';
import { machineBox, machineParts } from './support-check';
import type { MachineSpec, RoomGeo } from './machine-room';
import { KV_VERT } from './norme-vert';
import { wheelAt } from './room-above';
import { freeBeside } from './room-free';
import { outlineBox, panelArea, panelBox, switchBox, type Box, type Outline } from './room-floor';
import { grid, leastIn, walkOf, type Grid } from './room-route';

const corners = ([x0, y0, x1, y1]: Box): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** A free area hatched (its outline and diagonals dashed) with its size written in it. */
function hatched(b: Box, text: string): Entity[] {
  const [x0, y0, x1, y1] = b;
  return [path(corners(b), true, 'space'), line([x0, y0], [x1, y1], 'space'), line([x0, y1], [x1, y0], 'space'),
    { e: 'text', at: [(x0 + x1) / 2, y0 + 40], text, size: 1.6, align: 'c', halo: true }];
}

/** The free area beside the machine (as m_free and m_wheel take it) and beside the governor (as m_govfree), the
 *  machine's handwheel marked; `others` what stands on the floor besides the machine (the governor's footprint, the
 *  main switch), `gov` the governor's footprint. */
export function freeAreas(G: RoomGeo, M: MachineSpec, others: readonly Box[], gov: Box | null): { entities: Entity[]; machine: Box | null } {
  const R = G.room, out: Entity[] = [], K = KV_VERT, size = `${K.maintW}×${K.maintD}`;
  const f = freeBeside(R, machineBox(G, M), [panelBox(R), ...others], wheelAt(G, M)), ok = f.depth >= f.need;
  if (ok) out.push(...hatched(f.area, size));
  if (gov) {
    const near = [...machineParts(G, M), panelBox(R), switchBox(R)].map(outlineBox), g = freeBeside(R, gov, near);
    if (g.depth >= g.need) out.push(...hatched(g.area, size));
  }
  return { entities: out, machine: ok ? f.area : null };
}

/** The walk from the door to the nearest cell of `b` through cells at least half a way's width clear, as a polyline of
 *  the cells' middles straightened; null when none reaches it. */
function walkTo(g: Grid, b: Box): Pt[] | null {
  const r = KV_VERT.routeW / 2, dist = walkOf(g, r), target = leastIn(g, dist, b);
  if (target < 0) return null;
  let k = -1;
  for (let j = 0; j < g.ny && k < 0; j++) for (let i = 0; i < g.nx; i++) {
    const c = (j + 1) * g.stride + i + 1;
    const x = (i + 0.5) * g.sx, y = (j + 0.5) * g.sy;
    if (dist[c] === target && x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) { k = c; break; }
  }
  if (k < 0) return null;
  const next = [-1, 1, -g.stride, g.stride, -g.stride - 1, -g.stride + 1, g.stride - 1, g.stride + 1], cost = [10, 10, 10, 10, 14, 14, 14, 14], cells = [k];
  while (dist[k] > 0) {
    let best = -1;
    for (let e = 0; e < 8; e++) {
      const m = k + next[e];
      if (dist[m] >= 0 && dist[m] + cost[e] === dist[k] && (best < 0 || dist[m] < dist[best])) best = m;
    }
    if (best < 0) break;
    k = best;
    cells.push(k);
  }
  const pts = cells.reverse().map((c): Pt => [((c % g.stride) - 0.5) * g.sx, (Math.floor(c / g.stride) - 0.5) * g.sy]);
  // the straight runs only: a point is kept where the walk turns
  return pts.filter((p, i) => i === 0 || i === pts.length - 1 || Math.abs((p[0] - pts[i - 1][0]) * (pts[i + 1][1] - p[1]) - (p[1] - pts[i - 1][1]) * (pts[i + 1][0] - p[0])) > 1e-6);
}

/** A polyline's two sides `h` either side of it (mitred at its turns). */
function sides(pts: readonly Pt[], h: number): [Pt[], Pt[]] {
  const n = (a: Pt, b: Pt): Pt => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  };
  const left: Pt[] = [], right: Pt[] = [];
  pts.forEach((p, i) => {
    const a = i > 0 ? n(pts[i - 1], p) : n(p, pts[i + 1]), b = i < pts.length - 1 ? n(p, pts[i + 1]) : a;
    const m: Pt = [a[0] + b[0], a[1] + b[1]], l = Math.hypot(m[0], m[1]) || 1, cos = Math.max(0.5, (m[0] * a[0] + m[1] * a[1]) / l);
    const o: Pt = [(m[0] / l) * (h / cos), (m[1] / l) * (h / cos)];
    left.push([p[0] + o[0], p[1] + o[1]]);
    right.push([p[0] - o[0], p[1] - o[1]]);
  });
  return [left, right];
}

/** The ways from the door to the free area in front of the panel and to the one beside the machine (`machineArea`), as
 *  bands KV_VERT.routeW wide; `gear` what stands on the floor (the machine's parts, the governor, the main switch). */
export function wayBands(G: RoomGeo, gear: readonly Outline[], machineArea: Box | null): Entity[] {
  const R = G.room, g = grid(R, [...gear, panelBox(R)]), out: Entity[] = [];
  for (const b of [panelArea(R), ...(machineArea ? [machineArea] : [])]) {
    const w = walkTo(g, b);
    if (!w || w.length < 2) continue;
    for (const s of sides(w, KV_VERT.routeW / 2)) out.push(path(s, false, 'space'));
  }
  return out;
}
