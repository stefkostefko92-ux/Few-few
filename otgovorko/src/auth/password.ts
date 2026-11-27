import * as argon2 from 'argon2';

/** Argon2id по втората препоръка на RFC 9106: m = 64 MiB, t = 3. */
const OPTIONS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;

export const PASSWORD_MIN_LENGTH = 16;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/** Фиктивен хеш — при непознат имейл проверката отнема същото време (без изброяване на акаунти). */
let dummyHash: Promise<string> | null = null;
export function dummyVerify(password: string): Promise<boolean> {
  dummyHash ??= argon2.hash('otgovorko-dummy-password-for-timing', OPTIONS);
  return dummyHash.then((h) => verifyPassword(h, password)).then(() => false);
}
