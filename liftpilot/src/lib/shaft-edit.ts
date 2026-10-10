// Changing a distance where it is drawn, on the screens: the inputs with the new value, or why they cannot take it
// (out of the range the save accepts). The same validation as the save, so what a drawing sets can always be saved; a
// value refused tells the bounds of the dimension that was typed, not of the input behind it.
import type { Edit } from '@/drawing';
import { applyEdit, inputPath, type ShaftInputs } from '@/shaft';
import { shaftInputsSchema } from './shaft-input';

export type EditResult = { ok: true; inputs: ShaftInputs } | { ok: false; min: number | null; max: number | null; path?: string };

/** Validated inputs, or the bounds of the value that was refused (and where it is). Given the inputs before (`prev`),
 *  only what the change breaks refuses it: a value already out of range elsewhere stays marked in the form, which
 *  refuses the save. */
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
    path: issue.path.join('.'),
  };
}

// the least value of the inputs src/shaft/edit.ts refuses below: a support under the floor, a frame or a plinth shorter
// than the save takes
const LEAST: Readonly<Record<string, number>> = { 'sup.height': 0, 'rinvio.height': 0, 'sup.length': 300 };

/** The bounds of the input an edit changes as bounds of its dimension: the lengths that give them. */
export function lengthBounds(e: Edit, min: number | null, max: number | null): { min: number | null; max: number | null } {
  const at = (v: number | null): number | null => {
    if (v === null) return null;
    const along = (v - e.base) / e.k;
    return Math.round(e.across ? Math.hypot(Math.max(0, along), e.across) - (e.plus ?? 0) : along);
  };
  return e.k > 0 ? { min: at(min), max: at(max) } : { min: at(max), max: at(min) };
}

/** The dimension of `e` given the new length; refused, the bounds of that dimension when the edited input broke them. */
export function editShaft(I: ShaftInputs, e: Edit, length: number): EditResult {
  const next = applyEdit(I, e, length);
  if (!next) return e.pick ? { ok: false, min: null, max: null } : { ok: false, ...lengthBounds(e, LEAST[e.key] ?? null, null) };
  const r = checkedInputs(next, I);
  if (r.ok || e.pick) return r;
  return r.path !== undefined && inputPath(e.key)?.join('.') === r.path ? { ok: false, ...lengthBounds(e, r.min, r.max) } : { ok: false, min: null, max: null };
}
