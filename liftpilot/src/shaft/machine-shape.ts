// A maker's geared machine as the drawings and the 3D build it: its parts as boxes, cylinders and outlines extruded
// across, sized by the maker's dimensions — the technical sheet (the sheave's axis over the feet, the feet and their
// holes, the sheave's mid-plane P and width E by diameter, the overall sizes) and the CAD model the maker publishes
// (where the gearbox, the motor, the brake and the handwheel stand), rounded to the millimetre. Dimensions only: the
// shapes are ours, no geometry of the maker's is kept. The machine stands on a bedframe of ours (two beams under the
// rows of holes, anti-vibration mounts at the ends) whose height keeps the sheave's axis where the generic machine has
// it, when the machine allows. Millimetres, the machine's own frame: X along the worm from the sheave's axis (+X toward
// the motor), Y up from the feet's plane, Z along the sheave's axis from the worm's vertical plane (+Z toward the
// sheave). Pure.
import { MACHINE_A, MACHINE_X, MACHINE_Z } from './machine-outline';
import { KV_VERT } from './norme-vert';

/** What a part is: it sets how the drawings and the 3D finish it (cast and painted, turned, finned, yellow). */
export type ShapeRole = 'base' | 'housing' | 'cover' | 'shaft' | 'motor' | 'brake' | 'arm' | 'magnet' | 'handwheel' | 'terminal' | 'pedestal' | 'eye';

/** x0, y0, z0, x1, y1, z1 */
export type Box6 = readonly [number, number, number, number, number, number];

export type ShapePart =
  | { role: ShapeRole; box: Box6 }
  /** a cylinder along an axis: `at` its centre in the other two axes in order (x: y, z; y: x, z; z: x, y) */
  | { role: ShapeRole; cyl: 'x' | 'y' | 'z'; at: readonly [number, number]; r: number; span: readonly [number, number] }
  /** an outline in X, Y extruded across Z */
  | { role: ShapeRole; prism: readonly (readonly [number, number])[]; span: readonly [number, number] };

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
}

/** The sheave's mid-plane P and width E for the diameter D: the sheet's row nearest D. */
export function sheaveOf(S: MachineShape, D: number): { P: number; E: number } {
  let best = S.sheaves[0];
  for (const r of S.sheaves) if (Math.abs(r[0] - D) < Math.abs(best[0] - D)) best = r;
  return { P: best[1], E: best[2] };
}

/** A part's bounds. */
export function partBox(p: ShapePart): Box6 {
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

/** The bounds of the body (the parts, not the sheave). */
export function bodyBox(S: MachineShape): Box6 {
  const bs = S.parts.map(partBox), lo = (i: number): number => Math.min(...bs.map((b) => b[i])), hi = (i: number): number => Math.max(...bs.map((b) => b[i]));
  return [lo(0), lo(1), lo(2), hi(3), hi(4), hi(5)];
}

/** The generic machine's sheave axis over its bedplate's underside at the sheave D [mm] (machine-outline.ts, scaled). */
export const genericAxis = (D: number): number => MACHINE_A.yWheel * 1000 * (D / (2000 * MACHINE_A.rp));

/** Our bedframe's height under the maker's feet at the sheave D: where the generic machine has the sheave's axis, at
 *  least KV_VERT.machineBed and with the sheave's rim KV_VERT.machineRimClear over the bedframe's underside. */
export const bedOf = (S: MachineShape, D: number): number =>
  Math.ceil(Math.max(KV_VERT.machineBed, D / 2 + KV_VERT.machineRimClear - S.yWheel, genericAxis(D) - S.yWheel) - 1e-9);

/** Where the machine is, as the room's drawings and the 3D place it [mm]. */
export interface MachineFrame {
  /** the sheave's axis over the underside of the bedplate (where the machine stands on its support) */
  axis: number;
  /** the sheave's mid-plane and width across */
  zSheave: number;
  width: number;
  /** the bedplate along X, end to end; the machine across Z, from its far side to the sheave's outer face */
  x: readonly [number, number];
  z: readonly [number, number];
  /** the anti-vibration mounts along X and the bedplate's two beams across Z (a maker's: under its outer rows of holes) */
  mounts: readonly [number, number];
  beams: readonly [number, number];
  /** a concrete plinth under the bedplate across Z: one block, or a strip under each beam when the sheave and its ropes
   *  are between or over them */
  plinth: readonly (readonly [number, number])[];
  /** our bedframe's height under the maker's feet (0: the generic machine, whose bedplate is its own) */
  bed: number;
  /** the gearbox's face toward the sheave across Z: a slow shaft longer than the machine's runs from there */
  face: number;
  shape: MachineShape | null;
  /** the generic machine's scale on its Ø 560 */
  s: number;
}

export function machineFrame(D: number, S: MachineShape | null): MachineFrame {
  const s = D / (2000 * MACHINE_A.rp);
  if (!S) {
    // the same products as the drawings have always taken (a drawing set's hash covers every number)
    return { axis: MACHINE_A.yWheel * 1000 * s, zSheave: MACHINE_A.zSheave * 1000 * s, width: 100 * s, x: [MACHINE_X[0] * 1000 * s, MACHINE_X[1] * 1000 * s],
      z: [MACHINE_Z[0] * 1000 * s, MACHINE_Z[1] * 1000 * s], mounts: [-360 * s, 950 * s], beams: [-160 * s, 160 * s], plinth: [[-200 * s - 100, 200 * s + 100]],
      bed: 0, face: 200 * s, shape: null, s };
  }
  const { P, E } = sheaveOf(S, D), b = bodyBox(S), bed = bedOf(S, D), ov = KV_VERT.machineBedOverhang;
  const x0 = Math.min(S.feet[0], b[0]) - ov, x1 = Math.max(S.feet[2], b[3]) + ov;
  const face = Math.max(...S.parts.filter((p) => p.role === 'housing' || p.role === 'cover').map((p) => partBox(p)[5]).filter((z) => z < P));
  const zs = S.holes.map((h) => h[1]), beams: [number, number] = [Math.min(...zs), Math.max(...zs)];
  return { axis: bed + S.yWheel, zSheave: P, width: E, x: [x0, x1], z: [Math.min(S.feet[1], b[2]), P + E / 2], mounts: [x0 + 90, x1 - 90], beams,
    plinth: plinthOf(beams, P - E / 2 - 20, P + E / 2 + 20), bed, face, shape: S, s };
}

/** The plinth across Z under beams at `beams`: 140 mm past each, kept out of the sheave's band [s0, s1] where its ropes
 *  go down: a strip under each beam when the band is between them, else one block stopping short of it. */
function plinthOf(beams: readonly [number, number], s0: number, s1: number): [number, number][] {
  const [z0, z1] = beams, lo = z0 - 140, hi = z1 + 140;
  if (z0 < s0 && z1 > s1) return [[lo, Math.min(z0 + 140, s0)], [Math.max(z1 - 140, s1), hi]];
  return z1 < s0 ? [[lo, Math.min(hi, s0)]] : [[Math.max(lo, s1), hi]];
}
