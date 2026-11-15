import * as argon2 from 'argon2';
import { COMMON_PASSWORDS } from './common-passwords.js';

/** Argon2id по минимума на OWASP: m=19 MiB, t=2, p=1. */
const OPTIONS: argon2.HashOptions & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export const PASSWORD_MIN_LENGTH = 12;
/** Таван срещу претоварване на Argon2 с огромен вход; ASVS 5.0 v6.2.9 иска поне 64 позволени знака. */
export const PASSWORD_MAX_LENGTH = 256;

/** Наши думи, които речниците пробват първи, + корпусът на SecLists (`common-passwords.ts`). */
const OWN = ['piuma', 'carbonstealth', 'parola', 'instagram'];
const COMMON = [...new Set([...OWN, ...COMMON_PASSWORDS])];

/**
 * Политиката по NIST SP 800-63B и OWASP ASVS 5.0 (находка на Прониквача, 2026-11-15): дължина +
 * забранен списък, БЕЗ правила за състав („букви и цифри“ нарушава v6.2.5 и води до предвидими
 * пароли). Списъкът е ~7700 често срещани пароли (v6.2.4 иска поне 3000).
 */
export function passwordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Паролата трябва да е поне ${PASSWORD_MIN_LENGTH} знака.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Паролата трябва да е най-много ${PASSWORD_MAX_LENGTH} знака.`;
  }
  const squashed = password.toLowerCase().replace(/[^a-zа-я0-9]/g, '');
  // Честа парола, която е половината от паролата или повече („password2026!“, „qwerty123456“).
  if (COMMON.some((word) => squashed.includes(word) && word.length * 2 >= squashed.length)) {
    return 'Паролата е сред най-често използваните — изберете друга.';
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
