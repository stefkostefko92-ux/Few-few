/**
 * Българските идентификатори във фактурата: ЕИК/БУЛСТАТ (BT-30, BT-47) и ДДС номер (BT-31, BT-48).
 *
 * Контролната цифра на 9-цифрения ЕИК: тегла 1…8 върху първите 8 цифри, остатък по модул 11; ако е 10 —
 * тегла 3…10 и пак модул 11; ако пак е 10 — цифрата е 0. Сверено с реални кодове (208725180 на
 * Carbon Stealth VCC, 131063188 на НАП) — tests/einvoice-bg-ids.test.ts.
 * 13-цифреният код (клон) = 9-цифрен ЕИК + 4 цифри; контролната цифра на клона НЕ се проверява, защото
 * официален алгоритъм не е потвърден — проверяват се първите 9.
 */
function nineDigitCheck(digits: number[]): number {
  const weighted = (start: number) =>
    digits.slice(0, 8).reduce((acc, digit, index) => acc + digit * (start + index), 0) % 11;
  let remainder = weighted(1);
  if (remainder === 10) remainder = weighted(3);
  return remainder === 10 ? 0 : remainder;
}

export function isValidEik(value: string): boolean {
  if (!/^(\d{9}|\d{13})$/.test(value)) return false;
  const digits = value.split('').map(Number);
  return nineDigitCheck(digits) === digits[8];
}

/** ДДС номер в България: „BG“ + 9 цифри (ЕИК) или 10 (физическо лице). */
export const BG_VAT = /^BG\d{9,10}$/;

/** ДДС номер от ЕС: двубуквен префикс (EL за Гърция) и 2–12 знака. */
export const EU_VAT = /^[A-Z]{2}[0-9A-Z+*.]{2,12}$/;

export function normalizeVat(value: string): string {
  return value.replace(/[\s.-]/g, '').toUpperCase();
}

/** Българският ДДС номер с 9 цифри трябва да е валиден ЕИК (номерът по чл. 94, ал. 2 ЗДДС). */
export function isValidBgVat(value: string): boolean {
  if (!BG_VAT.test(value)) return false;
  const digits = value.slice(2);
  return digits.length === 10 || isValidEik(digits);
}
