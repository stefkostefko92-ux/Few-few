// The control panel's place in the one form (registry locale.quadro.posto): while the software places it, the drawings
// show it where the derivation put it; switched off, or moved on a drawing, its wall and place are entered as they were
// shown. Pure: the form and its tests share it.
import type { RoomInputs, ShaftInputs } from '@/shaft';
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

/** The shaft the drawings show and change: the one entered, the panel where the software put it. */
export function drawnShaft(shaft: ShaftInputs, derived: LiftDerived | null): ShaftInputs {
  const at = placedPanel(derived);
  return at && shaft.room ? { ...shaft, room: { ...shaft.room, panelWall: at.panelWall, panelAt: at.panelAt } } : shaft;
}

/** The room of `next` (a drawing's change of the drawn shaft) when it moves the panel the software placed: then entered
 *  there; null otherwise. */
export function movedPanel(next: ShaftInputs, derived: LiftDerived | null): RoomInputs | null {
  const at = placedPanel(derived), R = next.room;
  return at && R && (R.panelWall !== at.panelWall || R.panelAt !== at.panelAt) ? R : null;
}
