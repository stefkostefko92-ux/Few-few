import { describe, expect, it } from "vitest";
import { SeededRng } from "../../kernel/rng.js";
import { playRandom } from "../../bots/playout.js";
import { kentEngine, KENT_TARGET, type KentAction, type KentEvent, type KentState } from "./kent.js";

const init = (seed = "k"): KentState => kentEngine.init({ seats: 4 }, new SeededRng(seed));
const rng = () => new SeededRng("r");
const apply = (s: KentState, a: KentAction): KentState => kentEngine.reduce(s, a, rng()).state;
const step = (s: KentState, a: KentAction) => kentEngine.reduce(s, a, rng());

function craft(over: Partial<KentState>): KentState {
  return { ...init(), ...over };
}

describe("kent engine — раздаване и ход", () => {
  it("deals a 52-card layout: 4×4 hands + 4 face-up center + 32-card deck", () => {
    const s = init();
    expect(s.hands).toHaveLength(4);
    for (const h of s.hands) expect(h).toHaveLength(4);
    expect(s.center).toHaveLength(4);
    expect(s.deck).toHaveLength(32);
    // 16 + 4 + 32 = 52 уникални карти.
    expect(new Set([...s.hands.flat(), ...s.center, ...s.deck]).size).toBe(52);
    expect(s.round).toBe(1);
    expect(s.matchScore).toEqual([0, 0]);
  });

  it("only the seat on turn has legal actions (single-seat invariant)", () => {
    const s = init();
    const onTurn = kentEngine.legalActions(s, s.turn);
    // 4×4 SWAP + PASS + CALL_STOP гамбит = 18 (без основание за КУПЕ/сигнал).
    expect(onTurn.filter((a) => a.type === "SWAP")).toHaveLength(16);
    expect(onTurn.some((a) => a.type === "PASS")).toBe(true);
    // Всяко ДРУГО място няма никакви действия — няма два едновременни on-turn seat-а.
    for (const seat of [0, 1, 2, 3] as const) {
      if (seat === s.turn) continue;
      expect(kentEngine.legalActions(s, seat)).toHaveLength(0);
    }
  });

  it("КУПЕ is offered only to a partner who has seen the secret signal", () => {
    // Място 0 държи каре и е сигнализирало; сега е ход на партньора (място 2).
    const s = craft({ signaled: [true, false, false, false], turn: 2 });
    expect(kentEngine.legalActions(s, 2).some((a) => a.type === "CALL_KUPE")).toBe(true);
    // Противникът на ход не получава КУПЕ (партньорът му не е сигнализирал).
    const opp = craft({ signaled: [true, false, false, false], turn: 1 });
    expect(kentEngine.legalActions(opp, 1).some((a) => a.type === "CALL_KUPE")).toBe(false);
  });
});

describe("kent engine — механика", () => {
  it("SWAP exchanges a hand card with a center card and passes the turn", () => {
    const s = craft({
      hands: [["AS", "KH", "QD", "JC"], ["2S", "3H", "4D", "5C"], ["6S", "7H", "8D", "9C"], ["TS", "TH", "TD", "TC"]],
      center: ["AH", "AD", "AC", "2H"],
      turn: 0,
    });
    const after = apply(s, { type: "SWAP", handIndex: 1, centerIndex: 0 }); // KH ↔ AH
    expect(after.hands[0]).toEqual(["AS", "AH", "QD", "JC"]);
    expect(after.center).toEqual(["KH", "AD", "AC", "2H"]);
    expect(after.turn).toBe(1);
    expect(after.passStreak).toBe(0);
  });

  it("four passes in a row replace the four center cards from the deck", () => {
    let s = init();
    const oldCenter = [...s.center];
    const nextFour = s.deck.slice(0, 4);
    const deckAfter = s.deck.length - 4;
    for (let seat = 0; seat < 4; seat++) {
      expect(s.turn).toBe(seat);
      s = apply(s, { type: "PASS" });
    }
    expect(s.center).toEqual(nextFour);
    expect(s.center).not.toEqual(oldCenter);
    expect(s.deck).toHaveLength(deckAfter);
    expect(s.passStreak).toBe(0);
  });
});

