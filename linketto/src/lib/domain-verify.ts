// Проверка на собствеността на собствен домейн с TXT запис — чисто, тества се.
// Без нея всеки платен потребител може да „заеме“ чужд домейн (полето е
// unique) преди истинския собственик. Публично се сервира само проверен домейн
// (/d/[domain]); DNS заявката е в actions/profile.ts (verifyDomainAction).

export const DOMAIN_TXT_PREFIX = '_linketto';
const VALUE_PREFIX = 'linketto-verify=';

export function domainTxtName(domain: string): string {
  return `${DOMAIN_TXT_PREFIX}.${domain}`;
}

export function domainTxtValue(token: string): string {
  return `${VALUE_PREFIX}${token}`;
}

/** TXT записите от DNS (всеки е масив от части ≤255 знака) съдържат ли токена. */
export function txtMatches(records: string[][], token: string): boolean {
  if (!token) return false;
  const expected = domainTxtValue(token);
  return records.some((chunks) => chunks.join('').trim() === expected);
}

/** Какво става с проверката при запис на настройките. */
export function domainChange(input: {
  current: string | null;
  next: string | null;
}): { kind: 'keep' } | { kind: 'clear' } | { kind: 'reset' } {
  if (input.current === input.next) return { kind: 'keep' };
  if (input.next === null) return { kind: 'clear' };
  return { kind: 'reset' };
}
