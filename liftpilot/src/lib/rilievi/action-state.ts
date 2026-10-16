// What the survey sheets' server actions (src/server/rilievi/actions.ts) answer when they do not move on to another page
// (on success they redirect, with `?ok=<flash key>`). Kept apart from the 'use server' module, which exports functions
// only. The error codes' texts: `rilievi.error.<code>` (forbidden, readOnly, notFound, tooMany, tooLarge, sessionExpired;
// offline and failed are the browser's own: the request never got an answer — src/components/keep-on-failure.ts).
import type { FieldErrors, FormValues } from './field-parsers';
import type { Discrepanza } from './ordini/collegati';

export type RilievoActionError = 'forbidden' | 'readOnly' | 'notFound' | 'tooMany' | 'tooLarge' | 'sessionExpired' | 'offline' | 'failed';

/** What every answer that brings the form back carries besides its values: the names that still follow their source
 *  (`auto` — rilievi's data-auto: the browser keeps filling them from the sheet or the other module until the person
 *  types in them; ordini/form.ts withPrefill) and what the sheet and the modules say differently now (the lists under the
 *  modules' groups, ordini/collegati.ts discrepanzeDi). */
export interface RilievoFormBack {
  values: FormValues;
  auto: string[];
  discrepanze: Discrepanza[];
}

/** The sheet's form after a submit that did not save: the values as sent (to show them again, the modules' marks
 *  included), with the errors per field (rilievi's 422), or the conflict (409: someone saved the sheet meanwhile — the
 *  input stays, `base` is now the current version, so a second «Salva» overwrites knowingly; `updated` is the edit
 *  page's line about that version, «Ultima modifica di … il …»), or the discrepancies between the sheet and the modules
 *  to confirm (rilievi's 422 with «Salva comunque»: the form comes back as sent, the list on top, and a second submit
 *  button `conferma` = `impronta` — the fingerprint of exactly these discrepancies; the first button stays «Salva», so
 *  Enter in a field never confirms), or a refusal — the server's, or the browser's when no answer came (`base`: the
 *  version the form stood on, kept by the browser across the refusal, so that the next «Salva» is no conflict). */
export type RilievoFormState =
  | { status: 'idle' }
  | ({ status: 'invalid'; errors: FieldErrors; base: string } & RilievoFormBack)
  | ({ status: 'conflict'; base: string; updated: string } & RilievoFormBack)
  | ({ status: 'confirm'; base: string; impronta: string } & RilievoFormBack)
  | { status: 'error'; error: RilievoActionError; base?: string };

export const initialRilievoFormState: RilievoFormState = { status: 'idle' };

/** The name of the second submit button of a 'confirm' answer: its value is the fingerprint («Salva comunque»). */
export const CONFERMA_KEY = 'conferma';

/** The edited sheet's id in its form («Salva modifiche»). Not `id`: a field named so shadows the form's own `id`
 *  (HTMLFormElement's named properties), and React then leaves the submitter — «Salva comunque», `conferma` — out of the
 *  form's data, so the confirmation would be asked again and again. */
export const SCHEDA_KEY = 'scheda';

/** Trash, restore, delete for good: a refusal, or nothing (they redirect when done). */
export type RilievoActionState = { error?: RilievoActionError };

export const initialRilievoActionState: RilievoActionState = {};
