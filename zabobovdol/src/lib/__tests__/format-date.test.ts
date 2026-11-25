import test from "node:test";
import assert from "node:assert/strict";
import {
  formatDate,
  formatDateLong,
  formatDateNumeric,
  formatDateTime,
  formatDateTimeNumeric,
  formatDayMonth,
  formatEventWhen,
  formatMonthYear,
  formatTime,
  formatWeekdayDayMonth,
  isoDate,
  isoDateTime,
} from "@/lib/format-date";

const NB = " ";
// 24.10.2026 е последният ден на лятното време (EEST, UTC+3);
// 29.10.2026 е зимно време (EET, UTC+2).
const SUMMER = new Date("2026-10-24T06:33:00Z"); // 09:33 софийско
const WINTER = new Date("2026-10-29T07:33:00Z"); // 09:33 софийско

test("истинският момент се показва по софийско време (сървърът е UTC)", () => {
  assert.equal(formatTime(SUMMER), `09:33${NB}ч.`);
  assert.equal(formatTime(WINTER), `09:33${NB}ч.`);
  // 23:30 UTC на 31.12 е вече 1 януари в София.
  assert.equal(formatDate(new Date("2026-12-31T23:30:00Z")), `1${NB}януари 2027${NB}г.`);
});

test("дълга, кратка и числова дата", () => {
  assert.equal(formatDateLong(SUMMER), `събота, 24${NB}октомври 2026${NB}г.`);
  assert.equal(formatDate(SUMMER), `24${NB}октомври 2026${NB}г.`);
  assert.equal(formatDayMonth(SUMMER), `24${NB}октомври`);
  assert.equal(formatWeekdayDayMonth(WINTER), `четвъртък, 29${NB}октомври`);
  assert.equal(formatMonthYear(SUMMER), `октомври 2026${NB}г.`);
  assert.equal(formatDateNumeric(new Date("2026-03-05T10:00:00Z")), "05.03.2026");
  assert.equal(formatDateTimeNumeric(SUMMER), "24.10.2026, 09:33");
  assert.equal(formatDateTime(SUMMER), `събота, 24${NB}октомври 2026${NB}г., 09:33${NB}ч.`);
});

test("стенно време (админ поле datetime) се показва както е въведено", () => {
  // Админът въвежда „29.10.2026 18:00“ → в базата 18:00Z.
  const wall = new Date("2026-10-29T18:00:00Z");
  assert.equal(formatTime(wall, { wall: true }), `18:00${NB}ч.`);
  assert.equal(formatDateLong(wall, { wall: true }), `четвъртък, 29${NB}октомври 2026${NB}г.`);
  // Късно вечер не прескача в следващия ден.
  const late = new Date("2026-10-29T23:30:00Z");
  assert.equal(formatDate(late, { wall: true }), `29${NB}октомври 2026${NB}г.`);
  assert.equal(isoDate(late, { wall: true }), "2026-10-29");
});

test("formatEventWhen: без край, същия ден и различни дни", () => {
  const w = { wall: true };
  const start = new Date("2026-10-29T18:00:00Z");
  assert.equal(
    formatEventWhen(start, null, w),
    `четвъртък, 29${NB}октомври 2026${NB}г., 18:00${NB}ч.`,
  );
  assert.equal(
    formatEventWhen(start, new Date("2026-10-29T21:00:00Z"), w),
    `четвъртък, 29${NB}октомври 2026${NB}г., 18:00–21:00${NB}ч.`,
  );
  assert.equal(
    formatEventWhen(start, new Date("2026-10-30T12:00:00Z"), w),
    `четвъртък, 29${NB}октомври, 18:00${NB}ч. – петък, 30${NB}октомври 2026${NB}г., 12:00${NB}ч.`,
  );
  assert.equal(
    formatEventWhen(new Date("2026-12-31T20:00:00Z"), new Date("2027-01-01T02:00:00Z"), w),
    `четвъртък, 31${NB}декември 2026${NB}г., 20:00${NB}ч. – петък, 1${NB}януари 2027${NB}г., 02:00${NB}ч.`,
  );
  // Край преди началото се пренебрегва.
  assert.equal(formatEventWhen(start, new Date("2026-10-29T17:00:00Z"), w), formatEventWhen(start, null, w));
});

test("isoDateTime: отместването на София, и за стенно време", () => {
  assert.equal(isoDateTime(SUMMER), "2026-10-24T09:33:00+03:00");
  assert.equal(isoDateTime(WINTER), "2026-10-29T09:33:00+02:00");
  assert.equal(isoDateTime(new Date("2026-10-29T09:33:00Z"), { wall: true }), "2026-10-29T09:33:00+02:00");
  assert.equal(isoDateTime(new Date("2026-07-15T18:00:00Z"), { wall: true }), "2026-07-15T18:00:00+03:00");
  assert.equal(isoDate(SUMMER), "2026-10-24");
});

test("невалидна дата → празен низ; приема и низ, и число", () => {
  assert.equal(formatDate("не е дата"), "");
  assert.equal(formatDate(new Date(Number.NaN)), "");
  assert.equal(formatEventWhen("не е дата"), "");
  assert.equal(isoDateTime("не е дата"), "");
  assert.equal(formatDate("2026-10-24T06:33:00Z"), `24${NB}октомври 2026${NB}г.`);
  assert.equal(formatDate(SUMMER.getTime()), `24${NB}октомври 2026${NB}г.`);
});
