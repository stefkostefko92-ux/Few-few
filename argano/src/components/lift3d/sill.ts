// Sills of the entrances, landing and car: the extruded aluminium section (a walking face with fine ribs, a groove
// under each door track for the panels' shoes, the rounded nosing toward the gap), and at a landing the galvanized
// angle that carries it on the wall, with its gussets and anchors, and the stone threshold through the wall. Plan and
// heights in millimetres, into a batch. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { extrudeAlong, onWall, type Batch } from './geom';
import type { LiftMaterials, Side } from './materials';

// height of the extrusion, groove width and depth, rib pitch and depth [mm]
const H = 24, GROOVE = 11, GROOVE_D = 14, RIB = 4, RIB_D = 0.9;

/** The section across the sill, from v0 (inner edge) to v1 (nosing), top at 0, in metres; a groove at each of `grooves`.
 *  `flip`: the nosing at v0 instead (a car sill faces the landing, toward the wall). */
function section(v0: number, v1: number, grooves: readonly number[], flip: boolean): THREE.Shape {
  const m = (v: number, z: number): THREE.Vector2 => new THREE.Vector2((flip ? v0 + v1 - v : v) / 1000, z / 1000);
  grooves = flip ? grooves.map((g) => v0 + v1 - g) : grooves;
  const pts: THREE.Vector2[] = [m(v0, -H), m(v1 - 3, -H), m(v1, -H + 3), m(v1, -3), m(v1 - 3, 0)];
  // the walking face from the nosing back to the inner edge: ribs, broken by the grooves
  const cuts = grooves.map((g) => [g - GROOVE / 2, g + GROOVE / 2] as const).sort((a, b) => b[0] - a[0]);
  let v = v1 - 6;
  for (const [g0, g1] of [...cuts, [v0 - 1, v0] as const]) {
    for (; v - RIB > g1 + 2; v -= RIB) pts.push(m(v - RIB / 4, 0), m(v - RIB / 2, -RIB_D), m(v - (3 * RIB) / 4, 0));
    if (g1 < v0 + 1) break;
    pts.push(m(g1 + 1, 0), m(g1, -1), m(g1, -GROOVE_D), m(g0, -GROOVE_D), m(g0, -1), m(g0 - 1, 0));
    v = g0 - 3;
  }
  pts.push(m(v0, 0));
  return new THREE.Shape(pts);
}

/** A sill along `wall` from u0 to u1, from v0 to v1 deep, its top at z, grooved under the panels' tracks, its nosing
 *  toward the gap at v1 (landing) or at v0 (`flip`, car). */
export function sill(B: Batch, M: LiftMaterials, wall: Side, W: number, D: number, u0: number, u1: number, v0: number, v1: number, z: number, grooves: readonly number[], flip = false): void {
  B.add(extrudeAlong(wall, W, D, section(v0, v1, grooves, flip), u0, u1, z), M.alu);
  // dirt packed in the bottom of the grooves
  for (const g of grooves) B.wallBox(wall, W, D, u0 + 2, u1 - 2, g - GROOVE / 2 + 0.5, g + GROOVE / 2 - 0.5, z - GROOVE_D, z - GROOVE_D + 2, M.rubber);
}

/** The angle under a landing sill, on the wall face: its legs, a gusset every 400 mm, two anchors between gussets. */
export function sillSupport(B: Batch, M: LiftMaterials, wall: Side, W: number, D: number, u0: number, u1: number, depth: number, z: number): void {
  const top = z - H;
  B.wallBox(wall, W, D, u0, u1, 0, 5, top - 140, top, M.galv);
  B.wallBox(wall, W, D, u0, u1, 0, depth - 6, top - 6, top, M.galv);
  const n = Math.max(2, Math.round((u1 - u0) / 400));
  for (let k = 0; k <= n; k++) {
    const u = u0 + 15 + ((u1 - u0 - 30) * k) / n;
    B.plate(wall, W, D, u - 2.5, u + 2.5, [5, top - 130], [depth - 12, top - 8], 5, M.galv);
    if (k === n) continue;
    const a = u + (u1 - u0 - 30) / n / 2;
    const [x, y] = onWall(wall, W, D, a, 5), [x1, y1] = onWall(wall, W, D, a, 14);
    B.rod([x, y, top - 70], [x1, y1, top - 70], 11, M.galv, 6);
    B.rod([x, y, top - 70], [(x + x1) / 2, (y + y1) / 2, top - 70], 15, M.galv, 16);
  }
}
