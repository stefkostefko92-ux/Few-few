// Парична аритметика: цели центесими, half-up, преизчисление от редовете.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toCents,
  fromCents,
  totaleVoce,
  ivaVoce,
  calcolaTotali,
  riepilogoIva,
  totaliDaRiepilogo,
} from "../totals";

test("toCents/fromCents двупосочно", () => {
  assert.equal(toCents("123.45"), 12345);
  assert.equal(toCents("123,45"), 12345); // италианска запетая
  assert.equal(toCents("0.1"), 10);
  assert.equal(toCents("7"), 700);
  assert.equal(fromCents(12345), "123.45");
  assert.equal(fromCents(5), "0.05");
  assert.equal(fromCents(-150), "-1.50");
});

test("toCents отказва невалиден вход", () => {
  assert.throws(() => toCents("abc"));
  assert.throws(() => toCents(""));
  assert.throws(() => toCents("1.2.3"));
});

test("тотал на редица: qty × prezzo с half-up", () => {
  // 3 × 9.99 = 29.97
  assert.equal(
    totaleVoce({ quantita: "3", prezzoUnitario: "9.99", aliquotaIva: "22" }),
    2997,
  );
  // 0.5 × 0.03 = 0.015 → 0.02 (half-up)
  assert.equal(
    totaleVoce({ quantita: "0.50", prezzoUnitario: "0.03", aliquotaIva: "22" }),
    2,
  );
  // 1.33 × 7.77 = 10.3341 → 10.33
  assert.equal(
    totaleVoce({ quantita: "1.33", prezzoUnitario: "7.77", aliquotaIva: "22" }),
    1033,
  );
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

// ── Обобщение по аликвота ───────────────────────────────────────────────────

test("обобщението по аликвота групира и закръгля ВЕДНЪЖ на ставка", () => {
  const voci = [
    { quantita: "1", prezzoUnitario: "100.00", aliquotaIva: "22" },
    { quantita: "2", prezzoUnitario: "50.00", aliquotaIva: "22" },
    { quantita: "1", prezzoUnitario: "80.00", aliquotaIva: "10" },
  ];
  const r = riepilogoIva(voci);
  assert.equal(r.length, 2);
  // Подредено по ставка: първо 10 %, после 22 %.
  assert.equal(r[0].aliquota, "10.00");
  assert.equal(r[0].imponibile, "80.00");
  assert.equal(r[0].imposta, "8.00");
  assert.equal(r[1].aliquota, "22.00");
  assert.equal(r[1].imponibile, "200.00");
  assert.equal(r[1].imposta, "44.00");
});

test("сумирането по редове се разминава с обобщението — обобщението е вярното", () => {
  // Три реда по 0,105 € с 22 %: по редове 3 × 0,02 = 0,06; по обобщение
  // 0,32 × 22 % = 0,07. SDI отхвърля документ, чийто riepilogo не съвпада.
  const voci = [
    { quantita: "1", prezzoUnitario: "0.11", aliquotaIva: "22" },
    { quantita: "1", prezzoUnitario: "0.11", aliquotaIva: "22" },
    { quantita: "1", prezzoUnitario: "0.10", aliquotaIva: "22" },
  ];
  const perRighe = calcolaTotali(voci);
  const perRiepilogo = totaliDaRiepilogo(voci);
  assert.equal(perRighe.totaleNetto, perRiepilogo.totaleNetto);
  assert.notEqual(perRighe.totaleIva, perRiepilogo.totaleIva);
  assert.equal(perRiepilogo.totaleIva, "0.07");
  assert.equal(perRighe.totaleIva, "0.06");
});

test("тоталите от обобщението се събират точно", () => {
  const voci = [
    { quantita: "3", prezzoUnitario: "19.99", aliquotaIva: "22" },
    { quantita: "1", prezzoUnitario: "5.50", aliquotaIva: "4" },
  ];
  const t = totaliDaRiepilogo(voci);
  assert.equal(t.totaleNetto, "65.47");
  assert.equal(
    toCents(t.totaleLordo),
    toCents(t.totaleNetto) + toCents(t.totaleIva),
    "тоталът не е сборът на облагаемото и данъка",
  );
});
