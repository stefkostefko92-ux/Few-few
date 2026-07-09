import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toEur,
  normalizeVin,
  isValidEik,
  median,
  modelKey,
  computeRisk,
  detectMileageRollback,
} from "../index.ts";

test("toEur: EUR минава без промяна, друга валута ползва курс", () => {
  assert.equal(toEur(100, "EUR"), 100);
  assert.equal(toEur(100, "BGN", 0.511292), 51.13);
  assert.equal(toEur(100, "BGN", null), null);
});

test("normalizeVin: 17 валидни символа, иначе null", () => {
  assert.equal(normalizeVin("wvwzzz1kzaw000001"), "WVWZZZ1KZAW000001");
  assert.equal(normalizeVin("too-short"), null);
});

test("isValidEik: 9 или 13 цифри", () => {
  assert.equal(isValidEik("203456789"), true);
  assert.equal(isValidEik("123"), false);
});

test("median", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});

test("modelKey", () => {
  assert.equal(modelKey("VW", "Golf"), "vw|golf");
  assert.equal(modelKey(null, "Golf"), null);
});

test("detectMileageRollback засича намаляващ пробег", () => {
  assert.equal(
    detectMileageRollback([
      { date: "2023-09-01", km: 210000 },
      { date: "2026-06-15", km: 168000 },
    ]),
    true,
  );
  assert.equal(
    detectMileageRollback([
      { date: "2023-09-01", km: 100000 },
      { date: "2026-06-15", km: 168000 },
    ]),
    false,
  );
});

test("computeRisk: върнат пробег => red", () => {
  const r = computeRisk({
    mileageReadings: [
      { date: "2023-09-01", km: 210000 },
      { date: "2026-06-15", km: 168000 },
    ],
  });
  assert.equal(r.level, "red");
  assert.ok(r.reasons.includes("mileage_rollback"));
  assert.equal(r.mileageFlag, "suspect");
});

test("computeRisk: аномална цена => yellow", () => {
  const r = computeRisk({ priceEur: 5000, modelMedianEur: 12000 });
  assert.equal(r.level, "yellow");
  assert.ok(r.reasons.includes("price_anomaly"));
});

test("computeRisk: чиста кола => green", () => {
  const r = computeRisk({ priceEur: 11000, modelMedianEur: 12000, vinValid: true });
  assert.equal(r.level, "green");
  assert.deepEqual(r.reasons, []);
});
