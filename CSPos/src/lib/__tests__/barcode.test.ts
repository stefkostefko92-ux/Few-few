import { test } from "node:test";
import assert from "node:assert/strict";
import { eanCheckDigit, isValidEan, parseEmbeddedBarcode } from "../barcode";

test("EAN-13 контролна цифра (mod-10)", () => {
  // класически пример: 4006381333931
  assert.equal(eanCheckDigit("400638133393"), 1);
  assert.ok(isValidEan("4006381333931"));
  assert.ok(!isValidEan("4006381333932"));
  // EAN-8
  assert.ok(isValidEan("73513537"));
});

test("тегловен баркод 28 IIIII WWWWW C (Microinvest/Еликом конвенция)", () => {
  // По Еликом примера: 28 00005 01256 C → код 5, тегло 1,256 кг
  // (контролната цифра се изчислява по EAN mod-10 — тук е 9)
  const r = parseEmbeddedBarcode("280000501256" + String(eanCheckDigit("280000501256")));
  assert.ok(r);
  assert.equal(r.kind, "weight");
  assert.equal(r.plu, 5);
  assert.equal(r.qtyMilli, 1256);
});

test("тегловен баркод — Microinvest пример 0,250 кг", () => {
  // 28 01234 00250 C — тегло 250 г
  const code = "280123400250";
  const full = code + String(eanCheckDigit(code));
  const r = parseEmbeddedBarcode(full);
  assert.ok(r);
  assert.equal(r.plu, 1234);
  assert.equal(r.qtyMilli, 250);
});

test("ценови баркод 29 IIIII PPPPP C", () => {
  // 29 00042 00399 C → артикул 42, цена 3,99 €
  const code = "290004200399";
  const full = code + String(eanCheckDigit(code));
  const r = parseEmbeddedBarcode(full);
  assert.ok(r);
  assert.equal(r.kind, "price");
  assert.equal(r.plu, 42);
  assert.equal(r.value, 399);
  assert.equal(r.qtyMilli, null);
});

test("невалидна контролна цифра или чужд префикс → null", () => {
  assert.equal(parseEmbeddedBarcode("2800005012568"), null); // грешна контролна (вярна: 9)
  assert.equal(parseEmbeddedBarcode("3800005012569"), null); // префикс 38 не е в маските
  assert.equal(parseEmbeddedBarcode("абв"), null);
});
