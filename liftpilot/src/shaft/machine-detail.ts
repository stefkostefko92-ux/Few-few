// The details of a maker's machine that its drawings and its 3D share (machine-shape-view.ts, components/machine/shape):
// the sheave's spokes, hub and end plate; the drum brake round the parts the shape gives (the drum, the arms, the
// magnet) — the levers with their pivots, the shoes on the drum, the tie rod with its springs —; the bolt circles of the
// turned covers; the ribs on the back of the castings; the motor's end shields. Our own design of each, sized by the
// machine's dimensions: nothing of the maker's geometry. Millimetres of the machine's frame (machine-shape.ts). Pure.
import { partBox, type MachineShape, type ShapePart } from './machine-shape';

export type P2 = readonly [number, number];

/** The sheave at the diameter D, from its axis [mm]: the pitch radius, the rim's inside, the hub, the shaft's end plate
 *  and the circle of its six screws. */
export function sheaveDims(D: number): { R: number; rIn: number; rh: number; plate: number; screws: number } {
  const R = D / 2, rIn = R - Math.max(32, 0.09 * R), rh = Math.max(55, 0.2 * R), plate = 0.62 * rh;
  return { R, rIn, rh, plate, screws: 0.68 * plate };
}

/** Where the three spokes point, seen along the sheave's axis [rad]: one straight up. */
export const SPOKE_ANGLES: readonly number[] = [0, 1, 2].map((k) => Math.PI / 2 + (k * 2 * Math.PI) / 3);

const bezier = (p0: P2, c: P2, p1: P2, t: number): P2 =>
  [(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]];

/** One spoke seen along the sheave's axis, turned to `a`: two edges curved the same way from the hub into the rim,
 *  narrower at the rim; `steps` points per edge. */
