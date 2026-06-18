import argon2 from 'argon2';
import bcrypt from 'bcryptjs';

// Хеширане на тайни (пароли, PIN, резервни кодове) с Argon2id — препоръката на
// OWASP за пароли. Параметрите следват минимума на OWASP (m=19 MiB, t=2, p=1).
// verify() приема и стари bcrypt хешове за прозрачна миграция.
const OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export async function hashSecret(secret) {
  return argon2.hash(String(secret), OPTS);
}

export async function verifySecret(secret, stored) {
  if (!stored) return false;
  try {
    if (stored.startsWith('$argon2')) return await argon2.verify(stored, String(secret));
    if (stored.startsWith('$2')) return bcrypt.compareSync(String(secret), stored); // legacy
  } catch {
    return false;
  }
  return false;
}

// true, ако хешът не е Argon2id (трябва да се пре-хешира при следващ успешен вход).
export function needsRehash(stored) {
  return !stored || !stored.startsWith('$argon2');
}
