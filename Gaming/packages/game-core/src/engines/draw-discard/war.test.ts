import { describe, expect, it } from "vitest";
import { warEngine } from "./war.js";
import { SeededRng } from "../../kernel/rng.js";

describe("WAR redact", () => {
  it("hides both decks and the buried pile but keeps counts (no shuffle leak)", () => {
    const s = warEngine.init({ seats: 2 }, new SeededRng("war-redact"));
    const view = warEngine.redact(s, 0);
    expect(view.hands[0]!.every((c) => c === "?")).toBe(true);
    expect(view.hands[1]!.every((c) => c === "?")).toBe(true);
    expect(view.hands[0]!.length).toBe(s.hands[0]!.length);
    expect(view.hands[1]!.length).toBe(s.hands[1]!.length);
    expect(view.pile.every((c) => c === "?")).toBe(true);
  });
});
