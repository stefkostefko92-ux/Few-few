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

describe("chooseBotAction — regressions (2026-09-25 audit)", () => {
  it("EASY mostly follows the heuristic when the only enumerable move is PASS (Думи)", () => {
    // Like WORDS: legalActions enumerates only PASS; real plays come from bot().
    const words: GameEngine<{ turn: number }, string, GameEvent> = {
      init: () => ({ turn: 0 }),
      legalActions: () => ["PASS"],
      validate: () => true,
      bot: () => "PLAY",
      reduce: (s) => ({ state: s, events: [] }),
      isTerminal: () => false,
      score: () => [{ seat: 0, result: "draw" }, { seat: 1, result: "draw" }],
      redact: (s) => s,
    };
    const rng = new SeededRng("easy-words");
    let plays = 0;
    for (let i = 0; i < 400; i++) if (chooseBotAction(words, { turn: 0 }, 0, "EASY", rng) === "PLAY") plays++;
    expect(plays / 400).toBeGreaterThan(0.5); // ≈ 0.65; pure random was 0
    expect(plays / 400).toBeLessThan(0.8); // still blunders
  });

  it("HARD never asks an engine about a seat that does not exist", () => {
    const asked: number[] = [];
    const guarded: GameEngine<S, A, GameEvent> = {
      ...engine,
      legalActions: (s, seat) => {
        asked.push(seat);
        return engine.legalActions(s, seat);
      },
    };
    chooseBotAction(guarded, { n: 0, turn: 0, winner: null }, 0, "HARD", new SeededRng("seats"));
    expect(asked.length).toBeGreaterThan(0);
    expect(Math.max(...asked)).toBeLessThanOrEqual(1); // two seats: 0 and 1
  });

  it("HARD stays inside its wall-clock budget on a slow, never-ending engine", () => {
    const busy = (ms: number) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        /* simulate an expensive reduce (chess-like) */
      }
    };
    const slow: GameEngine<S, A, GameEvent> = {
      ...engine,
      reduce: (s, a) => {
        busy(1);
        return { state: { n: s.n + a, turn: (s.turn === 0 ? 1 : 0) as 0 | 1, winner: null }, events: [] };
      },
      isTerminal: () => false,
    };
    const t0 = Date.now();
    const a = chooseBotAction(slow, { n: 0, turn: 0, winner: null }, 0, "HARD", new SeededRng("slow"));
    expect([1, 2]).toContain(a);
    expect(Date.now() - t0).toBeLessThan(600); // budget is 120 ms (+ slack for CI)
  });
});
