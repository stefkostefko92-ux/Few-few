import { describe, expect, it } from "vitest";
import { seatNames } from "./seatNames";

const p = (seat: number, displayName: string, isBot = true) => ({ seat, displayName, isBot });

describe("seatNames", () => {
  it("numbers the bots that share a name, by seat order", () => {
    const name = seatNames([p(2, "АСО Бот"), p(0, "Мария", false), p(3, "АСО Бот"), p(1, "АСО Бот")]);
    expect([0, 1, 2, 3].map(name)).toEqual(["Мария", "АСО Бот 1", "АСО Бот 2", "АСО Бот 3"]);
  });

  it("leaves unique names alone (a lone bot stays „АСО Бот“)", () => {
    const name = seatNames([p(0, "Иван", false), p(1, "АСО Бот")]);
    expect(name(0)).toBe("Иван");
    expect(name(1)).toBe("АСО Бот");
  });

  it("returns undefined for an unknown seat", () => {
    expect(seatNames([p(0, "Иван", false)])(5)).toBeUndefined();
  });
});
