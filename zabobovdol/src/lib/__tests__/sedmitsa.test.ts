import test from "node:test";
import assert from "node:assert/strict";
import {
  capFirst,
  fmtDutyDay,
  fmtGenerated,
  fmtWeekRange,
  groupByDay,
  shorten,
  weekWindow,
} from "@/app/pechat/sedmitsa/week";

test("weekWindow: 7 дни от днес по българско време", () => {
  // 23.10 в 21:30 UTC = вече 24.10 в София (лятно време, UTC+3).
  const w = weekWindow(new Date("2026-10-23T21:30:00Z"));
  assert.equal(w.start.toISOString(), "2026-10-24T00:00:00.000Z");
  assert.equal(w.end.toISOString(), "2026-10-31T00:00:00.000Z");
  // През смяната на часа (25.10.2026) прозорецът пак е точно 7 дати.
  const d = weekWindow(new Date("2026-10-22T10:00:00Z"));
  assert.equal(d.start.toISOString(), "2026-10-22T00:00:00.000Z");
  assert.equal(d.end.toISOString(), "2026-10-29T00:00:00.000Z");
});

test("fmtWeekRange: в един месец и през два месеца", () => {
  assert.equal(
    fmtWeekRange(new Date("2026-10-05T00:00:00Z"), new Date("2026-10-12T00:00:00Z")),
    "5 – 11 октомври 2026 г.",
  );
  assert.equal(
    fmtWeekRange(new Date("2026-10-28T00:00:00Z"), new Date("2026-11-04T00:00:00Z")),
    "28 октомври – 3 ноември 2026 г.",
  );
});

test("fmtDutyDay: денят на дежурството не се измества и е с главна буква", () => {
  assert.equal(fmtDutyDay(new Date("2026-10-26T00:00:00Z")), "Понеделник, 26 октомври");
});

test("fmtGenerated: дата и час по София", () => {
  assert.equal(fmtGenerated(new Date("2026-10-23T16:45:00Z")), "23.10.2026 г., 19:45 ч.");
  assert.equal(fmtGenerated(new Date("2026-12-01T07:05:00Z")), "01.12.2026 г., 09:05 ч.");
});

test("capFirst и shorten", () => {
  assert.equal(capFirst("петък"), "Петък");
  assert.equal(capFirst(""), "");
  assert.equal(shorten("  кратко   ", 50), "кратко");
  const s = shorten("Спиране на тока по улиците Христо Ботев, Васил Левски и Г. С. Раковски", 40);
  assert.ok(s.endsWith("…") && s.length <= 41, s);
  assert.ok(!s.includes(" …"), s);
});

test("groupByDay групира поредните дежурства от един ден", () => {
  const rows = [
    { id: 1, date: new Date("2026-10-24T00:00:00Z") },
    { id: 2, date: new Date("2026-10-24T00:00:00Z") },
    { id: 3, date: new Date("2026-10-25T00:00:00Z") },
  ];
  const g = groupByDay(rows);
  assert.equal(g.length, 2);
  assert.deepEqual(
    g.map((x) => [x.key, x.items.map((i) => i.id)]),
    [
      ["2026-10-24", [1, 2]],
      ["2026-10-25", [3]],
    ],
  );
  assert.deepEqual(groupByDay([]), []);
});
