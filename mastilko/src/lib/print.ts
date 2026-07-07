// Печатна математика — всичко в милиметри върху лист А4 (210 × 297 mm).
// Чиста логика без DOM, за да е тестваема с node:test.

export const A4 = { w: 210, h: 297 } as const;

export type LabelShape = "rect" | "round" | "circle";

export interface LabelPreset {
  id: string;
  /** Име за интерфейса (на български). */
  name: string;
  w: number;
  h: number;
  shape: LabelShape;
  /**
   * Минимален марж по ръба на листа. Стандартните формати самозалепващи
   * листове (70 × 36, 105 × 74…) запълват цялата широчина → margin 0.
   */
  margin?: number;
}

// Типовите размери на самозалепващи етикети върху лист А4.
export const LABEL_PRESETS: LabelPreset[] = [
  { id: "38x21", name: "Мини (38 × 21 mm — 65/лист)", w: 38, h: 21.2, shape: "rect" },
  { id: "48x25", name: "Малки (48.5 × 25.4 mm — 44/лист)", w: 48.5, h: 25.4, shape: "rect" },
  { id: "52x30", name: "Компактни (52.5 × 29.7 mm — 40/лист)", w: 52.5, h: 29.7, shape: "rect", margin: 0 },
  { id: "63x38", name: "Класик (63.5 × 38.1 mm — 21/лист)", w: 63.5, h: 38.1, shape: "rect" },
  { id: "70x36", name: "Стандарт (70 × 36 mm — 24/лист)", w: 70, h: 36, shape: "rect", margin: 0 },
  { id: "70x42", name: "Широки (70 × 42.3 mm — 21/лист)", w: 70, h: 42.3, shape: "rect", margin: 0 },
  { id: "99x57", name: "Големи (99 × 57 mm — 10/лист)", w: 99, h: 57, shape: "rect", margin: 5 },
  { id: "105x74", name: "Много големи (105 × 74 mm — 8/лист)", w: 105, h: 74, shape: "rect", margin: 0 },
  { id: "oval", name: "Овални (63 × 38 mm)", w: 63, h: 38, shape: "round" },
  { id: "circle60", name: "Кръгли (Ø 60 mm)", w: 60, h: 60, shape: "circle" },
  { id: "circle40", name: "Кръгли малки (Ø 40 mm)", w: 40, h: 40, shape: "circle" },
];

/** Стандартна визитка за България/ЕС. */
export const CARD = { w: 90, h: 54 } as const;

export interface SheetGrid {
  cols: number;
  rows: number;
  total: number;
  /** Отстъп отляво, за да е центрирана решетката. */
  offsetX: number;
  /** Отстъп отгоре, за да е центрирана решетката. */
  offsetY: number;
  gapX: number;
  gapY: number;
}

/**
 * Колко елемента w×h се събират на А4 при даден минимален марж и междина,
 * с центриране на решетката. Връща валидна решетка и при прекалено голям
 * елемент (0 колони/редове не се допускат — минимум 1 × 1 няма как да е,
 * ако елементът не се събира изобщо, затова total може да е 0).
 */
export function sheetGrid(
  w: number,
  h: number,
  margin = 7,
  gapX = 0,
  gapY = 0,
): SheetGrid {
  const usableW = A4.w - 2 * margin;
  const usableH = A4.h - 2 * margin;
  const cols = Math.max(0, Math.floor((usableW + gapX) / (w + gapX)));
  const rows = Math.max(0, Math.floor((usableH + gapY) / (h + gapY)));
  const gridW = cols > 0 ? cols * w + (cols - 1) * gapX : 0;
  const gridH = rows > 0 ? rows * h + (rows - 1) * gapY : 0;
  return {
    cols,
    rows,
    total: cols * rows,
    offsetX: cols > 0 ? margin + (usableW - gridW) / 2 : margin,
    offsetY: rows > 0 ? margin + (usableH - gridH) / 2 : margin,
    gapX,
    gapY,
  };
}

/** Решетка за визитки: 2 × 5 = 10 на лист, без междина (за лесно рязане). */
export function cardGrid(): SheetGrid {
  return sheetGrid(CARD.w, CARD.h, 10, 0, 0);
}
