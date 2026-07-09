import { describe, expect, it } from "vitest";
import { SeededRng } from "../../kernel/rng.js";
import {
  bestDeadwood,
  bestMeldSplit,
  deadwoodAfterLayoff,
  meldsOf,
  rummyEngine,
  type RummyAction,
  type RummyState,
} from "./rummy.js";

const rng = () => new SeededRng("rummy-test");

function makeState(partial: Partial<RummyState>): RummyState {
  return {
    hands: [[], []],
    stock: [],
    discard: [],
    turn: 0,
    phase: "DRAW",
    winner: null,
    done: false,
    deadwood: null,
    matchScore: [0, 0],
    dealNo: 1,
    firstTurn: 0,
    drawnFromDiscard: null,
    dealsWon: [0, 0],
    showdown: null,
    ...partial,
  };
}

describe("rummy ace rules (gin: ace is low and worth 1)", () => {
  it("counts the ace as 1 deadwood point", () => {
    expect(bestDeadwood(["AS"])).toBe(1);
    expect(bestDeadwood(["AS", "KH", "QD"])).toBe(21); // 1 + 10 + 10
  });

  it("melds A-2-3 as a run", () => {
    expect(meldsOf(["AH", "2H", "3H"]).length).toBe(1);
    expect(bestDeadwood(["AH", "2H", "3H"])).toBe(0);
  });

  it("does NOT meld Q-K-A (no round-the-corner)", () => {
    expect(meldsOf(["QH", "KH", "AH"]).length).toBe(0);
    expect(bestDeadwood(["QH", "KH", "AH"])).toBe(21);
    expect(bestDeadwood(["KH", "AH", "2H"])).toBe(13);
  });
});

describe("rummy optimal meld split", () => {
  it("prefers a run over a set when that minimises deadwood", () => {
    // Greedy sets-first would meld 4H4S4D and strand 2H3H5H6H (16 deadwood);
    // optimal keeps the 2-6H run and leaves 4S+4D = 8.
    expect(bestDeadwood(["4H", "4S", "4D", "2H", "3H", "5H", "6H"])).toBe(8);
    const split = bestMeldSplit(["4H", "4S", "4D", "2H", "3H", "5H", "6H"]);
    expect(split.melds.length).toBe(1);
    expect(split.melds[0]).toEqual(["2H", "3H", "4H", "5H", "6H"]);
    expect(split.unmatched.sort()).toEqual(["4D", "4S"]);
  });

  it("can split 4-of-a-kind to feed a run (3-of-4 set + 4th in the run)", () => {
    // 7H7S7D7C + 8H 9H: best = set 7S7D7C + run 7H8H9H = 0 deadwood.
    expect(bestDeadwood(["7H", "7S", "7D", "7C", "8H", "9H"])).toBe(0);
  });
});

describe("rummy lay-offs", () => {
  it("removes deadwood that extends a knocker's run", () => {
    const melds = meldsOf(["5H", "6H", "7H"]); // run 5-6-7 hearts
    expect(melds.length).toBe(1);
    // Defender holds 8H (extends the run) + 2C (true deadwood).
    const dead = deadwoodAfterLayoff(["8H", "2C"], melds);
    expect(dead).toBe(2); // 8H laid off, only 2C counts
  });

  it("removes deadwood that extends a knocker's set", () => {
    const melds = meldsOf(["9S", "9H", "9D"]); // set of nines
    const dead = deadwoodAfterLayoff(["9C", "4S"], melds);
    expect(dead).toBe(4); // 9C laid off onto the set, 4S remains
  });

  it("does not lay off non-matching cards", () => {
    const melds = meldsOf(["5H", "6H", "7H"]);
    const dead = deadwoodAfterLayoff(["9C", "2S"], melds);
    expect(dead).toBe(11); // nothing extends; 9 + 2
  });

  it("chains lay-offs: 8H then 9H both join a 5-6-7H run", () => {
    const melds = meldsOf(["5H", "6H", "7H"]);
    expect(deadwoodAfterLayoff(["9H", "8H"], melds)).toBe(0);
  });

  it("lays the ace off on the LOW end of a run", () => {
    const melds = meldsOf(["2H", "3H", "4H"]);
    expect(deadwoodAfterLayoff(["AH"], melds)).toBe(0);
  });
});

