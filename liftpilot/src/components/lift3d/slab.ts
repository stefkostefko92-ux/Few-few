// The slab over the shaft: the machine room's floor, or the shaft's ceiling when the machine stands below. It is cut
// only where something goes through it, as on site: a tight opening round each run of the ropes (wherever the car and
// the counterweight are) and round a pulley that dips into it, two small holes for the governor's rope. On the room's
// floor the rope openings have a raised steel curb, except where a pulley's stand covers the opening. Plan and heights
// in millimetres, into a batch. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { belt, type RopeRig } from '@/lib/lift';
import { ropeWidths } from '@/shaft/machine-room';
import { KV_VERT } from '@/shaft/norme-vert';
import type { Batch } from './geom';
import type { GovernorSpot } from './governor';
import type { LiftMaterials } from './materials';

/** An opening in plan [mm], its corners in order round it; `curb`: a raised curb round it on the room's floor. */
export interface Opening {
  pts: readonly (readonly [number, number])[];
  curb: boolean;
}

// clearance round the ropes and the pulleys in the openings, the curb's height and wall as the drawings have them
// (registry locale.macchina, locale.fori) [mm]
const CLEAR = KV_VERT.holeGap, CURB_H = KV_VERT.slabKerb, CURB_T = KV_VERT.kerbW;
// the governor's rope and its holes [mm]
const GOV_HOLE = 50;

/** Half the width of the ropes and of a pulley: src/shaft/machine-room.ts, the drawings of the room take the same. */
export { ropeWidths };

/** The openings of the slab from zb to zt [m] for the ropes of `rig` with the car anywhere in `travel` (car floor s,
 *  counterweight w [m]), piece by piece in the planes of the ropes, and the holes of the governor's rope. */
export function slabOpenings(rig: RopeRig, n: number, d: number, zb: number, zt: number, travel: readonly (readonly [number, number])[], gov: GovernorSpot | null): Opening[] {
  const within = (y: number): boolean => y >= zb && y <= zt, wd = ropeWidths(n, d), out: Opening[] = [];
  rig.pieces(0, 0).forEach((ref, k) => {
    const spans: { lo: number; hi: number; wheel: boolean }[] = [];
    for (const [s, w] of travel) {
      const els = rig.pieces(s, w)[k].els, b = belt(els);
      for (const [[u1, y1], [u2, y2]] of b.runs) {
        // the part of the run between the slab's faces
        const us: number[] = [];
        if (within(y1)) us.push(u1);
        if (within(y2)) us.push(u2);
        for (const y of [zb, zt]) if ((y1 - y) * (y2 - y) < 0) us.push(u1 + ((u2 - u1) * (y - y1)) / (y2 - y1));
        if (us.length) spans.push({ lo: Math.min(...us), hi: Math.max(...us), wheel: false });
      }
      for (const e of els) if (e.kind === 'wheel' && e.y + e.r > zb && e.y - e.r < zt) spans.push({ lo: e.u - e.r, hi: e.u + e.r, wheel: true });
    }
    spans.sort((p, q) => p.lo - q.lo);
    const merged: { lo: number; hi: number; wheel: boolean }[] = [];
    for (const sp of spans) {
      const last = merged.at(-1);
      if (last && sp.lo - last.hi < 0.08) {
        last.hi = Math.max(last.hi, sp.hi);
        last.wheel ||= sp.wheel;
      } else merged.push({ ...sp });
    }
    const [ox, oy] = ref.plane.origin, [dx, dy] = ref.plane.dir;
    const at = (u: number, a: number): readonly [number, number] => [ox + u * dx - a * dy, oy + u * dy + a * dx];
    for (const m of merged) {
      const u0 = m.lo * 1000 - CLEAR, u1 = m.hi * 1000 + CLEAR, a = (m.wheel ? Math.max(wd.ropes, wd.pulley) : wd.ropes) + CLEAR;
      out.push({ pts: [at(u0, -a), at(u1, -a), at(u1, a), at(u0, a)], curb: !m.wheel });
    }
  });
  if (gov) {
    for (const y of [gov.y1, gov.y2]) {
      const h = GOV_HOLE / 2;
      out.push({ pts: [[gov.x - h, y - h], [gov.x + h, y - h], [gov.x + h, y + h], [gov.x - h, y + h]], curb: false });
    }
  }
  return out;
}

const loop = (pts: readonly (readonly [number, number])[]): THREE.Vector2[] => pts.map(([x, y]) => new THREE.Vector2(x / 1000, y / 1000));

/** The opening grown by g [mm] on every side (its corners in order round a rectangle). */
function grow(pts: Opening['pts'], g: number): [number, number][] {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const [a, b] = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]], la = Math.hypot(a, b);
  const [c, e] = [pts[3][0] - pts[0][0], pts[3][1] - pts[0][1]], lc = Math.hypot(c, e);
  const ux = [a / la, b / la], vy = [c / lc, e / lc], hu = la / 2 + g, hv = lc / 2 + g;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [cx + i * hu * ux[0] + j * hv * vy[0], cy + i * hu * ux[1] + j * hv * vy[1]]);
}

/** A flat solid in plan from z0 to z1 [mm]: the outline less the holes. */
function plan(B: Batch, outline: readonly (readonly [number, number])[], holes: readonly (readonly (readonly [number, number])[])[], z0: number, z1: number, m: THREE.Material): void {
  const shape = new THREE.Shape(loop(outline));
  for (const h of holes) shape.holes.push(new THREE.Path(loop(h)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: (z1 - z0) / 1000, bevelEnabled: false, curveSegments: 1 });
  // drawn in the plan (x, y), extruded along +Z: up the slab, plan y to −Z
  B.add(g.rotateX(-Math.PI / 2).translate(0, z0 / 1000, 0), m);
}

/** The slab from z0 to z1 [mm] over the plan rectangle [x0, y0, x1, y1], with its openings; the curbs when `room`. */
export function buildSlab(B: Batch, M: LiftMaterials, rect: readonly [number, number, number, number], z0: number, z1: number, openings: readonly Opening[], room: boolean, mat: THREE.Material = M.slab): void {
  const [x0, y0, x1, y1] = rect;
  plan(B, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], openings.map((o) => o.pts), z0, z1, mat);
  if (!room) return;
  for (const o of openings) if (o.curb) plan(B, grow(o.pts, CURB_T), [o.pts], z1, z1 + CURB_H, M.galv);
}
