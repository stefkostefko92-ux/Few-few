import { prisma } from "@aso/db";
import { createApp } from "./app.js";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { redis } from "./redis.js";
import { seedProducts } from "./economy/seed.js";
import { bootstrapOwner } from "./routes/admin.js";
import { primeSettings } from "./settings.js";
import { initSentry } from "./integrations/sentry.js";

// Last-resort guards. An unhandled rejection is logged; an uncaught exception
// leaves the process in an undefined state, so we log and exit non-zero and let
// the orchestrator restart a clean instance (crash-only design).
process.on("unhandledRejection", (reason) => logger.error({ reason }, "unhandledRejection"));
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaughtException — exiting");
  setTimeout(() => process.exit(1), 100).unref();
});

async function main(): Promise<void> {
  initSentry();
  const app = createApp();

  // Establish the Redis connection up front (progression uses it directly).
  await redis.connect().catch((err) => logger.warn({ err: err.message }, "redis connect at boot failed"));

  // Warm the admin-editable settings cache (Discord config) so the first
  // fire-and-forget notification uses the right webhook.
  await primeSettings();

  // Mirror the product catalog into the DB so Purchase rows can FK to it.
  await seedProducts().catch((err) => logger.error({ err }, "product seed failed"));

  // First-run owner bootstrap (§14): promote BOOTSTRAP_OWNER_EMAIL to OWNER so
  // a fresh database never needs manual SQL to reach the admin panel.
  await bootstrapOwner().catch((err) => logger.error({ err }, "owner bootstrap failed"));

  const server = app.listen(env.API_PORT, () => {
    logger.info(`🂡 АСО api listening on :${env.API_PORT} (${env.NODE_ENV})`);
  });
  // Bound idle/slow sockets so an abandoned or slowloris client can't hold a
  // connection open indefinitely (keepAlive must exceed any upstream LB idle).
  server.requestTimeout = 30_000;
  server.headersTimeout = 35_000;
  server.keepAliveTimeout = 65_000;

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down");
    server.close(async () => {
      await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
      process.exit(0);
    });
    // Force-exit if graceful close hangs.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "fatal startup error");
  process.exit(1);
});
