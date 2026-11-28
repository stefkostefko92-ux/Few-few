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

test("reviveDates оставя истинските Date непокътнати (пропуск в кеша)", () => {
  // При пропуск unstable_cache връща суровия резултат от Prisma — с Date.
  const at = new Date("2026-10-23T10:00:00Z");
  const out = reviveDates({
    a: at,
    rows: [{ title: "x", startAt: new Date("2026-10-26T09:00:00Z"), endAt: null }],
  });
  assert.ok(out.a instanceof Date);
  assert.equal(out.a.getTime(), at.getTime());
  assert.ok(out.rows[0].startAt instanceof Date);
  assert.equal(out.rows[0].startAt.toISOString(), "2026-10-26T09:00:00.000Z");
  assert.equal(out.rows[0].endAt, null);
  // Форматирането не хвърля (преди: {} → RangeError: Invalid time value).
  assert.doesNotThrow(() => new Intl.DateTimeFormat("bg-BG").format(out.rows[0].startAt));
});

test("reviveDates дава едно и също при попадение (JSON) и при пропуск (Date)", () => {
  const raw = [{ id: "1", startAt: new Date("2026-10-25T07:30:00.000Z"), title: "Събор" }];
  const miss = reviveDates(raw);
  const hit = reviveDates(JSON.parse(JSON.stringify(raw)) as typeof raw);
  assert.deepEqual(hit, miss);
  assert.ok(hit[0].startAt instanceof Date);
});

test("dayKey е по София и се мести с plusDays", () => {
  // 22:30 UTC на 22-ри = 01:30 на 23-ти в София (лятно/зимно +2/+3)
  const d = new Date("2026-10-22T22:30:00Z");
  assert.equal(dayKey(d), "2026-10-23");
  assert.equal(dayKey(d, 1), "2026-10-24");
  assert.equal(dayKey(d, 0), "2026-10-23");
});

test("dayKey: „утре“ е утре и в деня на смяната към зимно време (25.10.2026)", () => {
  // 25.10.2026 е 25-часов ден: в 04:00 (EEST, UTC+3) часовникът се връща на 03:00 (EET, UTC+2).
  const cases: [string, string, string][] = [
    // [момент UTC, днес по София, утре по София]
    ["2026-10-24T21:30:00Z", "2026-10-25", "2026-10-26"], // 00:30 на 25.10 (лятно)
    ["2026-10-25T00:30:00Z", "2026-10-25", "2026-10-26"], // 03:30 на 25.10 (първият път, лятно)
    ["2026-10-25T01:30:00Z", "2026-10-25", "2026-10-26"], // 03:30 на 25.10 (вторият път, зимно)
    ["2026-10-25T21:30:00Z", "2026-10-25", "2026-10-26"], // 23:30 на 25.10 (зимно)
    ["2026-10-24T20:30:00Z", "2026-10-24", "2026-10-25"], // 23:30 на 24.10
  ];
  for (const [iso, today, tomorrow] of cases) {
    const d = new Date(iso);
    assert.equal(dayKey(d), today, iso);
    assert.equal(dayKey(d, 1), tomorrow, iso);
  }
});

test("dayKey: „утре“ е утре и около смяната към лятно време (29.03.2026)", () => {
  // 29.03.2026 е 23-часов ден: в 03:00 (EET, UTC+2) часовникът скача на 04:00 (EEST, UTC+3).
  const cases: [string, string, string][] = [
    ["2026-03-28T21:30:00Z", "2026-03-28", "2026-03-29"], // 23:30 на 28.03 (преди: „утре“ = 30.03)
    ["2026-03-28T22:30:00Z", "2026-03-29", "2026-03-30"], // 00:30 на 29.03
    ["2026-03-29T20:30:00Z", "2026-03-29", "2026-03-30"], // 23:30 на 29.03 (лятно)
  ];
  for (const [iso, today, tomorrow] of cases) {
    const d = new Date(iso);
    assert.equal(dayKey(d), today, iso);
    assert.equal(dayKey(d, 1), tomorrow, iso);
  }
  // Повече дни напред и през края на месеца/годината.
  assert.equal(dayKey(new Date("2026-12-31T10:00:00Z"), 1), "2027-01-01");
  assert.equal(dayKey(new Date("2026-10-30T10:00:00Z"), 3), "2026-11-02");
});
