// Български телефонни номера за четене от човек — един формат навсякъде.
//
// В tel: връзката винаги отиват само цифрите (виж TelLink) — тук е само
// ПОКАЗВАНЕТО. Групирането следва националната номерация:
//   • мобилни (087/088/089/098/099) → „0877 414 874“
//   • национални 0700/0800/0900      → „0700 10 375“
//   • София (02 + 7 цифри)           → „02 931 11 11“
//   • областни градове (0XX + 6)     → „078 55 97 00“
//   • малки населени места (0XXX + 5, напр. Бобов дол 0702) → „0702 6 23 23“
//   • кратки номера (112, 150, 166, 116 111…) → без промяна
// Всичко непознато (чужд номер, думи, няколко номера в едно поле, непълен
// номер) се връща НЕПРОМЕНЕНО — по-добре суров номер, отколкото грешно разбит.

// Областни центрове с двуцифрен код след нулата (абонатният номер е 6 цифри).
const AREA_3 = new Set([
  "032", "034", "038", "042", "044", "046", "052", "054", "056", "058", "062",
  "064", "066", "068", "073", "076", "078", "082", "084", "086", "092", "094",
  "096",
]);

/** Целият низ като ЕДИН номер, само с цифри в национален запис — или null. */
function digitsAsOne(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  // Само цифри, интервали и обичайните разделители. Думи („централа“) и
  // запетаи (два номера в едно поле) → не пипаме.
  if (/[^\d\s+()\-./]/.test(s)) return null;
  const plus = s.indexOf("+");
  if (plus > 0 || s.lastIndexOf("+") !== plus) return null;
  const digits = s.replace(/\D/g, "");
  if (!digits) return null;
  if (plus === 0) return digits.startsWith("359") ? "0" + digits.slice(3) : null;
  if (digits.startsWith("00359")) return "0" + digits.slice(5);
  if (digits.startsWith("00")) return null; // чужд международен номер
  return digits;
}

/** Кодът на 9-цифрен национален номер: „02“, „078“ (областен град) или „0702“. */
function areaCode(n: string): string {
  if (n.startsWith("02")) return "02";
  return AREA_3.has(n.slice(0, 3)) ? n.slice(0, 3) : n.slice(0, 4);
}

/** Пълен български номер в национален запис (с правилна дължина) или кратък. */
function isCompleteNational(n: string): boolean {
  // Кратки (112, 150, 1470) и европейските 116 XXX (116 111 — детска линия).
  if (/^(?:1\d{2,3}|116\d{3})$/.test(n)) return true;
  if (!/^0[1-9]/.test(n)) return false;
  return n.length === (/^0(?:8[789]|9[89])/.test(n) ? 10 : 9);
}

/**
 * Няколко номера в едно поле („0888 123 456 / 0702 62323“, „…, …“) → всеки
 * поотделно; един номер → [номера]. „/“ често е и разделител на кода
 * („0702/6 23 23“) — затова низът се разделя само ако като ЕДИН номер не е
 * пълен. „0702 62323 / 62324“ — вторият е само абонатният номер и получава
 * кода от предния („0702 62324“).
 */
export function splitPhones(raw: string): string[] {
  const s = raw.trim();
  if (!/[/;,]/.test(s)) return [s];
  const one = digitsAsOne(s);
  if (one && isCompleteNational(one)) return [s];
  const parts = s.split(/\s*[/;,]\s*/).filter((p) => /\d/.test(p));
  if (parts.length < 2) return [s];
  const out: string[] = [];
  let prev: string | null = null;
  for (const p of parts) {
    const d = digitsAsOne(p);
    let part = p;
    // Само абонатният номер с точната дължина за кода на предния номер.
    const code = prev && prev.length === 9 ? areaCode(prev) : "";
    if (d && code && /^[2-9]/.test(d) && d.length === 9 - code.length) part = `${code} ${p}`;
    out.push(part);
    const pd = digitsAsOne(part);
    prev = pd && isCompleteNational(pd) ? pd : null;
  }
  return out;
}

/**
 * Национален запис само с цифри („0877414874“) или null, ако не е български
 * номер или полето съдържа няколко номера (виж splitPhones).
 */
export function nationalDigits(raw: string): string | null {
  if (splitPhones(raw).length > 1) return null;
  return digitsAsOne(raw);
}

