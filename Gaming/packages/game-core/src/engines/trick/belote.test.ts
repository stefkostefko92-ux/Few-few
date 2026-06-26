import { describe, expect, it } from "vitest";
import { SeededRng } from "../../kernel/rng.js";
import { playRandom } from "../../bots/playout.js";
import { beloteEngine, MATCH_TARGET, type BeloteAction, type BeloteState, type Contract } from "./belote.js";

const init = (seed = "bel"): BeloteState => beloteEngine.init({ seats: 4 }, new SeededRng(seed));
const rng = () => new SeededRng("r");

const reduceSeq = (s: BeloteState, actions: BeloteAction[]): BeloteState => {
  let cur = s;
  for (const a of actions) cur = beloteEngine.reduce(cur, a, rng()).state;
  return cur;
};

/** Craft a mid-PLAY state with full control (engine state is a plain object). */
function craft(over: Partial<BeloteState>): BeloteState {
  const base = init();
  return {
    ...base,
    phase: "PLAY",
    contract: "S",
    trump: "S",
    declarer: 0,
    ...over,
  };
}

describe("belote engine — наддаване", () => {
  it("deals four hands of 8 from a 32-card deck", () => {
    const s = init();
    expect(s.hands).toHaveLength(4);
    for (const h of s.hands) expect(h).toHaveLength(8);
    expect(new Set(s.hands.flat()).size).toBe(32);
    expect(s.phase).toBe("BID");
    expect(s.matchPoints).toEqual([0, 0]);
  });

  it("offers the full rising ladder, then only higher bids", () => {
    const s = init();
    const first = beloteEngine.legalActions(s, s.turn);
    expect(first.filter((a) => a.type === "BID")).toHaveLength(6); // ♣♦♥♠ БК ВК
    const afterH = reduceSeq(s, [{ type: "BID", contract: "H" }]);
    const next = beloteEngine.legalActions(afterH, afterH.turn);
    const bids = next.filter((a): a is Extract<BeloteAction, { type: "BID" }> => a.type === "BID");
    expect(bids.map((b) => b.contract)).toEqual(["S", "NT", "AT"]); // само по-високи
  });

  it("a bid needs three passes to close; play then starts with declarations", () => {
    let s = init();
    s = reduceSeq(s, [{ type: "BID", contract: "H" }, { type: "PASS" }, { type: "PASS" }]);
    expect(s.phase).toBe("BID"); // още не — само 2 паса
    s = reduceSeq(s, [{ type: "PASS" }]);
    expect(s.phase).toBe("PLAY");
    expect(s.contract).toBe("H");
    expect(s.trump).toBe("H");
    expect(s.declarer).not.toBeNull();
  });

  it("four passes with no contract redeal with the next dealer", () => {
    let s = init();
    const dealer0 = s.dealer;
    const deal0 = s.dealNo;
    s = reduceSeq(s, [{ type: "PASS" }, { type: "PASS" }, { type: "PASS" }, { type: "PASS" }]);
    expect(s.phase).toBe("BID");
    expect(s.dealNo).toBe(deal0 + 1);
    expect(s.dealer).toBe((dealer0 + 1) % 4);
    expect(s.contract).toBeNull();
  });

  it("opponents may КОНТРА and the bidding team may РЕКОНТРА", () => {
    let s = init();
    s = reduceSeq(s, [{ type: "BID", contract: "S" }]); // seat 1 bids (turn was 1)
    // now turn is the next seat — an opponent of the declarer team
    const opp = s.turn;
    expect(opp % 2).not.toBe(s.declarer! % 2);
    expect(beloteEngine.legalActions(s, opp).some((a) => a.type === "CONTRA")).toBe(true);
    s = reduceSeq(s, [{ type: "CONTRA" }]);
    expect(s.doubling).toBe(2);
    // recontra is offered only to the declarer's team
    const holder = s.turn;
    const acts = beloteEngine.legalActions(s, holder);
    const hasRe = acts.some((a) => a.type === "RECONTRA");
    expect(hasRe).toBe(holder % 2 === s.declarer! % 2);
    s = reduceSeq(s, [hasRe ? { type: "RECONTRA" } : { type: "PASS" }]);
    if (hasRe) expect(s.doubling).toBe(4);
  });

  it("legacy CALL still works as a suit bid", () => {
    let s = init();
    s = reduceSeq(s, [{ type: "CALL", suit: "D" }]);
    expect(s.contract).toBe("D");
  });
});

