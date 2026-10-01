// Panev's support of a counterweight rail seen from above, from the catalogue's outlines (staffe.ts) as the 3D builds
// it: the anchors through the flange's slots into the wall (below the plate: hidden), the galvanized plate folded off
// the flange's top with the two slots of its arm and the apron folded down along it, the SG laid on the arm with its
// slots and its flange seen edge-on behind the rail's foot, the two bolts holding the SG, the two N1 clips over the
// foot's edges with their bolts through the flange and the nuts behind it; and, on the first rail, its catalogue code
// with the count per rail (brackets.ts). Null when the design uses generic brackets or no support of the catalogue
// takes the rail (then the check v_staffa says so). A generic bracket as the 3D's railfix.ts builds it: the plate
// behind the foot with its two clips, one angle out to the wall (two bolted together past 150 mm), the wall plate and
// its anchors.
import { circle, line, path, type Entity, type Pt } from '../drawing';
import { bracketCount, railSpan } from './brackets';
import { cwNiche } from './niche';
import { onWall } from './plan-walls';
import { GENERIC_BRACKET as GB, RAILS, railClip } from './rails';
import { section } from './section';
import { N1, PLATES, SG_T, STATIONS, cwBracketsOf, cwSupport, seatRail, supportCode } from './staffe';
import type { HeadWalls, Layout, Rail, Wall } from './types';

const SHEET = 5, SG_W = 80, ANCHOR = 12, HEAD = 9.8;

/** How far along its wall the bracket of a counterweight rail reaches [mm in the wall's own u]: Panev's plate with
 *  its SG and clips, or a generic bracket as wide as the rail's foot and its clips. */
export function bracketSpan(L: Layout, r: Rail): { wall: Wall; u0: number; u1: number } | null {
  const I = L.inputs, s = RAILS[I.cwRail], n = cwNiche(I, L.cwSide);
  if (r.kind !== 'cw') return null;
  const g = cwBracketsOf(I) === 'panev' ? cwSupport(r, s.h, I.W, I.D, n ? [n.at, n.at + n.width] : undefined) : null;
  if (!g) {
    const wall: Wall = L.cwSide, along = wall === 'rear' ? r.x : r.y;
    return { wall, u0: along - s.b / 2 - 40, u1: along + s.b / 2 + 40 };
  }
  const k = PLATES[g.sup.kind], sx = g.mirror ? -1 : 1, u0 = g.foot - sx * k.arm[1], ends = [u0, u0 + sx * k.flange, u0 + sx * (k.arm[1] + N1.top)];
  return { wall: g.wall, u0: Math.min(...ends), u1: Math.max(...ends) };
}

/** A slot from (x0, y) to (x1, y) or (x, y0) to (x, y1), w wide, as a closed outline in the part's frame. */
function slot(a: readonly [number, number], b: readonly [number, number], w: number): [number, number][] {
  const r = w / 2, dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, out: [number, number][] = [];
  for (const [c, a0] of [[b, -Math.PI / 2], [a, Math.PI / 2]] as const) {
    for (let i = 0; i <= 6; i++) {
      const t = Math.atan2(uy, ux) + a0 + (i / 6) * Math.PI;
      out.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]);
    }
  }
  return out;
}

/** A hexagon of circumradius r round (x, y), a flat side along x. */
const hex = (x: number, y: number, r: number): [number, number][] => Array.from({ length: 6 }, (_, i) => [x + r * Math.cos((i * Math.PI) / 3), y + r * Math.sin((i * Math.PI) / 3)]);

/** A bracket's parts under the rail and over it (the clips on the foot's edges). */
export interface BracketPlan {
  under: Entity[];
  over: Entity[];
}

