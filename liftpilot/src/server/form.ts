// Result of a form action: an error code (translated by the page) or a success, with optional one-time data.
export interface FormState {
  ok?: boolean;
  error?: string;
  fields?: string[];
  /** shown once, e.g. a temporary password */
  secret?: string;
  message?: string;
  /** the new account confirms its address at the first sign-in */
  pending?: boolean;
}

export const initialFormState: FormState = {};

// A server action can be called by hand with a body that is no form at all (a JSON array, an object): its fields read
// as absent, and the action answers with its own error instead of failing on it.

/** The raw field (text, file or nothing). */
export const entry = (fd: FormData, name: string): FormDataEntryValue | null => (fd instanceof FormData ? fd.get(name) : null);

/** The field was sent (even empty). */
export const sent = (fd: FormData, name: string): boolean => fd instanceof FormData && fd.has(name);

/** The field as text: '' when absent or a file. */
export const str = (fd: FormData, name: string): string => {
  const v = entry(fd, name);
  return typeof v === 'string' ? v : '';
};
