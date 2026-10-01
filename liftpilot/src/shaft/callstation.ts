// The landing call stations: one beside every landing door, on the landing, at the same place at every floor. Seen
// from the landing its side is left or right; along the door's wall that is lower or higher u depending on which wall
// it is (the landing of the front wall looks into the shaft along +y, its left is −x). Pure.
import { KV } from './norme';
import type { CallStation, DoorLayout, ShaftInputs, Wall } from './types';

/** The call station of the inputs, or the typical one. */
export const callStationOf = (I: ShaftInputs): CallStation => I.callStation ?? { side: 'right', offset: KV.callOffset, height: KV.callHeight };

/** Whether lower u along the wall is on the left of someone on its landing facing the shaft. */
export const lowIsLeft = (w: Wall): boolean => w === 'front' || w === 'right';

/** Middle of the call station along the door's wall [mm], and the edge of the door's portal it is measured from. */
export function callStationAt(d: DoorLayout, cs: CallStation): { u: number; from: number } {
  const low = (cs.side === 'left') === lowIsLeft(d.wall), from = low ? d.u0 - KV.doorPortal : d.u1 + KV.doorPortal;
  return { u: low ? from - cs.offset : from + cs.offset, from };
}
