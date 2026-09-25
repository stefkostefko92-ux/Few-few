// mutation.mjs — безопасна мутация на файл за red-before-green доказателство.
//
// Защо съществува (от реални грешки, 2026-07-30):
//
// 1) НЕ-ЕКСПЕРИМЕНТ, четен като доказателство. Опитах да докажа, че liveness тестът лови счупен
//    хук: заменях `function main()` в `guard-dangerous.mjs` — но там НЯМА `function main()`.
//    Мутацията не се приложи, тестът остана зелен, и „зелено" се четеше като „тестът работи",
//    докато всъщност значеше „нищо не се случи". Мутация, която не се е приложила, е по-лоша от
//    липсваща — тя произвежда фалшива увереност.
//    → `withMutation` ХВЪРЛЯ, ако съдържанието не се е променило.
//
// 2) НЕВЪЗСТАНОВЕН ФАЙЛ. Ръчният `cp` назад работи, докато нещо не хвърли по средата.
//    → възстановяването е в `finally`, винаги, и се ПРОВЕРЯВА байт-за-байт.
//
// Договор: `withMutation(file, transform, fn)` прилага transform върху съдържанието, проверява че
// е различно, пуска `fn(mutatedText)`, връща резултата му и ВИНАГИ връща файла в изходния вид.

import { readFileSync, writeFileSync, renameSync } from "node:fs";

/**
 * АТОМАРЕН запис (Кръг 14, 2026-08-04). `writeFileSync` първо СЪКРАЩАВА файла, после пише — а
 * `node --test` пуска тестовите ФАЙЛОВЕ в паралелни процеси. Друг тест, който чете същия файл точно
 * в този прозорец, вижда ПРАЗЕН файл и се проваля по причина, нямаща нищо общо с него.
 *
 * Доказано, не предположено: CI падна на `flow-cost.test` с „префиксът 5178 т е над изведения таван
 * 4490 т (обвързващ: „Тестове")". Възпроизведох СЪСТОЯНИЕТО (не състезанието) — изпразване на
 * `_memory/izpitatelya.md` дава точно 4490 и точно „Тестове"; а мутиращият тест мутира точно
 * `izpitatelya`. Локално 6 паралелни пуска не хванаха състезанието — прозорецът е тесен, CI е
 * по-натоварен и го отваря.
 *
 * `rename` е атомарен на POSIX: четецът вижда или старото, или новото съдържание, никога празно.
 */
export function writeAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

export class MutationNotApplied extends Error {
  constructor(file) {
    super(`мутацията НЕ се приложи върху ${file} — това не е експеримент, а фалшива увереност: ` +
      `търсеният шаблон липсва (провери точния низ, преди да четеш резултата като доказателство)`);
    this.name = "MutationNotApplied";
  }
}

/**
 * @param {string} file път до файла
 * @param {(src:string)=>string} transform как се чупи
 * @param {(mutated:string)=>any} fn какво се наблюдава, докато е счупен
 */
export function withMutation(file, transform, fn) {
  const original = readFileSync(file, "utf8");
  const mutated = transform(original);
  if (mutated === original) throw new MutationNotApplied(file);
  writeAtomic(file, mutated);
  try {
    return fn(mutated);
  } finally {
    writeAtomic(file, original);
    // Проверката не е излишна: тихо невъзстановен файл трови всички следващи проверки в сесията.
    const now = readFileSync(file, "utf8");
    if (now !== original) throw new Error(`${file} НЕ е възстановен след мутация — спри и провери ръчно`);
  }
}

/** Замяна на точен низ, която сама се проверява (най-честият вид мутация). */
export const replaceOnce = (needle, replacement) => (src) => {
  const i = src.indexOf(needle);
  if (i === -1) return src; // → withMutation ще хвърли MutationNotApplied
  return src.slice(0, i) + replacement + src.slice(i + needle.length);
};

/** Обезврежда гейт: всеки изход става литерална нула (инструментът става докладчик).
 *
 * Първата версия беше `src.replace(/process\.exit\(([^;)]*)\)/g, …)` и се счупи веднага на
 * `process.exit(hard || (STRICT && warn) ? 1 : 0)` → регексът спря на ВЪТРЕШНАТА скоба и произведе
 * `process.exit(0) ? 1 : 0)`. Трети път за деня, в който регекс върху ВЛОЖЕНА структура лъже
 * (същото беше при FALLBACK блока и при „може ли гейтът да падне"). Затова: броене на скоби,
 * съобразено с низове — не регекс. */
export function neuterExits(src) {
  const NEEDLE = "process.exit(";
  let out = "", i = 0;
  for (;;) {
    const s = src.indexOf(NEEDLE, i);
    if (s === -1) { out += src.slice(i); return out; }
    const open = s + NEEDLE.length - 1;
    let depth = 0, inStr = null, esc = false, close = -1;
    for (let j = open; j < src.length; j++) {
      const c = src[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === inStr) inStr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
      if (c === "(") depth++;
      else if (c === ")") { depth--; if (depth === 0) { close = j; break; } }
    }
    if (close === -1) { out += src.slice(i); return out; } // незатворено → не пипай
    out += src.slice(i, s) + "process.exit(0)";
    i = close + 1;
  }
}
