// Бюлетин / email capture — чистата логика (валидиране, токени, CSV износ).
// Аудиторията е на създателя: GDPR двойно съгласие + отписване + износ.

import { randomBytes } from 'node:crypto';

/** Нормализира имейл: тримва и малки букви. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 200);
}

/** Проста, но стриктна проверка за валиден имейл. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** Неотгатваем токен за потвърждение/отписване (32 hex знака). */
export function generateSubscriberToken(): string {
  return randomBytes(16).toString('hex');
}

function csvCell(value: string): string {
  // Formula injection: клетка, започваща с = + - @ (или tab/CR), се изпълнява
  // като формула в Excel/Sheets — неутрализираме с водещ апостроф. Имейлът е
  // недоверен вход (=HYPERLINK(...)@evil.com минава имейл валидацията).
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  // RFC 4180: кавички при запетая/кавичка/нов ред; удвояваме вътрешните кавички.
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export interface SubscriberRow {
  email: string;
  locale: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
}

/** Построява CSV за износ на аудиторията (само потвърдени, подадени отвън). */
export function buildSubscribersCsv(rows: readonly SubscriberRow[]): string {
  const header = 'email,locale,confirmed_at,created_at';
  const lines = rows.map((row) =>
    [
      csvCell(row.email),
      csvCell(row.locale ?? ''),
      csvCell(row.confirmedAt ? row.confirmedAt.toISOString() : ''),
      csvCell(row.createdAt.toISOString()),
    ].join(','),
  );
  return [header, ...lines].join('\r\n') + '\r\n';
}
