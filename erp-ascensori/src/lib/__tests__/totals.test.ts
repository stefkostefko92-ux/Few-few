// Парична аритметика: цели центесими, half-up, преизчисление от редовете.
import { test } from "node:test";
import assert from "node:assert/strict";
import { toCents, fromCents, totaleVoce, ivaVoce, calcolaTotali } from "../totals";

test("toCents/fromCents двупосочно", () => {
  assert.equal(toCents("123.45"), 12345);
  assert.equal(toCents("0.1"), 10);
  assert.equal(toCents("7"), 700);
  assert.equal(fromCents(12345), "123.45");
  assert.equal(fromCents(5), "0.05");
  assert.equal(fromCents(-150), "-1.50");
});

test("toCents отказва невалиден вход", () => {
  assert.throws(() => toCents("12,50"));
  assert.throws(() => toCents("abc"));
  assert.throws(() => toCents(""));
});

test("тотал на редица: qty × prezzo с half-up", () => {
  // 3 × 9.99 = 29.97
  assert.equal(totaleVoce({ quantita: "3", prezzoUnitario: "9.99", aliquotaIva: "22" }), 2997);
  // 0.5 × 0.03 = 0.015 → 0.02 (half-up)
  assert.equal(totaleVoce({ quantita: "0.50", prezzoUnitario: "0.03", aliquotaIva: "22" }), 2);
  // 1.33 × 7.77 = 10.3341 → 10.33
  assert.equal(totaleVoce({ quantita: "1.33", prezzoUnitario: "7.77", aliquotaIva: "22" }), 1033);
});

test("ДДС на редица с half-up", () => {
  assert.equal(ivaVoce(10000, "22"), 2200);
  // 10.33 × 22% = 2.2726 → 2.27
  assert.equal(ivaVoce(1033, "22"), 227);
  // 0.02 × 22% = 0.0044 → 0.00
  assert.equal(ivaVoce(2, "22"), 0);
});

test("calcolaTotali: netto + iva = lordo, по редове", () => {
  const t = calcolaTotali([
    { quantita: "60.00", prezzoUnitario: "7.90", aliquotaIva: "22.00" }, // 474.00
    { quantita: "12.00", prezzoUnitario: "48.00", aliquotaIva: "22.00" }, // 576.00
    { quantita: "1.00", prezzoUnitario: "98.00", aliquotaIva: "22.00" }, // 98.00
  ]);
  assert.deepEqual(t.totaliVoci, ["474.00", "576.00", "98.00"]);
  assert.equal(t.totaleNetto, "1148.00");
  assert.equal(t.totaleIva, "252.56");
  assert.equal(t.totaleLordo, "1400.56");
});

test("празен документ = нули", () => {
  const t = calcolaTotali([]);
  assert.equal(t.totaleNetto, "0.00");
  assert.equal(t.totaleLordo, "0.00");
});

test("различни ставки IVA по редове", () => {
  const t = calcolaTotali([
    { quantita: "1", prezzoUnitario: "100.00", aliquotaIva: "22" },
    { quantita: "1", prezzoUnitario: "100.00", aliquotaIva: "10" },
    { quantita: "1", prezzoUnitario: "100.00", aliquotaIva: "4" },
  ]);
  assert.equal(t.totaleIva, "36.00");
  assert.equal(t.totaleLordo, "336.00");
});
