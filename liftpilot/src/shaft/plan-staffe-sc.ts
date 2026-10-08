// Panev's sliding support SC of a counterweight rail seen from above, as the 3D builds it (staffe-sc.ts): the anchors
// through the flange's slots into the wall (under the plate: hidden), the plate along the wall with its slots, the SG
// on it along the wall with its slots across and its flange edge-on behind the rail's foot, the two bolts holding it
// in the SC's slots, the two N1 clips over the foot's edges with their nuts behind the flange; and the code with the
// count per rail in the wall's thickness behind it. Pure.
import { TEXT, circle, line, path, type Entity, type Pt } from '../drawing';
import { ANCHOR, HEAD, hex, slot, type BracketPlan } from './plan-parts';
import { onWall } from './plan-walls';
import { N1, SG_T, STATIONS } from './staffe';
import { SC_RUNS, SC_T, scBoltRow } from './staffe-sc';
import type { SlideBracket } from './staffe-scelta';
import type { Layout } from './types';

/** The SC with its SG and clips; `label`: the code and count to write behind it. */
export function slidePlan(L: Layout, g: SlideBracket, label: string | null): BracketPlan {
  const { sc, place: p, gap } = g, { w, l } = sc.sg, runs = SC_RUNS[sc.L];
  // (u along the wall, y out from the bracket's wall)
  const P = (u: number, y: number): Pt => onWall(L, g.wall, u, y - g.inset);
  const poly = (pts: readonly (readonly [number, number])[]): Pt[] => pts.map(([u, y]) => P(u, y));
  const box = (u0: number, y0: number, u1: number, y1: number): Pt[] => poly([[u0, y0], [u1, y0], [u1, y1], [u0, y1]]);
  const out: Entity[] = [], over: Entity[] = [];
  // the anchors in the flange's slots, into the wall; the plate with its slots, the flange's line under it
  for (const [a, b] of runs.flange) out.push(path(box(p.s + (a + b) / 2 - ANCHOR / 2, -70, p.s + (a + b) / 2 + ANCHOR / 2, 0), true, 'hidden'));
  out.push(path(box(p.s, 0, p.s + sc.L, sc.W), true, 'outline', 'zinc'));
  out.push(line(P(p.s, SC_T), P(p.s + sc.L, SC_T), 'hidden'));
  if (sc.W <= 60) {
    for (const [a, b] of runs.plate) out.push(path(poly(slot([p.s + a + 6, sc.W - 22], [p.s + b - 6, sc.W - 22], 12)), true, 'fine'));
  } else {
    for (const x of [15, 30, sc.L / 2, sc.L - 30, sc.L - 15]) out.push(circle(P(p.s + x, sc.W - 56), 5, 'fine'));
    for (const y of [sc.W - 35, sc.W - 15.5]) for (const [a, b] of runs.plate) out.push(path(poly(slot([p.s + a + 5, y], [p.s + b - 5, y], 10)), true, 'fine'));
  }
  // the SG along the wall with its slots across, its flange edge-on behind the rail's foot
  const y1 = w - (w >= 80 ? 10 : 5);
  out.push(path(box(p.a, gap - w, p.a + l, gap), true, 'thin', 'zinc'));
  for (const st of STATIONS[l]) out.push(path(poly(slot([p.a + st, gap - 25], [p.a + st, gap - y1 + 5], 10)), true, 'fine'));
  out.push(path(box(p.a, gap - SG_T, p.a + l, gap), true, 'thin', 'dark'));
  // its two bolts in the SC's slots
  const row = scBoltRow(sc, gap), st = STATIONS[l];
  for (const x of [st[1], st[st.length - 2]]) out.push(path(poly(hex(p.a + x, row, HEAD)), true, 'thin', 'paper'), circle(P(p.a + x, row), 5, 'fine'));
  // the clips over the foot's edges, their bolts through the flange, the nuts behind it
  for (const [side, d] of p.seats) {
    const a = g.u + side * (d - N1.nose), b = g.u + side * (d + N1.heel), u = g.u + side * d;
    over.push(path(box(Math.min(a, b), gap, Math.max(a, b), gap + N1.top), true, 'thin', 'zinc'), line(P(u, gap), P(u, gap + N1.top), 'fine'));
    out.push(path(box(u - 8.5, gap - SG_T - 8, u + 8.5, gap - SG_T), true, 'thin', 'paper'), line(P(u, gap - SG_T - 12), P(u, gap - SG_T), 'fine'));
  }
  if (label) {
    // in the wall's thickness behind the support, from its end nearer the corner toward the middle of the wall
    const I = L.inputs, along = g.wall === 'front' || g.wall === 'rear', len = along ? I.W : I.D, first = 2 * p.s + sc.L < len;
    over.push({ e: 'text', at: P(first ? p.s : p.s + sc.L, -(I.wall - Math.max(0, g.inset)) / 2), text: label, size: TEXT.min, align: first ? 'l' : 'r', halo: true, angle: along ? 0 : 90 });
  }
  return { under: out, over };
}
