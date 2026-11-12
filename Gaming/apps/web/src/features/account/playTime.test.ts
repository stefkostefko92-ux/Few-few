import { describe, expect, it } from "vitest";
import { addDailyMinutes, nextRealityCheck, sessionMinutes } from "./playTime";

describe("отговорна игра — броене на времето", () => {
  it("дневният сбор се натрупва в същия ден и се нулира на следващия", () => {
    const a = addDailyMinutes(null, 1, "2026-10-24");
    const b = addDailyMinutes(a, 1, "2026-10-24");
    expect(b).toEqual({ day: "2026-10-24", minutes: 2 });
    expect(addDailyMinutes(b, 1, "2026-10-25")).toEqual({ day: "2026-10-25", minutes: 1 });
  });

  it("минути от началото на сесията", () => {
    expect(sessionMinutes(0, 59_999)).toBe(0);
    expect(sessionMinutes(0, 30 * 60_000)).toBe(30);
    expect(sessionMinutes(10_000, 0)).toBe(0);
  });

  it("следващото напомняне е следващото кратно на интервала", () => {
    expect(nextRealityCheck(0, 30)).toBe(30);
    expect(nextRealityCheck(30, 30)).toBe(60);
    expect(nextRealityCheck(61, 60)).toBe(120);
  });
});
