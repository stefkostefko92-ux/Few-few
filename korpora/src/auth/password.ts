import * as argon2 from 'argon2';

/**
 * Argon2id по втората препоръка на RFC 9106: m = 64 MiB, t = 3. При вход старият хеш се
 * преизчислява, ако параметрите са сменени (`needsRehash`).
 */
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

/** Пароли, които всеки речник пробва първи. Изтеклите бази се проверяват отделно (breached.ts). */
const COMMON = [
  'password',
  'parola',
  'qwerty',
  'qwertyuiop',
  'asdfgh',
  'zxcvbn',
  'iloveyou',
  'letmein',
  'welcome',
  'admin',
  'korpora',
  'carbonstealth',
  '1234567890',
  '0987654321',
  '1q2w3e4r',
  'abc123',
];

export type PasswordProblem = 'tooShort' | 'tooLong' | 'common' | 'personal' | 'repetitive';

/**
 * Правилата са по NIST SP 800-63B: дължина + забранен списък, без задължителни „главна, цифра,
 * знак“ — те водят до предвидими пароли. Връща ключа на проблема (за превод) или null.
 */
export function passwordProblem(
  password: string,
  personal: Array<string | null | undefined> = [],
): PasswordProblem | null {
  if (password.length < PASSWORD_MIN_LENGTH) return 'tooShort';
  if (password.length > PASSWORD_MAX_LENGTH) return 'tooLong';
  const lower = password.toLowerCase();
  if (new Set(password).size < 4) return 'repetitive';
  const squashed = lower.replace(/[^a-zа-я0-9]/g, '');
  // Обща дума, която е половината от паролата или повече („password2026“, „qwerty123456“).
  if (COMMON.some((word) => squashed.includes(word) && word.length * 2 >= squashed.length)) {
    return 'common';
  }
  // Части от имейла или името (поне 4 знака) — първото, което пробва човек, който те познава.
  for (const item of personal) {
    const words =
      (item ?? '')
        .toLowerCase()
        .split('@')[0]
        ?.split(/[^a-zа-я0-9]+/) ?? [];
    if (words.some((word) => word.length >= 4 && squashed.includes(word))) return 'personal';
  }
  return null;
}

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

export function needsRehash(hash: string): boolean {
  try {
    return argon2.needsRehash(hash, OPTIONS);
  } catch {
    return true;
  }
}

/**
 * Хеш за несъществуващ акаунт: проверката срещу него отнема същото време като истинската,
 * затова отговорът не издава кой имейл е регистриран. Изчислява се веднъж при първа нужда.
 */
let dummy: Promise<string> | null = null;
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword('korpora-timing-equaliser-not-a-password');
  return dummy;
}