export function panevSupportPlan(L: Layout, r: Rail, label: boolean, head?: HeadWalls): BracketPlan | null {
  const I = L.inputs, s = RAILS[I.cwRail], n = cwNiche(I, L.cwSide);
  if (r.kind !== 'cw' || cwBracketsOf(I) !== 'panev') return null;
  const g = cwSupport(r, s.h, I.W, I.D, n ? [n.at, n.at + n.width] : undefined, head);
  if (!g) return null;
  // the support's frame: x along the wall from its flange's end, y out from the wall's face
  const k = PLATES[g.sup.kind], xf = k.arm[1], sx = g.mirror ? -1 : 1, u0 = g.foot - sx * xf, Lp = g.sup.Lp;
  const P = (x: number, y: number): Pt => onWall(L, g.wall, u0 + sx * x, y - g.inset);
  const poly = (pts: readonly (readonly [number, number])[]): Pt[] => pts.map(([x, y]) => P(x, y));
  const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  const out: Entity[] = [], over: Entity[] = [];
  // the anchors in the flange's slots, into the wall
  for (const [a, b] of k.slots) out.push(path(box((a + b) / 2 - ANCHOR / 2, -70, (a + b) / 2 + ANCHOR / 2, 0), true, 'hidden'));
  // the plate with the slots of its arm, the apron's inner face along the arm, the flange's line under the plate
  out.push(path(poly(k.outline(Lp)), true, 'outline', 'zinc'));
  out.push(line(P(0, SHEET), P(k.flange, SHEET), 'hidden'));
  out.push(line(P(xf - SHEET, 2 * SHEET + 3), P(xf - SHEET, Lp), 'fine'));
  const xc = (k.arm[0] + k.arm[1]) / 2, mid = (Lp + 15) / 2;
  for (const [s0, s1] of [[25, mid - 5], [mid + 5, Lp - 10]]) out.push(path(poly(slot([xc, s0], [xc, s1], 10)), true, 'fine'));
  // the SG on the arm where the rail sits on it (as the 3D seats it): its slots across, its flange edge-on
  const l = g.sup.sg, far = g.reach > (g.sup.range[0] + g.sup.range[1]) / 2, { c, seats } = seatRail(l, far ? l : 0, 0, g.reach - 10, s.b / 2), y0 = g.reach - c;
  out.push(path(box(xf - SG_W, y0, xf, y0 + l), true, 'thin', 'zinc'));
  for (const st of STATIONS[l]) out.push(path(poly(slot([xf - SG_W + 20, y0 + st], [xf - 10, y0 + st], 10)), true, 'fine'));
  out.push(path(box(xf - SG_T, y0, xf, y0 + l), true, 'thin', 'dark'));
  // the two bolts of the SG over the arm's slots
  for (const [s0, s1] of [[30, mid - 10], [mid + 10, Lp - 15]]) {
    const at = STATIONS[l].map((st) => y0 + st).find((v) => v >= s0 && v <= s1);
    if (at !== undefined) out.push(path(poly(hex(xc, at, HEAD)), true, 'thin', 'paper'), circle(P(xc, at), 5, 'fine'));
  }
  // the clips over the foot's edges, their bolts through the flange, the nuts behind it
  for (const [side, d] of seats) {
    const a = g.reach + side * (d - N1.nose), b = g.reach + side * (d + N1.heel), y = g.reach + side * d;
    over.push(path(box(xf, Math.min(a, b), xf + N1.top, Math.max(a, b)), true, 'thin', 'zinc'), line(P(xf, y), P(xf + N1.top, y), 'fine'));
    out.push(path(box(xf - SG_T - 8, y - 8.5, xf - SG_T, y + 8.5), true, 'thin', 'paper'), line(P(xf - SG_T - 12, y), P(xf - SG_T, y), 'fine'));
  }
  if (label) {
    // the code and the count per rail, along the wall in its thickness behind the support (clear of what runs)
    const [z0, z1] = railSpan(section(L)), behind = (I.wall - Math.max(0, g.inset)) / 2, along = g.wall === 'front' || g.wall === 'rear';
    // from the support's end nearer the corner, toward the middle of the wall
    const ends = [u0, u0 + sx * k.flange], lo = Math.min(...ends), hi = Math.max(...ends), first = lo + hi < 2 * (along ? I.W : I.D) / 2;
    over.push({ e: 'text', at: P(((first ? lo : hi) - u0) / sx, -behind), text: `${bracketCount(z1 - z0)}× ${supportCode(g.sup)} + SG 80 ${l}`,
      size: 1.6, align: first ? 'l' : 'r', halo: true, angle: along ? 0 : 90 });
  }
  return { under: out, over };
}

