import test from "node:test";
import assert from "node:assert/strict";
import { fillNumber, formatNumber, layoutSheets, nthNumber, splitLine } from "../labels";
import { MAX_SHEETS } from "../print";

test("формат на номер: префикс, суфикс, водещи нули", () => {
  assert.equal(formatNumber(7, { prefix: "№ ", suffix: "", pad: 0 }), "№ 7");
  assert.equal(formatNumber(7, { prefix: "INV-", suffix: "", pad: 4 }), "INV-0007");
  assert.equal(formatNumber(12345, { prefix: "", suffix: "/2026", pad: 3 }), "12345/2026");
  assert.equal(nthNumber(100, 5, 3), 115);
});

test("ред от списъка: „|“ и табулация от Excel", () => {
  assert.deepEqual(splitLine("мента | сушена, 2026"), ["мента", "сушена, 2026"]);
  assert.deepEqual(splitLine("Иван Петров\tул. Витоша 1"), ["Иван Петров", "ул. Витоша 1"]);
  assert.deepEqual(splitLine("босилек"), ["босилек", ""]);
  // Само първият разделител дели — „|“ във втория ред остава.
  assert.deepEqual(splitLine("a | b | c"), ["a", "b | c"]);
});

test("{N} в баркода става номерът на етикета", () => {
  assert.equal(fillNumber("INV{N}", "0007"), "INV0007");
  assert.equal(fillNumber("3800000", "1"), "3800000");
});

test("разпределение по листове: начеван първи лист, после пълни", () => {
  // 50 етикета, 24 на лист, първите 5 клетки вече използвани.
  const sheets = layoutSheets(50, 24, 5);
  assert.equal(sheets.length, 3);
  assert.equal(sheets[0]!.length, 19);
  assert.equal(sheets[0]![0]!.cell, 5);
  assert.equal(sheets[1]!.length, 24);
  assert.equal(sheets[2]!.length, 7);
  // Поредните номера са непрекъснати през листовете.
  assert.deepEqual(sheets.flat().map((c) => c.index), Array.from({ length: 50 }, (_, i) => i));
  assert.equal(layoutSheets(10_000, 24, 0).length, MAX_SHEETS);
  assert.deepEqual(layoutSheets(0, 24, 0), []);
});

test("таванът на листовете = литерала в схемата на етикетите", () => {
  // LabelStudio пише `.max(100)` като литерал (огледалният тест на MCP чете
  // числото от кода) — ако MAX_SHEETS се промени, и литералът трябва.
  assert.equal(MAX_SHEETS, 100);
});
