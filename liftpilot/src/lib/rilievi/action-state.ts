// What the survey sheets' server actions (src/server/rilievi/actions.ts) answer when they do not move on to another page
// (on success they redirect, with `?ok=<flash key>`). Kept apart from the 'use server' module, which exports functions
// only. The error codes' texts: `rilievi.error.<code>` (forbidden, notFound, tooMany, tooLarge, loginNeeded).
import type { FieldErrors, FormValues } from './field-parsers';

export type RilievoActionError = 'forbidden' | 'notFound' | 'tooMany' | 'tooLarge';

/** The sheet's form after a submit that did not save: the values as sent (to show them again, the modules' marks
 *  included), with the errors per field (rilievi's 422), or the conflict (409: someone saved the sheet meanwhile — the
 *  input stays, `base` is now the current version, so a second «Salva» overwrites knowingly), or a refusal. */
export type RilievoFormState =
  | { status: 'idle' }
  | { status: 'invalid'; values: FormValues; errors: FieldErrors; base: string }
  | { status: 'conflict'; values: FormValues; base: string }
  | { status: 'error'; error: RilievoActionError };

export const initialRilievoFormState: RilievoFormState = { status: 'idle' };

/** Trash, restore, delete for good: a refusal, or nothing (they redirect when done). */
export type RilievoActionState = { error?: RilievoActionError };

export const initialRilievoActionState: RilievoActionState = {};
