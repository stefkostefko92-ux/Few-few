// A maker's machine drawn as the 3D builds it (machine-shape.ts; machine-detail.ts; components/machine/shape): seen
// along Z with the sheave face-on, and from above. The bedframe of ours under the feet, then everything back to front
// (from above: low to high): the castings with rounded corners and, from above, the ribs on their backs; the turned
// covers with their bolt circles; the motor with its end shields or its fins; the drum brake whole — the drum, the
// levers with their pivots, the tie rod with the springs, the magnet —; the handwheel edge-on; the worm's axis; in front
// the sheave as cast, its rim, three curved spokes and the hub with the shaft's end plate and screws, the openings
// between the spokes showing what stands behind. Millimetres of the machine's frame, the bedframe's underside at y = 0;
// `at` maps them to the drawing. Pure: room-view.ts places it.
import { circle, line, path, type Entity, type FillName, type Pt, type StyleName } from '../drawing';
import { partBox, tilted, type MachineFrame, type ShapePart } from './machine-shape';
import { SPOKE_ANGLES, brakeOf, coverBolts, endShields, ribsOf, sheaveDims, spokeOutline, type BrakeDetail, type P2 } from './machine-detail';

type At = (x: number, y: number) => Pt;

/** A circle of the machine's frame on the drawing, whatever way `at` turns it. */
function ring(at: At, cx: number, cy: number, r: number, st: StyleName | undefined, fill?: FillName): Entity {
  const c = at(cx, cy), e = at(cx + r, cy);
  return circle(c, Math.hypot(e[0] - c[0], e[1] - c[1]), st, fill);
}

/** A rectangle with its corners rounded by rr, as a closed outline. */
function rounded(at: At, x0: number, y0: number, x1: number, y1: number, rr: number): Pt[] {
  const r = Math.max(0, Math.min(rr, (x1 - x0) / 2, (y1 - y0) / 2)), pts: Pt[] = [];
  const corner = (cx: number, cy: number, a0: number): void => {
    for (let i = 0; i <= 4; i++) pts.push(at(cx + r * Math.cos(a0 + (i * Math.PI) / 8), cy + r * Math.sin(a0 + (i * Math.PI) / 8)));
  };
  corner(x1 - r, y0 + r, -Math.PI / 2);
  corner(x1 - r, y1 - r, 0);
  corner(x0 + r, y1 - r, Math.PI / 2);
  corner(x0 + r, y0 + r, Math.PI);
  return pts;
}

const CAST = new Set(['housing', 'base', 'cover', 'pedestal', 'terminal']);

/** The bedframe seen along Z: the beam, the posts down to the mounts when it is tall, the mounts. */
function bedElevation(F: MachineFrame, at: At): Entity[] {
  const out: Entity[] = [], hb = Math.min(120, F.bed - 22), y0 = F.bed - hb, [x0, x1] = F.run;
  const box = (a: number, b: number, c: number, d: number, st: 'outline' | 'thin' = 'outline', fill?: 'cw' | 'steel' | 'paper'): void => {
    out.push(path([at(a, b), at(c, b), at(c, d), at(a, d)], true, st, fill));
  };
  box(x0, y0, x1, F.bed, 'outline', 'cw');
  for (const y of [y0 + 9, F.bed - 9]) out.push(line(at(x0, y), at(x1, y), 'thin'));
  for (const x of F.mounts) {
    if (y0 - 22 > 4) box(x - 40, 22, x + 40, y0);
    box(x - 60, 0, x + 60, 22, 'thin', 'steel');
  }
  return out;
}

/** The part of a line from the hub outward that runs between the radii r0 and r1, cut where it crosses them. */
function between(pts: readonly P2[], r0: number, r1: number): P2[] {
  const out: P2[] = [], rad = (p: P2): number => Math.hypot(p[0], p[1]);
  const cut = (a: P2, b: P2, r: number): P2 => {
    const t = (r - rad(a)) / (rad(b) - rad(a));
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  };
  pts.forEach((p, i) => {
    const q = pts[i - 1], inside = rad(p) >= r0 && rad(p) <= r1;
    if (q && (rad(q) < r0) !== (rad(p) < r0)) out.push(cut(q, p, r0));
    if (q && (rad(q) > r1) !== (rad(p) > r1)) out.push(cut(q, p, r1));
    if (inside) out.push(p);
  });
  return out;
}

