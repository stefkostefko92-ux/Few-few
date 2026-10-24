/**
 * Редакция на лични данни ПРЕДИ текстът да напусне сървъра към Vertex (GDPR минимизация).
 * Цел: да не изпращаме случайно въведени идентификатори. Не е гаранция — уиджетът отделно
 * казва „не въвеждай лични данни“.
 */

export const PII_LABELS = {
  email: '[имейл]',
  phone: '[телефон]',
  egn: '[ЕГН]',
  iban: '[IBAN]',
  card: '[карта]',
} as const;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// IBAN: 2 букви + 2 цифри + 11–30 букви/цифри, по желание на групи от по 4 с интервал.
const IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/gi;
// Кандидат за карта: 13–19 цифри с интервали/тирета между тях.
const CARD = /\b\d(?:[ -]?\d){12,18}\b/g;
// ЕГН: точно 10 цифри (проверява се контролната сума).
const EGN = /\b\d{10}\b/g;
// Телефон: международен (+359…) или национален (0…), 8–15 цифри с разделители.
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,5}\d{2,4}/g;

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
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

/** ЕГН: тегла 2,4,8,5,10,9,7,3,6; остатък mod 11 (10 → 0); валиден месец (+20 / +40 за века). */
export function egnValid(egn: string): boolean {
  if (!/^\d{10}$/.test(egn)) return false;
  const w = [2, 4, 8, 5, 10, 9, 7, 3, 6];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(egn[i]) * w[i]!;
  const check = (sum % 11) % 10;
  if (check !== Number(egn[9])) return false;
  const month = Number(egn.slice(2, 4));
  const m = month > 40 ? month - 40 : month > 20 ? month - 20 : month;
  const day = Number(egn.slice(4, 6));
  return m >= 1 && m <= 12 && day >= 1 && day <= 31;
}

export function redactPii(text: string): string {
  let out = text.replace(EMAIL, PII_LABELS.email);
  out = out.replace(IBAN, (m) => (ibanValid(m) ? PII_LABELS.iban : m));
  out = out.replace(CARD, (m) => (luhnValid(digitsOnly(m)) ? PII_LABELS.card : m));
  out = out.replace(EGN, (m) => (egnValid(m) ? PII_LABELS.egn : m));
  out = out.replace(PHONE, (m) => {
    const d = digitsOnly(m);
    const looksPhone = m.trim().startsWith('+') || d.startsWith('0');
    return looksPhone && d.length >= 8 && d.length <= 15 ? PII_LABELS.phone : m;
  });
  return out;
}
