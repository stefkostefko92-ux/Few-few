import type { Ledger } from "./ledger.js";
import type { PlayerRepository } from "./repository.js";

/**
 * Transactional unit of work (GDD §11.3). A value-bearing action loads and
 * mutates players and posts ledger legs through a single `StoreTx` so they
 * commit atomically — on the Postgres backend a failure rolls everything back,
 * so a crash can never leave a player balance out of sync with the ledger.
 *
 * Side effects on external systems (Redis leaderboard, analytics stream, clan
 * war points) run *after* the transaction commits, never inside it.
 */
export interface StoreTx {
  players: PlayerRepository;
  ledger: Ledger;
}

export interface Store {
  transaction<T>(fn: (tx: StoreTx) => Promise<T>): Promise<T>;
}

/**
 * In-memory store: runs the unit of work against shared repo + ledger instances.
 * There is no real rollback (the prototype/test backend) — actions validate
 * before they mutate, so a thrown error leaves state untouched in practice. Real
 * atomicity is provided by PrismaStore.
 */
export class MemoryStore implements Store {
  constructor(
    private readonly players: PlayerRepository,
    private readonly ledger: Ledger,
  ) {}

  transaction<T>(fn: (tx: StoreTx) => Promise<T>): Promise<T> {
    return fn({ players: this.players, ledger: this.ledger });
  }
}
