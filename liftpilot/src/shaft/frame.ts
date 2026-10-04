// The frame round a landing door's clear opening, the same at every landing door: by default the portal through the
// wall (jambs KV.doorPortal, head KV.doorHead); or the door's own frame (telaio di piano) as the designer sets it, by
// default the standard one (KV.frameStd): it stands on the landing's finished floor in the opening of the wall, flush
// with the wall's landing face, its jambs full height beside the clear opening, its header between them over it, its
// depth into the wall; the opening in the wall is its outside (registry porte.telaio). Pure.
import { KV } from './norme';
import type { DoorFrame, ShaftInputs } from './types';

/** The standard frame: jambs, header, depth [mm]. */
export const FRAME_STD: DoorFrame = { jamb: KV.frameStd[0], head: KV.frameStd[1], depth: KV.frameStd[2] };

/** Width of the jambs and height of the head round the clear opening [mm]: the door's own frame's, else the portal's;
 *  `depth`: the frame's from the landing face of the wall, null for the portal (through the wall). */
export const portalOf = (I: ShaftInputs): { jamb: number; head: number; depth: number | null } =>
  I.frame ? { jamb: I.frame.jamb, head: I.frame.head, depth: I.frame.depth } : { jamb: KV.doorPortal, head: KV.doorHead, depth: null };

/** The inputs with this frame (null: the portal). */
export function withFrame(I: ShaftInputs, f: DoorFrame | null): ShaftInputs {
  const { frame: _drop, ...rest } = I;
  void _drop;
  return f ? { ...rest, frame: f } : rest;
}
