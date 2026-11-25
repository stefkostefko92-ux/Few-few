import test from "node:test";
import assert from "node:assert/strict";
import { daysLeftLabel, deadlineStatuses } from "@/lib/tax-deadlines";

const pick = (iso: string) =>
  deadlineStatuses(iso).map((s) => ({
    label: s.label,
    next: s.next,
    passed: s.passed,
    days: s.daysLeft,
  }));

test("24 октомври: следващ е 31 октомври (след 7 дни), април и юни са изтекли", () => {
  const s = pick("2026-10-24");
  assert.deepEqual(s, [
    { label: "до 30 април", next: false, passed: true, days: 188 },
    { label: "до 30 юни", next: false, passed: true, days: 249 },
    { label: "до 31 октомври", next: true, passed: false, days: 7 },
  ]);
});

test("в деня на срока той още е следващ („днес“)", () => {
  const s = deadlineStatuses("2026-10-31");
  assert.equal(s[2].next, true);
  assert.equal(s[2].daysLeft, 0);
  assert.equal(daysLeftLabel(s[2].daysLeft), "днес");
});

test("ноември: следващ е 30 април догодина; тазгодишните са изтекли", () => {
  const s = deadlineStatuses("2026-11-15");
  assert.equal(s[0].next, true);
  assert.equal(s[0].nextIso, "2027-04-30");
  assert.equal(s[0].passed, false, "следващият не е „изтекъл“");
  assert.deepEqual(
    s.map((x) => x.passed),
    [false, true, true],
  );
});

test("януари: нищо не е изтекло, следващ е 30 април", () => {
  const s = deadlineStatuses("2027-01-10");
  assert.deepEqual(
    s.map((x) => x.next),
    [true, false, false],
  );
  assert.deepEqual(
    s.map((x) => x.passed),
    [false, false, false],
  );
});

test("daysLeftLabel", () => {
  assert.equal(daysLeftLabel(1), "утре");
  assert.equal(daysLeftLabel(7), "след 7 дни");
});