describe("belote engine — задължения при игра", () => {
  it("must follow the led suit", () => {
    const s = craft({
      hands: [["AS", "7H"], ["KH", "8S"], ["7D", "8D"], ["9C", "TC"]],
      trick: [{ seat: 0, card: "7H" }],
      turn: 1,
      leader: 0,
    });
    const acts = beloteEngine.legalActions(s, 1) as Array<{ card: string }>;
    expect(acts.map((a) => a.card)).toEqual(["KH"]); // има купа → длъжен
  });

  it("на коз качваш, ако можеш", () => {
    const s = craft({
      hands: [["7S"], ["JS", "8S"], ["7D"], ["9C"]],
      trick: [{ seat: 0, card: "7S" }],
      turn: 1,
      leader: 0,
    });
    const acts = beloteEngine.legalActions(s, 1) as Array<{ card: string }>;
    // J е най-силен коз → 8S също бие 7S; и двете "качват"
    expect(acts.map((a) => a.card).sort()).toEqual(["8S", "JS"]);
  });

  it("без боя цакаш, освен ако партньорът държи взятката", () => {
    // seat 2's partner is seat 0; seat 0 currently winning → seat 2 е свободен
    const sFree = craft({
      hands: [[], ["7D"], ["7S", "8D"], []],
      trick: [{ seat: 0, card: "AH" }, { seat: 1, card: "7H" }],
      turn: 2,
      leader: 0,
    });
    const free = beloteEngine.legalActions(sFree, 2) as Array<{ card: string }>;
    expect(free.map((a) => a.card).sort()).toEqual(["7S", "8D"]); // всичко позволено

    // противник държи → длъжен да цака
    const sMust = craft({
      hands: [[], ["7D"], ["7S", "8D"], []],
      trick: [{ seat: 1, card: "AH" }],
      turn: 2,
      leader: 1,
    });
    const must = beloteEngine.legalActions(sMust, 2) as Array<{ card: string }>;
    expect(must.map((a) => a.card)).toEqual(["7S"]); // само козът
  });

  it("надцакваш чужд коз, ако можеш; иначе даваш по-малък коз", () => {
    const s = craft({
      hands: [[], [], ["JS", "7S", "8D"], []],
      trick: [{ seat: 0, card: "AH" }, { seat: 1, card: "9S" }],
      turn: 2,
      leader: 0,
    });
    const acts = beloteEngine.legalActions(s, 2) as Array<{ card: string }>;
    expect(acts.map((a) => a.card)).toEqual(["JS"]); // само надцакване (J > 9)
  });

  it("всичко коз: качваш в боята задължително", () => {
    const s = craft({
      contract: "AT",
      trump: null,
      hands: [[], ["9H", "7H", "AS"], [], []],
      trick: [{ seat: 0, card: "KH" }],
      turn: 1,
      leader: 0,
    });
    const acts = beloteEngine.legalActions(s, 1) as Array<{ card: string }>;
    expect(acts.map((a) => a.card)).toEqual(["9H"]); // 9 бие K в коз; 7H не качва
  });

  it("без коз: само отговаряш, без задължение за качване", () => {
    const s = craft({
      contract: "NT",
      trump: null,
      hands: [[], ["9H", "7H", "AS"], [], []],
      trick: [{ seat: 0, card: "KH" }],
      turn: 1,
      leader: 0,
    });
    const acts = beloteEngine.legalActions(s, 1) as Array<{ card: string }>;
    expect(acts.map((a) => a.card).sort()).toEqual(["7H", "9H"]);
  });
});

