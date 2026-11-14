import { describe, expect, it } from "vitest";
import { BOARD, BOARD_SIZE } from "@aso/shared";
import { tileCell } from "./board2d";

describe("tileCell — 2D дъската на Магнат", () => {
  it("всичките 40 полета са по ръба на 11×11 и никое не се застъпва", () => {
    const seen = new Set<string>();
    for (let i = 0; i < BOARD_SIZE; i++) {
      const { row, col } = tileCell(i);
      expect(row === 1 || row === 11 || col === 1 || col === 11).toBe(true);
      seen.add(`${row}:${col}`);
    }
    expect(seen.size).toBe(BOARD_SIZE);
  });

  it("ъглите са Старт, Затвор, Безплатен паркинг и Отиваш в затвора", () => {
    expect(tileCell(0)).toEqual({ row: 11, col: 11 });
    expect(BOARD[10]!.type).toBe("jail");
    expect(tileCell(10)).toEqual({ row: 11, col: 1 });
    expect(tileCell(20)).toEqual({ row: 1, col: 1 });
    expect(tileCell(30)).toEqual({ row: 1, col: 11 });
  });

  it("съседните полета са съседни клетки (ходът върви по ринга)", () => {
    for (let i = 0; i < BOARD_SIZE; i++) {
      const a = tileCell(i);
      const b = tileCell(i + 1);
      expect(Math.abs(a.row - b.row) + Math.abs(a.col - b.col)).toBe(1);
    }
  });
});
