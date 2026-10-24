import test from "node:test";
import assert from "node:assert/strict";
import {
  DUTY_DAYS_AHEAD,
  addDays,
  dayKey,
  dutyDayLabel,
  dutyRange,
  formatDutyDay,
  pickDuty,
} from "@/lib/duty";
import { sofiaDay } from "@/lib/stats-core";

// Записите идват от @db.Date — полунощ по UTC.
const d = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const row = (ymd: string, pharmacy: string) => ({ date: d(ymd), pharmacy });

// 2026-10-24 е събота.
const today = d("2026-10-24");

test("dayKey и addDays работят по календарен ден", () => {
  assert.equal(dayKey(today), "2026-10-24");
  assert.equal(dayKey(addDays(today, 1)), "2026-10-25");
  assert.equal(dayKey(addDays(today, 8)), "2026-11-01");
  // Час в деня не мести деня.
  assert.equal(dayKey(addDays(new Date("2026-10-24T18:30:00Z"), 1)), "2026-10-25");
});

test("смяната на лятното часово време (25.10.2026) не губи и не дублира ден", () => {
  const keys = Array.from({ length: 4 }, (_, i) => dayKey(addDays(today, i)));
  assert.deepEqual(keys, ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);
});

test("dutyRange: от днес вкл. до днес + 7 дни вкл.", () => {
  const r = dutyRange(today);
  assert.equal(r.gte.toISOString(), "2026-10-24T00:00:00.000Z");
  assert.equal(r.lt.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(DUTY_DAYS_AHEAD, 7);
});

test("pickDuty: днешният запис отделно, следващите по дни и подредени", () => {
  const rows = [
    row("2026-10-26", "Аптека В"),
    row("2026-10-24", "Аптека А"),
    row("2026-10-25", "Аптека Б"),
    row("2026-10-24", "Аптека Г"),
  ];
  const out = pickDuty(rows, today);
  assert.deepEqual(
    out.today.map((r) => r.pharmacy),
    ["Аптека А", "Аптека Г"],
  );
  assert.deepEqual(
    out.upcoming.map((x) => [x.key, x.entries.map((r) => r.pharmacy)]),
    [
      ["2026-10-25", ["Аптека Б"]],
      ["2026-10-26", ["Аптека В"]],
    ],
  );
});

test("pickDuty: без запис за днес → празно „днес“, следващите остават", () => {
  const out = pickDuty([row("2026-10-27", "Аптека А")], today);
  assert.equal(out.today.length, 0);
  assert.equal(out.upcoming.length, 1);
});

test("pickDuty: вчерашни, твърде далечни и невалидни дати се пропускат", () => {
  const out = pickDuty(
    [
      row("2026-10-23", "вчера"),
      row("2026-10-31", "последният ден"),
      row("2026-11-01", "твърде далеч"),
      { date: new Date("невалидна"), pharmacy: "счупена" },
    ],
    today,
  );
  assert.equal(out.today.length, 0);
  assert.deepEqual(
    out.upcoming.map((x) => x.entries[0].pharmacy),
    ["последният ден"],
  );
});

test("pickDuty: празен график", () => {
  assert.deepEqual(pickDuty([], today), { today: [], upcoming: [] });
});

test("„днес“ е денят в София, не в UTC", () => {
  // 23.10.2026 22:30 UTC = 24.10.2026 01:30 в София (лятно време, UTC+3).
  const sofiaToday = sofiaDay(new Date("2026-10-23T22:30:00Z"));
  const out = pickDuty([row("2026-10-24", "Аптека А"), row("2026-10-23", "вчера")], sofiaToday);
  assert.deepEqual(
    out.today.map((r) => r.pharmacy),
    ["Аптека А"],
  );
});

test("formatDutyDay и dutyDayLabel — на български, без отместване на деня", () => {
  assert.equal(formatDutyDay(today), "събота, 24 октомври");
  assert.equal(dutyDayLabel(today, today), "Днес, събота, 24 октомври");
  assert.equal(dutyDayLabel(d("2026-10-25"), today), "Утре, неделя, 25 октомври");
  assert.equal(dutyDayLabel(d("2026-10-26"), today), "Понеделник, 26 октомври");
});
