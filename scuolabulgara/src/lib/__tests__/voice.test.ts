import { describe, it, expect } from "vitest";
import { bestVoice, voiceScore } from "../voice";

describe("избор на гласа на устройството", () => {
  it("невронната „Калина“ (Edge) печели пред стария „Иван“", () => {
    const v = bestVoice([
      { name: "Microsoft Ivan - Bulgarian (Bulgaria)", lang: "bg-BG" },
      { name: "Microsoft Kalina Online (Natural) - Bulgarian (Bulgaria)", lang: "bg-BG" },
      { name: "Google italiano", lang: "it-IT" },
    ]);
    expect(v?.name).toContain("Kalina");
  });
  it("„Даря“ на iPhone се избира", () => {
    expect(bestVoice([{ name: "Daria", lang: "bg-BG" }])?.name).toBe("Daria");
  });
  it("роботски eSpeak никога", () => {
    expect(voiceScore({ name: "eSpeak Bulgarian", lang: "bg" })).toBeNull();
    expect(bestVoice([{ name: "espeak-ng bg", lang: "bg" }])).toBeNull();
  });
  it("без български глас → няма бутон", () => {
    expect(bestVoice([{ name: "Google UK English Female", lang: "en-GB" }])).toBeNull();
  });
  it("„Иван“ остава, ако е единственият", () => {
    expect(bestVoice([{ name: "Microsoft Ivan", lang: "bg-BG" }])?.name).toBe("Microsoft Ivan");
  });
});
