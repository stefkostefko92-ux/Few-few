import { defaultLiveOps } from "./config/liveops.js";
import { MemoryLedger, type Ledger } from "./data/ledger.js";
import { MemoryPlayerRepository } from "./data/memoryRepository.js";
import { PrismaLedger } from "./data/prismaLedger.js";
import { PrismaPlayerRepository } from "./data/prismaRepository.js";
import { createPrismaClient } from "./data/prismaClient.js";
import type { PlayerRepository } from "./data/repository.js";
import { createApp } from "./http/app.js";
import { GameService } from "./services/gameService.js";
import { noopLeaderboard, RedisLeaderboard, type Leaderboard } from "./services/leaderboard.js";

// Native .env loading (Node 22). No-op if the file is absent.
try {
  process.loadEnvFile();
} catch {
  /* env already provided by the environment */
}

/**
 * Prototype bootstrap. Selects adapters from the environment:
 *   - DATABASE_URL → Postgres (Prisma) repository + ledger; else in-memory
 *   - REDIS_URL    → Redis sorted-set leaderboard; else no-op
 * The GameService and HTTP routes are identical regardless of backing store.
 */
async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);

  let repo: PlayerRepository;
  let ledger: Ledger;
  if (process.env.DATABASE_URL) {
    const prisma = createPrismaClient(process.env.DATABASE_URL);
    repo = new PrismaPlayerRepository(prisma);
    ledger = new PrismaLedger(prisma);
    // eslint-disable-next-line no-console
    console.log("storage: Postgres (Prisma)");
  } else {
    repo = new MemoryPlayerRepository();
    ledger = new MemoryLedger();
    // eslint-disable-next-line no-console
    console.log("storage: in-memory");
  }

  let leaderboard: Leaderboard = noopLeaderboard;
  if (process.env.REDIS_URL) {
    const { Redis } = await import("ioredis");
    leaderboard = new RedisLeaderboard(new Redis(process.env.REDIS_URL));
    // eslint-disable-next-line no-console
    console.log("leaderboard: Redis");
  }

  const game = new GameService({ repo, ledger, config: defaultLiveOps, leaderboard });
  const app = createApp(game);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`KAGURA backend (prototype) listening on :${port}`);
  });
}

void main();
