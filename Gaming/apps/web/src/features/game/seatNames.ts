import type { MatchPlayerInfo } from "@aso/shared";

/**
 * Display names that tell the seats apart. Bots already arrive numbered
 * („Бот 1“, „Бот 2“… — server + localizeBots), but two humans may share a
 * name: names shared by several seats get an ordinal by seat order; unique
 * names stay as they are.
 */
export function seatNames(players: readonly MatchPlayerInfo[]): (seat: number) => string | undefined {
  const bySeat = [...players].sort((a, b) => a.seat - b.seat);
  const total = new Map<string, number>();
  for (const p of bySeat) total.set(p.displayName, (total.get(p.displayName) ?? 0) + 1);
  const seen = new Map<string, number>();
  const label = new Map<number, string>();
  for (const p of bySeat) {
    const n = (seen.get(p.displayName) ?? 0) + 1;
    seen.set(p.displayName, n);
    label.set(p.seat, (total.get(p.displayName) ?? 0) > 1 ? `${p.displayName} ${n}` : p.displayName);
  }
  return (seat) => label.get(seat);
}
