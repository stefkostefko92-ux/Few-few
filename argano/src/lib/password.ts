import 'server-only';
import * as argon2 from 'argon2';
import { randomInt } from 'node:crypto';

/** Argon2id at the OWASP minimum: m = 19 MiB, t = 2, p = 1 (as in piuma). */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export { passwordPolicyOk, PASSWORD_MIN_LENGTH } from './password-policy';

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// A valid Argon2id hash of a random string: verifying against it when the e-mail is unknown keeps the
// response time the same, so the login does not reveal which e-mails exist.
let dummy: Promise<string> | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hashPassword(`no-user-${randomInt(1e9)}`);
  await verifyPassword(password, await dummy);
}

/** Temporary password shown once to the person who creates or resets an account: 16 characters, no look-alikes. */
export function temporaryPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', digits = '23456789', all = letters + digits;
  const pick = (s: string): string => s.charAt(randomInt(s.length));
  const chars = [pick(letters), pick(digits), ...Array.from({ length: 14 }, () => pick(all))];
  for (let j = chars.length - 1; j > 0; j--) { const k = randomInt(j + 1); [chars[j], chars[k]] = [chars[k] as string, chars[j] as string]; }
  return chars.join('');
}