/** The sheave face-on at its axis (0, yc): the rim and the spokes filled, the openings left clear; the rim's edges,
 *  the grooves' bottom, the spokes' edges, the hub, the end plate with its screws. */
function sheaveFace(D: number, yc: number, at: At): Entity[] {
  const { R, rIn, rh, plate, screws } = sheaveDims(D), out: Entity[] = [], N = 96;
  const round = (r: number, from = 0, rev = false): Pt[] => Array.from({ length: N + 1 }, (_, i) => {
    const a = from + ((rev ? -1 : 1) * 2 * Math.PI * i) / N;
    return at(r * Math.cos(a), yc + r * Math.sin(a));
  });
  // the rim's ring as one outline, out round the rim and back round its inside: filled, no edge of its own
  out.push(path([...round(R + 6), ...round(rIn, 0, true)], true, undefined, 'paper'));
  const spokes = SPOKE_ANGLES.map((a) => spokeOutline(D, a)), P = ([x, y]: P2): Pt => at(x, yc + y);
  for (const s of spokes) out.push(path(s.map(P), true, undefined, 'paper'));
  out.push(ring(at, 0, yc, R + 6, 'outline'), ring(at, 0, yc, R - 6, 'thin'), ring(at, 0, yc, rIn, 'outline'));
  // the spokes' two edges from the hub to the rim's inside
  for (const s of spokes) {
    const half = s.length / 2;
    for (const edge of [s.slice(0, half), s.slice(half).reverse()]) {
      const e = between(edge, rh, rIn);
      if (e.length > 1) out.push(path(e.map(P), false, 'outline'));
    }
  }
  out.push(ring(at, 0, yc, rh, 'outline', 'paper'), ring(at, 0, yc, plate, 'thin', 'steel'));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 2 * Math.PI + Math.PI / 6;
    out.push(ring(at, screws * Math.cos(a), yc + screws * Math.sin(a), 0.07 * plate, 'thin'));
  }
  return out;
}

/** What stands in the drawing at a depth: drawn from the deepest. */
type Layer = { z: number; draw: () => void };

/** The drum brake seen along Z: the levers' outlines with their pivots, the tie rod's springs end-on; the lever behind
 *  the drum first, the one in front after it. */
function brakeLayers(B: BrakeDetail, Y: At, out: Entity[]): Layer[] {
  const rs = Math.min(22, Math.max(14, 0.35 * (B.springs[0][1] - B.springs[0][0])));
  return B.levers.map((L): Layer => ({
    z: L.side * L.z1,
    draw: () => {
      out.push(path(L.outline.map(([x, y]) => Y(x, y)), true, 'outline', 'paper'), ring(Y, L.pivot[0], L.pivot[1], 9, 'thin', 'steel'));
      out.push(ring(Y, B.x, B.rodY, rs, 'thin'), ring(Y, B.x, B.rodY, 8, 'thin', 'steel'));
    },
  }));
}

/** The machine seen along Z (the sheave face-on, toward +Z): the bedframe, the parts from the back, the sheave. */
export function shapeElevation(F: MachineFrame, D: number, at: At): Entity[] {
  const S = F.shape;
  if (!S) return [];
  const out = bedElevation(F, at), y = (v: number): number => v + F.bed, Y: At = (px, py) => at(px, y(py));
  // the brake's levers stand in for its arms; the rest of the parts as they are
  const B = brakeOf(S), lever = (p: ShapePart): boolean => B !== null && p.role === 'arm' && (partBox(p)[2] > 0 || partBox(p)[5] < 0);
  const turned = (p: ShapePart): At => (p.tilt ? (px, py) => Y(...tilted(p.tilt, px, py)) : Y);
  const layers: Layer[] = S.parts.filter((p) => !lever(p)).map((p) => ({ z: partBox(p)[5], draw: () => drawElevation(p, turned(p), out) }));
  if (B) layers.push(...brakeLayers(B, Y, out));
  for (const l of layers.sort((a, b) => a.z - b.z)) l.draw();
  // the worm's (and the motor's) axis along the machine, inclined with the parts on it; a vertical worm's upright
  const b = partBox(S.parts[0]), xs = S.parts.map(partBox), lo = Math.min(b[0], ...xs.map((q) => q[0])) - 25, hi = Math.max(b[3], ...xs.map((q) => q[3])) + 25;
  const t = S.parts.find((p) => p.tilt)?.tilt;
  if (S.wormX !== undefined) out.push(line(Y(S.wormX, S.yWheel - 60), Y(S.wormX, Math.max(...xs.map((q) => q[4])) + 25), 'axis'));
  else if (t) {
    const along = S.parts.filter((p) => p.tilt).map((p) => [p, partBox({ ...p, tilt: undefined })] as const), x1 = Math.max(...along.map(([, q]) => q[3])) + 25;
    out.push(line(Y(...tilted(t, lo, t.at[1])), Y(...tilted(t, x1, t.at[1])), 'axis'));
  } else out.push(line(Y(lo, S.yWorm), Y(hi, S.yWorm), 'axis'));
  out.push(...sheaveFace(D, y(S.yWheel), at));
  return out;
}

