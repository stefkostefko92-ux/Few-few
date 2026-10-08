// A maker's geared machine as the drawings and the 3D build it: its parts as boxes, cylinders and outlines extruded
// across, sized by the maker's dimensions — the technical sheet (the sheave's axis over the feet, the feet and their
// holes, the sheave's mid-plane P and width E by diameter, the overall sizes) and the CAD model the maker publishes
// (where the gearbox, the motor, the brake and the handwheel stand), rounded to the millimetre. Dimensions only: the
// shapes are ours, no geometry of the maker's is kept. The machine stands on a bedframe of ours whose height keeps the
// sheave's axis where the generic machine has it, when the machine allows: three irons on top, one under each row of
// holes and, when no row (an outboard support's) stands past the sheave, a third past it — the sheave between the irons,
// so the rope load acts between the frame's supports and nothing tips it —, anti-vibration mounts at their ends.
// Millimetres, the machine's own frame: X along the worm from the sheave's axis (+X toward the motor), Y up from the
// feet's plane, Z along the sheave's axis from the worm's vertical plane (+Z toward the sheave). Pure.
import { MACHINE_A, MACHINE_X, MACHINE_Z } from './machine-outline';
import { KV_VERT } from './norme-vert';

/** What a part is: it sets how the drawings and the 3D finish it (cast and painted, turned, finned, yellow). */
export type ShapeRole = 'base' | 'housing' | 'cover' | 'shaft' | 'motor' | 'brake' | 'arm' | 'magnet' | 'handwheel' | 'terminal' | 'pedestal' | 'eye';

/** x0, y0, z0, x1, y1, z1 */
export type Box6 = readonly [number, number, number, number, number, number];

/** The parts of an inclined worm (Sassi's LEO, TORO): built along X at the pivot's height, then turned about Z by `a`
 *  (rad, counter-clockwise with +X to the right and +Y up) round the pivot `at` [x, y]. */
export interface Tilt { a: number; at: readonly [number, number] }

export type ShapePart =
  | { role: ShapeRole; box: Box6; tilt?: Tilt }
  /** a cylinder along an axis: `at` its centre in the other two axes in order (x: y, z; y: x, z; z: x, y) */
  | { role: ShapeRole; cyl: 'x' | 'y' | 'z'; at: readonly [number, number]; r: number; span: readonly [number, number]; tilt?: Tilt }
  /** an outline in X, Y extruded across Z */
  | { role: ShapeRole; prism: readonly (readonly [number, number])[]; span: readonly [number, number]; tilt?: Tilt };

export interface MachineShape {
  brand: string;
  model: string;
  /** the sheave's axis and the worm's (the motor's) over the feet's plane */
  yWheel: number;
  yWorm: number;
  /** [D, P, E] of the sheet's table (conventional single wrap): the sheave's diameter, its mid-plane, its width */
  sheaves: readonly (readonly [number, number, number])[];
  /** the feet in plan [x0, z0, x1, z1], their holes [x, z] and what the holes are ('Ø24', 'M20') */
  feet: readonly [number, number, number, number];
  holes: readonly (readonly [number, number])[];
  hole: string;
  parts: readonly ShapePart[];
  /** the overall sizes the sheet dimensions: left of the sheave's axis, from it to the motor's end (the largest motor),
   *  the height over the feet */
  overall: readonly [number, number, number];
  src: string;
  /** the worm's axis not dimensioned on the sheet: measured on the scaled drawing (the relazione says so) */
  wormScaled?: true;
  /** a vertical worm (SICOR SV110): its axis upright at this x from the sheave's axis (yWorm: where it meets the wheel) */
  wormX?: number;
  /** the overall height not dimensioned on the sheet: measured on the scaled drawing */
  heightScaled?: true;
  /** the sheave's width E not dimensioned on the sheet: measured on the scaled drawing */
  sheaveScaled?: true;
  /** the model whose sheet gives the body and the sheave's width, where this model's own sheet dimensions only its
   *  differences (GEM HW140CL: the HW140C's) */
  bodyFrom?: string;
  /** the castings' enamel when it is not black: the maker's colour, as its photos show it (Montanari's blue, Sassi's
   *  grey-blue, GEM's navy) */
  paint?: 'blue' | 'grey-blue' | 'navy';
}

