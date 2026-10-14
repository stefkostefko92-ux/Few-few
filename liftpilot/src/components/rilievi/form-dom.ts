// The sheet form's controls as the browser rules of Rilievi see them (rilievi's public/js/app.js, moduli.js and
// collegati.js, commit ae6329cb6): the conditions synced on the page as app.js synced them — at once, on the elements
// (`data-off`), so that the linked data read what is on screen while they fill in several rounds —, and the adapter the
// linked data (collegati-client.ts) and the modules' survey fields (prefill-client.ts) work through. Only DOM, no React:
// the form's hook (use-scheda-form.ts) calls it from its event listeners.
import type { CollegatiHost } from '@/lib/rilievi/collegati-client';
import { activeFields, tokensOf } from '@/lib/rilievi/fields';
import type { PrefillHost } from '@/lib/rilievi/prefill-client';
import { valuesOfForm } from '@/lib/rilievi/prefill-client';

export type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export const isControl = (el: unknown): el is Control =>
  el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;

export const isTick = (el: Control): boolean => el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');

/**
 * What shows under a condition (`data-when` = the field it depends on, `data-when-values` = its answers that open it):
 * open while that field makes sense itself (activeFields — the same rule as the server's) and holds one of the answers.
 * The fields, the measurements per stop, a module's make and a module's «Sì» alike. rilievi did it on every change.
 */
export function syncConditions(form: HTMLFormElement): void {
  const values = valuesOfForm(form);
  const active = activeFields((key) => values[key]);
  form.querySelectorAll<HTMLElement>('[data-when]').forEach((el) => {
    const field = el.dataset.when ?? '';
    const wanted = (el.dataset.whenValues ?? '').split(' ');
    const on = active.has(field) && tokensOf(values[field]).some((v) => wanted.includes(v));
    el.toggleAttribute('data-off', !on);
  });
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
