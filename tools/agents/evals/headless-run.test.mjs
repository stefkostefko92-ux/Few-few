// tools/agents/evals/headless-run.test.mjs — регресия за system-ниво префикса на eval-харнеса.
//
// Пази две неща, които доскоро бяха счупени:
//  (1) ФИДЕЛНОСТ — eval-ът трябва да инжектира СЪЩИЯ статичен префикс (доктрина+процедура+споделено),
//      който продукцията дава на агента; без него eval мереше агент, който в продукция не съществува.
//  (2) SYSTEM-НИВО кеш — префиксът е БАЙТ-стабилен и идва ПЪРВИ → общ кешируем префикс между агенти.
//  (3) import-safety — модулът има CLI guard; import (за systemPrompt/тест) НЕ пуска main().

import { test } from "node:test";
import assert from "node:assert/strict";
import { systemPrompt } from "./headless-run.mjs";
import { staticPrefixParts } from "../../../.claude/hooks/memory-preload.mjs";

test("import не пуска main() (CLI guard) — стигнахме дотук без изход", () => {
  assert.ok(typeof systemPrompt === "function");
});

test("systemPrompt: статичният префикс е ПЪРВИ, тялото на агента ПОСЛЕДНО", () => {
  const sp = systemPrompt("razbivacha", ["DOCTRINE_X", "PROC_Y"]);
  assert.ok(sp.startsWith("DOCTRINE_X\n\nPROC_Y\n\n"), "префиксът води");
  assert.ok(/Разбивача/.test(sp), "тялото на агента присъства");
  assert.ok(sp.indexOf("DOCTRINE_X") < sp.indexOf("Разбивача"), "префикс ПРЕДИ тяло");
});

test("systemPrompt: байт-стабилен (кешируем) при повторно извикване", () => {
  const a = systemPrompt("kodadjiyata", ["P"]);
  const b = systemPrompt("kodadjiyata", ["P"]);
  assert.equal(a, b);
});

test("systemPrompt: общ водещ префикс МЕЖДУ различни агенти (cross-agent cache)", () => {
  const pref = ["ОБЩА_ДОКТРИНА_БЛОК", "ОБЩА_ПРОЦЕДУРА"];
  const a = systemPrompt("razbivacha", pref);
  const b = systemPrompt("kodadjiyata", pref);
  const shared = pref.join("\n\n");
  assert.ok(a.startsWith(shared) && b.startsWith(shared), "двата почват с идентичния префикс");
  // общият водещ префикс е поне колкото инжектирания споделен блок (реалната кеш-икономия)
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  assert.ok(i >= shared.length, "споделеният водещ префикс покрива целия общ блок");
});

test("реалният статичен префикс е непразен и се инжектира (иначе eval губи доктрината)", () => {
  const parts = staticPrefixParts();
  assert.ok(parts.length >= 1, "доктрина/процедура/споделено трябва да заредят");
  const sp = systemPrompt("razbivacha");
  assert.ok(sp.startsWith(parts.join("\n\n")), "реалният префикс води системния промпт");
});
