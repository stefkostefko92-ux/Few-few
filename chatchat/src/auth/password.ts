import * as argon2 from 'argon2';

/** Argon2id по втората препоръка на RFC 9106: m = 64 MiB, t = 3 (както в korpora). */
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (password.length > PASSWORD_MAX_LENGTH) return false;
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Хеш за несъществуващ акаунт: проверката срещу него отнема същото време като истинската,
 * затова отговорът не издава кой имейл съществува. Изчислява се веднъж при първа нужда.
 */
let dummy: Promise<string> | null = null;
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword('chatchat-timing-equaliser-not-a-password');
  return dummy;
}