/** The sheave's mid-plane P and width E for the diameter D: the sheet's row nearest D. */
export function sheaveOf(S: MachineShape, D: number): { P: number; E: number } {
  let best = S.sheaves[0];
  for (const r of S.sheaves) if (Math.abs(r[0] - D) < Math.abs(best[0] - D)) best = r;
  return { P: best[1], E: best[2] };
}

/** Where a point of a tilted part stands in the machine's frame [x, y]. */
export function tilted(t: Tilt | undefined, x: number, y: number): [number, number] {
  if (!t) return [x, y];
  const c = Math.cos(t.a), s = Math.sin(t.a), dx = x - t.at[0], dy = y - t.at[1];
  return [t.at[0] + dx * c - dy * s, t.at[1] + dx * s + dy * c];
}

/** A part's bounds before its tilt. */
function ownBox(p: ShapePart): Box6 {
  if ('box' in p) return p.box;
  if ('prism' in p) {
    const xs = p.prism.map((q) => q[0]), ys = p.prism.map((q) => q[1]);
    return [Math.min(...xs), Math.min(...ys), p.span[0], Math.max(...xs), Math.max(...ys), p.span[1]];
  }
  const [a, b] = p.at, r = p.r, [s0, s1] = p.span;
  if (p.cyl === 'x') return [s0, a - r, b - r, s1, a + r, b + r];
  if (p.cyl === 'y') return [a - r, s0, b - r, a + r, s1, b + r];
  return [a - r, b - r, s0, a + r, b + r, s1];
}

/** A part's bounds (a tilted one's round its turned outline seen along Z). */
export function partBox(p: ShapePart): Box6 {
  const b = ownBox(p);
  if (!p.tilt) return b;
  const pts = [[b[0], b[1]], [b[3], b[1]], [b[3], b[4]], [b[0], b[4]]].map(([x, y]) => tilted(p.tilt, x, y));
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  return [Math.min(...xs), Math.min(...ys), b[2], Math.max(...xs), Math.max(...ys), b[5]];
}

/** The bounds of the body (the parts, not the sheave). */
export function bodyBox(S: MachineShape): Box6 {
  const bs = S.parts.map(partBox), lo = (i: number): number => Math.min(...bs.map((b) => b[i])), hi = (i: number): number => Math.max(...bs.map((b) => b[i]));
  return [lo(0), lo(1), lo(2), hi(3), hi(4), hi(5)];
}

/** Our bedframe's height under the maker's feet at the sheave D: what the machine needs and no more — at least
 *  KV_VERT.machineBed, the sheave's rim and what hangs under the feet (Sassi's LEO: the end of its inclined worm, the
 *  brake and the flywheel) KV_VERT.machineRimClear over the bedframe's underside. Its irons are as tall as that on
 *  their mounts: never on posts. */
export const bedOf = (S: MachineShape, D: number): number =>
  Math.ceil(Math.max(KV_VERT.machineBed, D / 2 + KV_VERT.machineRimClear - S.yWheel, KV_VERT.machineRimClear - bodyBox(S)[1]) - 1e-9);

/** Our riser under the maker's feet on the irons of our bedplate with the diverting pulley: as high as keeps what hangs
 *  under the feet's plane (Sassi's LEO: the end of its inclined worm with the handwheel; TORO: its brake) KV_VERT.
 *  machineRimClear over the irons — the handwheel free for the manual emergency operation; 0 when nothing hangs there. */
export const padOf = (S: MachineShape): number => (bodyBox(S)[1] < 0 ? Math.ceil(KV_VERT.machineRimClear - bodyBox(S)[1] - 1e-9) : 0);

