import test from "node:test";
import assert from "node:assert/strict";
import {
  retentionCutoff,
  purgeDue,
  SEARCH_MISS_RETENTION_DAYS,
  PURGE_EVERY_MS,
} from "@/lib/retention-core";

test("срокът за търсенията без резултат е 90 дни", () => {
  assert.equal(SEARCH_MISS_RETENTION_DAYS, 90);
  const now = new Date("2026-10-23T12:00:00Z");
  assert.equal(retentionCutoff(now).toISOString(), "2026-07-25T12:00:00.000Z");
  assert.equal(retentionCutoff(now, 1).toISOString(), "2026-10-22T12:00:00.000Z");
  // Нелепи стойности не изтриват всичко наведнъж.
  assert.equal(retentionCutoff(now, 0).toISOString(), "2026-10-22T12:00:00.000Z");
});

test("автоматичното чистене е най-много веднъж на 12 часа", () => {
  const t = 1_000_000_000_000;
  assert.equal(purgeDue(null, t), true);
  assert.equal(purgeDue(t, t + 1000), false);
  assert.equal(purgeDue(t, t + PURGE_EVERY_MS), true);
  // Часовникът върнат назад — чистим, не блокираме завинаги.
  assert.equal(purgeDue(t, t - 1), true);
});
