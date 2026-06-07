import { defaultLiveOps } from "./config/liveops.js";
import { AuthService } from "./auth/authService.js";
import { TokenService } from "./auth/tokens.js";
import { MemoryAuthRepository, type AuthRepository } from "./data/authRepository.js";
import { MemoryLedger, type Ledger } from "./data/ledger.js";
import { MemoryPlayerRepository } from "./data/memoryRepository.js";
import { MemoryPurchaseRepository, type PurchaseRepository } from "./data/purchaseRepository.js";
import { PrismaAuthRepository } from "./data/prismaAuthRepository.js";
import { PrismaLedger } from "./data/prismaLedger.js";
import { PrismaPlayerRepository } from "./data/prismaRepository.js";
import { PrismaPurchaseRepository } from "./data/prismaPurchaseRepository.js";
import { createPrismaClient } from "./data/prismaClient.js";
import type { PlayerRepository } from "./data/repository.js";
import { createApp } from "./http/app.js";
import { Catalog } from "./monetization/catalog.js";
import { StubReceiptValidator } from "./monetization/receipts.js";
import { GameService } from "./services/gameService.js";
import { IapService } from "./services/iapService.js";
import { noopLeaderboard, RedisLeaderboard, type Leaderboard } from "./services/leaderboard.js";

// Native .env loading (Node 22). No-op if the file is absent.
try {
  process.loadEnvFile();
} catch {
  /* env already provided by the environment */
}

/**
 * Prototype bootstrap. Selects adapters from the environment:
 *   - DATABASE_URL → Postgres (Prisma) repository + ledger + auth; else in-memory
 *   - REDIS_URL    → Redis sorted-set leaderboard; else no-op
 * The GameService, AuthService and HTTP routes are identical regardless of store.
 */
async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  const jwtSecret = process.env.JWT_SECRET ?? "dev-insecure-secret-change-me-0000";
  if (!process.env.JWT_SECRET) {
    // eslint-disable-next-line no-console
    console.warn("⚠  JWT_SECRET not set — using an insecure dev secret. Do not use in production.");
  }

  let repo: PlayerRepository;
  let ledger: Ledger;
  let authRepo: AuthRepository;
  let purchases: PurchaseRepository;
  if (process.env.DATABASE_URL) {
    const prisma = createPrismaClient(process.env.DATABASE_URL);
    repo = new PrismaPlayerRepository(prisma);
    ledger = new PrismaLedger(prisma);
    authRepo = new PrismaAuthRepository(prisma);
    purchases = new PrismaPurchaseRepository(prisma);
    // eslint-disable-next-line no-console
    console.log("storage: Postgres (Prisma)");
  } else {
    repo = new MemoryPlayerRepository();
    ledger = new MemoryLedger();
    authRepo = new MemoryAuthRepository();
    purchases = new MemoryPurchaseRepository();
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
  const tokens = new TokenService(jwtSecret);
  const auth = new AuthService({ authRepo, tokens, createPlayer: (name) => game.createPlayer(name) });

  const catalog = new Catalog();
  const receiptSecret = process.env.IAP_RECEIPT_SECRET ?? "dev-receipt-secret-change-me";
  const webhookSecret = process.env.IAP_WEBHOOK_SECRET ?? "dev-webhook-secret-change-me";
  const iap = new IapService({
    catalog,
    validator: new StubReceiptValidator(receiptSecret),
    purchases,
    game,
  });

  const app = createApp({ game, auth, tokens, iap, catalog, webhookSecret });
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`KAGURA backend (prototype) listening on :${port}`);
  });
}

void main();