describe("rummy: card drawn from the discard pile cannot go straight back", () => {
  const base = () =>
    makeState({
      hands: [
        ["2C", "9S", "KD", "5H", "6H", "8D", "TC", "QS", "3D", "7C"],
        ["4C", "4D", "4S", "8H", "9H", "TH", "JC", "QC", "KC", "AD"],
      ],
      stock: ["2S", "3S", "4H", "5S"],
      discard: ["7H"],
      turn: 0,
      phase: "DRAW",
    });

  it("blocks DISCARD and KNOCK of the just-drawn upcard in legalActions", () => {
    const s1 = rummyEngine.reduce(base(), { type: "DRAW", from: "discard" }, rng()).state;
    expect(s1.drawnFromDiscard).toBe("7H");
    const legal = rummyEngine.legalActions(s1, 0);
    expect(legal.some((a) => a.type !== "DRAW" && a.card === "7H")).toBe(false);
    expect(legal.some((a) => a.type === "DISCARD" && a.card === "KD")).toBe(true);
  });

  it("reduce rejects discarding the just-drawn upcard, then clears the flag", () => {
    const s1 = rummyEngine.reduce(base(), { type: "DRAW", from: "discard" }, rng()).state;
    expect(() => rummyEngine.reduce(s1, { type: "DISCARD", card: "7H" }, rng())).toThrow(
      /discard pile/,
    );
    const s2 = rummyEngine.reduce(s1, { type: "DISCARD", card: "KD" }, rng()).state;
    expect(s2.drawnFromDiscard).toBe(null);
  });

  it("a stock draw may be discarded immediately", () => {
    const s1 = rummyEngine.reduce(base(), { type: "DRAW", from: "stock" }, rng()).state;
    expect(s1.drawnFromDiscard).toBe(null);
    const drawn = s1.hands[0]![10]!;
    expect(() => rummyEngine.reduce(s1, { type: "DISCARD", card: drawn }, rng())).not.toThrow();
  });
});

describe("rummy knock showdown", () => {
  // Seat 0 (11 cards): runs 4-5-6H and 2-3-4C, set 9s; 5S deadwood; knocks with KD.
  const knockState = () =>
    makeState({
      hands: [
        ["4H", "5H", "6H", "9S", "9H", "9D", "2C", "3C", "4C", "5S", "KD"],
        ["TS", "JS", "QS", "KC", "KH", "KS", "7H", "8H", "QD", "2D"],
      ],
      stock: ["2S", "3S", "4S", "6S"],
      discard: ["7C"],
      turn: 0,
      phase: "DISCARD",
    });

  it("reveals melds, chained lay-offs and both deadwoods in state.showdown", () => {
    const { state, events } = rummyEngine.reduce(knockState(), { type: "KNOCK", card: "KD" }, rng());
    const sd = state.showdown!;
    expect(sd).not.toBe(null);
    expect(sd.knocker).toBe(0);
    expect(sd.dead).toBe(false);
    expect(sd.gin).toBe(false);
    expect(sd.undercut).toBe(false);
    // Defender lays off 7H AND (chained) 8H onto the 4-5-6H run.
    expect([...sd.layoffs].sort()).toEqual(["7H", "8H"]);
    expect(sd.deadwood).toEqual([5, 12]); // knocker: 5S; defender: QD + 2D
    expect(sd.melds[0].length).toBe(3);
    expect(sd.unmatched[0]).toEqual(["5S"]);
    expect(sd.winner).toBe(0);
    expect(sd.points).toBe(7);
    expect(sd.matchScore).toEqual([7, 0]);
    // Deal was settled and redealt: loser draws first.
    expect(state.matchScore).toEqual([7, 0]);
    expect(state.dealsWon).toEqual([1, 0]);
    expect(state.dealNo).toBe(2);
    expect(state.turn).toBe(1);
    expect(state.hands[0]!.length).toBe(10);
    expect(state.done).toBe(false);
    // Events: DISCARD, KNOCK, WIN, DEAL_END (with flags).
    const types = events.map((e) => e.type);
    expect(types).toEqual(["DISCARD", "KNOCK", "WIN", "DEAL_END"]);
    const dealEnd = events.find((e) => e.type === "DEAL_END")!;
    expect(dealEnd).toMatchObject({ seat: 0, points: 7, gin: false, undercut: false });
    // The showdown survives redaction for BOTH seats.
    expect(rummyEngine.redact(state, 1).showdown).toEqual(sd);
  });

  it("undercut: defender at or below the knocker wins with the bonus", () => {
    const s = makeState({
      hands: [
        // After knocking with 6H: 2-3-4C, 9s set, T-J-QS + TH (10 deadwood).
        ["2C", "3C", "4C", "9S", "9H", "9D", "TS", "JS", "QS", "TH", "6H"],
        // Defender: three melds + AH → 1 deadwood (no lay-off available).
        ["4D", "5D", "6D", "7C", "8C", "9C", "KS", "KH", "KD", "AH"],
      ],
      stock: ["2S", "3S", "4S", "6S"],
      discard: ["7D"],
      turn: 0,
      phase: "DISCARD",
    });
    const { state, events } = rummyEngine.reduce(s, { type: "KNOCK", card: "6H" }, rng());
    const sd = state.showdown!;
    expect(sd.undercut).toBe(true);
    expect(sd.winner).toBe(1);
    expect(sd.deadwood).toEqual([10, 1]);
    expect(sd.points).toBe(9 + 25); // margin + undercut bonus
    const dealEnd = events.find((e) => e.type === "DEAL_END")!;
    expect(dealEnd).toMatchObject({ seat: 1, points: 34, undercut: true });
  });

  it("gin: +25 bonus and the defender may NOT lay off", () => {
    const s = makeState({
      hands: [
        // 2-3-4C, 5-6-7-8H, 9s set = 10 melded cards + KD to knock with.
        ["2C", "3C", "4C", "5H", "6H", "7H", "8H", "9S", "9H", "9D", "KD"],
        // 9C would lay off onto the nines — but not against gin.
        ["9C", "2S", "3D", "5C", "6S", "8D", "TS", "JD", "QS", "KC"],
      ],
      stock: ["2D", "4S", "4D", "7S"],
      discard: ["7C"],
      turn: 0,
      phase: "DISCARD",
    });
    const { state, events } = rummyEngine.reduce(s, { type: "KNOCK", card: "KD" }, rng());
    const sd = state.showdown!;
    expect(sd.gin).toBe(true);
    expect(sd.layoffs).toEqual([]);
    expect(sd.deadwood[0]).toBe(0);
    expect(sd.deadwood[1]).toBe(9 + 2 + 3 + 5 + 6 + 8 + 10 + 10 + 10 + 10);
    expect(sd.points).toBe(sd.deadwood[1] + 25);
    expect(events.find((e) => e.type === "DEAL_END")).toMatchObject({ seat: 0, gin: true });
  });
});

