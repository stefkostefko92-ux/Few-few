// The frame round a landing door's clear opening, the same at every landing door: by default the portal through the
// wall (jambs KV.doorPortal, head KV.doorHead); or the door's own frame (telaio di piano) as the designer sets it, by
// default the standard one (KV.frameStd). The frame stands all in the shaft, against the wall and on the sill: its jambs
// full height beside the clear opening, its header between them over it, its depth into the shaft; the sill and the
// suspension are fixed to it and Panev's pairs hold it to the wall (staffe-porte.ts); the opening in the wall is its
// outside, the linings (imbotti.ts) stand on the landing's floor. Its depth is within the landing door's: the panels run
// behind it (check v_telaio; registry porte.telaio). Pure.
import { KV } from './norme';
import { landingTracks } from './sill';
import type { DoorFrame, DoorLayout, ShaftInputs } from './types';

/** The standard frame: jambs, header, depth [mm]. */
export const FRAME_STD: DoorFrame = { jamb: KV.frameStd[0], head: KV.frameStd[1], depth: KV.frameStd[2] };

/** Width of the jambs and height of the head round the clear opening [mm]: the door's own frame's, else the portal's;
 *  `depth`: the frame's into the shaft from the wall, null for the portal (through the wall). */
export const portalOf = (I: ShaftInputs): { jamb: number; head: number; depth: number | null } =>
  I.frame ? { jamb: I.frame.jamb, head: I.frame.head, depth: I.frame.depth } : { jamb: KV.doorPortal, head: KV.doorHead, depth: null };

/** The inputs with this frame (null: the portal). */
export function withFrame(I: ShaftInputs, f: DoorFrame | null): ShaftInputs {
  const { frame: _drop, ...rest } = I;
  void _drop;
  return f ? { ...rest, frame: f } : rest;
}

/** Room for the panels behind the door's own frame [mm]: the landing doors' track nearest the wall (a telescopic door's
 *  slow panel, a centre-opening one's) less the frame's depth, the tightest door; null with the portal. */
export function frameRoom(I: ShaftInputs, doors: readonly DoorLayout[]): number | null {
  if (!I.frame || !doors.length) return null;
  const tr = landingTracks(I.landingDepth);
  return Math.min(...doors.map((d) => (d.kind === 'C2' ? tr.fast : tr.slow))) - I.frame.depth;
}
