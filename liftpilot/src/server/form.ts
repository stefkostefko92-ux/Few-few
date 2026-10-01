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

export const str = (fd: FormData, name: string): string => {
  const v = fd.get(name);
  return typeof v === 'string' ? v : '';
};
