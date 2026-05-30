import { prisma } from "@aso/db";
import { createApp } from "./app.js";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { redis } from "./redis.js";

async function main(): Promise<void> {
  const app = createApp();

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
