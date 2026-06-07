import { appendFile } from "node:fs/promises";
import type { AnalyticsEvent } from "./events.js";

/**
 * Warehouse sink the consumer drains the analytics stream into (GDD §14.2 →
 * ClickHouse/BigQuery). Abstracted so the batch-load target is swappable; the
 * prototype ships a memory writer (tests) and a JSONL file writer (a stand-in
 * for a warehouse batch load / object-store staging file).
 */
export interface WarehouseWriter {
  write(events: AnalyticsEvent[]): Promise<void>;
}

export class MemoryWarehouseWriter implements WarehouseWriter {
  readonly rows: AnalyticsEvent[] = [];
  async write(events: AnalyticsEvent[]): Promise<void> {
    this.rows.push(...events);
  }
}

/** Appends one JSON line per event — a staging file a loader would pick up. */
export class JsonlFileWarehouseWriter implements WarehouseWriter {
  constructor(private readonly filePath: string) {}
  async write(events: AnalyticsEvent[]): Promise<void> {
    if (events.length === 0) return;
    await appendFile(this.filePath, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  }
}
