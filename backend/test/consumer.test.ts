import { describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import { AnalyticsConsumer } from "../src/analytics/consumer.js";
import { MemoryWarehouseWriter } from "../src/analytics/warehouse.js";

/**
 * Minimal fake Redis exposing just the stream calls the consumer uses. It hands
 * back a single prepared batch on the first xreadgroup and records every xack.
 */
function fakeRedis(batch: [string, string[]][]) {
  let drained = false;
  const acked: string[] = [];
  const redis = {
    async xgroup() {
      return "OK";
    },
    async xreadgroup() {
      if (drained) return null;
      drained = true;
      return [["analytics:events", batch]];
    },
    async xack(_stream: string, _group: string, ...ids: string[]) {
      acked.push(...ids);
      return ids.length;
    },
  };
  return { redis: redis as unknown as Redis, acked };
}

describe("AnalyticsConsumer.drainOnce", () => {
  it("writes valid events and acks the whole batch", async () => {
    const ev = { type: "SPIN", playerId: "p1", at: 1 };
    const { redis, acked } = fakeRedis([["1-0", ["data", JSON.stringify(ev)]]]);
    const writer = new MemoryWarehouseWriter();
    const consumer = new AnalyticsConsumer(redis, writer);

    const n = await consumer.drainOnce();

    expect(n).toBe(1);
    expect(writer.rows).toEqual([ev]);
    expect(acked).toEqual(["1-0"]);
  });

  it("skips a poison entry but still writes the good one and acks both", async () => {
    const good = { type: "SPIN", playerId: "p2", at: 2 };
    const { redis, acked } = fakeRedis([
      ["2-0", ["data", "{not valid json"]], // poison: unparseable
      ["2-1", ["type", "SPIN"]], // poison: missing 'data' field
      ["2-2", ["data", JSON.stringify(good)]], // good
    ]);
    const writer = new MemoryWarehouseWriter();
    const consumer = new AnalyticsConsumer(redis, writer);

    const n = await consumer.drainOnce();

    expect(n).toBe(3);
    expect(writer.rows).toEqual([good]); // only the decodable event reaches the warehouse
    expect(acked).toEqual(["2-0", "2-1", "2-2"]); // poison acked too, so it can't stall the stream
  });
});