function drawElevation(p: ShapePart, at: At, out: Entity[]): void {
  const steel = p.role === 'brake' || p.role === 'shaft' || p.role === 'magnet', fill: FillName = steel ? 'steel' : 'paper';
  if ('prism' in p) {
    out.push(path(p.prism.map(([px, py]) => at(px, py)), true, 'outline', 'paper'));
    return;
  }
  if ('box' in p) {
    const [x0, y0, , x1, y1] = p.box, rr = CAST.has(p.role) ? Math.min(14, 0.1 * Math.min(x1 - x0, y1 - y0)) : 0;
    out.push(path(rr > 0 ? rounded(at, x0, y0, x1, y1, rr) : [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)], true, 'outline', fill));
    if (p.role === 'motor') for (let v = y0 + 28; v < y1 - 10; v += 28) out.push(line(at(x0 + 10, v), at(x1 - 10, v), 'fine'));
    if (p.role === 'terminal') out.push(line(at(x0 + 4, y1 - 12), at(x1 - 4, y1 - 12), 'thin'));
    return;
  }
  const [a, b] = p.at, r = p.r, [s0, s1] = p.span;
  if (p.cyl === 'z') {
    out.push(ring(at, a, b, r, 'outline', fill));
    const bc = p.role === 'cover' ? coverBolts(r) : null;
    if (bc) {
      out.push(ring(at, a, b, 0.5 * r, 'thin'));
      for (let i = 0; i < bc.n; i++) {
        const t = (i / bc.n) * 2 * Math.PI + Math.PI / bc.n;
        out.push(ring(at, a + bc.at * Math.cos(t), b + bc.at * Math.sin(t), bc.head, 'thin'));
      }
    }
    return;
  }
  if (p.cyl === 'y') {
    if (p.role === 'eye') {
      out.push(path([at(a - r, s0), at(a + r, s0), at(a + r, s0 + 12), at(a - r, s0 + 12)], true, 'thin'));
      out.push(ring(at, a, s1 - (s1 - s0 - 12) / 2, (s1 - s0 - 12) / 2, 'thin'));
    } else out.push(path([at(a - r, s0), at(a + r, s0), at(a + r, s1), at(a - r, s1)], true, 'outline', fill));
    return;
  }
  out.push(path([at(s0, a - r), at(s1, a - r), at(s1, a + r), at(s0, a + r)], true, 'outline', fill));
  // a turned frame's end shields; a cover's flange edge toward its bolts; the handwheel edge-on
  for (const [e0, e1, rr] of endShields(p)) out.push(path([at(e0, a - rr), at(e1, a - rr), at(e1, a + rr), at(e0, a + rr)], true, 'outline', 'paper'));
  if (p.role === 'cover' && coverBolts(r) && s1 - s0 > 14) out.push(line(at(s1 - 6, a - r), at(s1 - 6, a + r), 'thin'));
  if (p.role === 'handwheel') out.push(line(at((s0 + s1) / 2, a - r), at((s0 + s1) / 2, a + r), 'thin'));
}

