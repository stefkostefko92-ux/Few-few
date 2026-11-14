import test from "node:test";
import assert from "node:assert/strict";
import {
  DENSE_UNITS,
  HEADING_UNITS,
  NORMAL_UNITS,
  fitPhoneSheet,
  nameLines,
  rowUnits,
} from "@/lib/print-phones";

test("nameLines: пренасяне по думи при ~24 знака (както е на хартия)", () => {
  assert.equal(nameLines("Аптека — Бобов дол"), 1);
  assert.equal(nameLines("Полиция — РУ на МВР Бобов дол"), 2);
  assert.equal(nameLines("Регионална дирекция „Пожарна безопасност и защита на населението“ Кюстендил"), 4);
  assert.equal(nameLines("   "), 1);
});

test("rowUnits: едноредов = 1, всеки следващ ред +0,65", () => {
  assert.equal(rowUnits("Такси"), 1);
  assert.equal(rowUnits("Полиция — РУ на МВР Бобов дол"), 1.65);
});

const row = (name: string, i: number) => ({ id: String(i), name });
const many = (n: number, name = "Такси") => Array.from({ length: n }, (_, i) => row(name, i));

test("fitPhoneSheet: малко номера — всички, с обикновения шрифт", () => {
  const r = fitPhoneSheet([{ title: "Спешни и здраве", items: many(10) }]);
  assert.equal(r.shown, 10);
  assert.equal(r.cut, 0);
  assert.equal(r.dense, false);
  assert.equal(r.units, 10 + HEADING_UNITS);
});

test("fitPhoneSheet: над обикновения капацитет — сбит шрифт, още на един лист", () => {
  const n = Math.ceil(NORMAL_UNITS - HEADING_UNITS) + 1;
  const r = fitPhoneSheet([{ title: "Спешни и здраве", items: many(n) }]);
  assert.equal(r.dense, true);
  assert.equal(r.cut, 0);
  assert.ok(r.units <= DENSE_UNITS);
});

test("fitPhoneSheet: над сбития капацитет отпадат последните групи, не спешните", () => {
  const groups = [
    { title: "Спешни и здраве", items: many(25) },
    { title: "Община и институции", items: many(25) },
    { title: "Други", items: many(25) },
  ];
  const r = fitPhoneSheet(groups);
  assert.ok(r.units <= DENSE_UNITS);
  assert.equal(r.groups[0].items.length, 25);
  assert.ok(r.cut > 0);
  assert.equal(r.shown + r.cut, 75);
  assert.ok(!r.groups.some((g) => g.title === "Други"));
});

test("fitPhoneSheet: след първия номер, който не влиза, не се добавят по-кратки от следващите групи", () => {
  const long = "Регионална дирекция „Пожарна безопасност и защита на населението“ Кюстендил";
  const r = fitPhoneSheet([
    { title: "Спешни и здраве", items: many(17, long) },
    { title: "Други", items: many(5) },
  ]);
  assert.ok(r.units <= DENSE_UNITS);
  assert.equal(r.groups.length, 1);
  assert.equal(r.groups[0].items.length, 16);
  assert.equal(r.cut, 22 - r.shown);
});
