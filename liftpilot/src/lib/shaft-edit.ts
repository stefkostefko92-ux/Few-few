// Changing a distance where it is drawn, on the screens: the inputs with the new value, or why they cannot take it
// (out of the range the save accepts). The same validation as the save, so what is drawn can always be saved.
import type { Edit } from '@/drawing';
import { applyEdit, type ShaftInputs } from '@/shaft';
import { shaftInputsSchema } from './shaft-input';

export type EditResult = { ok: true; inputs: ShaftInputs } | { ok: false; min: number | null; max: number | null };

/** Validated inputs, or the bounds of the value that was refused. */
export function checkedInputs(next: ShaftInputs | null): EditResult {
  if (!next) return { ok: false, min: null, max: null };
  const r = shaftInputsSchema.safeParse(next);
  if (r.success) return { ok: true, inputs: next };
  const issue = r.error.issues[0];
  return {
    ok: false,
    min: issue?.code === 'too_small' ? Number(issue.minimum) : null,
    max: issue?.code === 'too_big' ? Number(issue.maximum) : null,
  };
}

/** The dimension of `e` given the new length. */
export const editShaft = (I: ShaftInputs, e: Edit, length: number): EditResult => checkedInputs(applyEdit(I, e, length));
