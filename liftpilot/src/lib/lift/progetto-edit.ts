// A change of the Progetto's drawing as the screen makes it (round 54: out of ProgettoWorkspace, so the remedies of a
// check try a value exactly as «Applica» would set it): a patch of the shaft entered — the distances set by hand kept
// with the arrangement they belong to —, or the shaft a drawing's dimension gave (the panel the software placed entered
// where it was moved, the governor's side and the beams the software took kept as the software's); each through the
// one form's draft on the base, the existing falls of a direct pull completing it (calata.ts). Pure.
import { keptPlan, type ShaftInputs } from '@/shaft';
import { enteredBy, filled, type BlankKey, type LiftDraft } from './blank';
import { calateAlCompleto } from './calata';
import type { LiftDerived } from './derive';
import { enteredShaft, movedPanel, panelEntered } from './panel-form';
import { composto, dalComposto, type BaseCalcolo, type ProgettoDraft } from './progetto';

/** The drawing after a change `f` of the one form's draft on the base (the plan's h of the drawing as it was). */
export const conModifica = (d: ProgettoDraft, B: BaseCalcolo, f: (L: LiftDraft) => LiftDraft): ProgettoDraft =>
  calateAlCompleto(d, dalComposto(f(composto(d, B)), d.progetto.h), B);

/** The drawing with the shaft's `patch` entered (`edit`: another change of the values still to enter). */
export const conPatch = (d: ProgettoDraft, B: BaseCalcolo, patch: Partial<ShaftInputs>, edit?: (b: readonly BlankKey[]) => BlankKey[]): ProgettoDraft =>
  conModifica(d, B, (L) => {
    const shaft = { ...L.inputs.shaft, ...patch };
    return { inputs: { ...L.inputs, shaft: { ...shaft, plan: keptPlan(L.inputs.shaft, shaft) } }, blank: filled(edit ? edit(L.blank) : L.blank, enteredBy(patch)) };
  });

/** The drawing after a dimension of its drawings gave the shaft `next` (`derived`: what the drawing gave before). */
export function conVano(d: ProgettoDraft, B: BaseCalcolo, next: ShaftInputs, derived: LiftDerived | null): ProgettoDraft {
  const moved = movedPanel(next, derived), shaft = composto(d, B).inputs.shaft;
  const placed = moved ? conModifica(d, B, (L) => panelEntered(L, moved)) : d;
  return conPatch(placed, B, enteredShaft(next, shaft, derived));
}
