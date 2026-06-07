import { hash, verify } from '@node-rs/argon2';

/**
 * Хеширане на админ пароли с argon2id. Параметрите следват препоръчителните
 * стойности на OWASP; солта се генерира вътрешно от библиотеката.
 */
const options = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, options);
}

export async function verifyPassword(digest: string, plain: string): Promise<boolean> {
  try {
    return await verify(digest, plain, options);
  } catch {
    // Повреден хеш в базата не бива да хвърля 500 при опит за вход.
    return false;
  }
}
