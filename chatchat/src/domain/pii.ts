/**
 * Маскиране на лични данни в свободния текст ПРЕДИ запис и ПРЕДИ изпращане към модела (GDPR
 * чл. 5(1)(c), чл. 25 — правният одит, т. 5). Не е гаранция: UI отделно казва „без лични данни“.
 * Логиката е копирана от agentgw/src/pii.ts (продуктите не споделят код), с италианския
 * codice fiscale вместо ЕГН. Сериини номера, кодове и версии не приличат на телефон и остават.
 */

export const PII_LABELS = {
  email: '[email]',
  phone: '[tel]',
  iban: '[IBAN]',
  card: '[card]',
  taxCode: '[CF]',
} as const;

// Опит само от началото на поредица от разрешени знаци (lookbehind) и с тавани по RFC 5321 —
// иначе дълъг низ без „@“ се сканира от всяка позиция до края (квадратично време).
const EMAIL = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}/g;
// IBAN: 2 букви + 2 цифри + 11–30 букви/цифри, по желание на групи от по 4 с интервал.
const IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/gi;
// Кандидат за карта: 13–19 цифри с интервали/тирета между тях (проверява се Luhn).
const CARD = /\b\d(?:[ -]?\d){12,18}\b/g;
// Codice fiscale: 6 букви, 2 цифри, буква, 2 цифри, буква, 3 цифри, буква.
const TAX_CODE = /\b[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z]\b/gi;
// Телефон: международен (+39…) или национален (0…/3…), 8–15 цифри с разделители.
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,5}\d{2,4}/g;

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return digits.length >= 13 && sum % 10 === 0;
}

export function ibanValid(raw: string): boolean {
  const s = raw.replace(/\s/g, '').toUpperCase();
  if (s.length < 15 || s.length > 34) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const val = code >= 65 && code <= 90 ? String(code - 55) : ch;
    for (const digit of val) rem = (rem * 10 + Number(digit)) % 97;
  }
  return rem === 1;
}

export function redactPii(text: string): string {
  let out = text.replace(EMAIL, PII_LABELS.email);
  out = out.replace(TAX_CODE, PII_LABELS.taxCode);
  out = out.replace(IBAN, (m) => (ibanValid(m) ? PII_LABELS.iban : m));
  out = out.replace(CARD, (m) => (luhnValid(digitsOnly(m)) ? PII_LABELS.card : m));
  out = out.replace(PHONE, (m) => {
    const d = digitsOnly(m);
    // Италиански мобилни започват с 3, стационарни с 0; международните — с „+“.
    const looksPhone = m.trim().startsWith('+') || d.startsWith('0') || /^3\d{8,9}$/.test(d);
    return looksPhone && d.length >= 8 && d.length <= 15 ? PII_LABELS.phone : m;
  });
  return out;
}
