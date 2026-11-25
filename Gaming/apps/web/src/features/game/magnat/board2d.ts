import { BOARD_SIZE } from "@aso/shared";

/**
 * Клетка (ред, колона; 1..11) на поле `i` в 11×11 решетката на 2D дъската:
 * Старт е долу вдясно, ходът върви наляво по долния ред, нагоре по левия,
 * надясно по горния и надолу по десния — както 3D дъската (magnatScene).
 */
export function tileCell(i: number): { row: number; col: number } {
  const k = ((i % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
  if (k <= 10) return { row: 11, col: 11 - k };
  if (k < 20) return { row: 11 - (k - 10), col: 1 };
  if (k <= 30) return { row: 1, col: k - 19 };
  return { row: k - 29, col: 11 };
}
