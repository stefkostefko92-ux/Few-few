import test from "node:test";
import assert from "node:assert/strict";
import { clientIp, pruneHits } from "@/lib/client-ip";
import type { NextRequest } from "next/server";

// Стъб — clientIp ползва само headers.get.
function reqWith(headers: Record<string, string>): NextRequest {
  return {
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as unknown as NextRequest;
}

test("clientIp: X-Real-IP (презаписан от nginx) има предимство", () => {
  const req = reqWith({
    "x-real-ip": "203.0.113.7",
    "x-forwarded-for": "1.2.3.4, 203.0.113.7",
  });
  assert.equal(clientIp(req), "203.0.113.7");
});

test("clientIp: подменен ляв XFF НЕ печели — взима се най-десният hop", () => {
  // Атакуващ праща XFF: 1.2.3.4; nginx добавя реалния IP отдясно.
  const req = reqWith({ "x-forwarded-for": "1.2.3.4, 198.51.100.9" });
  assert.equal(clientIp(req), "198.51.100.9");
});

test("clientIp: без хедъри → unknown", () => {
  assert.equal(clientIp(reqWith({})), "unknown");
});

test("pruneHits: маха изтеклите, пази живите броячи", () => {
  const now = 100_000;
  const win = 60_000;
  const hits = new Map<string, number[]>([
    ["стар", [now - 70_000, now - 65_000]],
    ["смесен", [now - 70_000, now - 1_000]],
    ["жив", [now - 500]],
  ]);
  pruneHits(hits, win, now);
  assert.equal(hits.has("стар"), false);
  assert.deepEqual(hits.get("смесен"), [now - 1_000]);
  assert.deepEqual(hits.get("жив"), [now - 500]);
});
