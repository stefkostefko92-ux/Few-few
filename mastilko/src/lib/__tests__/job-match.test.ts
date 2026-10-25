import test from "node:test";
import assert from "node:assert/strict";
import { keywords, matchCv, words } from "../job-match";

const AD = `Търсим счетоводител с опит в Microsoft Excel и SAP. Изисквания: висше образование
по счетоводство, работа с ДДС декларации, английски език. Предлагаме работа в екип.
Excel и SAP са задължителни.`;

test("служебните думи и числата отпадат", () => {
  const w = words("Търсим кандидати с опит от 3 години в Excel и за SAP");
  assert.deepEqual(w, ["excel", "sap"]);
});

test("ключовите думи — по честота", () => {
  const k = keywords(AD);
  // „счетоводител“ + „счетоводство“ = една основа (2) и Excel (2) водят.
  assert.deepEqual(k.slice(0, 2).sort(), ["excel", "счетоводител"]);
  assert.ok(k.includes("sap"));
  assert.ok(k.includes("ддс"));
  assert.ok(!k.includes("търсим") && !k.includes("предлагаме"));
});

test("съвпадение по основа: склонението не пречи", () => {
  const cv = "Счетоводство на малки фирми, ДДС декларации, Excel, английски B2.";
  const r = matchCv(cv, AD);
  // „счетоводител“ и „счетоводство“ са с една основа „счетов“.
  assert.ok(r.found.includes("счетоводител"));
  assert.ok(r.found.includes("excel"));
  assert.ok(r.missing.includes("sap"));
  assert.ok(r.percent > 0 && r.percent < 100);
});

test("празна обява → нищо за сравнение", () => {
  assert.deepEqual(matchCv("каквото и да е", ""), { found: [], missing: [], percent: 0 });
});