/** The machine from above (toward −Y): the bedframe's beams, the parts from the lowest with the ribs on the castings'
 *  backs, the brake's levers and springs, the sheave with its grooves, the worm's axis, the feet's holes (seen through
 *  the base when it has one; hidden under a compact gearbox). */
export function shapePlan(F: MachineFrame, D: number, n: number, d: number, at: (x: number, z: number) => Pt): Entity[] {
  const S = F.shape;
  if (!S) return [];
  const out: Entity[] = [], quad = (x0: number, z0: number, x1: number, z1: number, st: 'outline' | 'thin' | 'hidden' = 'outline', fill?: FillName): void => {
    out.push(path([at(x0, z0), at(x1, z0), at(x1, z1), at(x0, z1)], true, st, fill));
  };
  for (const z of F.beams) quad(F.run[0], z - 35, F.run[1], z + 35, 'outline', 'cw');
  for (const x of [F.run[0], F.run[1] - 70]) quad(x, F.beams[0] + 35, x + 70, F.beams[F.beams.length - 1] - 35, 'thin', 'cw');
  const B = brakeOf(S);
  const low = [...S.parts].sort((a, b) => partBox(a)[4] - partBox(b)[4]);
  for (const p of low) {
    const [x0, , z0, x1, , z1] = partBox(p), steel = p.role === 'brake' || p.role === 'shaft' || p.role === 'magnet';
    if ('cyl' in p && p.cyl === 'y') {
      out.push(ring(at, p.at[0], p.at[1], p.r, 'outline', 'paper'));
      continue;
    }
    // the levers as their plates seen from above
    if (B && p.role === 'arm' && (z0 > 0 || z1 < 0)) {
      const L = B.levers.find((l) => l.side === (z0 > 0 ? 1 : -1));
      if (L) quad(x0, L.side * L.z0, x1, L.side * L.z1, 'outline', 'paper');
      continue;
    }
    quad(x0, z0, x1, z1, 'outline', steel ? 'steel' : 'paper');
    if (p.role === 'motor' && 'box' in p) for (let z = z0 + 24; z < z1 - 10; z += 24) out.push(line(at(x0 + 10, z), at(x1 - 10, z), 'fine'));
    if (!p.tilt) for (const [e0, e1, rr] of endShields(p)) quad(e0, -rr, e1, rr, 'outline', 'paper');
    const ribs = ribsOf(S, p);
    for (const [a, , c] of ribs?.ribs ?? []) if (ribs) quad(Math.min(a, c) - 6, ribs.z - ribs.depth, Math.max(a, c) + 6, ribs.z, 'thin', 'paper');
  }
  if (B) {
    // the tie rod across the levers' tops, the springs outside them as coils seen from above
    const reach = Math.max(...B.springs.map((s) => s[1]));
    out.push(line(at(B.x, -reach - 26), at(B.x, reach + 26), 'thin'));
    B.springs.forEach(([a, b], i) => {
      const s = B.levers[i].side, rs = Math.min(22, Math.max(14, 0.35 * (b - a))), turns = 6, pts: Pt[] = [];
      for (let k = 0; k <= 2 * turns; k++) pts.push(at(B.x + (k % 2 ? rs : -rs), s * (a + ((b - a) * k) / (2 * turns))));
      out.push(path(pts, false, 'thin'));
    });
  }
  const base = S.parts.some((p) => p.role === 'base');
  for (const [hx, hz] of S.holes) out.push(ring(at, hx, hz, 11, base ? 'thin' : 'hidden'));
  // the worm's axis along the machine
  const xs = S.parts.map(partBox);
  out.push(line(at(Math.min(...xs.map((q) => q[0])) - 25, 0), at(Math.max(...xs.map((q) => q[3])) + 25, 0), 'axis'));
  // the sheave over the side: its rim and the grooves of the ropes
  const R = F.zSheave, half = F.width / 2, rs = D / 2 + 6, pitch = Math.min(Math.max(d + 6, 1.7 * d), (F.width - 12) / n);
  quad(-rs, R - half, rs, R + half, 'outline', 'steel');
  for (let i = 0; i < n; i++) {
    const z = R - (n * pitch) / 2 + pitch * (i + 0.5);
    out.push(line(at(-rs + 6, z), at(rs - 6, z), 'fine'));
  }
  return out;
}

