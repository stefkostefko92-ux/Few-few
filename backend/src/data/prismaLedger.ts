import { randomUUID } from "node:crypto";
import type { Currency } from "../domain/types.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import {
  assertBalanced,
  type Ledger,
  type LedgerEntry,
  type LedgerLeg,
  playerAccount,
  SYSTEM_FAUCET,
  SYSTEM_SINK,
} from "./ledger.js";

/**
 * Postgres-backed double-entry ledger (§6.1). Each transaction inserts its legs
 * atomically; balances are computed with SQL SUM aggregation. The table is
 * append-only — corrections are new balancing transactions, never UPDATEs.
 */
export class PrismaLedger implements Ledger {
  constructor(private readonly prisma: PrismaClient) {}

  async post(reason: string, legs: LedgerLeg[], at: number = Date.now()): Promise<LedgerEntry> {
    assertBalanced(legs);
    const txId = randomUUID();
    await this.prisma.ledgerLeg.createMany({
      data: legs.map((leg) => ({
        txId,
        at: BigInt(Math.round(at)),
        reason,
        account: leg.account,
        currency: leg.currency,
        delta: BigInt(Math.round(leg.delta)),
      })),
    });
    return { txId, at, reason, legs };
  }

  mint(playerId: string, currency: Currency, amount: number, reason: string, at?: number): Promise<LedgerEntry> {
    return this.post(
      reason,
      [
        { account: SYSTEM_FAUCET, currency, delta: -amount },
        { account: playerAccount(playerId), currency, delta: amount },
      ],
      at,
    );
  }

  burn(playerId: string, currency: Currency, amount: number, reason: string, at?: number): Promise<LedgerEntry> {
    return this.post(
      reason,
      [
        { account: playerAccount(playerId), currency, delta: -amount },
        { account: SYSTEM_SINK, currency, delta: amount },
      ],
      at,
    );
  }

  transfer(
    fromPlayerId: string,
    toPlayerId: string,
    currency: Currency,
    amount: number,
    reason: string,
    at?: number,
  ): Promise<LedgerEntry> {
    return this.post(
      reason,
      [
        { account: playerAccount(fromPlayerId), currency, delta: -amount },
        { account: playerAccount(toPlayerId), currency, delta: amount },
      ],
      at,
    );
  }

  async balanceOf(account: string, currency: Currency): Promise<number> {
    const agg = await this.prisma.ledgerLeg.aggregate({
      _sum: { delta: true },
      where: { account, currency },
    });
    return Number(agg._sum.delta ?? 0n);
  }

  async netForCurrency(currency: Currency): Promise<number> {
    const agg = await this.prisma.ledgerLeg.aggregate({
      _sum: { delta: true },
      where: { currency },
    });
    return Number(agg._sum.delta ?? 0n);
  }
}
