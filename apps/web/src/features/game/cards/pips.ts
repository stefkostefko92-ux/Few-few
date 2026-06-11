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
const X1 = 0.28;
const X2 = 0.72;

// Row y positions (top half; mirrored automatically for symmetry).
const R = {
  t: 0.16,
  tm: 0.305,
  m: 0.5,
  bm: 0.695,
  b: 0.84,
} as const;

const p = (x: number, y: number): Pip => ({ x, y, flip: y > 0.5 });

export const PIP_LAYOUTS: Record<string, Pip[]> = {
  "2": [p(L, R.t), p(L, R.b)],
  "3": [p(L, R.t), p(L, R.m), p(L, R.b)],
  "4": [p(X1, R.t), p(X2, R.t), p(X1, R.b), p(X2, R.b)],
  "5": [p(X1, R.t), p(X2, R.t), p(L, R.m), p(X1, R.b), p(X2, R.b)],
  "6": [p(X1, R.t), p(X2, R.t), p(X1, R.m), p(X2, R.m), p(X1, R.b), p(X2, R.b)],
  "7": [p(X1, R.t), p(X2, R.t), p(L, 0.235), p(X1, R.m), p(X2, R.m), p(X1, R.b), p(X2, R.b)],
  "8": [p(X1, R.t), p(X2, R.t), p(L, 0.235), p(X1, R.m), p(X2, R.m), p(L, 0.765), p(X1, R.b), p(X2, R.b)],
  "9": [
    p(X1, R.t), p(X2, R.t),
    p(X1, R.tm), p(X2, R.tm),
    p(L, R.m),
    p(X1, R.bm), p(X2, R.bm),
    p(X1, R.b), p(X2, R.b),
  ],
  T: [
    p(X1, R.t), p(X2, R.t),
    p(L, 0.235),
    p(X1, R.tm), p(X2, R.tm),
    p(X1, R.bm), p(X2, R.bm),
    p(L, 0.765),
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
