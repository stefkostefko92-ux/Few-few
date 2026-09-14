import { ball, TABLE, type Ball } from "@aso/shared";

/**
 * Starting layouts. The table is 2 (length, x) × 1 (across, y). The cue plays
 * from the "head" (low x); racks sit at the "foot" (high x). Ball ids:
 *  - cue = 0
 *  - 8-ball: 1..15 (8 = black; solids 1-7, stripes 9-15)
 *  - 9-ball: 1..9
 *  - snooker: reds = 11..25 (value 1); colours by value 2..7
 *    (yellow2 green3 brown4 blue5 pink6 black7)
 */

const GAP = TABLE.ballR * 2 * 1.03; // small breathing room so balls don't pre-touch
const DX = GAP * Math.cos(Math.PI / 6); // row spacing along x
const CUE_X = 0.5;
const MID_Y = TABLE.h / 2;
const APEX_X = 1.35;

const cue = (): Ball => ball(0, CUE_X, MID_Y);

/** Triangle of `rows` rows (1,2,3,…) growing toward +x, apex at (APEX_X, MID_Y). */
function triangle(ids: number[], rows: number, apexX = APEX_X): Ball[] {
  const out: Ball[] = [];
  let k = 0;
  for (let row = 0; row < rows; row++) {
    const x = apexX + row * DX;
    for (let i = 0; i <= row; i++) {
      if (k >= ids.length) return out;
      const y = MID_Y + (i - row / 2) * GAP;
      out.push(ball(ids[k]!, x, y));
      k++;
    }
  }
  return out;
}

export function rackEightBall(): Ball[] {
  // WPA rack (5-row triangle, filled row by row): apex ball on the foot spot,
  // the 8 in the exact CENTRE (middle slot of the 3rd row = flat index 4), and
  // the two back corners split one solid / one stripe. Indices per row:
  //   row0: [0]  row1: [1,2]  row2: [3,4,5]  row3: [6,7,8,9]  row4: [10,11,12,13,14]
  //   → centre = index 4 (=8); back corners = index 10 (=6, solid) & 14 (=15, stripe).
  const order = [1, 9, 2, 10, 8, 3, 4, 11, 5, 12, 6, 13, 14, 7, 15];
  return [cue(), ...triangle(order, 5)];
}

export function rackNineBall(): Ball[] {
  // Diamond: rows 1,2,3,2,1 with 1 at apex and 9 in the centre.
  const out: Ball[] = [cue()];
  const rowsCount = [1, 2, 3, 2, 1];
  const layout: number[][] = [[1], [2, 3], [4, 9, 5], [6, 7], [8]];
  for (let row = 0; row < rowsCount.length; row++) {
    const x = APEX_X + row * DX;
    const ids = layout[row]!;
    for (let i = 0; i < ids.length; i++) {
      const y = MID_Y + (i - (ids.length - 1) / 2) * GAP;
      out.push(ball(ids[i]!, x, y));
    }
  }
  return out;
}

export const SNOOKER_COLOURS = [2, 3, 4, 5, 6, 7] as const; // value === id
export const SNOOKER_REDS = Array.from({ length: 15 }, (_, i) => 11 + i);

/** Spot positions for the six colours (approx. real snooker spots, scaled). */
export const SNOOKER_SPOTS: Record<number, [number, number]> = {
  2: [0.45, MID_Y - 0.28], // yellow (baulk, right)
  3: [0.45, MID_Y + 0.28], // green (baulk, left)
  4: [0.45, MID_Y], // brown (baulk centre)
  5: [1.0, MID_Y], // blue (centre spot)
  6: [1.5, MID_Y], // pink (in front of reds)
  7: [1.75, MID_Y], // black
};

export function rackSnooker(): Ball[] {
  const out: Ball[] = [ball(0, 0.42, MID_Y - 0.18)]; // cue starts in the "D"
  for (const id of SNOOKER_COLOURS) {
    const [x, y] = SNOOKER_SPOTS[id]!;
    out.push(ball(id, x, y));
  }
  // Reds in a tight triangle just behind the pink.
  out.push(...triangle(SNOOKER_REDS, 5, 1.56));
  return out;
}
