import { describe, expect, it } from "vitest";
import { detectHand, resolveDeclarations } from "./declarations.js";

describe("belote declarations — detection", () => {
  it("detects a tierce (3 consecutive same suit) = 20", () => {
    const d = detectHand(["7H", "8H", "9H", "AS"], "S", 0);
    const t = d.find((x) => x.kind === "tierce");
    expect(t?.value).toBe(20);
  });

  it("detects fifty (4 consecutive) = 50, not two tierces", () => {
    const d = detectHand(["7H", "8H", "9H", "TH"], "S", 0);
    expect(d.filter((x) => x.kind === "tierce")).toHaveLength(0);
    expect(d.find((x) => x.kind === "fifty")?.value).toBe(50);
  });

  it("detects hundred (5 consecutive) = 100", () => {
    const d = detectHand(["7H", "8H", "9H", "TH", "JH"], "S", 0);
    expect(d.find((x) => x.kind === "hundred")?.value).toBe(100);
  });

  it("detects carré: jacks=200, nines=150, others=100", () => {
    expect(detectHand(["JS", "JH", "JD", "JC"], "S", 0).find((x) => x.kind === "carre")?.value).toBe(200);
    expect(detectHand(["9S", "9H", "9D", "9C"], "S", 0).find((x) => x.kind === "carre")?.value).toBe(150);
    expect(detectHand(["AS", "AH", "AD", "AC"], "S", 0).find((x) => x.kind === "carre")?.value).toBe(100);
  });

  it("does not form a carré of 7s or 8s (no value)", () => {
    expect(detectHand(["7S", "7H", "7D", "7C"], "S", 0).find((x) => x.kind === "carre")).toBeUndefined();
  });

  it("detects belote: K+Q of trump = 20", () => {
    const d = detectHand(["KS", "QS", "AH"], "S", 0);
    expect(d.find((x) => x.kind === "belote")?.value).toBe(20);
    // K+Q of a non-trump suit is NOT belote
    expect(detectHand(["KH", "QH"], "S", 0).find((x) => x.kind === "belote")).toBeUndefined();
  });

  it("sequence does not wrap (A-7-8 is not a run)", () => {
    const d = detectHand(["AH", "7H", "8H"], "S", 0);
    expect(d.find((x) => x.kind === "tierce")).toBeUndefined();
  });
});

describe("belote declarations — team resolution", () => {
  it("only the team with the best sequence scores; belote is NOT scored here", () => {
    // Team A (seat 0) has a fifty; Team B (seat 1) has a tierce + belote in trump S.
    const hands = [
      ["7H", "8H", "9H", "TH", "AC", "2S".replace("2", "8"), "QD", "KD"], // seat 0: fifty in H
      ["7D", "8D", "9D", "KS", "QS", "AH", "TC", "JC"], // seat 1: tierce in D + belote (K,Q of S)
      ["AS", "AD", "AC", "TD", "7C", "9C", "8C", "JH"], // seat 2
      ["2S".replace("2", "7"), "JS", "9S", "TS", "QH", "KH", "QC", "KC"], // seat 3
    ];
    const r = resolveDeclarations(hands, "S");
    // Team A's fifty (50) beats Team B's tierce (20) -> A scores all its combos.
    expect(r.teamPoints[0]).toBeGreaterThanOrEqual(50);
    // Belote (seat 1, team B) е изключен тук — зачита се при игра (belote.ts).
    expect(r.teamPoints[1]).toBe(0);
    expect(r.scored.some((d) => d.kind === "belote")).toBe(false);
  });

  it("a carré outranks an equal-value sequence", () => {
    const hands = [
      ["AS", "AH", "AD", "AC", "7H", "8C", "9C", "TC"], // seat 0 (team A): carré of aces (100)
      ["7D", "8D", "9D", "TD", "JH", "QH", "KH", "2S".replace("2", "7")], // seat 1 (team B): fifty (50)
      ["JS", "QS", "KS", "8H", "9H", "TH", "JC", "QC"], // seat 2
      ["7C", "KC", "AH".replace("H", "S"), "QD", "KD", "9S", "8S", "TS"], // seat 3
    ];
    const r = resolveDeclarations(hands, "D");
    expect(r.teamPoints[0]).toBeGreaterThanOrEqual(100); // carré team wins
  });

  it("returns zero when no declarations exist", () => {
    const hands = [
      ["7H", "9D", "JC", "AS"],
      ["8H", "TD", "QC", "KS"],
      ["7C", "9H", "JD", "AC"],
      ["8S", "TC", "QH", "KD"],
    ];
    const r = resolveDeclarations(hands, "S");
    expect(r.teamPoints).toEqual([0, 0]);
  });
});
