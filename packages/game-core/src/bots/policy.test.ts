import { describe, expect, it } from "vitest";
import type { GameEngine, GameEvent } from "../kernel/contract.js";
import { SeededRng } from "../kernel/rng.js";
import { chooseBotAction } from "./policy.js";

/**
 * Tiny two-seat race engine for testing the generic policy: on your turn you add
 * 1 or 2 to a counter; reaching 5+ ends the game and the mover who reached it
 * wins. From n=3 the winning move is +2 — a HARD bot must find it.
 */
interface S {
  n: number;
  turn: 0 | 1;
  winner: number | null;
}
type A = 1 | 2;

const engine: GameEngine<S, A, GameEvent> = {
  init: () => ({ n: 0, turn: 0, winner: null }),
  legalActions: (s, seat) => (s.winner === null && seat === s.turn ? [1, 2] : []),
  reduce: (s, a) => {
    const n = s.n + a;
    const winner = n >= 5 ? s.turn : null;
    return { state: { n, turn: (s.turn === 0 ? 1 : 0) as 0 | 1, winner }, events: [] };
  },
  isTerminal: (s) => s.winner !== null,
  score: (s) =>
    [0, 1].map((seat) => ({
      seat,
      result: s.winner === null ? ("draw" as const) : s.winner === seat ? ("win" as const) : ("loss" as const),
    })),
  redact: (s) => s,
};

describe("chooseBotAction", () => {
  it("EASY / NORMAL return a legal action", () => {
    const rng = new SeededRng("t");
    const s: S = { n: 0, turn: 0, winner: null };
    expect([1, 2]).toContain(chooseBotAction(engine, s, 0, "EASY", rng));
    expect([1, 2]).toContain(chooseBotAction(engine, s, 0, "NORMAL", rng));
  });

  it("HARD takes the immediate winning move", () => {
    const rng = new SeededRng("win");
    const s: S = { n: 3, turn: 0, winner: null };
    expect(chooseBotAction(engine, s, 0, "HARD", rng)).toBe(2); // +2 → 5, seat 0 wins now
  });

  it("returns null when the seat has no legal action", () => {
    const rng = new SeededRng("t");
    const s: S = { n: 0, turn: 1, winner: null }; // not seat 0's turn
    expect(chooseBotAction(engine, s, 0, "HARD", rng)).toBeNull();
  });
});
