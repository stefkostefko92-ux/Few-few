import { describe, expect, it } from "vitest";
import { SeededRng } from "../../kernel/rng.js";
import { chessEngine, type ChessAction } from "./chess.js";

const rng = new SeededRng("chess");
const move = (from: string, to: string): ChessAction => ({ type: "MOVE", from, to });

describe("chess engine", () => {
  it("starts with 20 legal moves for White and none for Black", () => {
    const s = chessEngine.init({ seats: 2 }, rng);
    expect(chessEngine.legalActions(s, 0)).toHaveLength(20);
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
});
