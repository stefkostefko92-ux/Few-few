import { randomUUID } from "node:crypto";
import type { Currency } from "../domain/types.js";

/**
 * Double-entry ledger (GDD §6.1).
 *
 * "Двойно-записна (double-entry) ledger таблица за ВСЯКА валутна транзакция —
 * задължително за анти-чийт, refund handling и финансов одит."
 *
 * Every value movement is recorded as a balanced transaction: the legs for each
 * currency MUST sum to zero. Minted currency flows out of a system faucet
 * account; spent currency flows into a system sink. Player-to-player transfers
 * (raid/attack) balance directly between the two players. This makes the whole
 * economy auditable and lets tests assert conservation of value.
 */

export const SYSTEM_FAUCET = "system:faucet";
export const SYSTEM_SINK = "system:sink";

export function playerAccount(playerId: string): string {
  return `player:${playerId}`;
}

export interface LedgerLeg {
  account: string;
  currency: Currency;
  delta: number; // positive = credit into account, negative = debit
}

export interface LedgerEntry {
  txId: string;
  at: number;
  reason: string;
  legs: LedgerLeg[];
}

export class LedgerImbalanceError extends Error {
  constructor(currency: Currency, sum: number) {
    super(`ledger transaction unbalanced for ${currency}: net ${sum} (must be 0)`);
    this.name = "LedgerImbalanceError";
  }
}

export class Ledger {
  private readonly entries: LedgerEntry[] = [];

  /**
   * Append a balanced transaction. Throws if any currency's legs do not net to
   * zero — a bug that would otherwise mint or destroy value silently.
   */
  post(reason: string, legs: LedgerLeg[], at: number = Date.now()): LedgerEntry {
    const byCurrency = new Map<Currency, number>();
    for (const leg of legs) {
      byCurrency.set(leg.currency, (byCurrency.get(leg.currency) ?? 0) + leg.delta);
    }
    for (const [currency, sum] of byCurrency) {
      if (sum !== 0) throw new LedgerImbalanceError(currency, sum);
    }
    const entry: LedgerEntry = { txId: randomUUID(), at, reason, legs };
    this.entries.push(entry);
    return entry;
  }

  /** Convenience: mint `amount` of a currency to a player from the faucet. */
  mint(playerId: string, currency: Currency, amount: number, reason: string, at?: number): LedgerEntry {
    return this.post(
      reason,
      [
        { account: SYSTEM_FAUCET, currency, delta: -amount },
        { account: playerAccount(playerId), currency, delta: amount },
      ],
      at,
    );
  }

  /** Convenience: burn `amount` of a currency from a player into the sink. */
  burn(playerId: string, currency: Currency, amount: number, reason: string, at?: number): LedgerEntry {
    return this.post(
      reason,
      [
        { account: playerAccount(playerId), currency, delta: -amount },
        { account: SYSTEM_SINK, currency, delta: amount },
      ],
      at,
    );
  }

  /** Convenience: transfer `amount` between two players (raid/attack). */
  transfer(
    fromPlayerId: string,
    toPlayerId: string,
    currency: Currency,
    amount: number,
    reason: string,
    at?: number,
  ): LedgerEntry {
    return this.post(
      reason,
      [
        { account: playerAccount(fromPlayerId), currency, delta: -amount },
        { account: playerAccount(toPlayerId), currency, delta: amount },
      ],
      at,
    );
  }

  /** Recompute an account's balance for a currency from the ledger (audit). */
  balanceOf(account: string, currency: Currency): number {
    let sum = 0;
    for (const e of this.entries) {
      for (const leg of e.legs) {
        if (leg.account === account && leg.currency === currency) sum += leg.delta;
      }
    }
    return sum;
  }

  /** Total minted minus burned should always net to zero across all accounts. */
  netForCurrency(currency: Currency): number {
    let sum = 0;
    for (const e of this.entries) {
      for (const leg of e.legs) {
        if (leg.currency === currency) sum += leg.delta;
      }
    }
    return sum;
  }

  all(): readonly LedgerEntry[] {
    return this.entries;
  }
}
