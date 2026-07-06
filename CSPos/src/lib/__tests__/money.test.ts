import { test } from "node:test";
import assert from "node:assert/strict";
import {
  eurCentsToBgnCents,
  bgnCentsToEurCents,
  formatCents,
  formatDual,
  parseCents,
  parseQty,
  formatQty,
  lineTotalCents,
  applyDiscount,
} from "../money";

test("превалутиране EUR→BGN по курс 1.95583 със закръгляване до цент", () => {
  // 1,00 € → 1,95583 лв. → 1,96 лв. (≥5 нагоре)
  assert.equal(eurCentsToBgnCents(100), 196);
  // 10,00 € → 19,5583 → 19,56 лв.
  assert.equal(eurCentsToBgnCents(1000), 1956);
  // 0,51 € → 0,9974733 → 1,00 лв.
  assert.equal(eurCentsToBgnCents(51), 100);
  assert.equal(eurCentsToBgnCents(0), 0);
});

test("превалутиране BGN→EUR чрез делене на пълния курс (чл. 13 ЗВЕРБ)", () => {
  // 1,95 лв. / 1.95583 = 0,99702 € → 1,00 €
  assert.equal(bgnCentsToEurCents(195), 100);
  // 100 лв. / 1.95583 = 51,1292 € → 51,13 €
  assert.equal(bgnCentsToEurCents(10000), 5113);
});

test("форматиране на суми", () => {
  assert.equal(formatCents(1234), "12,34");
  assert.equal(formatCents(-50), "-0,50");
  assert.equal(formatCents(0), "0,00");
  assert.equal(formatDual(100, true), "1,00 € (1,96 лв.)");
  assert.equal(formatDual(100, false), "1,00 €");
});

test("парсване на суми и количества", () => {
  assert.equal(parseCents("12,34"), 1234);
  assert.equal(parseCents("12.34"), 1234);
  assert.equal(parseCents("5"), 500);
  assert.ok(Number.isNaN(parseCents("абв")));
  assert.ok(Number.isNaN(parseCents("1,234")));
  assert.equal(parseQty("1,5"), 1500);
  assert.equal(parseQty("0.250"), 250);
  assert.ok(Number.isNaN(parseQty("-1")));
});

test("редова сума: цена × количество със закръгляване до цент", () => {
  // 3,33 € × 0,333 кг = 1,10889 → 1,11 €
  assert.equal(lineTotalCents(333, 333), 111);
  // 2,00 € × 2 бр.
  assert.equal(lineTotalCents(200, 2000), 400);
});

test("отстъпка в промили", () => {
  // 10,00 € с 5% (50‰) → 9,50 €
  assert.equal(applyDiscount(1000, 50), 950);
  assert.equal(applyDiscount(1000, 0), 1000);
});

test("формат на количества", () => {
  assert.equal(formatQty(1500, 3), "1,500");
  assert.equal(formatQty(2000, 0), "2");
});
