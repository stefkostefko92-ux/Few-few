import { defaultLiveOps } from "./config/liveops.js";
import { MemoryLiveOpsStore, type LiveOpsStore } from "./config/liveOpsStore.js";
import { PrismaLiveOpsStore } from "./data/prismaLiveOpsStore.js";
import { AuthService } from "./auth/authService.js";
import { TokenService } from "./auth/tokens.js";
import { MemoryAuthRepository, type AuthRepository } from "./data/authRepository.js";
import { MemoryClanRepository, type ClanRepository } from "./data/clanRepository.js";
import { MemoryLedger } from "./data/ledger.js";
import { MemoryPlayerRepository } from "./data/memoryRepository.js";
import { MemoryPurchaseRepository } from "./data/purchaseRepository.js";
import { PrismaAuthRepository } from "./data/prismaAuthRepository.js";
import { PrismaClanRepository } from "./data/prismaClanRepository.js";
import { PrismaPlayerRepository } from "./data/prismaRepository.js";
import { PrismaStore } from "./data/prismaStore.js";
import { createPrismaClient } from "./data/prismaClient.js";
import { MemoryStore, type Store } from "./data/store.js";
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
  let store: Store;
  let authRepo: AuthRepository;
  let clanRepo: ClanRepository;
  let liveOps: LiveOpsStore;
  if (process.env.DATABASE_URL) {
    const prisma = createPrismaClient(process.env.DATABASE_URL);
    repo = new PrismaPlayerRepository(prisma); // non-transactional reads
    store = new PrismaStore(prisma); // atomic unit of work (players, ledger, purchases, clans)
    authRepo = new PrismaAuthRepository(prisma);
    clanRepo = new PrismaClanRepository(prisma); // non-transactional reads (list/get)
    liveOps = new PrismaLiveOpsStore(prisma, defaultLiveOps);
    // eslint-disable-next-line no-console
    console.log("storage: Postgres (Prisma)");
  } else {
    const memRepo = new MemoryPlayerRepository();
    const memClans = new MemoryClanRepository();
    repo = memRepo;
    clanRepo = memClans;
    // One store backs every unit of work — shares the same repo instances the
    // services read through, so in-tx writes are visible to subsequent reads.
    store = new MemoryStore(memRepo, new MemoryLedger(), new MemoryPurchaseRepository(), memClans);
    authRepo = new MemoryAuthRepository();
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

  const clan = new ClanService({ clanRepo, playerRepo: repo, store });
  const game = new GameService({
    store,
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
  if (!process.env.IAP_WEBHOOK_SECRET) {
    // eslint-disable-next-line no-console
    console.warn("⚠  IAP_WEBHOOK_SECRET not set — using a public default. Anyone could forge IAP webhooks. Do not use in production.");
  }
  const validator = new StubReceiptValidator(receiptSecret);
  const iap = new IapService({ catalog, validator, game, analytics });

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
