import type { GameKey } from "@aso/db";
import { credit, debitClamped, type LedgerTx } from "@aso/db/ledger";
import { settleStake } from "@aso/shared";

export interface StakeSeat {
  seat: number;
  userId: string | null; // null = бот
  isBot: boolean;
}

/**
 * Разделя `total` пропорционално на теглата на цели части, чиято сума е ТОЧНО
 * `total` (остатъкът отива по най-голяма дробна част, после по по-малко място —
 * детерминистично). Нула или отрицателно → всички 0.
 */
export function splitProportional(total: bigint, weights: Array<{ seat: number; weight: bigint }>): Map<number, bigint> {
  const out = new Map<number, bigint>(weights.map((w) => [w.seat, 0n]));
  const sum = weights.reduce((s, w) => s + (w.weight > 0n ? w.weight : 0n), 0n);
  if (total <= 0n || sum <= 0n) return out;
  const parts = weights
    .filter((w) => w.weight > 0n)
    .map((w) => ({ seat: w.seat, base: (total * w.weight) / sum, rem: (total * w.weight) % sum }));
  let left = total - parts.reduce((s, p) => s + p.base, 0n);
  parts.sort((a, b) => (a.rem === b.rem ? a.seat - b.seat : a.rem > b.rem ? -1 : 1));
  for (const p of parts) {
    const extra = left > 0n ? 1n : 0n;
    left -= extra;
    out.set(p.seat, p.base + extra);
  }
  return out;
}

/**
 * Урежда залога на маса със залог (Свара) в транзакцията на мача и връща
 * реално приложения chipsΔ по място. Решение на собственика:
 *  - бот на масата → без залог за никого (0 — нито печалба, нито загуба);
 *  - между хора → нулева сума: загубилите плащат най-много колкото имат
 *    (пазач „не под 0“), а печелившите получават точно реално взетото,
 *    разделено пропорционално на номиналната им печалба. Чипове не се създават.
 * Всяко движение оставя ред MATCH в регистъра (refId = matchId).
 */
export async function settleBettingStakes(
  tx: LedgerTx,
  opts: { matchId: string; game: GameKey; seats: StakeSeat[]; pointsBySeat: Map<number, number> },
): Promise<Map<number, bigint>> {
  const { matchId, game, seats, pointsBySeat } = opts;
  const humans = seats.filter((s): s is StakeSeat & { userId: string } => !s.isBot && s.userId !== null);
  const out = new Map<number, bigint>(humans.map((s) => [s.seat, 0n]));
  if (humans.length !== seats.length) return out; // има бот → без залог

  const nominal = new Map<number, bigint>(
    humans.map((s) => [s.seat, BigInt(settleStake(game, pointsBySeat.get(s.seat) ?? 0))]),
  );
  const losers = humans.filter((s) => (nominal.get(s.seat) ?? 0n) < 0n);
  const winners = humans.filter((s) => (nominal.get(s.seat) ?? 0n) > 0n);
  if (losers.length === 0 || winners.length === 0) return out;

  // Колко най-много може да плати всеки загубил (номиналът, ограничен до портфейла).
  const caps: Array<{ seat: number; weight: bigint }> = [];
  for (const s of losers) {
    const u = await tx.user.findUnique({ where: { id: s.userId }, select: { chips: true } });
    const owe = -(nominal.get(s.seat) ?? 0n);
    const have = u?.chips ?? 0n;
    caps.push({ seat: s.seat, weight: have < owe ? (have > 0n ? have : 0n) : owe });
  }
  const winWeights = winners.map((s) => ({ seat: s.seat, weight: nominal.get(s.seat) ?? 0n }));
  const owedToWinners = winWeights.reduce((sum, w) => sum + w.weight, 0n);
  const payable = caps.reduce((sum, c) => sum + c.weight, 0n);
  const pot = payable < owedToWinners ? payable : owedToWinners;

  // Първо дебитите (атомарни, „не под 0“) — печелившите делят реално взетото.
  let taken = 0n;
  const loserShares = splitProportional(pot, caps);
  for (const s of losers) {
    const r = await debitClamped(tx, s.userId, "CHIPS", loserShares.get(s.seat) ?? 0n, "MATCH", matchId);
    taken += r.taken;
    out.set(s.seat, -r.taken);
  }
  const winShares = splitProportional(taken, winWeights);
  for (const s of winners) {
    const share = winShares.get(s.seat) ?? 0n;
    await credit(tx, s.userId, "CHIPS", share, "MATCH", matchId);
    out.set(s.seat, share);
  }
  return out;
}
