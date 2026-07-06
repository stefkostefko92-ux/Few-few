import { test } from "node:test";
import assert from "node:assert/strict";
import { includedVatCents, vatBreakdown, DEFAULT_VAT_RATES } from "../vat";

test("включен ДДС в брутна цена", () => {
  // 12,00 € с 20%: ДДС = 12 × 200/1200 = 2,00 €
  assert.equal(includedVatCents(1200, 200), 200);
  // 10,90 € с 9%: 1090 × 90/1090 = 90 → 0,90 €
  assert.equal(includedVatCents(1090, 90), 90);
  // група А (0%) — няма ДДС
  assert.equal(includedVatCents(500, 0), 0);
});

test("ставки по подразбиране: А=0, Б=20%, В=20% (горива), Г=9% — чл. 27 Н-18", () => {
  assert.equal(DEFAULT_VAT_RATES.A, 0);
  assert.equal(DEFAULT_VAT_RATES.B, 200);
  assert.equal(DEFAULT_VAT_RATES.C, 200);
  assert.equal(DEFAULT_VAT_RATES.D, 90);
});

test("разбивка по данъчни групи", () => {
  const rows = vatBreakdown([
    { vatGroup: "B", totalCents: 1200, vatCents: 200 },
    { vatGroup: "B", totalCents: 600, vatCents: 100 },
    { vatGroup: "D", totalCents: 1090, vatCents: 90 },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { group: "B", letter: "Б", grossCents: 1800, vatCents: 300 });
  assert.deepEqual(rows[1], { group: "D", letter: "Г", grossCents: 1090, vatCents: 90 });
});
