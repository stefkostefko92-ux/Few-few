import { defaultLiveOps } from "./config/liveops.js";
import { MemoryLiveOpsStore, type LiveOpsStore } from "./config/liveOpsStore.js";
import { PrismaLiveOpsStore } from "./data/prismaLiveOpsStore.js";
import { AuthService } from "./auth/authService.js";
import { TokenService } from "./auth/tokens.js";
import { MemoryAuthRepository, type AuthRepository } from "./data/authRepository.js";
import { MemoryClanRepository, type ClanRepository } from "./data/clanRepository.js";
import { MemoryLedger, type Ledger } from "./data/ledger.js";
import { MemoryPlayerRepository } from "./data/memoryRepository.js";
import { MemoryPurchaseRepository, type PurchaseRepository } from "./data/purchaseRepository.js";
import { PrismaAuthRepository } from "./data/prismaAuthRepository.js";
import { PrismaClanRepository } from "./data/prismaClanRepository.js";
import { PrismaLedger } from "./data/prismaLedger.js";
import { PrismaPlayerRepository } from "./data/prismaRepository.js";
import { PrismaPurchaseRepository } from "./data/prismaPurchaseRepository.js";
import { createPrismaClient } from "./data/prismaClient.js";
import type { PlayerRepository } from "./data/repository.js";
import { createApp } from "./http/app.js";
import { Catalog } from "./monetization/catalog.js";
import { StubReceiptValidator } from "./monetization/receipts.js";
import { ChatHub } from "./realtime/chatHub.js";
import { ClanService } from "./services/clanService.js";
import { GameService } from "./services/gameService.js";
import { IapService } from "./services/iapService.js";
import { noopLeaderboard, RedisLeaderboard, type Leaderboard } from "./services/leaderboard.js";
import { ConsoleAnalytics, type Analytics } from "./analytics/analytics.js";
import { RedisStreamAnalytics } from "./analytics/redisAnalytics.js";

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
  let clanRepo: ClanRepository;
  let liveOps: LiveOpsStore;
  if (process.env.DATABASE_URL) {
    const prisma = createPrismaClient(process.env.DATABASE_URL);
    repo = new PrismaPlayerRepository(prisma);
    ledger = new PrismaLedger(prisma);
    authRepo = new PrismaAuthRepository(prisma);
    purchases = new PrismaPurchaseRepository(prisma);
    clanRepo = new PrismaClanRepository(prisma);
    liveOps = new PrismaLiveOpsStore(prisma, defaultLiveOps);
    // eslint-disable-next-line no-console
    console.log("storage: Postgres (Prisma)");
  } else {
    repo = new MemoryPlayerRepository();
    ledger = new MemoryLedger();
    authRepo = new MemoryAuthRepository();
    purchases = new MemoryPurchaseRepository();
    clanRepo = new MemoryClanRepository();
    liveOps = new MemoryLiveOpsStore(defaultLiveOps);
    // eslint-disable-next-line no-console
    console.log("storage: in-memory");
  }
  await liveOps.load(); // seed from persistence if present

  let leaderboard: Leaderboard = noopLeaderboard;
  let analytics: Analytics = new ConsoleAnalytics();
  if (process.env.REDIS_URL) {
    const { Redis } = await import("ioredis");
    const redis = new Redis(process.env.REDIS_URL);
    leaderboard = new RedisLeaderboard(redis);
    analytics = new RedisStreamAnalytics(redis);
    // eslint-disable-next-line no-console
    console.log("leaderboard + analytics: Redis");
  } else {
    // eslint-disable-next-line no-console
    console.log("analytics: console");
  }

  const clan = new ClanService({ clanRepo, playerRepo: repo });
  const game = new GameService({
    repo,
    ledger,
    liveOps,
    leaderboard,
    analytics,
    onContribution: (playerId, points) => clan.contribute(playerId, points),
  });
  const tokens = new TokenService(jwtSecret);
  const auth = new AuthService({ authRepo, tokens, createPlayer: (name) => game.createPlayer(name), analytics });

  const catalog = new Catalog();
  const receiptSecret = process.env.IAP_RECEIPT_SECRET ?? "dev-receipt-secret-change-me";
  const webhookSecret = process.env.IAP_WEBHOOK_SECRET ?? "dev-webhook-secret-change-me";
  const validator = new StubReceiptValidator(receiptSecret);
  const iap = new IapService({ catalog, validator, purchases, game, analytics });

  // DEV ONLY: let the web demo mint sandbox receipts (never enable in prod).
  let devReceipt: ((productId: string) => string) | undefined;
  if (process.env.ENABLE_DEV_RECEIPTS === "true") {
    let n = 0;
    devReceipt = (productId) => validator.sign(`dev-${Date.now()}-${n++}`, productId);
    // eslint-disable-next-line no-console
    console.warn("⚠  ENABLE_DEV_RECEIPTS=true — /iap/dev-receipt is open. Dev only.");
  }

  const corsOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const adminKey = process.env.ADMIN_API_KEY;
  if (adminKey) {
    // eslint-disable-next-line no-console
    console.log("admin: /admin/liveops enabled");
  }
  const app = createApp({
    game,
    auth,
    tokens,
    iap,
    catalog,
    clan,
    liveOps,
    adminKey,
    webhookSecret,
    corsOrigins,
    devReceipt,
  });
  const server = app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`KAGURA backend (prototype) listening on :${port}`);
  });

  // Real-time clan chat over WebSocket at /ws (§7.2).
  new ChatHub(tokens, (id) => game.getPlayer(id)).attach(server);
}

void main();
