import type { Ledger } from "./ledger.js";
import { MemoryLedger } from "./ledger.js";
import type { PlayerRepository } from "./repository.js";
import type { PurchaseRepository } from "./purchaseRepository.js";
import { MemoryPurchaseRepository } from "./purchaseRepository.js";
import type { ClanRepository } from "./clanRepository.js";
import { MemoryClanRepository } from "./clanRepository.js";

/**
 * Transactional unit of work (GDD §11.3). A value-bearing action loads and
 * mutates players, posts ledger legs, claims purchase idempotency keys, and
 * updates clan/war rows through a single `StoreTx` so they commit atomically —
 * on the Postgres backend a failure rolls everything back, so a crash can never
 * leave a player balance out of sync with the ledger, an IAP recorded but
 * ungranted, or a clan over its member cap.
 *
 * Side effects on external systems (Redis leaderboard, analytics stream) run
 * *after* the transaction commits, never inside it.
 */
export interface StoreTx {
  players: PlayerRepository;
  ledger: Ledger;
  purchases: PurchaseRepository;
  clans: ClanRepository;
}

export interface Store {
  transaction<T>(fn: (tx: StoreTx) => Promise<T>): Promise<T>;
}

/**
 * In-memory store: runs the unit of work against shared repo instances. There
 * is no real rollback (the prototype/test backend) — actions validate before
 * they mutate, so a thrown error leaves state untouched in practice. Real
 * atomicity is provided by PrismaStore. Purchase/clan repos default to fresh
 * in-memory instances so existing call sites need not pass them.
 */
export class MemoryStore implements Store {
  private readonly players: PlayerRepository;
  private readonly ledger: Ledger;
  private readonly purchases: PurchaseRepository;
  private readonly clans: ClanRepository;

  constructor(
    players: PlayerRepository,
    ledger: Ledger = new MemoryLedger(),
    purchases: PurchaseRepository = new MemoryPurchaseRepository(),
    clans: ClanRepository = new MemoryClanRepository(),
  ) {
    this.players = players;
    this.ledger = ledger;
    this.purchases = purchases;
    this.clans = clans;
  }

  transaction<T>(fn: (tx: StoreTx) => Promise<T>): Promise<T> {
    return fn({ players: this.players, ledger: this.ledger, purchases: this.purchases, clans: this.clans });
  }
}
