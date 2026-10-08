// The overspeed governor's loop: the governor in the machine room (or on a bracket under the ceiling of the shaft
// when the machine stands below), its rope down beside a car rail to the tension pulley and its weight in the pit,
// clamped to that rail; one strand is clamped to the safety gear's lever on the car (sling.ts). Only for a central
// sling, on a side wall free of doors and of the counterweight. The governor's size by the rated speed and its parts
// in govparts.ts, the tension weight in tension.ts; both pulleys turn with the car. Plan and heights in millimetres,
// the frames into the shaft's batch. Loaded only through boot.ts (lazy).
// Motion: the pulleys turn as the car travels; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import type { Layout } from '@/shaft';
import type { Section } from '@/shaft/section';
import { P, type Batch } from './geom';
import { governorFrame, governorWheel } from './govparts';
import { GOV_BRACKET, freeSides, governorSpot, type GovernorSpot } from '@/shaft/governor';
import { KV_VERT } from '@/shaft/norme-vert';

export { freeSides, governorSpot, type GovernorSpot };
import { tensionWeight } from './tension';
import type { LiftMaterials } from './materials';

export interface GovernorModel {
  /** the governor's and the tension pulley, which turn */
  group: THREE.Group;
  /** the car's floor at s [m] */
  set(s: number): void;
}

export function buildGovernor(L: Layout, S: Section, g: GovernorSpot, roomFloor: number | null, M: LiftMaterials, B: Batch): GovernorModel {
  const { x, y1, y2, G } = g, yc = (y1 + y2) / 2, zTension = S.pitFloor + 480, zGov = roomFloor !== null ? roomFloor + G.axle : S.ceiling - KV_VERT.govUnderCeiling;
  const wallX = g.side === 'left' ? 0 : L.inputs.W, inward = g.side === 'left' ? 1 : -1;
  // the strands, tangent to both pulleys
  for (const y of [y1, y2]) B.rod([x, y, zTension], [x, y, zGov], G.rope, M.ropeCw, 6);
  // the governor on the room's floor, or on a bracket from the side wall, braced from below
  const zBase = zGov - G.axle;
  if (roomFloor === null) {
    // the bracket's plate out to the base's inner edge, no further: over the car's plan the car would reach it
    // (shaft/governor.ts GOV_BRACKET, the sheets draw the same)
    B.box(wallX, yc - G.baseW, zBase - GOV_BRACKET.plate, x + inward * G.baseA, yc + G.baseW, zBase, M.galv);
    for (const w of [-80, 80]) B.rod([wallX, yc + w, zBase - GOV_BRACKET.brace], [x + inward * (G.baseA - 30), yc + w, zBase - GOV_BRACKET.plate], 12, M.galv, 10);
  }
  governorFrame(B, M, [x, yc, zGov], inward, roomFloor === null ? wallX - x : null, roomFloor !== null, G);
  tensionWeight(B, M, [x, yc, zTension], G, g.rail, L.inputs.carRail, g.lever, y1 >= g.rail.y ? 1 : -1);
  const group = new THREE.Group(), top = governorWheel(M, inward, G), bottom = governorWheel(M, null, G);
  top.position.copy(P(x, yc, zGov));
  bottom.position.copy(P(x, yc, zTension));
  group.add(top, bottom);
  return {
    group,
    // the strand at y1 rides with the car: a point of either rim on its side moves with it
    set(s) {
      top.rotation.x = bottom.rotation.x = (-s * 1000) / G.R;
    },
  };
}
