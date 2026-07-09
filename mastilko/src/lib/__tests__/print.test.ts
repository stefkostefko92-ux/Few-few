import test from "node:test";
import assert from "node:assert/strict";
import { A4, CARD, LABEL_PRESETS, cardGrid, sheetGrid } from "../print";

test("решетката никога не излиза извън листа", () => {
  for (const p of LABEL_PRESETS) {
    const gap = p.shape === "rect" ? 0 : 3;
    const g = sheetGrid(p.w, p.h, p.margin ?? 7, gap, gap);
    const gridW = g.cols * p.w + (g.cols - 1) * g.gapX;
    const gridH = g.rows * p.h + (g.rows - 1) * g.gapY;
    assert.ok(g.offsetX + gridW <= A4.w + 1e-9, `${p.id}: широчина извън А4`);
    assert.ok(g.offsetY + gridH <= A4.h + 1e-9, `${p.id}: височина извън А4`);
    assert.ok(g.total > 0, `${p.id}: поне един етикет на лист`);
  }
});

test("типовите формати дават точния брой етикети на лист", () => {
  // Стандарт 70 × 36 → 3 × 8 = 24; Класик 63.5 × 38.1 → 3 × 7 = 21.
  assert.equal(sheetGrid(70, 36, 0).total, 24);
  assert.equal(sheetGrid(63.5, 38.1, 7).total, 21);
  assert.equal(sheetGrid(105, 74, 0).total, 8);
});

test("визитките са точно 2 × 5 = 10 на лист", () => {
  const g = cardGrid();
  assert.equal(g.cols, 2);
  assert.equal(g.rows, 5);
  assert.equal(g.total, 10);
  const gridW = g.cols * CARD.w;
  assert.ok(g.offsetX >= 0 && g.offsetX + gridW <= A4.w);
});

test("прекалено голям елемент дава празна решетка, не грешка", () => {
  const g = sheetGrid(500, 500);
  assert.equal(g.total, 0);
});