describe("kent engine — сигнал, Купе, Стоп", () => {
  it("caret → signal → partner Купе wins the round for the team", () => {
    // Място 0 държи каре от аса, на ход е → дава тайния знак.
    const s = craft({
      hands: [["AS", "AH", "AD", "AC"], ["KS", "KH", "QD", "JC"], ["QS", "QH", "KD", "JH"], ["JS", "JD", "KC", "QC"]],
      turn: 0,
    });
    expect(kentEngine.legalActions(s, 0).some((a) => a.type === "SIGNAL")).toBe(true);
    const afterSignal = apply(s, { type: "SIGNAL", seat: 0 });
    expect(afterSignal.signaled[0]).toBe(true);
    expect(afterSignal.turn).toBe(1);
    // Партньорът (място 2) вижда знака и вика „Купе!".
    const atPartner = { ...afterSignal, turn: 2 as const };
    const after = apply(atPartner, { type: "CALL_KUPE", seat: 2 });
    expect(after.lastRound).toMatchObject({ caller: 2, kind: "KUPE", correct: true, winningTeam: 0 });
    expect(after.matchScore).toEqual([1, 0]);
  });

  it("a false Купе (no caret in the team) hands the point to the opponents", () => {
    // Партньорът е сигнализирал, но отборът НЯМА каре → грешен вик.
    const s = craft({
      hands: [["AS", "KH", "QD", "JC"], ["KS", "AH", "QH", "JH"], ["QS", "AD", "KD", "JD"], ["JS", "AC", "KC", "QC"]],
      signaled: [false, false, true, false], // партньорът на място 0 (=2) е „сигнализирал"
      turn: 0,
    });
    const after = apply(s, { type: "CALL_KUPE", seat: 0 });
    expect(after.lastRound!.correct).toBe(false);
    expect(after.lastRound!.winningTeam).toBe(1);
    expect(after.matchScore).toEqual([0, 1]);
  });

  it("СТОП catches the opposing team holding a caret", () => {
    const s = craft({
      hands: [["AS", "AH", "AD", "AC"], ["KS", "QH", "JD", "TC"], ["QS", "QH", "KD", "JH"], ["JS", "JD", "KC", "QC"]],
      turn: 1, // противник на ход
    });
    const after = apply(s, { type: "CALL_STOP", seat: 1 });
    expect(after.lastRound).toMatchObject({ caller: 1, kind: "STOP", correct: true, winningTeam: 1 });
    expect(after.matchScore).toEqual([0, 1]);
  });

  it("a false СТОП (opponents have no caret) hands the point to them", () => {
    const s = craft({
      hands: [["AS", "KH", "QD", "JC"], ["KS", "QH", "JD", "TC"], ["QS", "AD", "KD", "JH"], ["JS", "JD", "KC", "QC"]],
      turn: 1,
    });
    const after = apply(s, { type: "CALL_STOP", seat: 1 });
    expect(after.lastRound!.correct).toBe(false);
    expect(after.matchScore).toEqual([1, 0]); // накърненият отбор {0,2} печели точката
  });

  it("SIGNAL is legal only for a caret holder and is hidden from opponents", () => {
    const s = craft({
      hands: [["AS", "AH", "AD", "AC"], ["KS", "KH", "QD", "JC"], ["QS", "QH", "KD", "JH"], ["JS", "JD", "KC", "QC"]],
      turn: 0,
    });
    expect(kentEngine.legalActions(s, 0).some((a) => a.type === "SIGNAL")).toBe(true);
    const after = apply(s, { type: "SIGNAL", seat: 0 });
    // Партньорът (място 2) вижда знака; противникът (място 1) — не.
    expect((kentEngine.redact(after, 2) as KentState).signaled[0]).toBe(true);
    expect((kentEngine.redact(after, 1) as KentState).signaled[0]).toBe(false);
  });

  it("redactEvent delivers the SIGNAL event only to the signaller and the partner", () => {
    const s = craft({
      hands: [["AS", "AH", "AD", "AC"], ["KS", "KH", "QD", "JC"], ["QS", "QH", "KD", "JH"], ["JS", "JD", "KC", "QC"]],
      turn: 0,
    });
    const { events } = step(s, { type: "SIGNAL", seat: 0 });
    const signal = events.find((e) => e.type === "SIGNAL") as KentEvent;
    expect(kentEngine.redactEvent!(signal, 0)).not.toBeNull(); // сигнализиращият
    expect(kentEngine.redactEvent!(signal, 2)).not.toBeNull(); // партньорът
    expect(kentEngine.redactEvent!(signal, 1)).toBeNull(); // противник — скрито
    expect(kentEngine.redactEvent!(signal, 3)).toBeNull(); // противник — скрито
  });
});

describe("kent engine — мач и инварианти", () => {
  it("plays full random matches to a decisive winning team (terminates)", () => {
    for (let g = 0; g < 12; g++) {
      const { state, terminal } = playRandom(kentEngine, { seed: `m${g}`, botSeed: `b${g}`, seats: 4 });
      expect(terminal).toBe(true);
      const score = kentEngine.score(state);
      expect(score.filter((x) => x.result === "win")).toHaveLength(2);
      const w = state.winningTeam!;
      expect(state.matchScore[w] >= KENT_TARGET || state.round >= 40 || state.moves >= 20_000).toBe(true);
    }
  });

  it("the heuristic bot only proposes legal actions", () => {
    let s = init("bot");
    for (let i = 0; i < 400 && !s.done; i++) {
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

  it("redact never reveals another seat's hand or the deck", () => {
    const s = init();
    const view = kentEngine.redact(s, 0) as KentState;
    expect(view.hands[0]).toEqual(s.hands[0]); // своята ръка е видима
    expect(view.hands[1]!.every((c) => c === "?")).toBe(true); // чужда ръка — скрита
    expect(view.deck.every((c) => c === "?")).toBe(true); // тестето — скрито
    expect(view.center).toEqual(s.center); // центърът е публичен
  });
});
