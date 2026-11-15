import test from "node:test";
import assert from "node:assert/strict";
import {
  nextBus,
  nextBuses,
  outageDay,
  outageDayLabel,
  outageHours,
  pickTodayOutages,
  sofiaWallWindow,
  todayCalendar,
  wallClock,
  workdayOnlyTimes,
} from "@/lib/today";
import { BUS } from "@/lib/bus-schedule";

// Стенно време на София, записано в UTC полета (както в Outage.startAt/endAt).
const wall = (s: string) => new Date(`${s}:00Z`);
const iso = (d: Date) => d.toISOString();

// 23.10.2026 е петък, 24.10 — събота. Лятното часово време (UTC+3) свършва
// в неделя, 25.10.2026, в 04:00 → 03:00 (UTC+2).
const FRI_11 = new Date("2026-10-23T08:00:00Z"); // 11:00 в София

test("прозорецът „днес и утре“ е по часа на София, не по UTC", () => {
  const w = sofiaWallWindow(FRI_11);
  assert.equal(iso(w.now), "2026-10-23T11:00:00.000Z");
  assert.equal(iso(w.todayStart), "2026-10-23T00:00:00.000Z");
  assert.equal(iso(w.tomorrowStart), "2026-10-24T00:00:00.000Z");
  assert.equal(iso(w.dayAfterStart), "2026-10-25T00:00:00.000Z");

  // 21:30 UTC в събота е вече 00:30 в неделя в София.
  const late = sofiaWallWindow(new Date("2026-10-24T21:30:00Z"));
  assert.equal(iso(late.todayStart), "2026-10-25T00:00:00.000Z");
  assert.equal(iso(late.now), "2026-10-25T00:30:00.000Z");

  // Зимно време (UTC+2).
  const winter = sofiaWallWindow(new Date("2026-12-01T22:30:00Z"));
  assert.equal(iso(winter.todayStart), "2026-12-02T00:00:00.000Z");
  assert.equal(iso(winter.now), "2026-12-02T00:30:00.000Z");
});

test("днешната дата и имен ден — по София", () => {
  const t = todayCalendar(new Date("2026-10-26T09:00:00Z"));
  assert.equal(t.dateText, "понеделник, 26 октомври");
  assert.ok(t.feasts.includes("Димитровден"));
  assert.ok(t.names.includes("Димитър"));
  // 22:30 UTC на 25.10 (зимно време) е 00:30 на 26.10 в София.
  assert.equal(todayCalendar(new Date("2026-10-25T22:30:00Z")).dateText, "понеделник, 26 октомври");
  // Ден без имен ден → празни списъци (панелът не показва празен ред).
  const plain = todayCalendar(new Date("2026-10-23T09:00:00Z"));
  assert.equal(plain.dateText, "петък, 23 октомври");
  assert.deepEqual(plain.names, []);
  assert.deepEqual(plain.feasts, []);
});

test("прекъсванията: сега / днес / утре, без свършилите и без по-късните", () => {
  const rows = [
    { id: "a", startAt: wall("2026-10-23T09:00"), endAt: wall("2026-10-23T16:00") },
    { id: "b", startAt: wall("2026-10-23T13:00"), endAt: wall("2026-10-23T15:00") },
    { id: "c", startAt: wall("2026-10-24T09:00"), endAt: wall("2026-10-24T12:00") },
    { id: "d", startAt: wall("2026-10-25T09:00"), endAt: wall("2026-10-25T12:00") },
    { id: "e", startAt: wall("2026-10-22T09:00"), endAt: wall("2026-10-23T10:00") },
    { id: "f", startAt: null, endAt: null },
    { id: "g", startAt: null, endAt: wall("2026-10-23T10:59") },
  ];
  const got = pickTodayOutages(rows, FRI_11).map((r) => `${r.id}:${r.day}`);
  assert.deepEqual(got, ["f:now", "a:now", "b:today", "c:tomorrow"]);
});

test("прекъсване в 09:00 по София е „сега“ в 11:00 по София (08:00 UTC)", () => {
  // Ако се сравнява с UTC часа (08:00), щеше да излезе „днес, предстои“.
  const w = sofiaWallWindow(FRI_11);
  assert.equal(outageDay({ startAt: wall("2026-10-23T09:00"), endAt: null }, w), "now");
  assert.equal(outageDay({ startAt: wall("2026-10-23T11:30"), endAt: null }, w), "today");
  assert.equal(outageDay({ startAt: wall("2026-10-24T23:59"), endAt: null }, w), "tomorrow");
  assert.equal(outageDay({ startAt: wall("2026-10-25T00:00"), endAt: null }, w), null);
  // Невалидна дата не чупи панела.
  assert.equal(outageDay({ startAt: new Date("x"), endAt: new Date("x") }, w), "now");
});

