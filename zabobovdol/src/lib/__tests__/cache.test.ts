import test from "node:test";
import assert from "node:assert/strict";
import { tagsForModel, reviveDates, dayKey, CACHE_TAGS } from "@/lib/cache-core";

test("tagsForModel връща таговете за известните модели", () => {
  assert.deepEqual(tagsForModel("faq"), [CACHE_TAGS.faq]);
  assert.deepEqual(tagsForModel("scamAlert"), [CACHE_TAGS.scam]);
  assert.deepEqual(tagsForModel("dutyRoster"), [CACHE_TAGS.duty]);
  assert.deepEqual(tagsForModel("obituary"), []);
});

test("reviveDates връща ISO низовете като Date, останалото не пипа", () => {
  const out = reviveDates<{
    a: unknown;
    b: unknown[];
    c: { d: number; e: null; f: string };
  }>({
    a: "2026-10-23T10:00:00.000Z",
    b: ["2026-10-23T10:00:00Z", "Здравейте"],
    c: { d: 5, e: null, f: "2026-10-23" },
  });
  assert.ok(out.a instanceof Date);
  assert.ok(out.b[0] instanceof Date);
  assert.equal(out.b[1], "Здравейте");
  assert.equal(out.c.f, "2026-10-23");
  assert.equal(out.c.e, null);
});

test("dayKey е по София и се мести с plusDays", () => {
  // 22:30 UTC на 22-ри = 01:30 на 23-ти в София (лятно/зимно +2/+3)
  const d = new Date("2026-10-22T22:30:00Z");
  assert.equal(dayKey(d), "2026-10-23");
  assert.equal(dayKey(d, 1), "2026-10-24");
});
