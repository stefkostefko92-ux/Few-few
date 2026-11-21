// Линк за плащане ПРИ създателя (spec §7.1 P13) — чисто, тества се. Само https,
// с истински хост (с точка), без вградени данни за вход; извежда се на
// публичния профил с rel="nofollow noopener noreferrer".
export function isExternalPaymentUrl(value: string): boolean {
  if (!value || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.hostname.includes('.')
    );
  } catch {
    return false;
  }
}
