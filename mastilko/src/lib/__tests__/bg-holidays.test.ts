import test from "node:test";
import assert from "node:assert/strict";
import { bgHolidays, orthodoxEaster } from "../bg-holidays";

test("православен Великден 2026 е 12 април", () => {
  const e = orthodoxEaster(2026);
  assert.equal(e.getUTCMonth() + 1, 4);
  assert.equal(e.getUTCDate(), 12);
});

test("подвижните празници около Великден 2026", () => {
  const h = bgHolidays(2026);
  assert.equal(h["4-10"], "Разпети петък");
  assert.equal(h["4-12"], "Великден");
  assert.equal(h["4-13"], "Велики понеделник");
});

test("фиксирани официални празници", () => {
  const h = bgHolidays(2026);
  assert.equal(h["1-1"], "Нова година");
  assert.equal(h["5-24"], "Ден на българската просвета и култура");
  assert.equal(h["12-25"], "Рождество Христово (Коледа)");
});
