import type { SeatPos } from "../table/FeltTable";

/**
 * Where an absolute seat sits at MY table. Белот се раздава и играе ОБРАТНО
 * на часовниковата стрелка (първа ръка — играчът вдясно от раздаващия), а
 * двигателят върви 0→1→2→3: значи следващият след мен (seat+1) седи ВДЯСНО,
 * партньорът — срещу мен, а предишният — вляво. (Изгледът ги рисуваше
 * огледално — ходът обикаляше по часовниковата стрелка.)
 */
export function beloteSeatPos(seat: number, mySeat: number): SeatPos {
  const d = (seat - mySeat + 4) % 4;
  return d === 0 ? "bottom" : d === 1 ? "right" : d === 2 ? "top" : "left";
}
