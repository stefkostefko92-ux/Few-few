import { describe, it, expect } from "vitest";
import type { NextRequest } from "next/server";
import { detectLocale, prefersBulgarian } from "../geo";

const req = (h: Record<string, string>) => ({ headers: new Headers(h) }) as unknown as NextRequest;

describe("избор на език при първо посещение", () => {
  it("без никакъв сигнал → италиански", () => {
    expect(detectLocale(req({}))).toBe("it");
  });
  it("английски браузър извън България → италиански (английски само по избор)", () => {
    expect(detectLocale(req({ "accept-language": "en-US,en;q=0.9", "x-country": "US" }))).toBe("it");
  });
  it("посетител от България → български", () => {
    expect(detectLocale(req({ "x-country": "BG", "accept-language": "it-IT" }))).toBe("bg");
  });
  it("български браузър в Милано → български", () => {
    expect(detectLocale(req({ "x-country": "IT", "accept-language": "bg-BG,bg;q=0.9,it;q=0.8" }))).toBe("bg");
  });
  it("български само като втори език не стига", () => {
    expect(prefersBulgarian("it-IT,bg;q=0.8")).toBe(false);
  });
});
