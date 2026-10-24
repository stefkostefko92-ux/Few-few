import test from "node:test";
import assert from "node:assert/strict";
import { A4, CARD, LABEL_PRESETS, cardGrid, sheetGrid } from "../print";

test("решетката никога не излиза извън листа", () => {
  for (const p of LABEL_PRESETS) {
    const gap = p.shape === "rect" ? 0 : 3;
    const g = sheetGrid(p.w, p.h, p.margin ?? 7, p.gapX ?? gap, gap);
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

// Позициите трябва да паснат на ИСТИНСКИТЕ листове, не само да „се събират“
// на А4. Източник: gLabels (avery-iso-templates.xml, herma-iso-templates.xml —
// размерите там са в pt; превърнати в mm) и публикуваните шаблони на Avery.
// Без междината 2.5 mm листът с 65 етикета излизаше до 5 mm встрани.
test("стандартните листове етикети съвпадат с реалните позиции (±0.6 mm)", () => {
  const real: Record<string, { cols: number; rows: number; x0: number; y0: number; dx: number; dy: number }> = {
    "38x21": { cols: 5, rows: 13, x0: 4.7, y0: 10.9, dx: 40.6, dy: 21.2 }, // Avery L7651
    "63x38": { cols: 3, rows: 7, x0: 7.2, y0: 15.15, dx: 66.04, dy: 38.1 }, // Avery L7160
    "70x36": { cols: 3, rows: 8, x0: 0, y0: 4.5, dx: 70, dy: 36 }, // Herma 4360
    "105x74": { cols: 2, rows: 4, x0: 0, y0: 0.5, dx: 105, dy: 74 },
  };
  for (const [id, r] of Object.entries(real)) {
    const p = LABEL_PRESETS.find((x) => x.id === id)!;
    const g = sheetGrid(p.w, p.h, p.margin ?? 7, p.gapX ?? 0, 0);
    assert.equal(g.cols, r.cols, `${id}: колони`);
    assert.equal(g.rows, r.rows, `${id}: редове`);
    for (let c = 0; c < g.cols; c++) {
      const x = g.offsetX + c * (p.w + g.gapX);
      assert.ok(Math.abs(x - (r.x0 + c * r.dx)) <= 0.6, `${id}: колона ${c + 1} е на ${x.toFixed(2)} mm, реално ${(r.x0 + c * r.dx).toFixed(2)}`);
    }
    assert.ok(Math.abs(g.offsetY - r.y0) <= 0.6, `${id}: горен отстъп ${g.offsetY.toFixed(2)}, реално ${r.y0}`);
  }
});
