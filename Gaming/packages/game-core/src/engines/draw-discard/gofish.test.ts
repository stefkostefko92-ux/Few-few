import { describe, expect, it } from "vitest";
import { goFishEngine, type GoFishState } from "./gofish.js";
import { SeededRng } from "../../kernel/rng.js";

const rng = (seed = "gofish-test") => new SeededRng(seed);

/** Hand-crafted state for deterministic reduce scenarios. */
function base(over: Partial<GoFishState>): GoFishState {
  return {
    hands: [[], []],
    ocean: [],
    books: [0, 0],
    turn: 0,
    seats: 2,
    winner: null,
    done: false,
    ...over,
  };
}

describe("gofish deal", () => {
  it("deals 7 cards each head-to-head and 5 with three players", () => {
    const two = goFishEngine.init({ seats: 2 }, rng("deal-2"));
    for (let s = 0; s < 2; s++) {
      // Books collected from the initial deal still account for 4 cards each.
      expect(two.hands[s]!.length + 4 * two.books[s]!).toBe(7);
    }
    expect(two.ocean.length).toBe(52 - 2 * 7);

    const three = goFishEngine.init({ seats: 3 }, rng("deal-3"));
    for (let s = 0; s < 3; s++) {
      expect(three.hands[s]!.length + 4 * three.books[s]!).toBe(5);
    }
    expect(three.ocean.length).toBe(52 - 3 * 5);
  });
});

describe("gofish turn flow", () => {
  it("a successful ask takes the cards and keeps the turn", () => {
    const s = base({ hands: [["7S", "2C"], ["7H", "7D", "3C"]], ocean: ["9S"] });
    const { state: n, events } = goFishEngine.reduce(
      s,
      { type: "ASK", target: 1, rank: "7" },
      rng(),
    );
    expect(events).toContainEqual({ type: "ASK", seat: 0, target: 1, rank: "7", got: 2 });
    expect(n.hands[0]).toEqual(expect.arrayContaining(["7S", "7H", "7D"]));
    expect(n.hands[1]).toEqual(["3C"]);
    expect(n.turn).toBe(0);
  });

  it("a miss draws from the ocean and passes the turn (no lucky fish)", () => {
    const s = base({ hands: [["7S"], ["3C"]], ocean: ["9S", "4H"] });
    const { state: n, events } = goFishEngine.reduce(
      s,
      { type: "ASK", target: 1, rank: "7" },
      rng(),
    );
    expect(events).toContainEqual({ type: "ASK", seat: 0, target: 1, rank: "7", got: 0 });
    expect(events).toContainEqual({ type: "FISH", seat: 0, lucky: false });
    expect(n.hands[0]).toEqual(["7S", "9S"]);
    expect(n.turn).toBe(1);
  });

  it("lucky fish: drawing the asked rank keeps the turn", () => {
    const s = base({ hands: [["7S"], ["3C"]], ocean: ["7H", "4H"] });
    const { state: n, events } = goFishEngine.reduce(
      s,
      { type: "ASK", target: 1, rank: "7" },
      rng(),
    );
    expect(events).toContainEqual({ type: "FISH", seat: 0, lucky: true });
    expect(n.hands[0]).toEqual(["7S", "7H"]);
    expect(n.turn).toBe(0);
    expect(goFishEngine.legalActions(n, 0).length).toBeGreaterThan(0);
  });

  it("a lucky fish that completes a book still keeps the turn after replenish", () => {
    const s = base({ hands: [["7S", "7H", "7D"], ["3C"]], ocean: ["7C", "5H", "5D"] });
    const { state: n, events } = goFishEngine.reduce(
      s,
      { type: "ASK", target: 1, rank: "7" },
      rng(),
    );
    expect(events).toContainEqual({ type: "FISH", seat: 0, lucky: true });
    expect(events).toContainEqual({ type: "BOOK", seat: 0, rank: "7" });
    expect(n.books[0]).toBe(1);
    // The book emptied the hand; replenish drew the next ocean card.
    expect(n.hands[0]).toEqual(["5H"]);
    expect(n.turn).toBe(0);
  });
});

describe("gofish finish", () => {
  it("emits a WIN event for every seat tied on max books", () => {
    // 12 books are out; the four nines complete the 13th and tie 5-5-3.
    const s = base({
      seats: 3,
      hands: [["9S", "9H"], ["9D", "9C"], []],
      books: [4, 5, 3],
      ocean: [],
      turn: 0,
    });
    const { state: n, events } = goFishEngine.reduce(
      s,
      { type: "ASK", target: 1, rank: "9" },
      rng(),
    );
    expect(n.done).toBe(true);
    expect(n.books).toEqual([5, 5, 3]);
    expect(events).toContainEqual({ type: "WIN", seat: 0 });
    expect(events).toContainEqual({ type: "WIN", seat: 1 });
    expect(events.filter((e) => e.type === "WIN")).toHaveLength(2);
    const score = goFishEngine.score(n);
    expect(score[0]!.result).toBe("win");
    expect(score[1]!.result).toBe("win");
    expect(score[2]!.result).toBe("loss");
  });
});
