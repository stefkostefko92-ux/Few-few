import { createHmac } from 'node:crypto';

/**
 * Отпечатък на нормализирана стойност (имейл, домейн, телефон) — HMAC-SHA256 с пипер от сървъра.
 * Регистрите за отказ и списъкът „не ме търсете“ пазят само отпечатъци, не самите стойности
 * (минимизация, чл. 5(1)(c) ОРЗД): възражението се помни, без да се пази адресът.
 */
export function fingerprint(normalizedValue: string, pepper: string): string {
  return createHmac('sha256', pepper).update(normalizedValue).digest('hex');
}
