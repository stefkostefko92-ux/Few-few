import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Случаен токен, base64url. 32 байта = 256 бита. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** HMAC-SHA256 с „подправката“ от средата — в базата стои само това, не самият токен. */
export function hashToken(token: string, pepper: string): string {
  return createHmac('sha256', pepper).update(token).digest('hex');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Сравнение без изтичане по време. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
