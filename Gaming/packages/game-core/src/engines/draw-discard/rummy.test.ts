import { describe, expect, it } from "vitest";
import { deadwoodAfterLayoff, meldsOf } from "./rummy.js";

describe("rummy lay-offs", () => {
  it("removes deadwood that extends a knocker's run", () => {
    const melds = meldsOf(["5H", "6H", "7H"]); // run 5-6-7 hearts
    expect(melds.length).toBe(1);
    // Defender holds 8H (extends the run) + 2C (true deadwood).
    const dead = deadwoodAfterLayoff(["8H", "2C"], melds);
    expect(dead).toBe(2); // 8H laid off, only 2C counts
  });

  it("removes deadwood that extends a knocker's set", () => {
    const melds = meldsOf(["9S", "9H", "9D"]); // set of nines
    const dead = deadwoodAfterLayoff(["9C", "4S"], melds);
    expect(dead).toBe(4); // 9C laid off onto the set, 4S remains
  });

  it("does not lay off non-matching cards", () => {
    const melds = meldsOf(["5H", "6H", "7H"]);
    const dead = deadwoodAfterLayoff(["9C", "2S"], melds);
    expect(dead).toBe(11); // nothing extends; 9 + 2
  });
});
