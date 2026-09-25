// backend/src/__tests__/archiveToken.test.js
// Гейт за константно-времево сравнение на публичния archive-токен.
//
// ЗАЩО (пред-деплоен одит 11.08.2026): `archiveTokenMatches` сравняваше с `===`
// вместо `timingSafeEqual` — консистентност с останалия таен-сравнителен код
// (topgg/bot secret). Токенът е 128-битов crypto.randomBytes hex, затова
// реалната timing атака е неосъществима, но правилото на репото е taints-safe
// сравнение за всяка тайна. Тестът пази поведението и различната дължина
// (timingSafeEqual хвърля при неравни буфери — трябва да върнем false, не да
// хвърлим).
import { describe, it, expect } from "vitest";
import { archiveTokenMatches, newArchiveToken } from "../lib/archiveToken.js";

describe("archiveTokenMatches", () => {
  it("вярно съвпадение → true", () => {
    const t = newArchiveToken();
    expect(archiveTokenMatches({ archiveToken: t }, t)).toBe(true);
  });

  it("грешен токен със същата дължина → false", () => {
    const a = newArchiveToken();
    const b = newArchiveToken();
    expect(a).not.toBe(b);
    expect(archiveTokenMatches({ archiveToken: a }, b)).toBe(false);
  });

  it("различна дължина → false, не хвърля (timingSafeEqual иска равни буфери)", () => {
    expect(() => archiveTokenMatches({ archiveToken: "abcd" }, "abcdef")).not.toThrow();
    expect(archiveTokenMatches({ archiveToken: "abcd" }, "abcdef")).toBe(false);
  });

  it("липсващ токен/вход → false", () => {
    expect(archiveTokenMatches({ archiveToken: null }, "x")).toBe(false);
    expect(archiveTokenMatches({}, "x")).toBe(false);
    expect(archiveTokenMatches({ archiveToken: "x" }, null)).toBe(false);
    expect(archiveTokenMatches(null, "x")).toBe(false);
  });

  it("числов вход не хвърля (String() нормализация)", () => {
    expect(() => archiveTokenMatches({ archiveToken: "123456" }, 123456)).not.toThrow();
  });
});
