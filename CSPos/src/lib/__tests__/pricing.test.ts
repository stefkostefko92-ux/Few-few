// pricing.test.ts — сървърното остойностяване и редът към ФУ (т. 2: пълнота и интегритет).

import { test } from "node:test";
import assert from "node:assert/strict";
import { priceLine, toFiscalItem, manualDiscountAllowed, type ProductLike } from "../pricing";
import { DEFAULT_VAT_RATES } from "../vat";
import type { ActivePromotion } from "../promotions";

const now = new Date("2026-11-14T10:00:00Z");
const apple: ProductLike = { id: "p1", plu: 101, name: "Ябълки", categoryId: "c1", unit: "KG", vatGroup: "B", priceCents: 1999 };
const water: ProductLike = { id: "p2", plu: 102, name: "Вода 0,5 л", categoryId: "c1", unit: "PCS", vatGroup: "B", priceCents: 199 };
const free: ProductLike = { id: "p3", plu: 990, name: "Свободна продажба 20%", categoryId: "c9", unit: "PCS", vatGroup: "B", priceCents: 0 };
const ctx = (promos: ActivePromotion[] = [], customerDiscountPermille = 0) => ({
  promos,
  now,
  customerDiscountPermille,
  vatRates: DEFAULT_VAT_RATES,
});

test("ценови баркод: към ФУ отива 1 × заключената сума (без разминаване ±1 ст.)", () => {
  // 19,99 €/кг и баркод за 5,17 € — старият път смяташе 0,259 кг × 19,99 = 5,18 €
  const l = priceLine({ qtyMilli: 259, discountPermille: 0, priceLockedCents: 517 }, apple, ctx());
  assert.equal(l.totalCents, 517);
  const f = toFiscalItem(l, "кг");
  assert.equal(f.qtyMilli, 1000);
  assert.equal(f.unitPriceCents, 517);
  assert.equal(Math.round((f.unitPriceCents * f.qtyMilli) / 1000), l.totalCents, "сумата на ФУ == записа");
});

test("свободна продажба (служебен PLU с цена 0) не стига до ФУ като 0,00 €", () => {
  const l = priceLine({ qtyMilli: 1000, discountPermille: 0, priceLockedCents: 250 }, free, ctx());
  const f = toFiscalItem(l, "бр.");
  assert.equal(f.unitPriceCents, 250);
  assert.equal(l.totalCents, 250);
});

test("MxN: абсолютната отстъпка се пази по ред и стига до ФУ", () => {
  const mxn: ActivePromotion = {
    id: "m1", name: "3 за 2", productId: "p2", categoryId: null, kind: "MXN",
    percent: null, priceCents: null, buyQty: 3, payQty: 2,
    startDate: "2026-01-01T00:00:00Z", endDate: "2026-12-31T23:59:59Z",
    startMinute: null, endMinute: null, minQtyMilli: 0,
  } as unknown as ActivePromotion;
  const l = priceLine({ qtyMilli: 3000, discountPermille: 0 }, water, ctx([mxn]));
  assert.equal(l.totalCents, 398);
  assert.equal(l.discountCents, 199);
  const f = toFiscalItem(l, "бр.");
  assert.equal(f.discountCents, 199);
  assert.equal(Math.round((f.unitPriceCents * f.qtyMilli) / 1000) - (f.discountCents ?? 0), 398);
});

test("ДДС е включен и се смята от крайната сума", () => {
  const l = priceLine({ qtyMilli: 1000, discountPermille: 0 }, water, ctx());
  assert.equal(l.totalCents, 199);
  assert.equal(l.vatCents, Math.round((199 * 200) / 1200));
});

test("ръчна отстъпка: касиерът — до лимита, управителят — без лимит", () => {
  assert.equal(manualDiscountAllowed(100, "CASHIER", 100), true);
  assert.equal(manualDiscountAllowed(101, "CASHIER", 100), false);
  assert.equal(manualDiscountAllowed(500, "MANAGER", 100), true);
  assert.equal(manualDiscountAllowed(0, "CASHIER", 0), true);
});
