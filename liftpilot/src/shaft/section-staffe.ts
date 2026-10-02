// Panev's landing-door brackets in the section A-A, as the 3D places them (staffe-porte.ts): under a landing's sill the
// fixing face of B against the wall seen edge-on with its anchors into the wall (hidden), the profile of its rib (full
// width below the joint, tapering to the foot), A's platform edge-on under the sill, cut to the sill's depth, and the
// profile of its rib down to the leg bolted to B's, with the joint and lock bolts. Pure.
import { circle, path, type Entity, type Pt } from '../drawing';
import { SILL_H } from './sill';
import { A_LEGS, B_SECTIONS, pairPose, plateReach, type DoorPair } from './staffe-porte';

type V = readonly [number, number];

/** The part of a polygon with x ≤ xs (one cut across it). */
function clipX(poly: readonly V[], xs: number): V[] {
  const out: V[] = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    if (p[0] <= xs) out.push(p);
    if ((p[0] - xs) * (q[0] - xs) < 0) out.push([xs, p[1] + ((xs - p[0]) / (q[0] - p[0])) * (q[1] - p[1])]);
  });
  return out;
}

/** The pair under the sill of the landing at floor level zf; `P` maps (v from the wall's inner face into the shaft, z). */
export function doorPairSection(pair: DoorPair, depth: number, zf: number, P: (v: number, z: number) => Pt): Entity[] {
  const sec = pair.a.section, s = B_SECTIONS[sec], g = A_LEGS[sec], L = pair.b.length, [hx, hy] = g.holes[0], [lx, ly] = g.holes[1];
  const { base, pivot, aTop, aWall } = pairPose(pair, zf - SILL_H), { cut } = plateReach(pair.a, depth);
  const poly = (pts: readonly V[]): Pt[] => pts.map(([v, z]) => P(v, z));
  const out: Entity[] = [];
  // B: the anchors into the wall, the fixing face edge-on, the rib's profile
  for (const y of [70, L - 95]) out.push(path(poly([[-70, base + y - 6], [0, base + y - 6], [0, base + y + 6], [-70, base + y + 6]]), true, 'hidden'));
  out.push(path(poly([[0, base], [s.t, base], [s.t, base + L], [0, base + L]]), true, 'thin', 'zinc'));
  out.push(path(poly([[s.t, base], [s.foot, base], [s.rib, base + L - s.full], [s.rib, base + L], [s.t, base + L]]), true, 'thin', 'zinc'));
  // A: the platform edge-on under the sill, the rib's profile (x along the platform from its wall end, y down)
  out.push(path(poly([[aWall, aTop - g.t], [aWall + cut, aTop - g.t], [aWall + cut, aTop], [aWall, aTop]]), true, 'thin', 'zinc'));
  const [cx0, cx1, cy1] = g.chamfer, rib: V[] = [[0, 0], [pair.a.length, 0], [pair.a.length, g.strip], [cx0, g.strip], [cx1, cy1], g.legIn, g.legOut, [0, 12]];
  out.push(path(poly(clipX(rib, cut).map(([x, y]) => [aWall + x, aTop - y] as const)), true, 'thin', 'zinc'));
  // the joint bolt and the lock's, through both ribs
  for (const [v, z] of [[s.col, pivot], [s.col + lx - hx, pivot - (ly - hy)]] as const) out.push(circle(P(v, z), 8, 'thin', 'paper'), circle(P(v, z), 4, 'fine'));
  return out;
}
