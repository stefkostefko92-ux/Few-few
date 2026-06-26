import { describe, expect, it } from "vitest";
import { svaraEngine } from "./svara.js";
import { SeededRng } from "../../kernel/rng.js";

describe("СВАРА — opening betting round", () => {
  it("does not resolve after the first CALL (everyone must act)", () => {
    const s = svaraEngine.init({ seats: 4 }, new SeededRng("svara-open"));
    // All seats start at the ANTE, so bets are already 'matched' — the opening
    // CALL must NOT trigger a showdown before seats 1..3 act (regression).
    const { state, events } = svaraEngine.reduce(s, { type: "CALL" }, new SeededRng("r"));
    expect(events.some((e) => e.type === "SHOWDOWN")).toBe(false);
    expect(events.some((e) => e.type === "HAND")).toBe(false);
    expect(state.done).toBe(false);
    expect(state.turn).not.toBe(0); // turn advanced to another seat
    expect(state.acted[0]).toBe(true);
    expect(state.acted.slice(1).every((a) => a === false)).toBe(true);
  });

  it("resolves only once every active seat has acted", () => {
    let s = svaraEngine.init({ seats: 3 }, new SeededRng("svara-all"));
    let resolved = false;
    for (let i = 0; i < 3; i++) {
      const r = svaraEngine.reduce(s, { type: "CALL" }, new SeededRng(`r${i}`));
      s = r.state;
      if (r.events.some((e) => e.type === "SHOWDOWN" || e.type === "WIN")) resolved = true;
    }
    // After all three call the opening level, the hand resolves.
    expect(resolved).toBe(true);
  });
});
