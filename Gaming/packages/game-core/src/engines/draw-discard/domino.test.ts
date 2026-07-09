import { describe, expect, it } from "vitest";
import {
  dominoEngine,
  openingPick,
  MATCH_TARGET_DOMINO,
  type DominoState,
} from "./domino.js";
import { SeededRng } from "../../kernel/rng.js";

const rng = (seed = "domino-test") => new SeededRng(seed);

/** Hand-crafted mid-round state for deterministic reduce scenarios. */
function base(over: Partial<DominoState>): DominoState {
  return {
    hands: [[], []],
    boneyard: [],
    line: [],
    ends: null,
    turn: 0,
    seats: 2,
    passes: 0,
    matchScore: [0, 0],
    roundNo: 1,
    firstTurn: 0,
    lastRound: null,
    openingTile: null,
    winner: null,
    done: false,
    ...over,
  };
}

describe("domino opening (българско правило — най-голямото чифте)", () => {
  it("init gives the turn to the holder of the highest dealt double and forces it", () => {
    const s = dominoEngine.init({ seats: 4 }, rng("domino-open"));
    let bestPip = -1;
    let bestSeat = -1;
    let bestTile = "";
    s.hands.forEach((h, i) =>
      h.forEach((t) => {
        const [a, b] = t.split("-").map(Number) as [number, number];
        if (a === b && a > bestPip) {
          bestPip = a;
          bestSeat = i;
          bestTile = t;
        }
      }),
    );
    expect(bestSeat).toBeGreaterThanOrEqual(0); // seed deals at least one double
    expect(s.turn).toBe(bestSeat);
    expect(s.firstTurn).toBe(bestSeat);
    expect(s.openingTile).toBe(bestTile);
    // The opener has exactly one legal action: play the double.
    expect(dominoEngine.legalActions(s, s.turn)).toEqual([
      { type: "PLAY", tile: bestTile, side: "L" },
    ]);
    // Everyone else waits.
    for (let seat = 0; seat < s.seats; seat++) {
      if (seat !== s.turn) expect(dominoEngine.legalActions(s, seat)).toEqual([]);
    }
  });

  it("reduce rejects opening with a different tile and clears openingTile after the opening", () => {
    const s = base({
      hands: [["6-6", "2-3"], ["1-4"]],
      boneyard: ["0-0"],
      openingTile: "6-6",
    });
    expect(() =>
      dominoEngine.reduce(s, { type: "PLAY", tile: "2-3", side: "L" }, rng()),
    ).toThrow(/highest double/);
    const { state: n, events } = dominoEngine.reduce(
      s,
      { type: "PLAY", tile: "6-6", side: "L" },
      rng(),
    );
    expect(events).toContainEqual({ type: "PLAY", seat: 0, tile: "6-6", side: "L" });
    expect(n.openingTile).toBeNull();
    expect(n.ends).toEqual([6, 6]);
    expect(n.turn).toBe(1);
  });

  it("openingPick falls back to the heaviest tile when no double was dealt", () => {
    expect(openingPick([["0-1", "3-3"], ["5-6", "2-2"]])).toEqual({ seat: 0, tile: "3-3" });
    expect(openingPick([["0-1", "2-4"], ["5-6", "0-3"]])).toEqual({ seat: 1, tile: null });
  });
});

describe("domino round settlement", () => {
  it("going out wins the round, scores the others' pips and deals the next round", () => {
    const s = base({
      hands: [["3-5"], ["1-1", "2-2"]],
      line: ["3-4"],
      ends: [3, 4],
    });
    const { state: n, events } = dominoEngine.reduce(
      s,
      { type: "PLAY", tile: "3-5", side: "L" },
      rng("out"),
    );
    expect(events).toContainEqual({ type: "WIN", seat: 0, reason: "out" });
    expect(events).toContainEqual({ type: "ROUND", seat: 0, points: 6, matchScore: [6, 0] });
    expect(n.matchScore).toEqual([6, 0]);
    expect(n.lastRound).toEqual({ seat: 0, reason: "out", points: 6 });
    // Fresh deal: table cleared, new hands, opener rotated, round counter up.
    expect(n.roundNo).toBe(2);
    expect(n.line).toEqual([]);
    expect(n.ends).toBeNull();
    expect(n.hands[0]!.length).toBe(7);
    expect(n.hands[1]!.length).toBe(7);
    expect(n.turn).toBe(1);
    expect(n.done).toBe(false);
  });

  it("a blocked round goes to the lowest pip count", () => {
    // Neither 0-1 (sum 1) nor 2-3 (sum 5) fits ends [6,6]; boneyard empty.
    const s = base({ hands: [["0-1"], ["2-3"]], line: ["6-6"], ends: [6, 6] });
    const r1 = dominoEngine.reduce(s, { type: "PASS" }, rng("blk"));
    expect(r1.events).toEqual([{ type: "PASS", seat: 0 }]);
    const r2 = dominoEngine.reduce(r1.state, { type: "PASS" }, rng("blk2"));
    expect(r2.events).toContainEqual({ type: "PASS", seat: 1 });
    expect(r2.events).toContainEqual({ type: "WIN", seat: 0, reason: "blocked" });
    expect(r2.events).toContainEqual({ type: "ROUND", seat: 0, points: 5, matchScore: [5, 0] });
    expect(r2.state.matchScore).toEqual([5, 0]);
    expect(r2.state.lastRound).toEqual({ seat: 0, reason: "blocked", points: 5 });
    expect(r2.state.roundNo).toBe(2);
  });

  it("a blocked pip tie is a null round: no WIN, no points, redeal", () => {
    // 2-3 and 1-4 both sum to 5 and neither fits ends [6,6].
    const s = base({ hands: [["2-3"], ["1-4"]], line: ["6-6"], ends: [6, 6] });
    const r1 = dominoEngine.reduce(s, { type: "PASS" }, rng("tie"));
    const r2 = dominoEngine.reduce(r1.state, { type: "PASS" }, rng("tie2"));
    expect(r2.events.some((e) => e.type === "WIN")).toBe(false);
    expect(r2.events).toContainEqual({ type: "ROUND", points: 0, matchScore: [0, 0] });
    expect(r2.state.matchScore).toEqual([0, 0]);
    expect(r2.state.lastRound).toEqual({ seat: null, reason: "blocked", points: 0 });
    expect(r2.state.roundNo).toBe(2);
    expect(r2.state.done).toBe(false);
  });

  it("reaching the match target ends the match instead of redealing", () => {
    const s = base({
      hands: [["3-5"], ["1-1", "2-2"]],
      line: ["3-4"],
      ends: [3, 4],
      matchScore: [MATCH_TARGET_DOMINO - 4, 0],
    });
    const { state: n, events } = dominoEngine.reduce(
      s,
      { type: "PLAY", tile: "3-5", side: "L" },
      rng("match"),
    );
    expect(events).toContainEqual({ type: "MATCH", seat: 0 });
    expect(n.done).toBe(true);
    expect(n.winner).toBe(0);
    expect(n.matchScore[0]).toBeGreaterThanOrEqual(MATCH_TARGET_DOMINO);
    expect(dominoEngine.score(n)).toEqual([
      { seat: 0, result: "win", points: n.matchScore[0] },
      { seat: 1, result: "loss", points: 0 },
    ]);
  });
});