/** Вместо номер, който не може да се набере (виж isDialablePhone). */
export const NOT_DIALABLE = "Телефонът се проверява";

/**
 * Може ли номерът да се набере — false САМО за ясно български номер с грешна
 * дължина или невъзможен код: „0702 2016“ (4 цифри след 0702 вместо 5),
 * „000 000 000“ (примерен), мобилен без цифра. Българските номера с код са
 * 9 цифри (02 + 7, 0XX + 6, 0XXX + 5, 0700 + 5), мобилните — 10; кратките 112, 150,
 * 1470 и европейските 116 XXX са верни. Чужд номер, думи или няколко номера в
 * едно поле — не съдим (true; всеки от няколкото се съди поотделно след
 * splitPhones). Ползва се, за да не правим tel: бутон за номер, който не свързва.
 */
export function isDialablePhone(raw: string): boolean {
  if (/^0+$/.test(raw.replace(/\D/g, ""))) return false; // „000 000 000“
  const n = nationalDigits(raw);
  if (n === null) return true;
  return isCompleteNational(n);
}

/**
 * „+359877414874“ → „0877 414 874“; „0702 62323“ → „0702 6 23 23“;
 * „112“ → „112“. Непознат формат → оригиналният текст.
 */
export function formatPhoneBg(raw: string): string {
  const n = nationalDigits(raw);
  if (!n) return raw;
  // Кратки национални номера (112, 150, 160, 166, 1470, 116 111…) — без промяна.
  if (/^(?:1\d{2,3}|116\d{3})$/.test(n)) return raw.trim();

  let m: RegExpExecArray | null;
  // Мобилни: 087/088/089/098/099 + 7 цифри.
  if ((m = /^(0(?:8[789]|9[89])\d)(\d{3})(\d{3})$/.exec(n))) {
    return `${m[1]} ${m[2]} ${m[3]}`;
  }
  // Мобилен префикс с грешен брой цифри — не гадаем.
  if (/^0(?:8[789]|9[89])/.test(n)) return raw;
  // Национални 0700 / 0800 / 0900 + 5 цифри.
  if ((m = /^(0[789]00)(\d{2})(\d{3})$/.exec(n))) {
    return `${m[1]} ${m[2]} ${m[3]}`;
  }
  // София: 02 + 7 цифри.
  if ((m = /^(02)(\d{3})(\d{2})(\d{2})$/.exec(n))) {
    return `${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
  }
  // Областен град: 0XX + 6 цифри.
  m = /^(0\d{2})(\d{2})(\d{2})(\d{2})$/.exec(n);
  if (m && AREA_3.has(m[1])) {
    return `${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
  }
  // По-малко населено място: 0XXX + 5 цифри (Бобов дол 0702, Дупница 0701).
  if ((m = /^(0[1-9]\d{2})(\d)(\d{2})(\d{2})$/.exec(n))) {
    return `${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
  }
  return raw;
}

/**
 * Телефон, въведен от посетител във форма — допълва очевидно липсващото:
 * „359888123456“ → „0888 123 456“ (без „+“), „888 123 456“ → „0888 123 456“
 * (мобилен без 0). Всичко друго се връща както е (само без крайните интервали).
 */
export function normalizePhoneInput(raw: string): string {
  const s = raw.trim();
  if (s.startsWith("+") || digitsAsOne(s) === null) return s;
  const d = s.replace(/\D/g, "");
  const fixed = /^359\d{8,9}$/.test(d)
    ? "0" + d.slice(3)
    : /^(?:8[789]|9[89])\d{7}$/.test(d)
      ? "0" + d
      : null;
  return fixed && isCompleteNational(fixed) ? formatPhoneBg(fixed) : s;
}

/**
 * Телефон от форма: цифри, интервали, +, -, (, ), / и поне 6 цифри — и всеки
 * български номер в полето е с пълна дължина. Иначе публикуваното съдържание
 * би показало „Телефонът се проверява“ вместо номера.
 */
export function isPhoneInput(v: string): boolean {
  return (
    /^[+\d\s()\-/]{6,40}$/.test(v) &&
    (v.match(/\d/g)?.length ?? 0) >= 6 &&
    splitPhones(v).every(isDialablePhone)
  );
}
