// pii.mjs — откриване на лични данни, които не бива да напускат машината през инструмент на агент.
//
// Защо (Разбивача, 23.11.2026, F2): доктрината забранява изнасяне на лични данни, а кодът не ги
// виждаше — ЕГН с диагноза в адрес на WebFetch, в текста на търсене или в аргумент на MCP минаваше с
// изход 0. Тук е само ЕГН: то е единственият идентификатор, който можем да познаем почти без фалшиви
// тревоги (валидна дата + контролна сума отсяват телефони, Unix време и случайни 10-цифрени числа).
// Имена, адреси и диагнози в свободен текст регулярен израз не хваща надеждно — там защитата е
// данните изобщо да не влизат в контекста на агента.

const WEIGHTS = [2, 4, 8, 5, 10, 9, 7, 3, 6];

/**
 * Валидно ЕГН: 10 цифри, реална дата (месец +40 за 2000-те) и контролна цифра. Месец +20 (1800-те) не се
 * приема: живи хора с такова ЕГН няма, а клонът отваряше още фалшиви тревоги (Кодаджията, 23.11.2026).
 */
export function isValidEgn(s) {
  const d = String(s ?? "");
  if (!/^\d{10}$/.test(d)) return false;
  const yy = Number(d.slice(0, 2)), mmRaw = Number(d.slice(2, 4)), dd = Number(d.slice(4, 6));
  let year, month;
  if (mmRaw >= 1 && mmRaw <= 12) { year = 1900 + yy; month = mmRaw; }
  else if (mmRaw >= 41 && mmRaw <= 52) { year = 2000 + yy; month = mmRaw - 40; }
  else return false;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (dd < 1 || dd > days) return false;
  const sum = WEIGHTS.reduce((acc, w, i) => acc + w * Number(d[i]), 0) % 11;
  return (sum === 10 ? 0 : sum) === Number(d[9]);
}

// Измерено (Кодаджията, 2M проби): ~1,1% от случайните 10-цифрени числа минават датата и контролната сума,
// а Unix секундите от 15.01.2027 до юни 2027 — ~2,8%. В аргумент на MCP (ID на коментар в GitHub, време)
// това е блок на всеки ~36–90 стойности. Затова там, където текстът е произволен JSON или команда, искаме
// ЕТИКЕТ до числото; в адреса на WebFetch и в търсенето голото число стига.
const LABEL = /(?:ЕГН|EGN|ЛНЧ|LNCH|личен\s+номер|ID\s*номер|national\s*id)/i;
const CANDIDATE = /(?<![\d-])(\d{6})[\s./-]?(\d{4})(?![\d-])/g;

/**
 * Първото валидно ЕГН в текста, иначе null. Приема и разделител след датата (`850315-1235`).
 * `{ needLabel: true }` — броим само число с етикет (ЕГН, EGN, ЛНЧ…) до 30 знака преди него.
 */
export function findEgn(text, { needLabel = false } = {}) {
  const t = String(text ?? "");
  for (const m of t.matchAll(CANDIDATE)) {
    const id = m[1] + m[2];
    if (!isValidEgn(id)) continue;
    if (needLabel && !LABEL.test(t.slice(Math.max(0, m.index - 30), m.index))) continue;
    return id;
  }
  return null;
}
