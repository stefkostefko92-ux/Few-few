// Sills of the entrances, landing and car: the extruded aluminium section (a walking face with fine ribs, a groove
// under each door track for the panels' shoes, the rounded nosing toward the gap). A landing's sill rests on Panev's
// brackets (staffe.ts). Plan and heights in millimetres, into a batch. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { GROOVE, GROOVE_D, SILL_H, sillSection } from '@/shaft/sill';
import { extrudeAlong, type Batch } from './geom';
import type { LiftMaterials, Side } from './materials';

export { SILL_H };

/** The section across the sill (src/shaft/sill.ts), in metres. */
const section = (v0: number, v1: number, grooves: readonly number[], flip: boolean): THREE.Shape =>
  new THREE.Shape(sillSection(v0, v1, grooves, flip).map(([v, z]) => new THREE.Vector2(v / 1000, z / 1000)));

/** A sill along `wall` from u0 to u1, from v0 to v1 deep, its top at z, grooved under the panels' tracks, its nosing
 *  toward the gap at v1 (landing) or at v0 (`flip`, car). */
export function sill(B: Batch, M: LiftMaterials, wall: Side, W: number, D: number, u0: number, u1: number, v0: number, v1: number, z: number, grooves: readonly number[], flip = false): void {
  B.add(extrudeAlong(wall, W, D, section(v0, v1, grooves, flip), u0, u1, z), M.alu);
  // dirt packed in the bottom of the grooves
  for (const g of grooves) B.wallBox(wall, W, D, u0 + 2, u1 - 2, g - GROOVE / 2 + 0.5, g + GROOVE / 2 - 0.5, z - GROOVE_D, z - GROOVE_D + 2, M.rubber);
}
