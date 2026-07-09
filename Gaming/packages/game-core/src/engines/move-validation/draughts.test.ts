import { describe, expect, it } from "vitest";
import { SeededRng } from "../../kernel/rng.js";
import { draughtsEngine, type DraughtsState } from "./draughts.js";

const empty = (): DraughtsState => ({
  board: new Array(64).fill(null),
  turn: 0,
  chainFrom: null,
  winner: null,
  done: false,
  noCaptureMoves: 0,
});

const idx = (r: number, c: number) => r * 8 + c;
const rng = () => new SeededRng("x");

describe("draughts multi-jump chaining", () => {
  it("forces a continued capture with the same piece (chainFrom set)", () => {
    const s = empty();
    // White (5,0); black (4,1) -> land (3,2); black (2,3) -> land (1,4).
    s.board[idx(5, 0)] = "w";
    s.board[idx(4, 1)] = "b";
    s.board[idx(2, 3)] = "b";

    // First jump.
    const r1 = draughtsEngine.reduce(s, { type: "MOVE", from: idx(5, 0), to: idx(3, 2) }, rng());
    expect(r1.state.chainFrom).toBe(idx(3, 2));
    expect(r1.state.turn).toBe(0); // same player continues
    // Only the chaining piece may act.
    const actions = draughtsEngine.legalActions(r1.state, 0);
    expect(actions.every((a) => a.from === idx(3, 2))).toBe(true);

    // Second jump completes the chain; turn passes.
    const r2 = draughtsEngine.reduce(r1.state, { type: "MOVE", from: idx(3, 2), to: idx(1, 4) }, rng());
    expect(r2.state.chainFrom).toBeNull();
    expect(r2.state.turn).toBe(1);
    // both black men captured
    expect(r2.state.board[idx(4, 1)]).toBeNull();
    expect(r2.state.board[idx(2, 3)]).toBeNull();
  });

  it("mandatory capture: only captures are offered when one exists", () => {
    const s = empty();
    s.board[idx(5, 2)] = "w";
    s.board[idx(4, 3)] = "b"; // capturable
    s.board[idx(5, 6)] = "w"; // could step but capture takes priority
    const actions = draughtsEngine.legalActions(s, 0);
    expect(actions.length).toBeGreaterThan(0);
    // every offered move must be the capturing jump (lands two away)
    expect(actions.every((a) => Math.abs((a.to % 8) - (a.from % 8)) === 2)).toBe(true);
  });
});

describe("draughts backward capture (Bulgarian rules)", () => {
  it("a man captures backward", () => {
    const s = empty();
    s.board[idx(3, 2)] = "w";
    s.board[idx(4, 3)] = "b"; // behind the white man (white moves toward row 0)
    const actions = draughtsEngine.legalActions(s, 0);
    expect(actions).toContainEqual({ type: "MOVE", from: idx(3, 2), to: idx(5, 4) });
    const r = draughtsEngine.reduce(s, { type: "MOVE", from: idx(3, 2), to: idx(5, 4) }, rng());
    expect(r.state.board[idx(4, 3)]).toBeNull();
    expect(r.state.board[idx(5, 4)]).toBe("w");
  });

  it("a man does NOT step backward (steps stay forward-only)", () => {
    const s = empty();
    s.board[idx(3, 2)] = "w"; // nothing to capture anywhere
    const actions = draughtsEngine.legalActions(s, 0);
    // only the two forward steps
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.to).sort()).toEqual([idx(2, 1), idx(2, 3)].sort());
  });
});

describe("draughts flying kings", () => {
  it("a king slides any number of empty squares", () => {
    const s = empty();
    s.board[idx(4, 3)] = "W";
    const actions = draughtsEngine.legalActions(s, 0);
    expect(actions).toHaveLength(13); // full X of open diagonals
    expect(actions).toContainEqual({ type: "MOVE", from: idx(4, 3), to: idx(1, 0) });
    expect(actions).toContainEqual({ type: "MOVE", from: idx(4, 3), to: idx(0, 7) });
    expect(actions).toContainEqual({ type: "MOVE", from: idx(4, 3), to: idx(7, 0) });
    expect(actions).toContainEqual({ type: "MOVE", from: idx(4, 3), to: idx(7, 6) });
  });

  it("a king cannot slide past a piece", () => {
    const s = empty();
    s.board[idx(7, 0)] = "W";
    s.board[idx(5, 2)] = "w"; // own man blocks the diagonal
    const actions = draughtsEngine.legalActions(s, 0);
    const kingMoves = actions.filter((a) => a.from === idx(7, 0));
    expect(kingMoves).toEqual([{ type: "MOVE", from: idx(7, 0), to: idx(6, 1) }]);
  });

  it("a king captures a distant piece and may stop on any empty square behind it", () => {
    const s = empty();
    s.board[idx(7, 0)] = "W";
    s.board[idx(4, 3)] = "b"; // three squares away, empty squares behind
    const actions = draughtsEngine.legalActions(s, 0);
    // mandatory capture: all actions are the flying capture with 4 landings
    expect(actions).toHaveLength(4);
    for (const to of [idx(3, 4), idx(2, 5), idx(1, 6), idx(0, 7)]) {
      expect(actions).toContainEqual({ type: "MOVE", from: idx(7, 0), to });
    }
    const r = draughtsEngine.reduce(s, { type: "MOVE", from: idx(7, 0), to: idx(2, 5) }, rng());
    expect(r.state.board[idx(4, 3)]).toBeNull();
    expect(r.state.board[idx(2, 5)]).toBe("W");
    expect(r.state.chainFrom).toBeNull();
    expect(r.state.turn).toBe(1);
  });

  it("a king cannot capture when the square behind the piece is occupied", () => {
    const s = empty();
    s.board[idx(7, 0)] = "W";
    s.board[idx(4, 3)] = "b";
    s.board[idx(3, 4)] = "b"; // no empty landing behind the first enemy
    const actions = draughtsEngine.legalActions(s, 0);
    // no capture available → only sliding steps up to (5,2)
    expect(actions.every((a) => a.to === idx(6, 1) || a.to === idx(5, 2))).toBe(true);
  });
});

