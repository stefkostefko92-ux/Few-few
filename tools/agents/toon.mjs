#!/usr/bin/env node
// toon.mjs — TOON-стил таблична нотация за подаване на ЕДНООБРАЗНИ масиви към LLM.
// Идея от TOON формата (awesome-llm-apps / toon-format), написана НАШИЯ начин: zero-dep, ~30 реда.
//
// Защо: JSON повтаря ключовете на всеки ред. За uniform масив (мач-история, trend, ledger)
// header+редове реже токените драстично. ИЗМЕРЕНО с token-budget.estTokens на наши данни
// (2026-07-23): голад мач-история 200 реда → −48% vs компактен JSON; trend 50 реда → −68%;
// прозаичен run-plan → само −18% (за проза/вложени структури НЕ си струва — остава JSON).
//
// Формат:  N{key1,key2,…}:\n  val,val,…  (CSV-екраниране за стойности със запетая/кавичка/нов ред)
//
//   node tools/agents/toon.mjs < data.json          # stdin JSON масив → stdout TOON
//   import { toonEncode } from "…/toon.mjs"          # програмно
//
// Правило: ползвай САМО за плоски, еднообразни масиви към LLM. Не е сериализация за съхранение
// (няма schema еволюция) и не е за човешки конфиг файлове.

import { readFileSync } from "node:fs";

export function toonEncode(arr) {
  if (!Array.isArray(arr)) throw new Error("toonEncode иска масив");
  if (!arr.length) return "0{}:";
  const keys = Object.keys(arr[0]);
  const esc = (v) => {
    if (v && typeof v === "object") return JSON.stringify(JSON.stringify(v)); // вложено → JSON стринг (рядко; сигнал, че данните не са плоски)
    const s = String(v ?? "");
    return /[,\n"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return `${arr.length}{${keys.join(",")}}:\n` + arr.map((o) => "  " + keys.map((k) => esc(o[k])).join(",")).join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const data = JSON.parse(readFileSync(0, "utf8"));
    console.log(toonEncode(data));
  } catch (e) { console.error(`toon: ${e.message}`); process.exit(1); }
}
