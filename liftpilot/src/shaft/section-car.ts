// The car in section A-A (section-view.ts), kept apart for its size: at a floor with its platform, walls cut at the
// entrances, sills, doors, operator, frame, ropes and balustrade; its top dashed at its highest position. Pure.
import { line, path, rect, type Entity, type Pt } from '../drawing';
import { KV_VERT } from './norme-vert';
import { CAR_PANEL, carTracks, sillSection, trackPlanes } from './sill';
import type { Layout } from './types';

/** Stiles of the car frame in the section: at the rails' axis, or one at each rail's tip on a cantilever sling. */
export const stilesOf = (L: Layout): number[] =>
  L.frame.kind === 'central' ? [L.frame.axis] : L.rails.filter((r) => r.kind === 'car').map((r) => r.y + (r.dir === 'back' ? 55 : -55));

/** The top of the car dashed at the floor level zf: roof, operators, crosshead, balustrade (its highest position). */
export function carTopAt(L: Layout, P: (x: number, z: number) => Pt, zf: number): Entity[] {
  const I = L.inputs, V = I.vertical, c = L.car, x0 = c.y, x1 = c.y + c.h, roof = zf + V.carOutH, out: Entity[] = [];
  const b = (a0: number, z0: number, a1: number, z1: number): Entity => path([P(a0, z0), P(a1, z0), P(a1, z1), P(a0, z1)], true, 'space');
  out.push(line(P(x0, roof), P(x1, roof), 'space'));
  for (const d of L.doors.filter((x) => x.wall === 'front' || x.wall === 'rear')) {
    const front = d.wall === 'front';
    if (V.opTop > V.carOutH + 60) out.push(b(front ? x0 - I.carDoorDepth : x1 - 150, roof + 60, front ? x0 + 150 : x1 + I.carDoorDepth, zf + V.opTop));
  }
  const stiles = stilesOf(L);
  out.push(b(Math.min(...stiles) - KV_VERT.crossheadHalf, zf + V.frameTop - KV_VERT.crossheadH, Math.max(...stiles) + KV_VERT.crossheadHalf, zf + V.frameTop));
  if (V.parapet > 0) {
    const zt = roof + V.parapet;
    out.push(line(P(x0 + 60, zt), P(x1 - 60, zt), 'space'), line(P(x0 + 60, roof), P(x0 + 60, zt), 'space'), line(P(x1 - 60, roof), P(x1 - 60, zt), 'space'));
  }
  return out;
}

/** Car at the floor zf: platform, walls cut at the entrances, roof, doors, operator, frame, balustrade (the refuge space
 *  on the roof is drawn where the car stands at its highest position: extremes.ts). */
export function car(L: Layout, P: (x: number, z: number) => Pt, zf: number, ropeTop: number): Entity[] {
  const I = L.inputs, V = I.vertical, c = L.car, out: Entity[] = [], x0 = c.y, x1 = c.y + c.h, w = I.carWall;
  const b = (a0: number, z0: number, a1: number, z1: number, st: Parameters<typeof rect>[4] = 'thin', fill?: Parameters<typeof rect>[5]): Entity =>
    path([P(a0, z0), P(a1, z0), P(a1, z1), P(a0, z1)], true, st, fill);
  out.push(b(x0, zf - V.platform, x1, zf, 'outline', 'car'));
  const front = L.doors.some((d) => d.wall === 'front'), rear = L.doors.some((d) => d.wall === 'rear');
  for (const [a, open] of [[x0, front], [x1 - w, rear]] as const) {
    if (open) {
      out.push(b(a, zf + I.doorHeight, a + w, zf + V.carOutH, 'outline', 'car'));
      // the car sill from the gap to the car's inside, nosing at the gap, the panels on their tracks (sill.ts)
      const fr = a === x0, X = (v: number): number => (fr ? v : I.D - v), v0 = I.landingDepth + I.sillGap, inner = fr ? x0 + w : I.D - (x1 - w);
      const door = L.doors.find((d) => d.wall === (fr ? 'front' : 'rear')), grooves = door ? trackPlanes(door, carTracks(v0), CAR_PANEL) : [];
      out.push(path(sillSection(v0, inner, grooves, true).map(([v, z]) => P(X(v), zf + z)), true, 'outline', 'steel'));
      for (const g of grooves) out.push(b(X(g - CAR_PANEL / 2), zf, X(g + CAR_PANEL / 2), zf + I.doorHeight, 'thin', 'door'));
      // operator over the entrance, on the car roof
      if (V.opTop > V.carOutH + 60) out.push(b(a === x0 ? x0 - I.carDoorDepth : x1 - 150, zf + V.carOutH + 60, a === x0 ? x0 + 150 : x1 + I.carDoorDepth, zf + V.opTop, 'thin'));
    } else {
      out.push(b(a, zf, a + w, zf + V.carOutH, 'outline', 'car'));
    }
  }
  out.push(b(x0, zf + V.carH, x1, zf + V.carOutH, 'outline', 'car'));
  // car frame seen beyond: the stiles, crosshead and safety plank cut
  const stiles = stilesOf(L);
  for (const ax of stiles) {
    out.push(b(ax - 55, zf - V.frameBelow, ax + 55, zf + V.frameTop, 'thin'));
    for (const z of [zf + V.frameTop, zf - V.frameBelow - 90]) out.push(b(ax - 35, z, ax + 35, z + 90, 'thin'));
  }
  const [s0, s1] = [Math.min(...stiles) - KV_VERT.crossheadHalf, Math.max(...stiles) + KV_VERT.crossheadHalf];
  out.push(b(s0, zf + V.frameTop - KV_VERT.crossheadH, s1, zf + V.frameTop, 'outline', 'steel'));
  out.push(b(s0, zf - V.frameBelow, s1, zf - V.frameBelow + 150, 'outline', 'steel'));
  // suspension ropes up to the machine
  if (ropeTop > zf + V.frameTop) out.push(line(P(c.y + c.h / 2, zf + V.frameTop), P(c.y + c.h / 2, ropeTop), 'thin'));
  // balustrade on the roof, seen along its side
  if (V.parapet > 0) {
    const zt = zf + V.carOutH + V.parapet;
    out.push(line(P(x0 + 60, zt), P(x1 - 60, zt), 'outline'), line(P(x0 + 60, zf + V.carOutH), P(x0 + 60, zt), 'outline'), line(P(x1 - 60, zf + V.carOutH), P(x1 - 60, zt), 'outline'));
    out.push(line(P(x0 + 60, zf + V.carOutH + V.parapet / 2), P(x1 - 60, zf + V.carOutH + V.parapet / 2), 'thin'));
  }
  return out;
}
