// Leaving the sheet form with unsaved changes (use-scheda-form.ts): another form of the page sent meanwhile (the top
// bar's search) is sent by the browser itself, a real page load, so the browser asks first as on every page load of
// rilievi. That needs a form whose action is an address: its own handler in the app (next/form moving inside the page)
// is skipped. A form whose action is a function of the app cannot be sent by the browser — React draws it with the
// action `javascript:…` in the browser, with hidden `$ACTION_…` fields on the server — and is left to the app.

/** Whether the browser can send the form itself: `action` is the address it would go to (the submitter's formaction,
 *  else the form's action attribute, null when there is none), `names` the names of its fields and of the submitter. */
export function browserSendable(action: string | null, names: readonly string[]): boolean {
  if (action !== null && /^\s*javascript:/i.test(action)) return false;
  return !names.some((n) => n.startsWith('$ACTION_'));
}
