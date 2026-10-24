import { test } from "node:test";
import assert from "node:assert/strict";
import { amountText, bgQuotes, shareNumber } from "../transparency-format";

const N = " ";

test("amountText: един знак след запетаята и неразделящи интервали", () => {
  assert.equal(amountText("4 млн. €"), `4,0${N}млн.${N}€`);
  assert.equal(amountText("4,1 млн. €"), `4,1${N}млн.${N}€`);
  assert.equal(amountText("25 млн. €"), `25,0${N}млн.${N}€`);
  assert.equal(amountText("850 хил. €"), `850${N}хил.${N}€`);
  assert.equal(amountText("12 345 €"), `12 345${N}€`);
});

test("shareNumber", () => {
  assert.equal(shareNumber("16,2%"), 16.2);
  assert.equal(shareNumber("7 %"), 7);
  assert.equal(shareNumber("—"), null);
  assert.equal(shareNumber(undefined), null);
});

test("bgQuotes", () => {
  assert.equal(bgQuotes('"ГРОМА ХОЛД" ЕООД'), "„ГРОМА ХОЛД“ ЕООД");
  assert.equal(bgQuotes('ДЗЗД "ПЪТИЩА БОБОВ ДОЛ 2" и др.'), "ДЗЗД „ПЪТИЩА БОБОВ ДОЛ 2“ и др.");
});
