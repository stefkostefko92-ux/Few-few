import { type LiveOpsConfig, loadLiveOps } from "../config/liveops.js";
import type { LiveOpsStore } from "../config/liveOpsStore.js";
import type { PrismaClient } from "./prismaClient.js";

const ROW_ID = "current";

/**
 * Postgres-backed LiveOps store (§6.2). The whole config lives in a single JSON
 * row; `get()` serves an in-memory cache for synchronous, hot-path reads, and
 * `replace()` validates then upserts the row and refreshes the cache.
 */
export class PrismaLiveOpsStore implements LiveOpsStore {
  private cache: LiveOpsConfig;

  constructor(
    private readonly prisma: PrismaClient,
    fallback: LiveOpsConfig,
  ) {
    this.cache = fallback;
  }

  get(): LiveOpsConfig {
    return this.cache;
  }

  async load(): Promise<void> {
    const row = await this.prisma.liveOpsConfig.findUnique({ where: { id: ROW_ID } });
    if (row) this.cache = loadLiveOps(row.config);
  }

  async replace(raw: unknown): Promise<LiveOpsConfig> {
    const config = loadLiveOps(raw); // validates; throws ZodError on bad input
    await this.prisma.liveOpsConfig.upsert({
      where: { id: ROW_ID },
      create: { id: ROW_ID, config: config as object },
      update: { config: config as object },
    });
    this.cache = config;
    return config;
  }
}
