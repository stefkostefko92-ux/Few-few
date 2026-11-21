// Резервни кодове за 2FA (при загубен телефон): 10 еднократни кода по 10 знака
// от base32 без двусмислени знаци (≈50 бита всеки). Пазим само sha256 хеша —
// кодът е с висока ентропия, бавен хеш не е нужен. Показват се веднъж.

import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без I, O, 0, 1
export const BACKUP_CODE_COUNT = 10;
/** Под този брой оставащи кодове — подкана за нови (вход и страницата „Сигурност“). */
export const BACKUP_CODES_LOW = 3;

export function newBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    let code = '';
    for (let i = 0; i < 10; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  });
}

export function normalizeBackupCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashBackupCode(code: string): string {
  return createHash('sha256').update(`linketto-backup:${normalizeBackupCode(code)}`).digest('hex');
}

/** Индексът на съвпадащия хеш (за изтриване — еднократен) или -1. Сравнение в константно време. */
export function matchBackupCode(input: string, hashes: readonly string[]): number {
  const normalized = normalizeBackupCode(input);
  if (normalized.length !== 10) return -1;
  const candidate = Buffer.from(hashBackupCode(normalized), 'hex');
  let found = -1;
  hashes.forEach((hash, index) => {
    const stored = Buffer.from(hash, 'hex');
    if (stored.length === candidate.length && timingSafeEqual(stored, candidate) && found === -1) found = index;
  });
  return found;
}