describe("belote engine — точкуване на раздаване", () => {
  it("валат: +90 за победителите, обявите на губещите отпадат", () => {
    const s = craft({
      hands: [["AS"], ["7H"], ["8H"], ["7D"]],
      trick: [],
      turn: 0,
      leader: 0,
      tricksTaken: [7, 0],
      teamPoints: [141, 0],
      declarer: 0,
    });
    const done = reduceSeq(s, [
      { type: "PLAY", card: "AS" },
      { type: "PLAY", card: "7H" },
      { type: "PLAY", card: "8H" },
      { type: "PLAY", card: "7D" },
    ]);
    expect(done.lastDeal).not.toBeNull();
    expect(done.lastDeal!.valat).toBe(0);
    // raw 162 + 90 = 252 → 25 точки за мача
    expect(done.lastDeal!.awarded[0]).toBe(25);
    expect(done.lastDeal!.awarded[1]).toBe(0);
  });

  it("равенство: точките на обявилия отбор висят", () => {
    const s = craft({
      hands: [["KS"], ["7H"], ["8H"], ["7D"]],
      trick: [],
      turn: 0,
      leader: 0,
      tricksTaken: [4, 3],
      teamPoints: [72, 86],
      declarer: 0,
    });
    const done = reduceSeq(s, [
      { type: "PLAY", card: "KS" },
      { type: "PLAY", card: "7H" },
      { type: "PLAY", card: "8H" },
      { type: "PLAY", card: "7D" },
    ]);
    // 72 + 4 (KS) + 10 (последна) = 86 = 86 → равни
    expect(done.lastDeal!.inside).toBe(false);
    expect(done.lastDeal!.awarded[0]).toBe(0);
    expect(done.lastDeal!.awarded[1]).toBe(9);
    expect(done.hanging).toBe(9);
    expect(done.phase).toBe("BID"); // следващото раздаване е започнало
  });

  it("вътре: противникът взима всичко", () => {
    const s = craft({
      hands: [["7S"], ["JS"], ["8H"], ["7D"]],
      trick: [],
      turn: 0,
      leader: 0,
      tricksTaken: [3, 4],
      teamPoints: [40, 88],
      declarer: 0,
    });
    const done = reduceSeq(s, [
      { type: "PLAY", card: "7S" },
      { type: "PLAY", card: "JS" }, // J коз бие → отбор 1 печели взятката
      { type: "PLAY", card: "8H" },
      { type: "PLAY", card: "7D" },
    ]);
    // отбор1: 88 + 20 (JS) + 10 = 118; отбор0: 40 → вътре
    expect(done.lastDeal!.inside).toBe(true);
    expect(done.lastDeal!.awarded[0]).toBe(0);
    expect(done.lastDeal!.awarded[1]).toBe(Math.round(118 / 10) + Math.round(40 / 10));
  });
});

describe("belote engine — мач до 151", () => {
  it("plays full random matches to a 151+ winner", () => {
    let maxDeals = 0;
    for (let g = 0; g < 12; g++) {
      const { state, terminal } = playRandom(beloteEngine, {
        seed: `m${g}`,
        botSeed: `b${g}`,
        seats: 4,
      });
      expect(terminal).toBe(true);
      const score = beloteEngine.score(state);
      expect(score.filter((x) => x.result === "win")).toHaveLength(2);
      const w = state.winningTeam!;
      expect(state.matchPoints[w === 0 ? 0 : 1]).toBeGreaterThanOrEqual(MATCH_TARGET);
      expect(state.matchPoints[w === 0 ? 0 : 1]).toBeGreaterThan(state.matchPoints[w === 0 ? 1 : 0]);
      maxDeals = Math.max(maxDeals, state.dealNo);
    }
    // С реконтра един мач МОЖЕ да свърши в 1 раздаване, но не всичките 12.
    expect(maxDeals).toBeGreaterThan(1);
  });

  it("is deterministic for identical seeds", () => {
    const a = playRandom(beloteEngine, { seed: "x", botSeed: "y", seats: 4 });
    const b = playRandom(beloteEngine, { seed: "x", botSeed: "y", seats: 4 });
    expect(a.state).toEqual(b.state);
  });

  it("the heuristic bot always proposes a legal action", () => {
    const contracts: Contract[] = ["S", "NT", "AT"];
    for (const c of contracts) {
      let s = init(`bot-${c}`);
      s = reduceSeq(s, [{ type: "BID", contract: c }, { type: "PASS" }, { type: "PASS" }, { type: "PASS" }]);
      for (let i = 0; i < 64 && !s.done && s.phase === "PLAY"; i++) {
        const seat = s.turn;
        const pick = beloteEngine.bot!(s, seat, new SeededRng(`b${i}`));
        expect(pick).not.toBeNull();
        const legal = beloteEngine.legalActions(s, seat);
        expect(legal.some((l) => JSON.stringify(l) === JSON.stringify(pick))).toBe(true);
        s = beloteEngine.reduce(s, pick!, rng()).state;
      }
    }
  });
});
