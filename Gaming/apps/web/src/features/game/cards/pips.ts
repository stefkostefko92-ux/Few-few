/**
 * Classic pip layouts for number cards (2..10), as fractional (x, y) positions
 * inside the card's inner area. y is mirrored for the bottom half so the layout
 * reads correctly upright. `flip: true` marks pips that are drawn upside-down
 * (the bottom half of the card), matching real playing-card engraving.
 */
export interface Pip {
  x: number;
  y: number;
  flip: boolean;
}

// Column x positions.
const L = 0.5; // center
const X1 = 0.26;
const X2 = 0.74;

// Row y positions for the top half (mirrored automatically by `flip`). These are
// the classic, evenly-spaced engraving rows so dense cards (7–10) never crowd.
const R = {
  t: 0.12, // top corner row
  q: 0.385, // upper-quarter row (4-row cards)
  m: 0.5, // dead centre
  b: 0.88, // bottom corner row (mirror of t)
} as const;

const p = (x: number, y: number): Pip => ({ x, y, flip: y > 0.5 });

export const PIP_LAYOUTS: Record<string, Pip[]> = {
  "2": [p(L, R.t), p(L, R.b)],
  "3": [p(L, R.t), p(L, R.m), p(L, R.b)],
  "4": [p(X1, R.t), p(X2, R.t), p(X1, R.b), p(X2, R.b)],
  "5": [p(X1, R.t), p(X2, R.t), p(L, R.m), p(X1, R.b), p(X2, R.b)],
  // 6/7/8: three evenly-spaced rows per column, with centre pips added between.
  "6": [p(X1, R.t), p(X2, R.t), p(X1, R.m), p(X2, R.m), p(X1, R.b), p(X2, R.b)],
  "7": [p(X1, R.t), p(X2, R.t), p(L, 0.31), p(X1, R.m), p(X2, R.m), p(X1, R.b), p(X2, R.b)],
  "8": [p(X1, R.t), p(X2, R.t), p(L, 0.31), p(X1, R.m), p(X2, R.m), p(L, 0.69), p(X1, R.b), p(X2, R.b)],
  // 9/10: four evenly-spaced rows per column (t, q, mirror-q, b) + centre pips.
  "9": [
    p(X1, R.t), p(X2, R.t),
    p(X1, R.q), p(X2, R.q),
    p(L, R.m),
    p(X1, 1 - R.q), p(X2, 1 - R.q),
    p(X1, R.b), p(X2, R.b),
  ],
  T: [
    p(X1, R.t), p(X2, R.t),
    p(L, 0.255),
    p(X1, R.q), p(X2, R.q),
    p(X1, 1 - R.q), p(X2, 1 - R.q),
    p(L, 0.745),
    p(X1, R.b), p(X2, R.b),
  ],
};

/** Display label for a rank (T -> 10). */
export const RANK_LABEL: Record<string, string> = {
  "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9",
  T: "10", J: "J", Q: "Q", K: "K", A: "A",
};

/** Bulgarian court labels for an authentic local feel (В/Д/П for Вале/Дама/Поп). */
export const RANK_LABEL_BG: Record<string, string> = {
  J: "В", Q: "Д", K: "П", A: "А",
};
