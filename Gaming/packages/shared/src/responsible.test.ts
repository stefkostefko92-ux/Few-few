import { describe, expect, it } from "vitest";
import {
  DAILY_LIMIT_COOLDOWN_HOURS,
  effectiveDailyLimit,
  nextPlayDayStart,
  playDayStart,
  playedMinutes,
  requestDailyLimit,
  type DailyLimitFields,
} from "./responsible.js";

const H = 3_600_000;
const none: DailyLimitFields = { dailyLimitMinutes: null, dailyLimitPendingMinutes: null, dailyLimitPendingAt: null };

describe("игровият ден е по софийско време", () => {
  it("зимно време (UTC+2): денят започва в 22:00 UTC предния ден", () => {
    const now = Date.parse("2026-01-15T10:00:00Z");
    expect(playDayStart(now).toISOString()).toBe("2026-01-14T22:00:00.000Z");
    expect(nextPlayDayStart(now).toISOString()).toBe("2026-01-15T22:00:00.000Z");
  });

  it("лятно време (UTC+3): денят започва в 21:00 UTC; 23:30 UTC вече е новият ден", () => {
    expect(playDayStart(Date.parse("2026-07-01T20:59:00Z")).toISOString()).toBe("2026-06-30T21:00:00.000Z");
    expect(playDayStart(Date.parse("2026-07-01T21:30:00Z")).toISOString()).toBe("2026-07-01T21:00:00.000Z");
  });

  it("денят на смяната на часа (29 март 2026 е 23 ч) — следващият започва точно след него", () => {
    const now = Date.parse("2026-03-29T12:00:00Z");
    expect(playDayStart(now).toISOString()).toBe("2026-03-28T22:00:00.000Z");
    expect(nextPlayDayStart(now).toISOString()).toBe("2026-03-29T21:00:00.000Z");
  });
});

describe("действащият лимит и 24-часовото изчакване", () => {
  const now = Date.parse("2026-05-10T12:00:00Z");

  it("без лимит → по-строг (всеки) лимит важи веднага", () => {
    expect(requestDailyLimit(none, 60, now)).toEqual({ ...none, dailyLimitMinutes: 60 });
  });

  it("свалянето важи веднага и отменя чакащото вдигане", () => {
    const pending = { dailyLimitMinutes: 120, dailyLimitPendingMinutes: 240, dailyLimitPendingAt: new Date(now + H) };
    expect(requestDailyLimit(pending, 60, now)).toEqual({ ...none, dailyLimitMinutes: 60 });
  });

  it("вдигането и махането чакат 24 ч; дотогава действа старият лимит", () => {
    const cur = { ...none, dailyLimitMinutes: 60 };
    const up = requestDailyLimit(cur, 120, now);
    expect(up).toEqual({
      dailyLimitMinutes: 60,
      dailyLimitPendingMinutes: 120,
      dailyLimitPendingAt: new Date(now + DAILY_LIMIT_COOLDOWN_HOURS * H),
    });
    expect(effectiveDailyLimit(up, now + 23 * H)).toBe(60);
    expect(effectiveDailyLimit(up, now + 24 * H)).toBe(120);

    const off = requestDailyLimit(cur, null, now);
    expect(off.dailyLimitPendingMinutes).toBeNull();
    expect(off.dailyLimitPendingAt).not.toBeNull();
    expect(effectiveDailyLimit(off, now + 25 * H)).toBeNull();
  });

  it("повторна заявка за същото вдигане не рестартира часовника", () => {
    const cur = { ...none, dailyLimitMinutes: 60 };
    const first = requestDailyLimit(cur, 120, now);
    const again = requestDailyLimit(first, 120, now + 5 * H);
    expect(again.dailyLimitPendingAt).toEqual(first.dailyLimitPendingAt);
  });

  it("дошлото си време чакащо вдигане е новата основа за следваща заявка", () => {
    const due = { dailyLimitMinutes: 60, dailyLimitPendingMinutes: 120, dailyLimitPendingAt: new Date(now - H) };
    expect(requestDailyLimit(due, 90, now)).toEqual({ ...none, dailyLimitMinutes: 90 });
  });
});

describe("изиграните минути за деня", () => {
  const day = new Date("2026-05-09T21:00:00Z");
  const now = Date.parse("2026-05-10T12:00:00Z");

  it("сбор от мачовете; мач от предния ден се брои само след полунощ; текущият — до сега", () => {
    const m = (a: string, b: string | null) => ({ startedAt: new Date(a), endedAt: b ? new Date(b) : null });
    expect(
      playedMinutes(
        [
          m("2026-05-09T20:50:00Z", "2026-05-09T21:10:00Z"), // 10 мин след полунощ
          m("2026-05-10T08:00:00Z", "2026-05-10T08:25:30Z"), // 25,5 мин
          m("2026-05-10T11:50:00Z", null), // още тече: 10 мин
          m("2026-05-09T18:00:00Z", "2026-05-09T19:00:00Z"), // изцяло вчера
        ],
        day,
        now,
      ),
    ).toBe(45);
  });
});
