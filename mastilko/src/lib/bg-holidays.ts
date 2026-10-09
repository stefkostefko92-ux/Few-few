// Официалните празници в България за дадена година — с подвижните (Великден,
// изчислен по православната пасхалия). Ключ „M-D“ (месец 1–12, ден) → име.
// Чисто, тествано (виж __tests__). Без часовникова зона извън UTC.

const FIXED: Array<[number, number, string]> = [
  [1, 1, "Нова година"],
  [3, 3, "Ден на Освобождението"],
  [5, 1, "Ден на труда"],
  [5, 6, "Гергьовден — Ден на храбростта"],
  [5, 24, "Ден на българската просвета и култура"],
  [9, 6, "Ден на Съединението"],
  [9, 22, "Ден на Независимостта"],
  [12, 24, "Бъдни вечер"],
  [12, 25, "Рождество Христово (Коледа)"],
  [12, 26, "Рождество Христово — втори ден"],
];

/** Дата на православния Великден (григориански) за годината. */
export function orthodoxEaster(year: number): Date {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31); // 3 = март, 4 = април (юлиански)
  const day = ((d + e + 114) % 31) + 1;
  const julian = new Date(Date.UTC(year, month - 1, day));
  julian.setUTCDate(julian.getUTCDate() + 13); // юлиански → григориански (1900–2099)
  return julian;
}

function key(d: Date): string {
  return `${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

/** Всички официални празници за годината: „M-D“ → име. */
export function bgHolidays(year: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [m, d, name] of FIXED) out[`${m}-${d}`] = name;

  const easter = orthodoxEaster(year);
  const goodFriday = new Date(easter);
  goodFriday.setUTCDate(easter.getUTCDate() - 2);
  const holySaturday = new Date(easter);
  holySaturday.setUTCDate(easter.getUTCDate() - 1);
  const easterMonday = new Date(easter);
  easterMonday.setUTCDate(easter.getUTCDate() + 1);

  out[key(goodFriday)] = "Разпети петък";
  out[key(holySaturday)] = "Велика събота";
  out[key(easter)] = "Великден";
  out[key(easterMonday)] = "Велики понеделник";
  return out;
}
