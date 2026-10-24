// Маскиране на лични данни в свободен текст ПРЕДИ запис (напр. търсене без
// резултат). Възрастните често пишат в търсачката ЕГН, телефон или имейл —
// такъв текст никога не бива да стига до базата.
//
// Чиста функция (без база, без server-only), за да се тества. Редът е важен:
// първо адреси/имейли/голи домейни/IBAN (съдържат цифри), после телефони, после ЕГН, накрая
// всяка друга дълга поредица от цифри (номер на договор, клиентски номер,
// дата на раждане и т.н.).
//
// Ограничение (честно): имена и адреси без цифри НЕ могат да се разпознаят
// надеждно. Затова записът има и срок (виж ./retention.ts) и е само за
// вътрешна употреба в админ панела.

export const PII_TOKENS = {
  url: "[адрес]",
  email: "[имейл]",
  iban: "[IBAN]",
  phone: "[телефон]",
  egn: "[ЕГН]",
  digits: "[цифри]",
} as const;

// Разделители, които хората слагат между цифрите: интервал, тире (и дълго),
// точка, наклонена, скоби — до 3 подред („088 - 123 - 4567“, „+359 (88) 123“).
// По-добре да маскираме повече, отколкото телефон да стигне до базата.
const SEP = "[\\s\\-./–—()]{0,3}";

const RX_URL = /\b(?:https?:\/\/|www\.)\S+/giu;
// Имейл — и с кирилски знаци в локалната част (хората ги пишат и така).
const RX_EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
// Адрес без „http“/„www“: „facebook.com/ivan.petrov“, „example.bg/път“. Само с
// позната крайна част (.bg, .com…), за да не хваща съкращения като „ул.“ или
// „гр.дупница“. Началото и краят са по букви (и кирилски), не по \b.
const TLD = "(?:bg|бг|eu|com|net|org|info|biz|io|me|app|dev|co|uk|de|it|fr|es|gr|ro|ru|rs|mk|tr|us|tv|online|site|shop|store|blog|xyz|edu|gov)";
const RX_DOMAIN = new RegExp(
  `(?<![\\p{L}\\p{N}_@.\\-])(?:[\\p{L}\\p{N}][\\p{L}\\p{N}\\-]{0,62}\\.)+${TLD}(?![\\p{L}\\p{N}_\\-])(?:[/?#]\\S*)?`,
  "giu",
);
// IBAN: 2 букви + 2 цифри + 11–30 знака, позволени са интервали по 4.
const RX_IBAN = /\b[a-z]{2}\d{2}(?:\s?[a-z0-9]){11,30}\b/giu;
// Телефон с международен код: +359 / 00359 и 8–9 цифри след него.
const RX_PHONE_INTL = new RegExp(`(?:\\+|\\b00)${SEP}359(?:${SEP}\\d){8,9}(?!\\d)`, "gu");
// Мобилен 08x/09x (10 цифри) или стационарен 0 + код (9 цифри), с разделители.
const RX_PHONE_LOCAL = new RegExp(`(?<!\\d)0${SEP}[1-9](?:${SEP}\\d){7,8}(?!\\d)`, "gu");
// Точно 10 поредни цифри — най-вероятно ЕГН (или ЛНЧ).
const RX_EGN = /(?<!\d)\d{10}(?!\d)/gu;
// Всяка друга поредица от 6+ цифри, вкл. с разделители („12.05.1950“, „123 456“).
const RX_DIGITS = new RegExp(`(?<!\\d)\\d(?:${SEP}\\d){5,}(?!\\d)`, "gu");

/** Заменя вероятните лични данни със служебни етикети. */
export function maskPii(input: string): string {
  let s = String(input ?? "");
  // Невидими/управляващи знаци — вън (иначе крият цифрите от проверките).
  s = s.replace(/[\p{Cc}\p{Cf}]/gu, " ");
  s = s.replace(RX_URL, PII_TOKENS.url);
  s = s.replace(RX_EMAIL, PII_TOKENS.email);
  // След имейлите — иначе „ivan@abv.bg“ би станало „ivan@[адрес]“.
  s = s.replace(RX_DOMAIN, PII_TOKENS.url);
  s = s.replace(RX_IBAN, (m) => (/\d.*\d.*\d/.test(m.slice(4)) ? PII_TOKENS.iban : m));
  s = s.replace(RX_PHONE_INTL, PII_TOKENS.phone);
  s = s.replace(RX_PHONE_LOCAL, PII_TOKENS.phone);
  s = s.replace(RX_EGN, PII_TOKENS.egn);
  s = s.replace(RX_DIGITS, PII_TOKENS.digits);
  return s.replace(/\s+/g, " ").trim();
}

const TOKEN_RX = /\[(?:адрес|имейл|IBAN|телефон|ЕГН|цифри)\]/gu;

/** Остава ли нещо смислено (поне 2 букви/цифри) след маскирането? */
export function hasContentAfterMask(masked: string): boolean {
  const rest = masked.replace(TOKEN_RX, " ").replace(/[^\p{L}\p{N}]+/gu, "");
  return rest.length >= 2;
}

/** Самопроверка: съдържа ли текстът нещо, което маскирането е трябвало да хване. */
export function looksLikePii(s: string): boolean {
  const t = String(s ?? "");
  return maskPii(t) !== t.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim();
}
