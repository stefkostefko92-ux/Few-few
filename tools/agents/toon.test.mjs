// toon.test.mjs — TOON-стил табличната нотация (CI auto-discovery).
import { test } from "node:test";
import assert from "node:assert/strict";
import { toonEncode } from "./toon.mjs";
import { estTokens } from "./token-budget.mjs";

test("кодира uniform масив: header + редове", () => {
  const t = toonEncode([{ a: 1, b: "x" }, { a: 2, b: "y" }]);
  assert.equal(t, '2{a,b}:\n  1,x\n  2,y');
});

test("екранира запетая/кавичка/нов ред (CSV правила)", () => {
  const t = toonEncode([{ a: 'к"в', b: "с,запетая" }]);
  assert.equal(t, '1{a,b}:\n  "к""в","с,запетая"');
});

test("празен масив и не-масив", () => {
  assert.equal(toonEncode([]), "0{}:");
  assert.throws(() => toonEncode({ a: 1 }));
});

test("null/undefined → празна клетка", () => {
  const t = toonEncode([{ a: null, b: undefined, c: 0 }]);
  assert.equal(t, "1{a,b,c}:\n  ,,0");
});

test("реална печалба: ≥40% срещу компактен JSON на таблични данни", () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ date: "2026-07-23", home: "Отбор" + i, away: "Гост" + i, hg: i % 5, ag: i % 3, xg: 1.25 }));
  const j = estTokens(JSON.stringify(rows));
  const t = estTokens(toonEncode(rows));
  assert.ok(t < j * 0.6, `TOON ${t} т трябва да е <60% от JSON ${j} т`);
});
