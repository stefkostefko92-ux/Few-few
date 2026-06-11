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

describe("draughts multi-jump chaining", () => {
  it("forces a continued capture with the same piece (chainFrom set)", () => {
    const s = empty();
    // White man at (5,2). Black men at (4,3) and (2,3) set up a double jump:
    // w jumps (4,3) landing (3,4), then must jump (2,3)? Build a clean diagonal.
    // White (5,0); black (4,1) -> land (3,2); black (2,3) -> land (1,4).
    s.board[idx(5, 0)] = "w";
    s.board[idx(4, 1)] = "b";
    s.board[idx(2, 3)] = "b";

    // First jump.
    const r1 = draughtsEngine.reduce(s, { type: "MOVE", from: idx(5, 0), to: idx(3, 2) }, new SeededRng("x"));
    expect(r1.state.chainFrom).toBe(idx(3, 2));
    expect(r1.state.turn).toBe(0); // same player continues
    // Only the chaining piece may act.
    const actions = draughtsEngine.legalActions(r1.state, 0);
    expect(actions.every((a) => a.from === idx(3, 2))).toBe(true);

    // Second jump completes the chain; turn passes.
    const r2 = draughtsEngine.reduce(r1.state, { type: "MOVE", from: idx(3, 2), to: idx(1, 4) }, new SeededRng("x"));
    expect(r2.state.chainFrom).toBeNull();
    expect(r2.state.turn).toBe(1);
    // both black men captured
    expect(r2.state.board[idx(4, 1)]).toBeNull();
    expect(r2.state.board[idx(2, 3)]).toBeNull();
  });

  it("crowning ends the chain even if another capture exists", () => {
    const s = empty();
    // White man one jump from crowning: w(2,1), b(1,2) -> land (0,3) crowns.
    s.board[idx(2, 1)] = "w";
    s.board[idx(1, 2)] = "b";
    // Another capturable black placed so a (hypothetical) chain would exist.
    s.board[idx(0, 5)] = "b";
    const r = draughtsEngine.reduce(s, { type: "MOVE", from: idx(2, 1), to: idx(0, 3) }, new SeededRng("x"));
    expect(r.state.board[idx(0, 3)]).toBe("W"); // crowned
    expect(r.state.chainFrom).toBeNull(); // chain ended by crowning
    expect(r.state.turn).toBe(1);
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
