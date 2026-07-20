// audits.test.mjs — node:test за date-логиката на def-freshness (CI auto-discover).
import { test } from "node:test";
import assert from "node:assert/strict";
import { datesIn } from "./def-freshness.mjs";

test("datesIn: ISO дата", () => {
  assert.deepEqual(datesIn("в сила от 2025-06-28 според директивата"), ["2025-06-28"]);
});
test("datesIn: ДД.ММ.ГГГГ → нормализирана ISO", () => {
  assert.deepEqual(datesIn("краен срок 31.08.2026 за target API 36"), ["2026-08-31"]);
});
test("datesIn: няколко дати на ред", () => {
  assert.deepEqual(datesIn("от 2026-01-01 до 31.12.2026"), ["2026-01-01", "2026-12-31"]);
});
test("datesIn: без дата → празно", () => {
  assert.deepEqual(datesIn("няма дата тук, само текст"), []);
});
