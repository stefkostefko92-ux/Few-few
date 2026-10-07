// The control panel's place in the one form (registry locale.quadro.posto): while the software places it, the drawings
// show it where the derivation put it; switched off, or moved on a drawing, its wall and place are entered as they were
// shown. The HEB beams on the shaft's walls the same way: the drawings show those the derivation took, chosen on a
// drawing they are entered. A change on the drawings enters only what it changed: the panel and the beams stay the
// software's, the support the drawings show stays unchosen unless the change is the support's. Pure: the form and its
// tests share it.
import type { Edit } from '@/drawing';
import type { RoomInputs, ShaftBeams, ShaftInputs } from '@/shaft';
import { filled, type LiftDraft } from './blank';
import type { LiftDerived } from './derive';

type Place = Pick<RoomInputs, 'panelWall' | 'panelAt'>;

/** The form with the panel's wall and place entered as `R` has them: no longer the software's to place. */
export function panelEntered(d: LiftDraft, R: Place): LiftDraft {
  const room = d.inputs.shaft.room;
  if (!room) return d;
  return {
    inputs: { ...d.inputs, auto: { ...d.inputs.auto, panel: false }, shaft: { ...d.inputs.shaft, room: { ...room, panelWall: R.panelWall, panelAt: R.panelAt } } },
    blank: filled(d.blank, ['room.panelWall', 'room.panelAt']),
  };
}

/** Where the software put the panel; null when it is entered (or there is no room). */
export const placedPanel = (derived: LiftDerived | null): Place | null => (derived?.origin.panel === 'auto' ? derived.shaft.room : null);

/** The HEB beams the derivation took when the form leaves their profile or direction to it; null otherwise. */
const takenBeams = (shaft: ShaftInputs, derived: LiftDerived | null): ShaftBeams | null => {
  const own = shaft.room?.heb, taken = derived?.heb ? derived.shaft.room?.heb : undefined;
  return own && taken && (!own.profile || !own.dir) ? taken : null;
};

/** The shaft the drawings show and change: the one entered, the panel where the software put it, the HEB beams it took. */
export function drawnShaft(shaft: ShaftInputs, derived: LiftDerived | null): ShaftInputs {
  const at = placedPanel(derived), heb = takenBeams(shaft, derived), R = shaft.room;
  if (!R || (!at && !heb)) return shaft;
  return { ...shaft, room: { ...R, ...(at ? { panelWall: at.panelWall, panelAt: at.panelAt } : {}), ...(heb ? { heb } : {}) } };
}

/** The room of `next` (a drawing's change of the drawn shaft) when it moves the panel the software placed: then entered
 *  there; null otherwise. */
export function movedPanel(next: ShaftInputs, derived: LiftDerived | null): RoomInputs | null {
  const at = placedPanel(derived), R = next.room;
  return at && R && (R.panelWall !== at.panelWall || R.panelAt !== at.panelAt) ? R : null;
}

/** The shaft a drawing's change of the drawn shaft (`next`) enters into the form's `shaft`: the panel the software
 *  placed and did not see moved, and the HEB beams it took and did not see changed, keep the form's own entries (they
 *  stay the software's). */
export function enteredShaft(next: ShaftInputs, shaft: ShaftInputs, derived: LiftDerived | null): ShaftInputs {
  const R = next.room, own = shaft.room;
  if (!R || !own) return next;
  const panel = !!placedPanel(derived) && !movedPanel(next, derived), taken = takenBeams(shaft, derived);
  const beams = !!taken && R.heb?.profile === taken.profile && R.heb?.dir === taken.dir;
  if (!panel && !beams) return next;
  return { ...next, room: { ...R, ...(panel ? { panelWall: own.panelWall, panelAt: own.panelAt } : {}), ...(beams ? { heb: own.heb } : {}) } };
}

/** The drawn shaft an edit `e` changes: with the support the drawings show (the bedplate with the diverting pulley when
 *  none was chosen) made the one chosen when the edit is the support's (its height, length or profile). */
export function edited(drawn: ShaftInputs, e: Edit, derived: LiftDerived | null): ShaftInputs {
  const R = drawn.room, own = e.key.startsWith('sup.') || e.key === 'rinvio.height';
  return R && own && !R.support && derived?.machine.rinvio ? { ...drawn, room: { ...R, support: { kind: 'rinvio' } } } : drawn;
}
