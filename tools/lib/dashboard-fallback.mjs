// dashboard-fallback.mjs — ЕДИН локатор за вградения `const FALLBACK = {…}` в agents-dashboard/index.html.
//
// Таблото има ДВЕ огледала на едни и същи данни: `agents.json` (за http) и вграден FALLBACK в
// index.html (за преглед през file://). `oversee` ГЕЙТВА съвпадението им — затова инструмент, който
// пипне само едното, чупи гейта. Точно това ми се случи при синхронизацията на броя поуки.
//
// Логиката тук беше вградена в `memory-capture.mjs` и живееше на едно място; вторият консуматор
// (`sync-dashboard.mjs`) щеше да я ПРЕПИШЕ — а преписаният парсер дрейфва (днешният урок с двата
// списъка за „какво е тайна“ и с двата брояча). Затова е изнесена веднъж, с тест.
//
// Внимание (реален бъг, поправен веднъж): скобите ВЪТРЕ в JSON низове (поука, съдържаща „{id}“)
// не бива да се броят — иначе `JSON.parse` гърми тихо и FALLBACK замръзва. Матчерът е string-aware.

const MARKER = "const FALLBACK = {";

/**
 * Намира границите на JSON обекта след `const FALLBACK = {`.
 * @returns {{begin:number,end:number}|null} begin = индекс на `{`, end = индекс на затварящата `}`.
 */
export function findFallbackBlock(html) {
  const s = html.indexOf(MARKER);
  if (s === -1) return null;
  const begin = html.indexOf("{", s);
  if (begin === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = begin; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return { begin, end: i }; }
  }
  return null; // незатворен обект → по-добре нищо, отколкото повреден запис
}

/** Разпарсва вградения FALLBACK. Връща null, ако блокът липсва или не е валиден JSON. */
export function parseFallback(html) {
  const b = findFallbackBlock(html);
  if (!b) return null;
  try { return JSON.parse(html.slice(b.begin, b.end + 1)); } catch { return null; }
}

/** Връща нов HTML с подменен FALLBACK обект (или оригинала, ако блокът не е намерен). */
export function replaceFallback(html, obj) {
  const b = findFallbackBlock(html);
  if (!b) return html;
  return html.slice(0, b.begin) + JSON.stringify(obj, null, 2) + html.slice(b.end + 1);
}