export function spokeOutline(D: number, a: number, steps = 12): P2[] {
  const { rIn, rh } = sheaveDims(D), a0 = 0.5 * rh, a1 = 0.32 * rh, bend = 0.14 * (rIn - rh), x0 = 0.7 * rh, x1 = rIn + 6, xm = (x0 + x1) / 2;
  const pts: P2[] = [];
  for (let i = 0; i <= steps; i++) pts.push(bezier([x0, -a0], [xm, -a1 + bend], [x1, -1.6 * a1], i / steps));
  for (let i = 0; i <= steps; i++) pts.push(bezier([x1, 1.6 * a1], [xm, a1 + bend], [x0, a0], i / steps));
  const c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

/** A turned cover's bolt circle: how many screws, on which radius, their heads' size [mm]; null when too small. */
export function coverBolts(r: number): { n: number; at: number; head: number } | null {
  return r > 50 ? { n: r > 80 ? 8 : 6, at: 0.78 * r, head: Math.min(9, 0.06 * r) } : null;
}

/** One lever of the drum brake, on one side of the drum (side +1 at +Z). */
export interface Lever {
  side: 1 | -1;
  /** its outline seen along Z: the pivot's boss at the bottom, widest at the drum's axis, the boss of the tie rod on top */
  outline: P2[];
  /** the lever's plate across Z (its outer face toward ±Z) */
  z0: number;
  z1: number;
  pivot: P2;
  /** the shoe on the drum: its lining's inside at the drum's radius, the half angle it covers */
  shoeHalf: number;
}

export interface BrakeDetail {
  /** the drum: its axis' height, its radius, its span along X */
  y: number;
  r: number;
  x0: number;
  x1: number;
  /** where the levers stand along X, the tie rod's height through their tops and the magnet */
  x: number;
  rodY: number;
  levers: Lever[];
  /** the springs on the tie rod outside each lever, from the lever's face outward [z0, z1] */
  springs: readonly (readonly [number, number])[];
  magnet: ShapePart | null;
}

/** The drum brake of a shape: from its drum, its two arms and its magnet; null without them. */
export function brakeOf(S: MachineShape): BrakeDetail | null {
  const drum = S.parts.find((p): p is Extract<ShapePart, { cyl: 'x' | 'y' | 'z' }> => p.role === 'brake' && 'cyl' in p && p.cyl === 'x');
  const arms = S.parts.filter((p) => p.role === 'arm' && 'box' in p).map(partBox).filter((b) => b[2] > 0 || b[5] < 0);
  if (!drum || arms.length < 2) return null;
  const y = drum.at[0], r = drum.r, magnet = S.parts.find((p) => p.role === 'magnet') ?? null;
  const top = Math.min(...arms.map((b) => b[4])), W = Math.min(...arms.map((b) => b[3] - b[0])), rt = 0.36 * W;
  const mb = magnet ? partBox(magnet) : null, rodY = Math.min(mb ? (mb[1] + mb[4]) / 2 : Infinity, top - rt);
  const levers = arms.map((b): Lever => {
    const side = b[2] > 0 ? 1 : -1, [ax0, ay0, az0, ax1, ay1, az1] = b, xc = (ax0 + ax1) / 2, w = ax1 - ax0, rb = 0.42 * w, rq = 0.36 * w;
    const zin = side > 0 ? az0 : -az1, zout = side > 0 ? az1 : -az0, t = Math.min(26, Math.max(14, 0.25 * (zout - zin)));
    // the outline: up the +X edge from the pivot's boss, out to the shoe's pin at the drum's axis, in to the top's boss
    const right: P2[] = [], n = 8;
    for (let i = 0; i <= n; i++) right.push(bezier([xc + rb, ay0 + rb], [xc + w / 2, (ay0 + rb + y) / 2], [xc + w / 2, y], i / n));
    for (let i = 1; i <= n; i++) right.push(bezier([xc + w / 2, y], [xc + w / 2, (y + ay1 - rq) / 2], [xc + rq, ay1 - rq], i / n));
    const arc = (cy: number, rr: number, a0: number, a1: number): P2[] =>
      Array.from({ length: 9 }, (_, i) => [xc + rr * Math.cos(a0 + ((a1 - a0) * i) / 8), cy + rr * Math.sin(a0 + ((a1 - a0) * i) / 8)] as const);
    const outline: P2[] = [...right, ...arc(ay1 - rq, rq, 0, Math.PI).slice(1), ...right.slice().reverse().map(([px, py]): P2 => [2 * xc - px, py]).slice(1),
      ...arc(ay0 + rb, rb, Math.PI, 2 * Math.PI).slice(1, -1)];
    return { side, outline, z0: Math.abs(zout) - t, z1: Math.abs(zout), pivot: [xc, ay0 + rb], shoeHalf: Math.min(1, Math.max(0.4, Math.acos(Math.min(1, Math.abs(zin) / r)))) };
  });
  const reach = Math.min(45, 0.6 * W);
  return { y, r, x0: drum.span[0], x1: drum.span[1], x: (arms[0][0] + arms[0][3]) / 2, rodY, levers, springs: levers.map((l) => [l.z1, l.z1 + reach] as const), magnet };
}

/** The ribs on the back (−Z) of a casting: vertical plates across a box gearbox, radial ones on an arched one clear of
 *  its rear cover; each [x0, y0, x1, y1] seen along Z, all as deep, standing proud of the face at z. */
export function ribsOf(S: MachineShape, p: ShapePart): { z: number; depth: number; ribs: (readonly [number, number, number, number])[] } | null {
  if (p.role !== 'housing') return null;
  const [x0, y0, z0, x1, y1] = partBox(p), w = x1 - x0, h = y1 - y0;
  if ('box' in p) {
    if (w < 150 || h < 150) return null;
    const n = Math.min(4, Math.max(2, Math.round(w / 110)));
    return { z: z0, depth: 14, ribs: Array.from({ length: n }, (_, i) => {
      const x = x0 + (w * (i + 1)) / (n + 1);
      return [x - 6, y0 + 15, x + 6, y1 - 15] as const;
    }) };
  }
  if (!('prism' in p)) return null;
  // radial plates from the wheel's rear cover out to the arch, the axis at the shape's wheel
  const cover = S.parts.find((q) => q.role === 'cover' && 'cyl' in q && q.cyl === 'z' && partBox(q)[5] <= z0 + 1);
  const r0 = (cover && 'cyl' in cover ? cover.r : 0.25 * w) + 14, r1 = Math.min(y1 - S.yWheel, w / 2) - 12;
  if (r1 - r0 < 40) return null;
  return { z: z0, depth: 16, ribs: [Math.PI / 6, Math.PI / 2, (5 * Math.PI) / 6].map((a) => [r0 * Math.cos(a), S.yWheel + r0 * Math.sin(a), r1 * Math.cos(a), S.yWheel + r1 * Math.sin(a)] as const) };
}

/** The motor's end shields along X: at both ends of a turned frame, a band a little proud of it [x0, x1, radius]. */
export function endShields(p: ShapePart): (readonly [number, number, number])[] {
  if (p.role !== 'motor' || !('cyl' in p) || p.cyl !== 'x') return [];
  const [s0, s1] = p.span, w = Math.min(22, 0.08 * (s1 - s0));
  return [[s0, s0 + w, p.r + 4], [s1 - w, s1, p.r + 4]];
}
