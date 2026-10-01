// Password rule, shared by the forms and the server: at least 12 characters with letters and digits.
export const PASSWORD_MIN_LENGTH = 12;

export function passwordPolicyOk(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && password.length <= 200 && /\p{L}/u.test(password) && /\d/.test(password);
}
