// Where loads on the slab of the machine room act besides the machine (P1) and the governor (P4): P2 and P3, the
// hitches of a 2:1 roping's car and counterweight ropes (loads.ts), tagged where each dead end hangs from the slab, the
// tag beyond the dead end in the plane its pulley turns in (away from its fall) and a little past it along the drop
// line, its leader to the hitch. Room plan axes [mm]. Pure.
import type { Entity, Pt } from '../drawing';
import type { RoomGeo } from './machine-room';

/** How far beyond the dead end the tag stands [mm of the room]: just past its opening, short of the rows of the
 *  dimensions beside the machine; and how far along the drop line, away from the other dead end, off the extension line
 *  of the drops' dimension that runs through it. */
const AWAY = 180, ALONG = 130;

export function hitchTags(G: Pick<RoomGeo, 'deadEnds' | 'ux' | 'uy'>): Entity[] {
  return G.deadEnds.slice(0, 2).map(({ at, dir }, i): Entity => {
    const s = i === 0 ? -1 : 1, tag: Pt = [at[0] - dir[0] * AWAY + s * G.ux * ALONG, at[1] - dir[1] * AWAY + s * G.uy * ALONG];
    return { e: 'tag', at: tag, text: i === 0 ? 'P2' : 'P3', to: at };
  });
}