/** Where the machine is, as the room's drawings and the 3D place it [mm]. */
export interface MachineFrame {
  /** the sheave's axis over the underside of the bedplate (where the machine stands on its support) */
  axis: number;
  /** the sheave's mid-plane and width across */
  zSheave: number;
  width: number;
  /** the bedplate along X, end to end; the machine across Z, from its far side to the sheave's outer face or past it
   *  to an outboard support's feet */
  x: readonly [number, number];
  z: readonly [number, number];
  /** our bedframe along X: as `x`, but stopping short of what hangs under the feet past their ends (Sassi's LEO: its
   *  inclined brake and flywheel overhang it), and with the irons round the sheave reaching past its rope falls */
  run: readonly [number, number];
  /** the anti-vibration mounts along X, at the ends of each iron; the frame's irons across Z, in order: three, the sheave
   *  between the last two (the generic bedplate's two I-beams under the gearbox and one past the sheave; under a maker's
   *  rows of holes and past the sheave when no row stands there) — beside the shaft below, the sheave through the wall,
   *  the machine's own only */
  mounts: readonly [number, number];
  beams: readonly number[];
  /** a concrete plinth under the bedplate across Z: a block under the irons on each side of the sheave's band, where its
   *  ropes go down */
  plinth: readonly (readonly [number, number])[];
  /** the height under the maker's feet over what the machine stands on (0: the generic machine, whose bedplate is its
   *  own) */
  bed: number;
  /** what the maker's feet stand on: our bedframe (`frame`: an iron under each row and past the sheave, as tall as the
   *  frame less its mounts — never on posts), the irons of the bedplate with the diverting pulley (`bedplate`: its beams
   *  under them, rinvio.ts; no frame of its own, `bed` 0), on those irons our welded riser under the feet when something
   *  hangs under the feet's plane (`pad`: Sassi's LEO, its inclined worm's handwheel and brake — `bed` as high as keeps
   *  them KV_VERT.machineRimClear over the irons, padOf) or the maker's pedestal on the maker's bedplate (`pedestal`,
   *  `bed` high, as the maker draws it); the generic machine on its own bedplate (`frame`) */
  on: 'frame' | 'bedplate' | 'pad' | 'pedestal';
  /** the gearbox's face toward the sheave across Z: a slow shaft longer than the machine's runs from there */
  face: number;
  shape: MachineShape | null;
  /** the generic machine's scale on its Ø 560 */
  s: number;
}

/** The flange width of our bedframe's channels and of the generic bedplate's I-beams at Ø 560 [mm], as the drawings and
 *  the 3D draw them. */
export const IRON = 70;

/** The third iron past the sheave (mid-plane P, width E) of a frame whose row nearest before it is `near`, its flange
 *  `half` wide each side: as far past the sheave as that row stands before it (where the makers' outboard supports
 *  stand), its flange at least KV_VERT.machineIronClear clear of the sheave's outer face. */
const ironPast = (near: number, P: number, E: number, half: number): number => Math.max(2 * P - near, P + E / 2 + KV_VERT.machineIronClear + half);

/** The machine of the sheave D: the generic one scaled to it, or the maker's `S` on our bedframe (bedOf) or, on the
 *  bedplate with the diverting pulley (rinvio.ts), `seat` over its top — 0 on ours, the feet on its irons; the maker's
 *  pedestal on the maker's. `through`: the sheave reaches through a wall (the machine below beside the shaft), no iron
 *  past it. */
