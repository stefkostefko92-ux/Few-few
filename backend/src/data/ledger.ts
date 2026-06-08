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
 * (raid/attack) balance directly between the two players.
 *
 * The interface is async so the same `GameService` runs over the in-memory
 * implementation (tests/prototype) or the Postgres-backed one (production).
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

/** Validate that legs net to zero per currency; throws otherwise. */
export function assertBalanced(legs: LedgerLeg[]): void {
  const byCurrency = new Map<Currency, number>();
  for (const leg of legs) {
    byCurrency.set(leg.currency, (byCurrency.get(leg.currency) ?? 0) + leg.delta);
  }
  for (const [currency, sum] of byCurrency) {
    if (sum !== 0) throw new LedgerImbalanceError(currency, sum);
  }
}

export interface Ledger {
  post(reason: string, legs: LedgerLeg[], at?: number): Promise<LedgerEntry>;
  mint(playerId: string, currency: Currency, amount: number, reason: string, at?: number): Promise<LedgerEntry>;
  burn(playerId: string, currency: Currency, amount: number, reason: string, at?: number): Promise<LedgerEntry>;
  transfer(
    fromPlayerId: string,
    toPlayerId: string,
    currency: Currency,
    amount: number,
    reason: string,
    at?: number,
  ): Promise<LedgerEntry>;
  balanceOf(account: string, currency: Currency): Promise<number>;
  netForCurrency(currency: Currency): Promise<number>;
}

/** Shared convenience helpers built on top of `post`. */
abstract class BaseLedger implements Ledger {
  abstract post(reason: string, legs: LedgerLeg[], at?: number): Promise<LedgerEntry>;
  abstract balanceOf(account: string, currency: Currency): Promise<number>;
  abstract netForCurrency(currency: Currency): Promise<number>;

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
}

export class MemoryLedger extends BaseLedger {
  private readonly entries: LedgerEntry[] = [];

  async post(reason: string, legs: LedgerLeg[], at: number = Date.now()): Promise<LedgerEntry> {
    assertBalanced(legs);
    const entry: LedgerEntry = { txId: randomUUID(), at, reason, legs };
    this.entries.push(entry);
    return entry;
  }

  async balanceOf(account: string, currency: Currency): Promise<number> {
    let sum = 0;
    for (const e of this.entries) {
      for (const leg of e.legs) {
        if (leg.account === account && leg.currency === currency) sum += leg.delta;
      }
    }
    return sum;
  }

  async netForCurrency(currency: Currency): Promise<number> {
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
