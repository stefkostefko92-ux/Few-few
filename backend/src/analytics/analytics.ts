import type { AnalyticsEvent } from "./events.js";

/**
 * Analytics sink (GDD §14.2: event stream → warehouse). `track` is
 * fire-and-forget and must never throw or block a gameplay action — a failing
 * analytics backend can't break the game. Production fans out to a queue
 * (BullMQ/Redis) and on to ClickHouse/BigQuery.
 */
export interface Analytics {
  track(event: AnalyticsEvent): void;
}

/** Default sink — drops everything. */
export const noopAnalytics: Analytics = { track() {} };

/** In-memory sink for tests/inspection. */
export class MemoryAnalytics implements Analytics {
  readonly events: AnalyticsEvent[] = [];
  track(event: AnalyticsEvent): void {
    this.events.push(event);
  }
  ofType<T extends AnalyticsEvent["type"]>(type: T): Extract<AnalyticsEvent, { type: T }>[] {
    return this.events.filter((e) => e.type === type) as Extract<AnalyticsEvent, { type: T }>[];
  }
}

/** Structured-log sink (pino-style line per event; never logs PII — §11.4). */
export class ConsoleAnalytics implements Analytics {
  constructor(private readonly log: (line: string) => void = (l) => console.log(l)) {}
  track(event: AnalyticsEvent): void {
    this.log(JSON.stringify({ kind: "analytics", ...event }));
  }
}
