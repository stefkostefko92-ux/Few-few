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
} as const;

export function customerLabel(userId: string): string {
  return `@customer:${userId}`;
}

const KEYS: Readonly<Record<string, string>> = {
  system: 'label.system',
  superseded: 'label.superseded',
  'cancelled-by-customer': 'label.cancelledByCustomer',
  signup: 'label.signup',
  'trial-started': 'label.trialStarted',
  withdrawal: 'label.withdrawal',
  'created-by-staff': 'label.createdByStaff',
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
