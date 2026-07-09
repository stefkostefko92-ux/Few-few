import { describe, expect, it } from "vitest";
import { SeededRng } from "../../kernel/rng.js";
import { playRandom } from "../../bots/playout.js";
import { kentEngine, KENT_TARGET, type KentAction, type KentState } from "./kent.js";

const init = (seed = "k"): KentState => kentEngine.init({ seats: 4 }, new SeededRng(seed));
const rng = () => new SeededRng("r");
const apply = (s: KentState, a: KentAction): KentState => kentEngine.reduce(s, a, rng()).state;

function craft(over: Partial<KentState>): KentState {
  return { ...init(), ...over };
}

describe("kent engine — раздаване и подаване", () => {
  it("deals 4 ranks × 4 = 16 cards, four to each seat", () => {
    const s = init();
    expect(s.hands).toHaveLength(4);
    for (const h of s.hands) expect(h).toHaveLength(4);
    expect(new Set(s.hands.flat()).size).toBe(16);
    expect(s.round).toBe(1);
    expect(s.matchScore).toEqual([0, 0]);
  });

  it("offers PASS only to the seat on turn; КЕНТ is callable only with grounds", () => {
    const s = init();
    const onTurn = kentEngine.legalActions(s, s.turn);
    expect(onTurn.filter((a) => a.type === "PASS")).toHaveLength(4);
    // Без собствен Кент и без сигнал от партньора викът не се предлага —
    // отворен за всички той позволяваше безнаказан спам от заместващи ботове.
    for (const seat of [0, 1, 2, 3] as const) {
      const acts = kentEngine.legalActions(s, seat);
      const hasKent = s.hands[seat]!.every((c) => c[0] === s.hands[seat]![0]![0]);
      expect(acts.some((a) => a.type === "CALL_KUPE")).toBe(hasKent);
      expect(acts.some((a) => a.type === "CALL_STOP")).toBe(false);
    }
  });

  it("СТОП КЕНТ appears for opponents once a signal is flashed and wins on a catch", () => {
    // Craft a state where seat 0 holds a Kent and has signalled.
    const s = init();
    const st = {
      ...s,
      hands: [
        ["AS", "AH", "AD", "AC"],
        s.hands[1]!,
        s.hands[2]!,
        s.hands[3]!,
      ],
      signaled: [true, false, false, false],
    };
    // Partner (seat 2) may call Кент; opponents (1, 3) get Стоп Кент.
    expect(kentEngine.legalActions(st, 2).some((a) => a.type === "CALL_KUPE")).toBe(true);
    expect(kentEngine.legalActions(st, 1).some((a) => a.type === "CALL_STOP")).toBe(true);
    expect(kentEngine.legalActions(st, 3).some((a) => a.type === "CALL_STOP")).toBe(true);
    const { state: after, events } = kentEngine.reduce(st, { type: "CALL_STOP", seat: 1 }, new SeededRng("s"));
    const stop = events.find((e) => e.type === "STOP_KENT");
    expect(stop && "correct" in stop && stop.correct).toBe(true);
    expect(after.matchScore[1]).toBe(1); // team {1,3} catches team {0,2}
  });

  it("after all four pass, cards move one seat to the left simultaneously", () => {
    let s = init();
    const give = s.hands.map((h) => h[0]!); // each seat passes its first card
    for (let seat = 0; seat < 4; seat++) {
      expect(s.turn).toBe(seat);
      s = apply(s, { type: "PASS", card: give[seat]! });
    }
    expect(s.passes).toBe(1);
    // seat 1 should now hold the card seat 0 passed.
    expect(s.hands[1]).toContain(give[0]);
    expect(s.hands[0]).not.toContain(give[0]);
    // hands stay at 4.
    for (const h of s.hands) expect(h).toHaveLength(4);
  });
});

describe("kent engine — Купе", () => {
  it("a correct Купе (team holds a Kent) wins the round for the caller's team", () => {
    const s = craft({
      // seat 0 holds four Aces (a Kent); caller is its partner, seat 2.
      hands: [["AS", "AH", "AD", "AC"], ["KS", "KH", "QD", "JC"], ["QS", "QH", "KD", "JH"], ["JS", "JD", "KC", "QC"]],
    });
    const after = apply(s, { type: "CALL_KUPE", seat: 2 });
    expect(after.lastRound).toEqual({ caller: 2, correct: true, winningTeam: 0 });
    expect(after.matchScore[0]).toBe(1);
    expect(after.matchScore[1]).toBe(0);
  });

  it("a false Купе hands the point to the opponents", () => {
    const s = craft({
      hands: [["AS", "KH", "QD", "JC"], ["KS", "AH", "QH", "JH"], ["QS", "AD", "KD", "JD"], ["JS", "AC", "KC", "QC"]],
    });
    const after = apply(s, { type: "CALL_KUPE", seat: 0 }); // team 0 has no Kent
    expect(after.lastRound!.correct).toBe(false);
    expect(after.lastRound!.winningTeam).toBe(1);
    expect(after.matchScore).toEqual([0, 1]);
  });

  it("SIGNAL is only legal for a Kent holder and is hidden from opponents", () => {
    const s = craft({
      hands: [["AS", "AH", "AD", "AC"], ["KS", "KH", "QD", "JC"], ["QS", "QH", "KD", "JH"], ["JS", "JD", "KC", "QC"]],
    });
    expect(kentEngine.legalActions(s, 0).some((a) => a.type === "SIGNAL")).toBe(true);
    expect(kentEngine.legalActions(s, 1).some((a) => a.type === "SIGNAL")).toBe(false);
    const after = apply(s, { type: "SIGNAL", seat: 0 });
    // partner (seat 2) sees the signal; opponent (seat 1) does not.
    expect((kentEngine.redact(after, 2) as KentState).signaled[0]).toBe(true);
    expect((kentEngine.redact(after, 1) as KentState).signaled[0]).toBe(false);
  });
});

describe("kent engine — мач и инварианти", () => {
  it("plays full random matches to a winning team", () => {
    for (let g = 0; g < 12; g++) {
      const { state, terminal } = playRandom(kentEngine, { seed: `m${g}`, botSeed: `b${g}`, seats: 4 });
      expect(terminal).toBe(true);
      const score = kentEngine.score(state);
      expect(score.filter((x) => x.result === "win")).toHaveLength(2);
      const w = state.winningTeam!;
      expect(state.matchScore[w] >= KENT_TARGET || state.round >= 40).toBe(true);
    }
  });

  it("the heuristic bot only proposes legal actions", () => {
    let s = init("bot");
    for (let i = 0; i < 200 && !s.done; i++) {
      let acted = false;
      for (let seat = 0; seat < 4; seat++) {
        const pick = kentEngine.bot!(s, seat, new SeededRng(`b${i}`));
        if (!pick) continue;
        const legal = kentEngine.legalActions(s, seat);
        expect(legal.some((l) => JSON.stringify(l) === JSON.stringify(pick))).toBe(true);
        s = apply(s, pick);
        acted = true;
        break;
      }
      if (!acted) break;
    }
  });

  it("redact never reveals another seat's hand", () => {
    const s = init();
    const view = kentEngine.redact(s, 0) as KentState;
    expect(view.hands[0]).toEqual(s.hands[0]);
    expect(view.hands[1]!.every((c) => c === view.hands[1]![0])).toBe(true); // all hidden marker
  });
});
