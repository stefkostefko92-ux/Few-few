// The overspeed governor's loop: the governor in the machine room (or on a bracket under the ceiling of the shaft
// when the machine stands below), its rope down beside a car rail to the tension pulley and its weight in the pit;
// one strand is clamped to the safety gear's lever on the car (sling.ts). Only for a central sling, on a side wall
// free of doors and of the counterweight. The parts are in govparts.ts; both pulleys turn with the car. Plan and
// heights in millimetres, the frames into the shaft's batch. Loaded only through boot.ts (lazy).
// Motion: the pulleys turn as the car travels; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import type { Layout } from '@/shaft';
import type { Section } from '@/shaft/section';
import { P, type Batch } from './geom';
import { GOV, governorFrame, governorWheel, tensionFrame } from './govparts';
import type { LiftMaterials, Side } from './materials';

/** Where the governor rope runs: x of its plane, the strand clamped to the car (y1) and the free one (y2). */
export interface GovernorSpot {
  side: Side;
  x: number;
  y1: number;
  y2: number;
}

/** The side walls with neither an entrance nor the counterweight, left first. */
export function freeSides(L: Layout): Side[] {
  return (['left', 'right'] as const).filter((s) => L.cwSide !== s && !L.doors.some((d) => d.wall === s));
}

export function governorSpot(L: Layout): GovernorSpot | null {
  if (L.frame.kind !== 'central') return null;
  const side = freeSides(L).at(-1);
  const rail = L.rails.find((r) => r.kind === 'car' && (side === 'left' ? r.dir === 'right' : r.dir === 'left'));
  if (!side || !rail) return null;
  const W = L.inputs.W, gap = side === 'left' ? L.car.x : W - (L.car.x + L.car.w);
  if (gap < 110) return null;
  const x = side === 'left' ? gap / 2 - 10 : W - gap / 2 + 10, y1 = rail.y + 145, y2 = y1 + 2 * GOV.R;
  return y2 + GOV.R < L.inputs.D - 80 ? { side, x, y1, y2 } : null;
}

export interface GovernorModel {
  /** the governor's and the tension pulley, which turn */
  group: THREE.Group;
  /** the car's floor at s [m] */
  set(s: number): void;
}

export function buildGovernor(L: Layout, S: Section, g: GovernorSpot, roomFloor: number | null, M: LiftMaterials, B: Batch): GovernorModel {
  const { x, y1, y2 } = g, yc = (y1 + y2) / 2, zTension = S.pitFloor + 520, zGov = roomFloor !== null ? roomFloor + GOV.axle : S.ceiling - 420;
  const wallX = g.side === 'left' ? 0 : L.inputs.W, inward = g.side === 'left' ? 1 : -1;
  // the strands, tangent to both pulleys
  for (const y of [y1, y2]) B.rod([x, y, zTension], [x, y, zGov], GOV.rope, M.ropeCw, 6);
  // the governor on the room's floor, or on a bracket from the side wall, braced from below
  const zBase = zGov - GOV.axle;
  if (roomFloor === null) {
    B.box(wallX, yc - 118, zBase - 20, x + inward * 180, yc + 118, zBase, M.galv);
    for (const w of [-80, 80]) B.rod([wallX, yc + w, zBase - 260], [x + inward * 150, yc + w, zBase - 20], 12, M.galv, 10);
  }
  governorFrame(B, M, [x, yc, zGov], inward, roomFloor === null ? wallX - x : null, roomFloor !== null);
  tensionFrame(B, M, [x, yc, zTension], wallX, inward);
  const group = new THREE.Group(), top = governorWheel(M, inward), bottom = governorWheel(M, null);
  top.position.copy(P(x, yc, zGov));
  bottom.position.copy(P(x, yc, zTension));
  group.add(top, bottom);
  return {
    group,
    // the strand at y1 rides with the car: a point of either rim on its side moves with it
    set(s) {
      top.rotation.x = bottom.rotation.x = (-s * 1000) / GOV.R;
    },
  };
}
