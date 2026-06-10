import { prisma } from "@aso/db";
import { createApp } from "./app.js";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { redis } from "./redis.js";
import { seedProducts } from "./economy/seed.js";
import { initSentry } from "./integrations/sentry.js";

// Last-resort guards: a stray async error must not silently kill the process.
process.on("unhandledRejection", (reason) => logger.error({ reason }, "unhandledRejection"));
process.on("uncaughtException", (err) => logger.error({ err }, "uncaughtException"));

async function main(): Promise<void> {
  initSentry();
  const app = createApp();

  // Establish the Redis connection up front (progression uses it directly).
  await redis.connect().catch((err) => logger.warn({ err: err.message }, "redis connect at boot failed"));

  // Mirror the product catalog into the DB so Purchase rows can FK to it.
  await seedProducts().catch((err) => logger.error({ err }, "product seed failed"));

  const server = app.listen(env.API_PORT, () => {
    logger.info(`🂡 АСО api listening on :${env.API_PORT} (${env.NODE_ENV})`);
  });

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
