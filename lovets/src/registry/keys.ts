import { emailDomain } from '../compliance/normalize.js';

/**
 * Ключовете, по които се търси стойност в регистър или в „не ме търсете“: самата стойност и,
 * за имейл или URL, домейнът ѝ (вписан домейн обхваща всички адреси на домейна).
 */
export function lookupKeys(normalizedValue: string): string[] {
  if (normalizedValue.includes('@')) return [normalizedValue, emailDomain(normalizedValue)];
  if (/^https?:\/\//.test(normalizedValue)) {
    const host = new URL(normalizedValue).hostname.replace(/^www\./, '');
    return [normalizedValue, host];
  }
  return [normalizedValue];
}
