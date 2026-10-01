// The overspeed governor's loop: the governor in the machine room (or under the ceiling of the shaft when the
// machine stands below), its rope down beside a car rail to the tension pulley and weight in the pit; one strand is
// clamped to the safety gear's lever on the car (sling.ts). Only for a central sling, on a side wall free of doors
// and of the counterweight. Plan and heights in millimetres, into the shaft's batch. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import type { Layout } from '@/shaft';
import type { Section } from '@/shaft/section';
import type { Batch } from './geom';
import type { LiftMaterials, Side } from './materials';

// pulley radius of the governor and of the tension pulley, rope radius [mm]
const R = 150, ROPE = 4;

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
  const x = side === 'left' ? gap / 2 - 10 : W - gap / 2 + 10, y1 = rail.y + 145, y2 = y1 + 2 * R;
  return y2 + R < L.inputs.D - 80 ? { side, x, y1, y2 } : null;
}

export function buildGovernor(L: Layout, S: Section, g: GovernorSpot, roomFloor: number | null, M: LiftMaterials, B: Batch): void {
  const { x, y1, y2 } = g, yc = (y1 + y2) / 2, zBot = S.pitFloor;
  const zTension = zBot + 520, zGov = roomFloor !== null ? roomFloor + 480 : S.ceiling - 420;
  const pulley = (z: number): void => {
    B.rod([x - 22, yc, z], [x + 22, yc, z], R, M.pulley, 32);
    B.rod([x - 34, yc, z], [x + 34, yc, z], 28, M.alu, 16);
  };
  // the strands
  for (const y of [y1, y2]) B.rod([x, y, zTension], [x, y, zGov], ROPE, M.ropeCw, 6);
  // tension pulley on its lever, hinged on a bracket at the wall, the weight hanging at the lever's end
  pulley(zTension);
  const wallX = g.side === 'left' ? 0 : L.inputs.W, inward = g.side === 'left' ? 1 : -1;
  for (const s of [-1, 1]) B.box(x + s * 30, yc - 60, zTension - 40, x + s * 38, y2 + 140, zTension + 40, M.steel);
  B.box(wallX, yc - 50, zTension - 60, wallX + inward * (Math.abs(x - wallX) + 40), yc + 50, zTension - 40, M.galv);
  B.box(x - 45, y2 + 90, zTension - 330, x + 45, y2 + 190, zTension - 60, M.cwFill);
  B.rod([x, y2 + 140, zTension - 60], [x, y2 + 140, zTension - 20], 8, M.alu, 8);
  // the governor: base, cheeks, pulley, the flyweights' cover and the switch box
  pulley(zGov);
  const zBase = roomFloor ?? zGov - R - 180;
  if (roomFloor === null) B.box(wallX, yc - 160, zBase - 20, wallX + inward * (Math.abs(x - wallX) + 160), yc + 160, zBase, M.galv);
  B.box(x - 120, yc - 220, zBase, x + 120, yc + 220, zBase + 16, M.steel);
  for (const s of [-1, 1]) B.box(x + s * 40, yc - 120, zBase + 16, x + s * 52, yc + 120, zGov + 60, M.steel);
  B.rod([x + 52, yc, zGov], [x + 95, yc, zGov], 95, M.base, 28);
  B.box(x - 110, yc + 150, zBase + 16, x - 52, yc + 215, zBase + 150, M.frame);
}
