import test from "node:test";
import assert from "node:assert/strict";
import { checkBarcode, gs1CheckDigit } from "../barcode";

test("GS1 контролна цифра — известни реални кодове", () => {
  assert.equal(gs1CheckDigit("380012345678"), 7); // EAN-13 (декодиран от ZXing като …787)
  assert.equal(gs1CheckDigit("9638507"), 4); // EAN-8 96385074
  assert.equal(gs1CheckDigit("03600029145"), 2); // UPC-A 036000291452
  assert.equal(gs1CheckDigit("1234567890123"), 1); // ITF-14 12345678901231
});

test("EAN-13: грешна контролна цифра казва каква трябва да е", () => {
  const r = checkBarcode("EAN13", "3800123456789");
  assert.equal(r.ok, false);
  assert.match(r.message!, /трябва да е 7/);
  assert.equal(checkBarcode("EAN13", "3800123456787").ok, true);
  assert.equal(checkBarcode("EAN13", "380012345678").ok, true); // 12 → добавя се
  assert.match(checkBarcode("EAN13", "38001234").message!, /12 или 13/);
  assert.match(checkBarcode("EAN13", "38001234567A").message!, /само цифри/);
});

test("Code 39 и Code 128 — непозволени знаци", () => {
  assert.equal(checkBarcode("CODE39", "ABC-123").ok, true);
  assert.equal(checkBarcode("CODE39", "abc").ok, false);
  assert.equal(checkBarcode("CODE128", "MECHTA-001").ok, true);
  assert.equal(checkBarcode("CODE128", "Мечта").ok, false);
  assert.equal(checkBarcode("ITF14", "1234567890123").ok, true);
  assert.equal(checkBarcode("ITF14", "12345678901230").ok, false);
});