describe("draughts mid-chain crowning (international rule)", () => {
  it("a man passing the far row mid-chain continues capturing as a man", () => {
    const s = empty();
    s.board[idx(2, 1)] = "w";
    s.board[idx(1, 2)] = "b"; // jump to (0,3) — crowning row
    s.board[idx(1, 4)] = "b"; // backward capture continues from (0,3) to (2,5)
    const r1 = draughtsEngine.reduce(s, { type: "MOVE", from: idx(2, 1), to: idx(0, 3) }, rng());
    expect(r1.state.board[idx(0, 3)]).toBe("w"); // NOT crowned mid-chain
    expect(r1.state.chainFrom).toBe(idx(0, 3));
    expect(r1.state.turn).toBe(0);
    expect(r1.events.some((e) => e.type === "KING")).toBe(false);

    const r2 = draughtsEngine.reduce(r1.state, { type: "MOVE", from: idx(0, 3), to: idx(2, 5) }, rng());
    expect(r2.state.board[idx(2, 5)]).toBe("w"); // chain ended off the far row — still a man
    expect(r2.state.chainFrom).toBeNull();
  });

  it("a capture chain ENDING on the far row crowns", () => {
    const s = empty();
    s.board[idx(2, 1)] = "w";
    s.board[idx(1, 2)] = "b";
    s.board[idx(0, 5)] = "b"; // not capturable from (0,3)
    const r = draughtsEngine.reduce(s, { type: "MOVE", from: idx(2, 1), to: idx(0, 3) }, rng());
    expect(r.state.board[idx(0, 3)]).toBe("W"); // crowned
    expect(r.state.chainFrom).toBeNull();
    expect(r.state.turn).toBe(1);
    expect(r.events.some((e) => e.type === "KING")).toBe(true);
  });
});

describe("draughts quiet-game cap", () => {
  it("draws when the 80-ply no-capture cap hits with equal material", () => {
    const s = empty();
    s.board[idx(5, 0)] = "w";
    s.board[idx(2, 7)] = "b";
    s.noCaptureMoves = 79;
    const r = draughtsEngine.reduce(s, { type: "MOVE", from: idx(5, 0), to: idx(4, 1) }, rng());
    expect(r.state.done).toBe(true);
    expect(r.state.winner).toBeNull();
    expect(r.events.some((e) => e.type === "DRAW")).toBe(true);
    const score = draughtsEngine.score(r.state);
    expect(score.every((x) => x.result === "draw")).toBe(true);
  });

  it("awards the material leader when the cap hits unevenly", () => {
    const s = empty();
    s.board[idx(5, 0)] = "w";
    s.board[idx(5, 4)] = "w";
    s.board[idx(2, 7)] = "b";
    s.noCaptureMoves = 79;
    const r = draughtsEngine.reduce(s, { type: "MOVE", from: idx(5, 0), to: idx(4, 1) }, rng());
    expect(r.state.done).toBe(true);
    expect(r.state.winner).toBe(0);
  });
});

describe("draughts bot", () => {
  it("returns a legal action and prefers the longer capture chain", () => {
    const s = empty();
    // Two options: single capture right, double-chain left.
    s.board[idx(5, 4)] = "w";
    s.board[idx(4, 5)] = "b"; // single capture → (3,6)
    s.board[idx(4, 3)] = "b"; // chain start → (3,2), then (2,1)? build a chain:
    s.board[idx(2, 1)] = "b"; // (3,2) → jump (2,1) → (1,0)
    const legal = draughtsEngine.legalActions(s, 0);
    const pick = draughtsEngine.bot!(s, 0, rng());
    expect(pick).not.toBeNull();
    expect(legal).toContainEqual(pick);
    expect(pick).toEqual({ type: "MOVE", from: idx(5, 4), to: idx(3, 2) });
  });
});
