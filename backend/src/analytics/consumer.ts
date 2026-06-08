import type { Redis } from "ioredis";
import type { AnalyticsEvent } from "./events.js";
import type { WarehouseWriter } from "./warehouse.js";

export interface ConsumerOptions {
  stream?: string;
  group?: string;
  consumer?: string;
  batch?: number;
  blockMs?: number;
}

/**
 * Drains the analytics Redis stream into a warehouse writer using a consumer
 * group (GDD §14.2). At-least-once delivery: a batch is written to the
 * warehouse *then* XACK-ed, so a crash mid-write redelivers rather than drops.
 * Horizontally scalable — run N consumers in the same group.
 */
export class AnalyticsConsumer {
  private readonly stream: string;
  private readonly group: string;
  private readonly consumer: string;
  private readonly batch: number;
  private readonly blockMs: number;
  private running = false;

  constructor(
    private readonly redis: Redis,
    private readonly writer: WarehouseWriter,
    opts: ConsumerOptions = {},
  ) {
    this.stream = opts.stream ?? "analytics:events";
    this.group = opts.group ?? "warehouse";
    this.consumer = opts.consumer ?? `c-${process.pid}`;
    this.batch = opts.batch ?? 100;
    this.blockMs = opts.blockMs ?? 5000;
  }

  /** Create the consumer group (and the stream) if it doesn't exist yet. */
  async ensureGroup(): Promise<void> {
    try {
      await this.redis.xgroup("CREATE", this.stream, this.group, "0", "MKSTREAM");
    } catch (err) {
      // BUSYGROUP = group already exists — fine.
      if (!(err instanceof Error) || !err.message.includes("BUSYGROUP")) throw err;
    }
  }

  /** Read + write + ack one batch of new messages. Returns how many were processed. */
  async drainOnce(): Promise<number> {
    const res = (await this.redis.xreadgroup(
      "GROUP",
      this.group,
      this.consumer,
      "COUNT",
      this.batch,
      "STREAMS",
      this.stream,
      ">",
    )) as [string, [string, string[]][]][] | null;

    if (!res || res.length === 0) return 0;
    const entries = res[0][1];
    if (entries.length === 0) return 0;
    return this.writeAndAck(entries);
  }

  /**
   * Decode → write → ack one batch. Valid events are written *before* the ack
   * (at-least-once: a write failure leaves the batch unacked for redelivery).
   * A single undecodable ("poison") entry is logged and skipped rather than
   * thrown, so one malformed event can't kill the consumer or stall the stream.
   */
  private async writeAndAck(entries: [string, string[]][]): Promise<number> {
    const events: AnalyticsEvent[] = [];
    for (const [id, fields] of entries) {
      const i = fields.indexOf("data");
      try {
        if (i < 0) throw new Error("missing 'data' field");
        events.push(JSON.parse(fields[i + 1]) as AnalyticsEvent);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`analytics: dropping unparseable event ${id}:`, err instanceof Error ? err.message : err);
      }
    }
    if (events.length > 0) await this.writer.write(events);
    await this.redis.xack(this.stream, this.group, ...entries.map(([id]) => id));
    return entries.length;
  }

  /** Run until stop() — blocking reads, draining batches as they arrive. */
  async run(): Promise<void> {
    await this.ensureGroup();
    this.running = true;
    while (this.running) {
      const res = (await this.redis.xreadgroup(
        "GROUP",
        this.group,
        this.consumer,
        "COUNT",
        this.batch,
        "BLOCK",
        this.blockMs,
        "STREAMS",
        this.stream,
        ">",
      )) as [string, [string, string[]][]][] | null;
      if (!res || res.length === 0) continue;
      const entries = res[0][1];
      if (entries.length === 0) continue;
      await this.writeAndAck(entries);
    }
  }

  stop(): void {
    this.running = false;
  }
}
