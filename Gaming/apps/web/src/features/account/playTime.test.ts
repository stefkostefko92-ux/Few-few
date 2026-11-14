import { describe, expect, it } from "vitest";
import { nextRealityCheck, sessionMinutes } from "./playTime";

describe("отговорна игра — броене на времето", () => {
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
