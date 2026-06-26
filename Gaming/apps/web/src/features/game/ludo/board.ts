/**
 * Geometry for the classic "Не се сърди човече" cross board on an 11×11 grid.
 * The engine models the 40-cell track (4 players enter 10 apart), 4-cell home
 * columns, and 4 corner bases (§4.10). Coordinates are [col, row], 0..10.
 */

export const N = 11;

/** The 40 main-track cells, clockwise. Index = absolute board cell. */
export const TRACK: ReadonlyArray<readonly [number, number]> = [
  [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], // 0-4  left arm, upper lane → center
  [4, 3], [4, 2], [4, 1], [4, 0], //           5-8  up the top arm's left lane
  [5, 0], [6, 0], //                           9-10 across the top
  [6, 1], [6, 2], [6, 3], [6, 4], //           11-14 down the top arm's right lane
  [7, 4], [8, 4], [9, 4], [10, 4], //          15-18 right arm, upper lane
  [10, 5], [10, 6], //                         19-20 down the right edge
  [9, 6], [8, 6], [7, 6], [6, 6], //           21-24 right arm, lower lane
  [6, 7], [6, 8], [6, 9], [6, 10], //          25-28 down the bottom arm's right lane
  [5, 10], [4, 10], //                         29-30 across the bottom
  [4, 9], [4, 8], [4, 7], [4, 6], //           31-34 up the bottom arm's left lane
  [3, 6], [2, 6], [1, 6], [0, 6], //           35-38 left arm, lower lane
  [0, 5], //                                   39   up the left edge → loops to 0
];

/** Seat colors: 0 red (left), 1 green (top), 2 brass (right), 3 blue (bottom). */
export const SEAT_COLORS = ["#c2362f", "#4ea96b", "#d9b25f", "#5a8fc2"] as const;

/** Each seat's home column (4 cells) leading into the center goal. */
export const HOME: Record<number, ReadonlyArray<readonly [number, number]>> = {
  0: [[1, 5], [2, 5], [3, 5], [4, 5]],
  1: [[5, 1], [5, 2], [5, 3], [5, 4]],
  2: [[9, 5], [8, 5], [7, 5], [6, 5]],
  3: [[5, 9], [5, 8], [5, 7], [5, 6]],
};

/** Each seat's four base (start) slots in its corner house. */
export const BASE: Record<number, ReadonlyArray<readonly [number, number]>> = {
  0: [[1, 1], [2, 1], [1, 2], [2, 2]],
  1: [[8, 1], [9, 1], [8, 2], [9, 2]],
  2: [[8, 8], [9, 8], [8, 9], [9, 9]],
  3: [[1, 8], [2, 8], [1, 9], [2, 9]],
};

export const CENTER: readonly [number, number] = [5, 5];

const MAIN = 40;
const FINISH = 44;

/** Board cell [col,row] for a seat's token at the given progress + token index. */
export function tokenCoord(
  seat: number,
  prog: number,
  tokenIdx: number,
): readonly [number, number] {
  if (prog < 0) return BASE[seat]![tokenIdx]!;
  if (prog >= FINISH) return CENTER;
  if (prog >= MAIN) return HOME[seat]![prog - MAIN]!;
  const abs = (seat * 10 + prog) % MAIN;
  return TRACK[abs]!;
}

/** The corner-house seat for a cell, or null. (Used to tint the base areas.) */
export function houseSeat(col: number, row: number): number | null {
  if (col <= 3 && row <= 3) return 0;
  if (col >= 7 && row <= 3) return 1;
  if (col >= 7 && row >= 7) return 2;
  if (col <= 3 && row >= 7) return 3;
  return null;
}