describe("rummy dead hand (two stock cards left, no knock)", () => {
  it("awards no points and redeals with the same first player", () => {
    const s = makeState({
      hands: [
        ["2C", "9S", "KD", "5H", "6H", "8D", "TC", "QS", "3D", "7C", "4H"],
        ["4C", "4D", "4S", "8H", "9H", "TH", "JC", "QC", "KC", "AD"],
      ],
      stock: ["2S", "3S"],
      discard: ["7H"],
      turn: 0,
      phase: "DISCARD",
      firstTurn: 1,
      matchScore: [30, 20],
      dealNo: 3,
    });
    const { state, events } = rummyEngine.reduce(s, { type: "DISCARD", card: "KD" }, rng());
    expect(events.some((e) => e.type === "DEAD_HAND")).toBe(true);
    expect(events.some((e) => e.type === "WIN" || e.type === "DEAL_END")).toBe(false);
    expect(state.matchScore).toEqual([30, 20]); // nobody scores
    expect(state.dealsWon).toEqual([0, 0]);
    expect(state.showdown!.dead).toBe(true);
    expect(state.showdown!.winner).toBe(null);
    expect(state.showdown!.points).toBe(0);
    expect(state.dealNo).toBe(4);
    expect(state.turn).toBe(1); // same firstTurn, not "loser starts"
    expect(state.done).toBe(false);
    expect(state.hands[0]!.length).toBe(10);
  });
});

describe("rummy bot", () => {
  it("takes the upcard only when it melds", () => {
    const hand = ["5H", "6H", "9S", "QD", "KC", "2C", "7D", "8D", "3S", "TC"];
    const useful = makeState({ hands: [hand, []], stock: ["2S"], discard: ["7H"], phase: "DRAW" });
    expect(rummyEngine.bot!(useful, 0, rng())).toEqual({ type: "DRAW", from: "discard" });
    const useless = makeState({ hands: [hand, []], stock: ["2S"], discard: ["KD"], phase: "DRAW" });
    expect(rummyEngine.bot!(useless, 0, rng())).toEqual({ type: "DRAW", from: "stock" });
  });

  it("knocks when possible with the lowest-deadwood card", () => {
    const s = makeState({
      hands: [
        ["2C", "3C", "4C", "5H", "6H", "7H", "9S", "9H", "9D", "5S", "KD"],
        [],
      ],
      stock: ["2S", "3S", "4S", "6S"],
      discard: ["7C"],
      turn: 0,
      phase: "DISCARD",
    });
    expect(rummyEngine.bot!(s, 0, rng())).toEqual({ type: "KNOCK", card: "KD" });
  });

  it("otherwise discards the card that minimises deadwood, never the upcard take", () => {
    const s = makeState({
      hands: [
        ["2C", "9S", "KD", "5H", "8C", "8D", "TC", "QS", "3D", "7C", "KH"],
        [],
      ],
      stock: ["2S", "3S", "4S", "6S"],
      discard: [],
      turn: 0,
      phase: "DISCARD",
      drawnFromDiscard: "KD",
    });
    const a = rummyEngine.bot!(s, 0, rng()) as RummyAction & { card: string };
    expect(a.type).toBe("DISCARD");
    expect(a.card).not.toBe("KD");
  });
});

describe("rummy final scoring (line bonus + shutout)", () => {
  it("adds 25 per won deal and doubles a shutout", () => {
    const s = makeState({
      done: true,
      winner: 0,
      matchScore: [105, 0],
      dealsWon: [5, 0],
    });
    const score = rummyEngine.score(s);
    expect(score.find((x) => x.seat === 0)).toMatchObject({ result: "win", points: (105 + 125) * 2 });
    expect(score.find((x) => x.seat === 1)).toMatchObject({ result: "loss", points: 0 });
  });

  it("no shutout double when the loser scored", () => {
    const s = makeState({
      done: true,
      winner: 0,
      matchScore: [102, 40],
      dealsWon: [4, 2],
    });
    const score = rummyEngine.score(s);
    expect(score.find((x) => x.seat === 0)!.points).toBe(102 + 100);
    expect(score.find((x) => x.seat === 1)!.points).toBe(40 + 50);
  });
});
