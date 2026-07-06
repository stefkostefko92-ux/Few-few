import { test } from "node:test";
import assert from "node:assert/strict";
import { bestPromotion, windowContains, type ActivePromotion } from "../promotions";

const prod = { id: "p1", categoryId: "c1", priceCents: 1000 };
const noon = new Date(2026, 6, 3, 12, 0, 0); // 12:00

function promo(over: Partial<ActivePromotion>): ActivePromotion {
  return {
    id: "x",
    name: "промо",
    productId: null,
    categoryId: null,
    kind: "PERCENT",
    percent: null,
    priceCents: null,
    buyQty: null,
    payQty: null,
    startMinute: null,
    endMinute: null,
    minQtyMilli: 0,
    ...over,
  };
}

test("без промоции → каталожна цена", () => {
  const r = bestPromotion(prod, 1000, [], noon);
  assert.equal(r.unitCents, 1000);
  assert.equal(r.promotion, null);
});

test("процентна промоция за стока", () => {
  // 15% от 10,00 € → 8,50 €
  const r = bestPromotion(prod, 1000, [promo({ productId: "p1", kind: "PERCENT", percent: 150 })], noon);
  assert.equal(r.unitCents, 850);
  assert.equal(r.promotion?.id, "x");
});

test("фиксирана промо цена", () => {
  const r = bestPromotion(prod, 1000, [promo({ categoryId: "c1", kind: "PRICE", priceCents: 799 })], noon);
  assert.equal(r.unitCents, 799);
});

test("продуктовата промоция бие категорийната при равна цена", () => {
  const r = bestPromotion(
    prod,
    1000,
    [
      promo({ id: "cat", categoryId: "c1", kind: "PRICE", priceCents: 800 }),
      promo({ id: "prod", productId: "p1", kind: "PRICE", priceCents: 800 }),
    ],
    noon
  );
  assert.equal(r.promotion?.id, "prod");
});

test("печели по-ниската цена", () => {
  const r = bestPromotion(
    prod,
    1000,
    [
      promo({ id: "a", productId: "p1", kind: "PERCENT", percent: 100 }), // 9,00
      promo({ id: "b", categoryId: "c1", kind: "PRICE", priceCents: 700 }), // 7,00
    ],
    noon
  );
  assert.equal(r.unitCents, 700);
  assert.equal(r.promotion?.id, "b");
});

test("happy hour: извън диапазона не се прилага", () => {
  // 08:00–10:00 (480–600); в 12:00 не важи
  const r = bestPromotion(prod, 1000, [promo({ productId: "p1", kind: "PERCENT", percent: 500, startMinute: 480, endMinute: 600 })], noon);
  assert.equal(r.unitCents, 1000);
  assert.equal(r.promotion, null);
});

test("happy hour: в диапазона се прилага", () => {
  const morning = new Date(2026, 6, 3, 9, 0, 0);
  const r = bestPromotion(prod, 1000, [promo({ productId: "p1", kind: "PERCENT", percent: 500, startMinute: 480, endMinute: 600 })], morning);
  assert.equal(r.unitCents, 500);
});

test("минимално количество", () => {
  const p = promo({ productId: "p1", kind: "PRICE", priceCents: 500, minQtyMilli: 3000 });
  assert.equal(bestPromotion(prod, 2000, [p], noon).unitCents, 1000); // под прага
  assert.equal(bestPromotion(prod, 3000, [p], noon).unitCents, 500); // на прага
});

test("диапазон през полунощ", () => {
  assert.ok(windowContains(1320, 120, 1380)); // 23:00 в 22:00–02:00
  assert.ok(windowContains(1320, 120, 60)); // 01:00
  assert.ok(!windowContains(1320, 120, 720)); // 12:00 извън
});

test("MxN „3 за 2“: при 3 бр. едно е безплатно", () => {
  // каталог 10,00 €/бр., 3 бр. → плащаш 2 = 20,00 € (отстъпка ~33,3%)
  const r = bestPromotion(prod, 3000, [promo({ productId: "p1", kind: "MXN", buyQty: 3, payQty: 2 })], noon);
  assert.equal(r.lineCents, 2000);
  assert.equal(r.discountPermille, 333); // 1/3
  assert.equal(r.promotion?.kind, "MXN");
});

test("MxN под прага не се прилага", () => {
  // само 2 бр. при „3 за 2" → пълна цена 20,00 €
  const r = bestPromotion(prod, 2000, [promo({ productId: "p1", kind: "MXN", buyQty: 3, payQty: 2 })], noon);
  assert.equal(r.lineCents, 2000);
  assert.equal(r.promotion, null);
});

test("MxN само за цели бройки (не тегловни)", () => {
  const r = bestPromotion(prod, 3500, [promo({ productId: "p1", kind: "MXN", buyQty: 3, payQty: 2 })], noon);
  assert.equal(r.promotion, null); // 3,5 не е цяло
});

test("MxN 6 бр. при „3 за 2“ → 2 безплатни", () => {
  const r = bestPromotion(prod, 6000, [promo({ productId: "p1", kind: "MXN", buyQty: 3, payQty: 2 })], noon);
  assert.equal(r.lineCents, 4000); // плащаш 4 от 6
});

test("най-ниска редова сума печели между типовете", () => {
  const r = bestPromotion(
    prod,
    3000,
    [
      promo({ id: "pct", productId: "p1", kind: "PERCENT", percent: 100 }), // 10% → 27,00
      promo({ id: "mxn", productId: "p1", kind: "MXN", buyQty: 3, payQty: 2 }), // → 20,00
    ],
    noon
  );
  assert.equal(r.lineCents, 2000);
  assert.equal(r.promotion?.id, "mxn");
});
