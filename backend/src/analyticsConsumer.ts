import { Redis } from "ioredis";
import { AnalyticsConsumer } from "./analytics/consumer.js";
import { JsonlFileWarehouseWriter } from "./analytics/warehouse.js";

// Native .env loading (Node 22).
try {
  process.loadEnvFile();
} catch {
  /* env already provided */
}

/**
 * Standalone analytics warehouse consumer (GDD §14.2). Drains the Redis stream
 * the game services produce into a JSONL staging file (a stand-in for a
 * ClickHouse/BigQuery batch load). Run alongside the API:
 *   REDIS_URL=redis://localhost:6379 npm run analytics:consume
 */
async function main(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required for the analytics consumer");
  const outFile = process.env.ANALYTICS_OUT ?? "analytics-events.jsonl";

  const redis = new Redis(url);
  const consumer = new AnalyticsConsumer(redis, new JsonlFileWarehouseWriter(outFile));

  const shutdown = () => {
    consumer.stop();
    redis.quit().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // eslint-disable-next-line no-console
  console.log(`analytics consumer draining → ${outFile}`);
  await consumer.run();
}

void main();
