// Съкратени линкове (/s/<code>) — чистата логика (код, валидиране).

import { randomBytes } from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Нормализира код: малки букви, само букви/цифри/тире, до 32 знака. */
export function normalizeShortCode(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 32);
}

/** Валиден код: 3–32 знака от [a-z0-9-]. */
export function isValidShortCode(code: string): boolean {
  return /^[a-z0-9-]{3,32}$/.test(code);
}

/** Случаен код (6 знака) за автоматично генериране. */
export function generateShortCode(): string {
  const bytes = randomBytes(6);
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}
