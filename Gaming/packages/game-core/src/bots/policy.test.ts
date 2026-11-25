import { describe, expect, it } from "vitest";
import type { GameEngine, GameEvent } from "../kernel/contract.js";
import { SeededRng } from "../kernel/rng.js";
import { chooseBotAction, determinizer } from "./policy.js";
import { santaseEngine } from "../engines/trick/santase.js";
import { battleshipEngine } from "../engines/grid-guess/battleship.js";

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

describe("ботовете не се предават и не предлагат реми на случаен принцип", () => {
  it("шах: EASY/NORMAL/HARD никога не избират RESIGN / DRAW_OFFER / DRAW_ACCEPT", async () => {
    const { chessEngine } = await import("../engines/move-validation/chess.js");
    const meta = new Set(["RESIGN", "DRAW_OFFER", "DRAW_ACCEPT"]);
    const rng = new SeededRng("chess-meta");
    // Стандартна позиция + позиция с висящо предложение за реми към бота.
    const start = chessEngine.init({ seats: 2 }, rng);
    const offered = { ...start, drawOffer: 1 };
    for (const difficulty of ["EASY", "NORMAL", "HARD"] as const) {
      const n = difficulty === "HARD" ? 2 : difficulty === "NORMAL" ? 5 : 120;
      for (let i = 0; i < n; i++) {
        const a = chooseBotAction(chessEngine, start, 0, difficulty, rng);
        expect(meta.has(a!.type)).toBe(false);
        const b = chooseBotAction(chessEngine, offered, 0, difficulty, rng);
        expect(meta.has(b!.type)).toBe(false);
      }
    }
  }, 30_000);

  it("botCandidates пази мета-ходовете само ако няма нищо друго (масата не замръзва)", async () => {
    const { botCandidates } = await import("./policy.js");
    type M = { type: "RESIGN" } | { type: "MOVE" };
    const only: GameEngine<null, M, GameEvent> = {
      init: () => null,
      legalActions: () => [{ type: "RESIGN" }],
      reduce: (s) => ({ state: s, events: [] }),
      isTerminal: () => false,
      score: () => [],
      redact: (s) => s,
    };
    expect(botCandidates(only, null, 0)).toEqual([{ type: "RESIGN" }]);
    const mixed: GameEngine<null, M, GameEvent> = {
      ...only,
      legalActions: () => [{ type: "MOVE" }, { type: "RESIGN" }],
    };
    expect(botCandidates(mixed, null, 0)).toEqual([{ type: "MOVE" }]);
  });
});

/**
 * Скрита информация: ботът на „Трудно“ търси само в това, което неговото място
 * вижда. Преди се симулираше истинското състояние — виждаше чуждите карти и
 * реда на тестето (и в Морски бой — къде са корабите).
 */
describe("HARD не вижда скритото", () => {
  it("determinizer: своята ръка и публичното остават, скритите карти се раздават наново", () => {
    const rng = new SeededRng("det");
    const s = santaseEngine.init({ seats: 2 }, rng);
    const sample = determinizer(santaseEngine, s, 0)!;
    expect(sample).not.toBeNull();
    const unseen = [...s.hands[1]!, ...s.stock].sort();
    let differs = false;
    for (let i = 0; i < 8; i++) {
      const w = sample(rng);
      expect(w.hands[0]).toEqual(s.hands[0]);
      expect(w.hands[1]!.length).toBe(s.hands[1]!.length);
      expect(w.stock.length).toBe(s.stock.length);
      expect([...w.hands[1]!, ...w.stock].sort()).toEqual(unseen);
      if (w.hands[1]!.join() !== s.hands[1]!.join()) differs = true;
    }
    expect(differs).toBe(true);
  });

  it("ботът не познава скрита карта по-добре от случайността", () => {
    // Противникът държи „A“ или „B“ (скрито); другата е в тестето. Позна ли —
    // печелиш. Бот, който вижда истинското състояние, познава винаги.
    interface G {
      opp: string[];
      deck: string[];
      guess: string | null;
    }
    const guessEngine: GameEngine<G, string, GameEvent> = {
      init: () => ({ opp: ["A"], deck: ["B"], guess: null }),
      legalActions: (g, seat) => (seat === 0 && g.guess === null ? ["A", "B"] : []),
      reduce: (g, a) => ({ state: { ...g, guess: a }, events: [] }),
      isTerminal: (g) => g.guess !== null,
      score: (g) => [
        { seat: 0, result: g.guess === g.opp[0] ? ("win" as const) : ("loss" as const) },
        { seat: 1, result: g.guess === g.opp[0] ? ("loss" as const) : ("win" as const) },
      ],
      redact: (g, seat) => (seat === 0 ? { ...g, opp: g.opp.map(() => "?"), deck: g.deck.map(() => "?") } : g),
    };
    const rng = new SeededRng("guess");
    let right = 0;
    for (let i = 0; i < 40; i++) {
      const held = rng.next() < 0.5 ? "A" : "B";
      const g: G = { opp: [held], deck: [held === "A" ? "B" : "A"], guess: null };
      if (chooseBotAction(guessEngine, g, 0, "HARD", rng) === held) right++;
    }
    expect(right).toBeLessThan(40);
    expect(right).toBeGreaterThan(5);
  });

  it("Морски бой: корабите не могат да се „измислят“ — HARD играе честната евристика", () => {
    const rng = new SeededRng("bs");
    let s = battleshipEngine.init({ seats: 2 }, rng);
    for (const seat of [0, 1]) {
      const a = battleshipEngine.legalActions(s, seat).find((x) => x.type === "PLACE_RANDOM");
      if (a) s = battleshipEngine.reduce(s, a, rng).state;
    }
    expect(s.phase).toBe("FIRE");
    expect(determinizer(battleshipEngine, s, s.turn)).toBeNull();
    const move = chooseBotAction(battleshipEngine, s, s.turn, "HARD", rng);
    expect(move).toMatchObject({ type: "FIRE" });
  });
});
