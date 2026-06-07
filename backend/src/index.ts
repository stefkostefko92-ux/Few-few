import type { Server } from "node:http";
import { defaultLiveOps } from "./config/liveops.js";
import { loadConfig } from "./config/env.js";
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
import { createPrismaClient, type PrismaClient } from "./data/prismaClient.js";
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

type RedisClient = import("ioredis").Redis;

/**
 * Bootstrap. Config is validated fail-fast (config/env.ts) — in production the
 * process refuses to start with a missing database or insecure default secrets.
 * Adapters are selected from the (validated) config:
 *   - DATABASE_URL → Postgres (Prisma); else in-memory (dev only)
 *   - REDIS_URL    → Redis leaderboard + analytics stream; else no-op/console
 */
async function main(): Promise<void> {
  const cfg = loadConfig();

  let prisma: PrismaClient | undefined;
  let redis: RedisClient | undefined;

  let repo: PlayerRepository;
  let store: Store;
  let authRepo: AuthRepository;
  let clanRepo: ClanRepository;
  let liveOps: LiveOpsStore;
  if (cfg.databaseUrl) {
    prisma = createPrismaClient(cfg.databaseUrl);
    repo = new PrismaPlayerRepository(prisma); // non-transactional reads
    store = new PrismaStore(prisma); // atomic unit of work (players, ledger, purchases, clans)
    authRepo = new PrismaAuthRepository(prisma);
    clanRepo = new PrismaClanRepository(prisma); // non-transactional reads (list/get)
    liveOps = new PrismaLiveOpsStore(prisma, defaultLiveOps);
    console.log("storage: Postgres (Prisma)");
  } else {
    const memRepo = new MemoryPlayerRepository();
    const memClans = new MemoryClanRepository();
    repo = memRepo;
    clanRepo = memClans;
    store = new MemoryStore(memRepo, new MemoryLedger(), new MemoryPurchaseRepository(), memClans);
    authRepo = new MemoryAuthRepository();
    liveOps = new MemoryLiveOpsStore(defaultLiveOps);
    console.log("storage: in-memory (development)");
  }
  await liveOps.load(); // seed from persistence if present

  let leaderboard: Leaderboard = noopLeaderboard;
  let analytics: Analytics = new ConsoleAnalytics();
  if (cfg.redisUrl) {
    const { Redis } = await import("ioredis");
    redis = new Redis(cfg.redisUrl, { maxRetriesPerRequest: 3 });
    leaderboard = new RedisLeaderboard(redis);
    analytics = new RedisStreamAnalytics(redis);
    console.log("leaderboard + analytics: Redis");
  } else {
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
  const tokens = new TokenService(cfg.jwtSecret);
  const auth = new AuthService({ authRepo, tokens, createPlayer: (name) => game.createPlayer(name), analytics });

  const catalog = new Catalog();
  if (!process.env.JWT_SECRET) console.warn("⚠  JWT_SECRET not set — using an insecure dev secret (development only).");
  if (!process.env.IAP_WEBHOOK_SECRET) console.warn("⚠  IAP_WEBHOOK_SECRET not set — using a public default (development only).");
  const validator = new StubReceiptValidator(cfg.receiptSecret);
  const iap = new IapService({ catalog, validator, game, analytics });

  // DEV ONLY: let the web demo mint sandbox receipts (config rejects this in prod).
  let devReceipt: ((productId: string) => string) | undefined;
  if (cfg.enableDevReceipts) {
    let n = 0;
    devReceipt = (productId) => validator.sign(`dev-${Date.now()}-${n++}`, productId);
    console.warn("⚠  ENABLE_DEV_RECEIPTS=true — /iap/dev-receipt is open. Dev only.");
  }
  if (cfg.adminKey) console.log("admin: /admin/liveops enabled");

  // Readiness probe for the load balancer: are the backing stores reachable?
  const readiness = async () => {
    const checks: Record<string, boolean> = {};
    if (prisma) {
      try { await prisma.$queryRaw`SELECT 1`; checks.database = true; } catch { checks.database = false; }
    }
    if (redis) {
      try { checks.redis = (await redis.ping()) === "PONG"; } catch { checks.redis = false; }
    }
    return { ok: Object.values(checks).every(Boolean), checks };
  };

  const app = createApp({
    game,
    auth,
    tokens,
    iap,
    catalog,
    clan,
    liveOps,
    adminKey: cfg.adminKey,
    webhookSecret: cfg.webhookSecret,
    corsOrigins: cfg.corsOrigins,
    devReceipt,
    trustProxy: cfg.trustProxy,
    readiness,
  });
  const server: Server = app.listen(cfg.port, () => {
    console.log(`KAGURA backend listening on :${cfg.port} (${cfg.nodeEnv})`);
  });

  // Real-time clan chat over WebSocket at /ws (§7.2).
  const wss = new ChatHub(tokens, (id) => game.getPlayer(id)).attach(server);

  installShutdown({ server, wss, prisma, redis });
}

/**
 * Graceful shutdown (GDD §11.4). On SIGTERM/SIGINT: stop accepting new HTTP
 * connections, close live WebSockets, then close the Postgres pool and Redis,
 * with a hard-exit fallback so a stuck connection can't block a redeploy.
 */
function installShutdown(h: {
  server: Server;
  wss: import("ws").WebSocketServer;
  prisma?: PrismaClient;
  redis?: RedisClient;
}): void {
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received — shutting down gracefully`);
    const force = setTimeout(() => {
      console.error("forced exit after shutdown timeout");
      process.exit(1);
    }, 10_000);
    force.unref();
    try {
      for (const client of h.wss.clients) client.close(1001, "server shutting down");
      await new Promise<void>((resolve) => h.wss.close(() => resolve()));
      await new Promise<void>((resolve) => h.server.close(() => resolve()));
      if (h.prisma) await h.prisma.$disconnect();
      if (h.redis) await h.redis.quit();
      clearTimeout(force);
      console.log("shutdown complete");
      process.exit(0);
    } catch (err) {
      console.error("error during shutdown:", err);
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
