// The sheet form's controls as the browser rules of Rilievi see them (rilievi's public/js/app.js, moduli.js and
// collegati.js, commit 988f3cf37): the conditions synced on the page as app.js synced them — at once, on the elements
// (`data-off`), so that the linked data read what is on screen while they fill in several rounds —, and the adapter the
// linked data (collegati-client.ts) and the modules' survey fields (prefill-client.ts) work through. Only DOM, no React:
// the form's hook (use-scheda-form.ts) calls it from its event listeners.
import type { CollegatiHost } from '@/lib/rilievi/collegati-client';
import type { FormValues } from '@/lib/rilievi/field-parsers';
import { activeParts, tokensOf } from '@/lib/rilievi/fields';
import type { PrefillHost } from '@/lib/rilievi/prefill-client';
import { valuesOfForm } from '@/lib/rilievi/prefill-client';

export type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export const isControl = (el: unknown): el is Control =>
  el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;

export const isTick = (el: Control): boolean => el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');

/**
 * Whether an element with a condition is hidden (`data-when` = the field it depends on, `data-when-values` = its answers
 * that show it, `data-when-not` = shown while it holds none of them): the field «holds» while it makes sense itself
 * (`active` — activeParts, the same rule as the server's: a field of a hidden section says nothing) and has one of the
 * answers. rilievi's app.js asks the same of the page (the field's control not inside anything hidden).
 */
export function offBy(data: { when?: string; whenValues?: string; whenNot?: string }, values: FormValues, active: ReadonlySet<string>): boolean {
  const field = data.when ?? '';
  const wanted = (data.whenValues ?? '').split(' ');
  const has = active.has(field) && tokensOf(values[field]).some((v) => wanted.includes(v));
  return 'whenNot' in data ? has : !has;
}

/**
 * Everything with a condition shown or hidden as the form's values say (offBy): the fields, the sections, the
 * measurements per stop, a module's make and model and its «Sì», the sections' ticks for the print — and, outside the
 * form, the sections' lines in the index beside it. activeParts follows the order of fields.ts, not the company's, so a
 * section moved above the field it depends on needs no second pass (rilievi's app.js makes two). rilievi did it on every
 * change.
 */
export function syncConditions(form: HTMLFormElement): void {
  const values = valuesOfForm(form);
  const { fields: active } = activeParts((key) => values[key]);
  // the form's layout (SchedaForm.tsx): the form and, outside it, the index of its sections
  const root = form.closest('[data-scheda-layout]') ?? form;
  root.querySelectorAll<HTMLElement>('[data-when]').forEach((el) => el.toggleAttribute('data-off', offBy(el.dataset, values, active)));
}

/** Shown: not inside anything hidden — a field off by its condition, a closed module, a module of the other make. */
const shown = (el: Element): boolean => !el.closest('[data-off]');

const optionsOf = (el: Control): readonly string[] | null => (el instanceof HTMLSelectElement ? Array.from(el.options, (o) => o.value) : null);

/** The form's controls for the linked data and for the modules' survey fields. */
export function domHost(form: HTMLFormElement): CollegatiHost<Control> & PrefillHost<Control> {
  const all = (selector: string): Control[] => Array.from(form.querySelectorAll(selector)).filter(isControl);
  return {
    byName: (name) => all(`[name="${CSS.escape(name)}"]`),
    tickOf: (name, value) => all(`input[name="${CSS.escape(name)}"][value="${CSS.escape(value)}"]`)[0] ?? null,
    shown,
    moduloOpen: (el) => {
      const box = el.closest('[data-modulo]');
      return box ? !box.hasAttribute('data-off') : null;
    },
    labelOf: (el) => el.closest('label')?.textContent?.trim() ?? el.value,
    optionsOf,
    autoControls: () => all('[data-auto]'),
    controls: () => all('[data-modulo] [data-prefill]'),
    tokenOf: (el) => el.dataset.prefill ?? '',
  };
}
