import { test } from "node:test";
import assert from "node:assert/strict";
import { busBoard, inMinutesText } from "../bus-board";

const dir = {
  title: "Бобов дол → Дупница",
  times: ["06:15", "07:30", "13:30", "18:00"],
  notes: ["Курсовете в 06:15 и 07:30 пътуват само в работни дни."],
};

// 24.10.2026 е събота; 13:05 ч. в София (лятно време, UTC+3) = 10:05 UTC.
const SAT_1305 = new Date("2026-10-24T10:05:00Z");
// 26.10.2026 е понеделник; 07:00 ч. в София (зимно време, UTC+2) = 05:00 UTC.
const MON_0700 = new Date("2026-10-26T05:00:00Z");

test("busBoard: следващ курс и минали в събота", () => {
  const b = busBoard(dir, SAT_1305);
  assert.deepEqual(b.next, { time: "13:30", inMinutes: 25 });
  assert.deepEqual(
    b.times.map((t) => [t.time, t.past, t.next, t.workdayOnly]),
    [
      ["06:15", true, false, true],
      ["07:30", true, false, true],
      ["13:30", false, true, false],
      ["18:00", false, false, false],
    ],
  );
  assert.equal(b.hasWorkdayOnly, true);
});

test("busBoard: в работен ден курсът „само в работни дни“ е следващ", () => {
  const b = busBoard(dir, MON_0700);
  assert.deepEqual(b.next, { time: "07:30", inMinutes: 30 });
});

test("busBoard: вечерта няма следващ курс", () => {
  const b = busBoard(dir, new Date("2026-10-24T19:00:00Z"));
  assert.equal(b.next, null);
  assert.ok(b.times.every((t) => t.past));
});

test("busBoard: вечерта разписанието е разчетено (readable)", () => {
  assert.equal(busBoard(dir, new Date("2026-10-24T19:00:00Z")).readable, true);
});

test("busBoard: неразчетена бележка по дни — без „следващ“, но не и „няма повече“", () => {
  const odd = { ...dir, notes: ["Курсът в 18:00 пътува само в събота."] };
  const b = busBoard(odd, SAT_1305);
  assert.equal(b.readable, false);
  assert.equal(b.next, null);
  assert.ok(b.times.every((t) => !t.next));
  // Миналите курсове пак се отбелязват — часовникът е сигурен.
  assert.deepEqual(
    b.times.map((t) => t.past),
    [true, true, false, false],
  );
});

test("inMinutesText", () => {
  assert.equal(inMinutesText(25), "след 25\u00a0мин.");
  assert.equal(inMinutesText(60), "след 1\u00a0ч.");
  assert.equal(inMinutesText(65), "след 1\u00a0ч. и 5\u00a0мин.");
});