export function machineFrame(D: number, S: MachineShape | null, seat: number | null = null, through = false): MachineFrame {
  const s = D / (2000 * MACHINE_A.rp);
  if (!S) {
    // the generic bedplate (machine-outline.ts): its I-beams at ±160 under the gearbox, the third past the sheave at 520
    // (Ø 560: as far past its plane at 340 as the near one is before it, as ironPast; its flange 95 clear of the sheave),
    // the cross members 40 past the outer ones
    const x: [number, number] = [MACHINE_X[0] * 1000 * s, MACHINE_X[1] * 1000 * s], P = MACHINE_A.zSheave * 1000 * s, E = 100 * s;
    const beams = through ? [-160 * s, 160 * s] : [-160 * s, 160 * s, 520 * s];
    return { axis: MACHINE_A.yWheel * 1000 * s, zSheave: P, width: E, x, run: x,
      z: [MACHINE_Z[0] * 1000 * s, through ? MACHINE_Z[1] * 1000 * s : 560 * s], mounts: [-360 * s, 950 * s], beams,
      plinth: plinthOf(beams, P - E / 2 - 20, P + E / 2 + 20), bed: 0, on: 'frame', face: 200 * s, shape: null, s };
  }
  // on our bedplate's irons (seat 0) a riser when something hangs under the feet (padOf)
  const pad = seat === 0 ? padOf(S) : 0, b = bodyBox(S), bed = seat === null ? bedOf(S, D) : seat + pad, ov = KV_VERT.machineBedOverhang, half = IRON / 2;
  const { P, E } = sheaveOf(S, D), on: MachineFrame['on'] = seat === null ? 'frame' : seat > 0 ? 'pedestal' : pad > 0 ? 'pad' : 'bedplate';
  // an iron under each row of holes, and past the sheave a third when no row (an outboard support's) stands there
  const rows = [...new Set(S.holes.map((h) => h[1]))].sort((a, c) => a - c), near = rows.filter((z) => z < P);
  const beams = through || !near.length || rows.some((z) => z > P) ? rows : [...rows, ironPast(near[near.length - 1], P, E, half)];
  // the bedframe ends 20 mm short of a part hanging under the feet past their ends; with the irons round the sheave its
  // cross members at the ends stand past the rope falls (the sheave's rim, D/2 + 6) by KV_VERT.machineIronClear, the
  // ropes going down inside it
  const hang = S.parts.map(partBox).filter((q) => q[1] < 0), past = hang.filter((q) => q[0] >= S.feet[2]), before = hang.filter((q) => q[3] <= S.feet[0]);
  const x0 = Math.min(S.feet[0], b[0]) - ov, x1 = Math.max(S.feet[2], b[3]) + ov, reach = D / 2 + 6 + KV_VERT.machineIronClear + IRON;
  const r0 = before.length ? Math.max(...before.map((q) => q[3])) + 20 : x0, r1 = past.length ? Math.min(...past.map((q) => q[0])) - 20 : x1;
  const run: [number, number] = beams[0] < P && beams[beams.length - 1] > P ? [Math.min(r0, -reach), Math.max(r1, reach)] : [r0, r1];
  const face = Math.max(...S.parts.filter((p) => p.role === 'housing' || p.role === 'cover').map((p) => partBox(p)[5]).filter((z) => z < P));
  return { axis: bed + S.yWheel, zSheave: P, width: E, x: [Math.min(x0, run[0]), Math.max(x1, run[1])], run,
    z: [Math.min(S.feet[1], b[2], beams[0] - half), Math.max(P + E / 2, S.feet[3], beams[beams.length - 1] + half)], mounts: [run[0] + 90, run[1] - 90], beams,
    plinth: plinthOf(beams, P - E / 2 - 20, P + E / 2 + 20), bed, on, face, shape: S, s };
}

/** The plinth across Z under beams at `beams` (in order): 140 mm past them, kept out of the sheave's band [s0, s1] where
 *  its ropes go down: one block under the beams on each side of the band, stopping short of it. */
function plinthOf(beams: readonly number[], s0: number, s1: number): [number, number][] {
  const below = beams.filter((z) => z < s0), above = beams.filter((z) => z > s1), out: [number, number][] = [];
  if (below.length) out.push([below[0] - 140, Math.min(below[below.length - 1] + 140, s0)]);
  if (above.length) out.push([Math.max(above[0] - 140, s1), above[above.length - 1] + 140]);
  return out;
}
