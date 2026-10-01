// The tension weight of the governor's rope in the pit, after the makers' kits (PFB R4K, Dynatech): its pulley as
// large as the governor's (PFB), clamped to the car rail by two forged clips. Where the shaft is deep enough the
// horizontal kind: a lever hinged on the rail's bracket, the pulley on it and the cast-iron weight at its far end —
// 22 kg for a governor that trips both ways, about 700 × 330 × 113 over all (PFB R4KE for LK200) — and the slack-rope
// switch under the lever by the hinge. Where it is not, the vertical kind: the pulley's carriage sliding on a channel
// clamped to the rail, the weight of 44 kg hung straight under it (PFB R4R, the vertical kit PFB pairs with a governor
// that trips both ways). Millimetres in the pulley's frame — a
// along the axle (plan x), w along the rope's plane (plan y), h up — round its centre o. Loaded only through boot.ts
// (lazy).
// Motion: the pulley turns as the car travels; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { RAILS, type Rail, type RailType } from '@/shaft';
import type { Batch, Point } from './geom';
import { LEVER_REACH, TENSION } from '@/shaft/governor';
import type { GovSize } from './govparts';
import type { LiftMaterials } from './materials';
import { clippedPlate, railFrameOf } from './railfix';

// the lever and the weights (src/shaft/governor.ts: the pit's plan draws the same) [mm]
const { hinge: HINGE, bar: BAR, barT: BAR_T, weightAt: WEIGHT_AT } = TENSION;
const LEVER_W: Point = [...TENSION.lever], HANG_W: Point = [...TENSION.hang];

/** The tension weight round the pulley's centre o: on the car rail `rail` (its type `type`), the lever kind when
 *  `lever`, else the vertical kind. `sw`: +1 when the rope's plane runs from the rail toward +y, −1 toward −y. */
export { LEVER_REACH };

export function tensionWeight(B: Batch, M: LiftMaterials, o: Point, G: GovSize, rail: Rail, type: RailType, lever: boolean, sw: 1 | -1): void {
  const [x, y, z] = o, { b } = RAILS[type], RF = railFrameOf(rail, RAILS[type].h);
  const at = (a: number, w: number, h: number): Point => [x + a, y + sw * w, z + h];
  const box = (a0: number, a1: number, w0: number, w1: number, h0: number, h1: number, m: THREE.Material): void => {
    const [p, q] = [at(a0, w0, h0), at(a1, w1, h1)];
    B.box(p[0], p[1], p[2], q[0], q[1], q[2], m);
  };
  const galv = (a0: number, a1: number, c0: number, c1: number, z0: number, z1: number): void => {
    const [p, q] = [RF.plan(a0, c0), RF.plan(a1, c1)];
    B.box(p[0], p[1], z0, q[0], q[1], z1, M.galv);
  };
  // from the pulley's centre back to the rail's axis along the rope's plane
  const toRail = Math.abs(rail.y - y), hinge = -(toRail - b / 2 - HINGE);
  // the plate behind the rail's foot with its two clips, and on toward the hinge
  const outer = clippedPlate(B, M, RF, type, z, galv), cSide = Math.sign((y - rail.y) * (RF.plan(0, 1)[1] - RF.plan(0, 0)[1])) || 1;
  galv(-10, 0, cSide * outer, cSide * (b / 2 + HINGE + 16), z - 75, z + 75);
  if (lever) {
    // the lug on the plate, the hinge's pin through it and the two bars; the bars past the weight
    box(-20, 20, hinge - 14, hinge + 14, -45, 35, M.galv);
    B.rod(at(-(BAR + BAR_T + 6), hinge, 0), at(BAR + BAR_T + 6, hinge, 0), 8, M.galv, 12);
    for (const s of [-1, 1]) {
      box(s * BAR, s * (BAR + BAR_T), hinge - 25, WEIGHT_AT + LEVER_W[1] / 2 + 10, -22, 22, M.steel);
      B.rod(at(s * (BAR + BAR_T), 0, 0), at(s * (BAR + BAR_T + 8), 0, 0), 14, M.galv, 6);
    }
    B.rod(at(-(BAR + BAR_T + 8), 0, 0), at(BAR + BAR_T + 8, 0, 0), 12, M.rail, 16);
    // the weight under the bars' end, bolted through them
    const [wa, ww, wh] = LEVER_W;
    box(-wa / 2, wa / 2, WEIGHT_AT - ww / 2, WEIGHT_AT + ww / 2, -22 - wh, -22, M.cwFill);
    for (const w of [WEIGHT_AT - ww / 4, WEIGHT_AT + ww / 4]) B.rod(at(-(BAR + BAR_T + 10), w, 0), at(BAR + BAR_T + 10, w, 0), 7, M.galv, 8);
    // the slack-rope switch under the bars by the hinge, its roller up to the near bar
    box(-18, 18, hinge + 30, hinge + 80, -110, -50, M.panel);
    B.rod(at(-BAR - BAR_T / 2, hinge + 55, -50), at(-BAR - BAR_T / 2, hinge + 55, -28), 3, M.galv, 8);
    B.rod(at(-BAR - BAR_T - 4, hinge + 55, -28), at(-BAR + 4, hinge + 55, -28), 6, M.rubber, 12);
  } else {
    // a channel clamped to the rail beside the pulley, the carriage of the axle sliding on it, the weight hung under
    const [wa, ww, wh] = HANG_W, ch = hinge, low = -G.R - 100;
    box(-30, 30, ch - 20, ch + 20, low - wh, 200, M.steel);
    for (const s of [-1, 1]) box(s * BAR, s * (BAR + BAR_T), ch - 30, 30, -40, 40, M.steel);
    B.rod(at(-(BAR + BAR_T + 8), 0, 0), at(BAR + BAR_T + 8, 0, 0), 12, M.rail, 16);
    box(-6, 6, -6, 6, low, -G.R - 20, M.galv);
    box(-wa / 2, wa / 2, -ww / 2, ww / 2, low - wh, low, M.cwFill);
    box(-18, 18, ch + 22, ch + 60, low + 40, low + 100, M.panel);
  }
}
