import { describe, expect, it } from "vitest";
import { SeededRng } from "../../kernel/rng.js";
import { chessEngine, type ChessAction, type ChessState } from "./chess.js";

const rng = new SeededRng("chess");
const move = (from: string, to: string): ChessAction => ({ type: "MOVE", from, to });

describe("chess engine", () => {
  it("starts with 20 legal moves for White and none for Black", () => {
    const s = chessEngine.init({ seats: 2 }, rng);
    const white = chessEngine.legalActions(s, 0);
    expect(white.filter((a) => a.type === "MOVE")).toHaveLength(20);
    // plus the meta actions: resign + draw offer
    expect(white.some((a) => a.type === "RESIGN")).toBe(true);
    expect(white.some((a) => a.type === "DRAW_OFFER")).toBe(true);
    expect(chessEngine.legalActions(s, 1)).toHaveLength(0);
  });

  it("plays Fool's mate to checkmate (Black wins)", () => {
    let s = chessEngine.init({ seats: 2 }, rng);
    s = chessEngine.reduce(s, move("f2", "f3"), rng).state;
    s = chessEngine.reduce(s, move("e7", "e5"), rng).state;
    s = chessEngine.reduce(s, move("g2", "g4"), rng).state;
    const final = chessEngine.reduce(s, move("d8", "h4"), rng);

    expect(final.events.some((e) => e.type === "CHECKMATE")).toBe(true);
    expect(chessEngine.isTerminal(final.state)).toBe(true);

    const score = chessEngine.score(final.state);
    expect(score.find((x) => x.seat === 1)?.result).toBe("win");
    expect(score.find((x) => x.seat === 0)?.result).toBe("loss");
  });

  it("rejects an illegal move", () => {
    const s = chessEngine.init({ seats: 2 }, rng);
    expect(() => chessEngine.reduce(s, move("e2", "e5"), rng)).toThrow();
  });

  it("redact is a no-op (no hidden info)", () => {
    const s = chessEngine.init({ seats: 2 }, rng);
    expect(chessEngine.redact(s, 1)).toEqual(s);
  });

  it("declares a draw on threefold repetition", () => {
    let s = chessEngine.init({ seats: 2 }, rng);
    const shuffle: Array<[string, string]> = [
      ["g1", "f3"], ["g8", "f6"], ["f3", "g1"], ["f6", "g8"],
      ["g1", "f3"], ["g8", "f6"], ["f3", "g1"],
    ];
    for (const [from, to] of shuffle) {
      const r = chessEngine.reduce(s, move(from, to), rng);
      s = r.state;
      expect(chessEngine.isTerminal(s)).toBe(false);
    }
    // The 8th move recreates the initial position for the third time.
    const final = chessEngine.reduce(s, move("f6", "g8"), rng);
    expect(final.events).toContainEqual({ type: "DRAW", reason: "threefold" });
    expect(final.state.drawn).toBe("threefold");
    expect(chessEngine.isTerminal(final.state)).toBe(true);
    expect(chessEngine.score(final.state).every((x) => x.result === "draw")).toBe(true);
  });

  it("resets the repetition counter on irreversible moves (pawn push)", () => {
    let s = chessEngine.init({ seats: 2 }, rng);
    s = chessEngine.reduce(s, move("e2", "e4"), rng).state;
    expect(Object.keys(s.reps)).toHaveLength(1);
    expect(Object.values(s.reps)).toEqual([1]);
  });

  it("handles resignation: the resigning seat loses", () => {
    const s = chessEngine.init({ seats: 2 }, rng);
    expect(chessEngine.legalActions(s, 0)).toContainEqual({ type: "RESIGN" });
    const r = chessEngine.reduce(s, { type: "RESIGN" }, rng);
    expect(r.events).toContainEqual({ type: "RESIGN", seat: 0 });
    expect(chessEngine.isTerminal(r.state)).toBe(true);
    const score = chessEngine.score(r.state);
    expect(score.find((x) => x.seat === 0)?.result).toBe("loss");
    expect(score.find((x) => x.seat === 1)?.result).toBe("win");
    expect(chessEngine.legalActions(r.state, 0)).toHaveLength(0);
  });

  it("agrees a draw via DRAW_OFFER → move → DRAW_ACCEPT", () => {
    let s = chessEngine.init({ seats: 2 }, rng);
    // White offers, then plays a move — the offer stands for Black.
    s = chessEngine.reduce(s, { type: "DRAW_OFFER" }, rng).state;
    expect(s.drawOffer).toBe(0);
    // No second offer while one is pending.
    expect(chessEngine.legalActions(s, 0).some((a) => a.type === "DRAW_OFFER")).toBe(false);
    s = chessEngine.reduce(s, move("e2", "e4"), rng).state;
    expect(s.drawOffer).toBe(0);
    const black = chessEngine.legalActions(s, 1);
    expect(black).toContainEqual({ type: "DRAW_ACCEPT" });
    const r = chessEngine.reduce(s, { type: "DRAW_ACCEPT" }, rng);
    expect(r.events).toContainEqual({ type: "DRAW", reason: "agreement" });
    expect(chessEngine.isTerminal(r.state)).toBe(true);
    expect(chessEngine.score(r.state).every((x) => x.result === "draw")).toBe(true);
  });

  it("declines a pending draw offer when the offeree moves instead", () => {
    let s = chessEngine.init({ seats: 2 }, rng);
    s = chessEngine.reduce(s, { type: "DRAW_OFFER" }, rng).state;
    s = chessEngine.reduce(s, move("e2", "e4"), rng).state;
    s = chessEngine.reduce(s, move("e7", "e5"), rng).state; // Black moves → declined
    expect(s.drawOffer).toBeNull();
    expect(chessEngine.legalActions(s, 0)).toContainEqual({ type: "DRAW_OFFER" });
  });

  it("bot returns a legal MOVE and finds mate in one", () => {
    let s = chessEngine.init({ seats: 2 }, rng);
    // Opening position: any legal move is fine, never a meta action.
    const opener = chessEngine.bot!(s, 0, new SeededRng("b1"));
    expect(opener?.type).toBe("MOVE");
    expect(chessEngine.legalActions(s, 0)).toContainEqual(opener);

    s = chessEngine.reduce(s, move("f2", "f3"), rng).state;
    s = chessEngine.reduce(s, move("e7", "e5"), rng).state;
    s = chessEngine.reduce(s, move("g2", "g4"), rng).state;
    const mate = chessEngine.bot!(s, 1, new SeededRng("b2"));
    expect(mate).toEqual({ type: "MOVE", from: "d8", to: "h4" });
  });

  it("keeps working with pre-upgrade snapshots (missing new fields)", () => {
    const legacy = {
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      lastMove: null,
    } as unknown as ChessState;
    expect(chessEngine.isTerminal(legacy)).toBe(false);
    const actions = chessEngine.legalActions(legacy, 0);
    expect(actions.filter((a) => a.type === "MOVE")).toHaveLength(20);
    const r = chessEngine.reduce(legacy, move("e2", "e4"), rng);
    expect(r.state.reps).toBeDefined();
  });
});
