// Changing a distance where it is drawn, on the screens: the inputs with the new value, or why they cannot take it
// (out of the range the save accepts). The same validation as the save, so what a drawing sets can always be saved.
import type { Edit } from '@/drawing';
import { applyEdit, type ShaftInputs } from '@/shaft';
import { shaftInputsSchema } from './shaft-input';

export type EditResult = { ok: true; inputs: ShaftInputs } | { ok: false; min: number | null; max: number | null };

/** Validated inputs, or the bounds of the value that was refused. Given the inputs before (`prev`), only what the change
 *  breaks refuses it: a value already out of range elsewhere stays marked in the form, which refuses the save. */
export function checkedInputs(next: ShaftInputs | null, prev: ShaftInputs | null = null): EditResult {
  if (!next) return { ok: false, min: null, max: null };
  const r = shaftInputsSchema.safeParse(next);
  if (r.success) return { ok: true, inputs: next };
  const before = prev ? shaftInputsSchema.safeParse(prev) : null;
  const old = new Set(before && !before.success ? before.error.issues.map((i) => i.path.join('.')) : []);
  const issue = r.error.issues.find((i) => !old.has(i.path.join('.')));
  if (!issue) return { ok: true, inputs: next };
  return {
    ok: false,
    min: issue.code === 'too_small' ? Number(issue.minimum) : null,
    max: issue.code === 'too_big' ? Number(issue.maximum) : null,
  };
}

/** The dimension of `e` given the new length. */
export const editShaft = (I: ShaftInputs, e: Edit, length: number): EditResult => checkedInputs(applyEdit(I, e, length), I);
