import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Случаен токен за бисквитка или връзка (base64url, без падинг). 32 байта = 43 знака. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Сравнение в константно време. Различна дължина връща false без изтичане на съдържанието. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
