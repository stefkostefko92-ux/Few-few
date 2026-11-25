import type { Translator } from './i18n.js';

/**
 * Етикетите, които системата пише в историята (кой е направил промяната и защо), се пазят като
 * стабилни знаци, не като думи — превеждат се при показване. Иначе ред, записан на български, стои
 * на български и в английския и италианския панел.
 */
export const LABEL = {
  system: '@system',
  superseded: '@superseded',
  cancelledByCustomer: '@cancelled-by-customer',
  signup: '@signup',
  trialStarted: '@trial-started',
  withdrawal: '@withdrawal',
  createdByStaff: '@created-by-staff',
  /** Поръчката чакаше плащане, когато акаунтът беше изтрит — вече не може да се изпълни. */
  accountDeleted: '@account-deleted',
  /** Планът е удължен с времето на блокиране, вдигнато като грешка (services/admin-security.ts). */
  banMistake: '@ban-mistake',
} as const;

export function customerLabel(userId: string): string {
  return `@customer:${userId}`;
}

/** Знакът (без „@“) → ключът на превода: `@trial-started` → `label.trialStarted`. Изведено от LABEL. */
const KEYS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    Object.entries(LABEL).map(([name, token]) => [token.slice(1), `label.${name}`]),
  ),
  customer: 'label.customer',
};

/** Записаният етикет за показ: знакът става думи на езика на страницата; името на човек остава както е. */
export function displayLabel(value: string | null | undefined, t: Translator): string {
  if (!value) return '';
  if (!value.startsWith('@')) return value;
  const colon = value.indexOf(':');
  const token = colon === -1 ? value.slice(1) : value.slice(1, colon);
  const arg = colon === -1 ? '' : value.slice(colon + 1);
  if (!Object.hasOwn(KEYS, token)) return value;
  return t(KEYS[token] as string, { id: arg });
}
