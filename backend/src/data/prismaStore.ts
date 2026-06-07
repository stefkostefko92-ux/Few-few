import type { PrismaClient } from "./prismaClient.js";
import { PrismaLedger } from "./prismaLedger.js";
import { PrismaPlayerRepository } from "./prismaRepository.js";
import { PrismaPurchaseRepository } from "./prismaPurchaseRepository.js";
import { PrismaClanRepository } from "./prismaClanRepository.js";
import type { Store, StoreTx } from "./store.js";

/**
 * Postgres-backed unit of work: each `transaction()` runs inside a real
 * `prisma.$transaction`, so the player save(s) and ledger legs for one action
 * commit or roll back together (GDD §11.3).
 */
export class PrismaStore implements Store {
  constructor(private readonly prisma: PrismaClient) {}

  transaction<T>(fn: (tx: StoreTx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      (txClient) => {
        // The interactive transaction client exposes the same model delegates as
        // PrismaClient (just without $transaction itself), so the repos can run
        // against it. The cast is safe — only model accessors are used.
        const client = txClient as unknown as PrismaClient;
        const tx: StoreTx = {
          players: new PrismaPlayerRepository(client),
          ledger: new PrismaLedger(client),
          purchases: new PrismaPurchaseRepository(client),
          clans: new PrismaClanRepository(client),
        };
        return fn(tx);
      },
      // Raised above Prisma's 5s default: actions can briefly wait on a clan
      // SELECT ... FOR UPDATE lock under contention. Bodies do no external I/O,
      // so they stay short; the cap just prevents a P2028 abort while queued.
      { timeout: 15_000, maxWait: 5_000 },
    );
  }
}