test("часовете на прекъсването за панела", () => {
  const w = sofiaWallWindow(FRI_11);
  assert.equal(outageHours({ startAt: wall("2026-10-23T09:00"), endAt: wall("2026-10-23T16:00") }, w), "до 16:00");
  assert.equal(outageHours({ startAt: wall("2026-10-23T13:00"), endAt: wall("2026-10-23T15:30") }, w), "от 13:00 до 15:30");
  assert.equal(outageHours({ startAt: wall("2026-10-24T09:00"), endAt: wall("2026-10-24T12:00") }, w), "от 09:00 до 12:00");
  assert.equal(
    outageHours({ startAt: wall("2026-10-23T20:00"), endAt: wall("2026-10-24T06:00") }, w),
    "от 20:00 до 24 октомври в 06:00",
  );
  assert.equal(outageHours({ startAt: wall("2026-10-23T09:00"), endAt: wall("2026-10-27T18:00") }, w), "до 27 октомври в 18:00");
  assert.equal(outageHours({ startAt: wall("2026-10-23T14:00"), endAt: null }, w), "от 14:00");
  assert.equal(outageHours({ startAt: null, endAt: null }, w), "");
  assert.equal(outageDayLabel("now"), "Сега");
  assert.equal(outageDayLabel("today"), "Днес");
  assert.equal(outageDayLabel("tomorrow"), "Утре");
  assert.equal(wallClock(wall("2026-10-23T07:05")), "07:05");
  assert.equal(wallClock(null), "");
});

test("курсовете „само в работни дни“ се разчитат от бележките на разписанието", () => {
  const [toBobovDol, toDupnitsa] = BUS.directions;
  assert.deepEqual([...(workdayOnlyTimes(toBobovDol.notes) ?? [])], ["06:40"]);
  assert.deepEqual([...(workdayOnlyTimes(toDupnitsa.notes) ?? [])].sort(), ["06:15", "07:30"]);
  assert.deepEqual([...(workdayOnlyTimes(["Курсът в 18:00 минава през с. Дяково."]) ?? [])], []);
  // Ограничение без час или правило, което не разчитаме → null (без „следващ“ час).
  assert.equal(workdayOnlyTimes(["Курсът пътува само в работни дни."]), null);
  assert.equal(workdayOnlyTimes(["В празнични дни не се движи."]), null);
  assert.equal(workdayOnlyTimes(["Курсът в 10:00 е само в събота."]), null);
});

test("следващият автобус — по часа на София, след сегашния", () => {
  const [toBobovDol, toDupnitsa] = BUS.directions;
  // Петък, 06:30 в София (03:30 UTC).
  const fri0630 = new Date("2026-10-23T03:30:00Z");
  assert.equal(nextBus(toDupnitsa, fri0630), "06:45");
  assert.equal(nextBus(toBobovDol, fri0630), "06:40"); // работен ден — курсът е
  // Петък, 08:00 в София (05:00 UTC); по UTC щеше да е 06:15.
  assert.equal(nextBus(toDupnitsa, new Date("2026-10-23T05:00:00Z")), "08:20");
  // Точно в часа на тръгване → следващият.
  assert.equal(nextBus(toDupnitsa, new Date("2026-10-23T03:45:00Z")), "07:30");
});

test("в събота и неделя курсовете „само в работни дни“ не се предлагат", () => {
  const [toBobovDol, toDupnitsa] = BUS.directions;
  // Събота, 06:30 в София: 06:40 е само в работни дни → 07:30.
  assert.equal(nextBus(toBobovDol, new Date("2026-10-24T03:30:00Z")), "07:30");
  // Събота, 04:00 в София: 06:15 е само в работни дни → 06:45.
  assert.equal(nextBus(toDupnitsa, new Date("2026-10-24T01:00:00Z")), "06:45");
  // Неделя след смяната на часа (07:00 в София = 05:00 UTC): 07:30 се пропуска.
  assert.equal(nextBus(toDupnitsa, new Date("2026-10-25T05:00:00Z")), "08:20");
});

test("след последния курс за деня няма „следващ“ — панелът дава само връзка", () => {
  // Петък, 20:30 в София.
  const late = new Date("2026-10-23T17:30:00Z");
  assert.equal(nextBus(BUS.directions[0], late), null);
  assert.equal(nextBus(BUS.directions[1], late), null);
  assert.deepEqual(nextBuses(BUS.directions, late), []);
  const some = nextBuses(BUS.directions, new Date("2026-10-23T15:30:00Z")); // 18:30
  assert.deepEqual(some, [
    { title: "Дупница → Бобов дол", time: "19:00" },
    { title: "Бобов дол → Дупница", time: "19:00" },
  ]);
});

test("неясно разписание или лоши часове не дават измислен час", () => {
  const now = new Date("2026-10-23T05:00:00Z"); // 08:00 петък
  assert.equal(nextBus({ title: "x", times: ["09:00"], notes: ["Не се движи в почивни дни."] }, now), null);
  assert.equal(nextBus({ title: "x", times: ["25:00", "abc", "9:05", "08:00"], notes: [] }, now), "09:05");
  assert.equal(nextBus({ title: "x", times: [], notes: [] }, now), null);
});