/** A generic bracket of a rail seen from above, reaching the wall (or the bridge) at the rail's bracketTo. */
export function genericBracketPlan(L: Layout, r: Rail): BracketPlan {
  const type = r.kind === 'car' ? L.inputs.carRail : L.inputs.cwRail, { b, h } = RAILS[type], clip = railClip(type), half = b / 2, outer = half + clip.reach;
  const [dx, dy] = r.dir === 'right' ? [1, 0] : r.dir === 'left' ? [-1, 0] : r.dir === 'back' ? [0, 1] : [0, -1], fx = r.x - dx * h, fy = r.y - dy * h;
  // the rail's frame: a along the blade from the back of the foot, c across it
  const at = (a: number, c: number): Pt => [fx + dx * a - dy * c, fy + dy * a + dx * c];
  const box = (a0: number, c0: number, a1: number, c1: number): Pt[] => [at(a0, c0), at(a1, c0), at(a1, c1), at(a0, c1)];
  const out: Entity[] = [path(box(-GB.plate, -outer, 0, outer), true, 'thin', 'zinc')], over: Entity[] = [];
  for (const sc of [-1, 1]) {
    const c = sc * (half + clip.shank);
    over.push(path(box(0, sc * (half - 6), 8, sc * (outer - 2)), true, 'thin', 'zinc'));
    out.push(path(box(-GB.plate - 0.8 * clip.bolt, c - 0.85 * clip.bolt, -GB.plate, c + 0.85 * clip.bolt), true, 'thin', 'paper'));
  }
  // out to the wall: straight back from the plate (the wall behind the foot) or beside the foot (the wall across it)
  const toWall = r.bracketAxis === 'x' ? r.bracketTo - fx : r.bracketTo - fy, along = r.bracketAxis === 'x' ? Math.abs(dx) > 0.5 : Math.abs(dy) > 0.5;
  const arm = (e: readonly [number, number], n: readonly [number, number], s0: number, reach: number, q0: number): void => {
    const sq = (s: number, q: number): Pt => at(e[0] * s + n[0] * (q0 + q), e[1] * s + n[1] * (q0 + q));
    const piece = (s1: number, s2: number, q1: number, q2: number, fill: 'zinc' | 'dark'): void => {
      out.push(path([sq(s1, q1), sq(s2, q1), sq(s2, q2), sq(s1, q2)], true, 'thin', fill));
    };
    const end = s0 + reach - GB.wallPlate;
    let plate: readonly [number, number] = [-80, 80];
    if (reach <= GB.onePiece) {
      piece(s0, end, -45, 45, 'zinc');
      piece(s0, end, 37, 45, 'dark');
    } else {
      const mid = s0 + reach / 2;
      piece(s0, mid + 40, -45, 37, 'zinc');
      piece(s0, mid + 40, 29, 37, 'dark');
      piece(mid - 40, end, 37, 121, 'zinc');
      piece(mid - 40, end, 37, 45, 'dark');
      for (const sb of [mid - 22, mid + 22]) out.push(circle(sq(sb, 41), 9, 'thin', 'paper'));
      plate = [-45, 121];
    }
    piece(end, end + GB.wallPlate, plate[0], plate[1], 'zinc');
    const qc = (plate[0] + plate[1]) / 2;
    for (const q of [qc - 56, qc + 56]) out.push(path([sq(end + GB.wallPlate, q - 6), sq(end + GB.wallPlate + 70, q - 6), sq(end + GB.wallPlate + 70, q + 6), sq(end + GB.wallPlate, q + 6)], true, 'hidden'));
  };
  if (along) {
    const a1 = toWall * (r.bracketAxis === 'x' ? dx : dy);
    if (Math.abs(a1) > 12) arm([a1 < 0 ? -1 : 1, 0], [0, 1], GB.plate, Math.abs(a1) - GB.plate, 0);
  } else {
    const c1 = toWall * (r.bracketAxis === 'x' ? -dy : dx);
    if (Math.abs(c1) > outer) arm([0, c1 < 0 ? -1 : 1], [-1, 0], 0, Math.abs(c1), 55);
  }
  return { under: out, over };
}
