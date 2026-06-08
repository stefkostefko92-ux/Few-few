import { type LiveOpsConfig, loadLiveOps } from "./liveops.js";

/**
 * Live-tunable LiveOps configuration (GDD §6.2: "тунинг без release"). The
 * GameService reads the *current* config on every action via `get()`, so an
 * admin update through `replace()` takes effect immediately — no redeploy. A
 * cached value keeps `get()` synchronous; `replace()` validates with the same
 * zod schema and persists (Postgres in production).
 */
export interface LiveOpsStore {
  get(): LiveOpsConfig;
  /** Validate + persist a full config replacement; throws ZodError if invalid. */
  replace(raw: unknown): Promise<LiveOpsConfig>;
  /** Seed the cache from persistence at startup (no-op for in-memory). */
  load(): Promise<void>;
}

export class MemoryLiveOpsStore implements LiveOpsStore {
  private current: LiveOpsConfig;

  constructor(initial: LiveOpsConfig) {
    this.current = initial;
  }

  get(): LiveOpsConfig {
    return this.current;
  }

  async replace(raw: unknown): Promise<LiveOpsConfig> {
    this.current = loadLiveOps(raw);
    return this.current;
  }

  async load(): Promise<void> {
    /* in-memory: nothing to load */
  }
}
