import type { Redis } from "ioredis";
import type { Analytics } from "./analytics.js";
import type { AnalyticsEvent } from "./events.js";

/**
 * Redis Streams analytics sink (GDD §14.2). Each event is appended to a Redis
 * stream with XADD; a downstream consumer group drains it into the warehouse
 * (ClickHouse/BigQuery). `track` is fire-and-forget: XADD failures are swallowed
 * so analytics can never break gameplay.
 */
export class RedisStreamAnalytics implements Analytics {
  constructor(
    private readonly redis: Redis,
    private readonly stream = "analytics:events",
  ) {}

  /** Awaitable append — used by tests; `track` wraps this fire-and-forget. */
  async record(event: AnalyticsEvent): Promise<void> {
    await this.redis.xadd(this.stream, "*", "type", event.type, "data", JSON.stringify(event));
  }

  track(event: AnalyticsEvent): void {
    void this.record(event).catch(() => {
      /* never let analytics break a gameplay action */
    });
  }
}
