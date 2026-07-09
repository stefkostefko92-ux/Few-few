import { describe, expect, it } from "vitest";
import {
  svaraEngine,
  svaraPoints,
  MAX_HANDS_SVARA,
  type SvaraState,
  type SvaraEvent,
} from "./svara.js";
import { SeededRng } from "../../kernel/rng.js";
import { rankOf, type Card } from "../cards.js";

const rng = () => new SeededRng("svara-test");

/** Craft a mid-hand state (defaults: everyone anted 10 into the pot). */
function mk(partial: Partial<SvaraState> & { hands: Card[][] }): SvaraState {
  const seats = partial.hands.length;
  return {
    chips: new Array<number>(seats).fill(490),
    bet: new Array<number>(seats).fill(10),
    folded: new Array<boolean>(seats).fill(false),
    acted: new Array<boolean>(seats).fill(false),
    pot: 10 * seats,
    current: 10,
    turn: 0,
    seats,
    dealer: 0,
    handNo: 1,
    phase: "BETTING",
    svaraSeats: null,
    svaraFee: 0,
    svaraPending: [],
    svaraJoined: [],
    winner: null,
    done: false,
    ...partial,
  };
}

describe("СВАРА — точкуване на ръката (svaraPoints)", () => {
  it("три седмици са най-силната ръка: 34", () => {
    expect(svaraPoints(["7C", "7H", "7S"])).toBe(34);
  });

  it("три еднакви ранга = стойност×3 (три аса = 33)", () => {
    expect(svaraPoints(["AH", "AS", "AD"])).toBe(33);
    expect(svaraPoints(["KH", "KS", "KD"])).toBe(30);
    expect(svaraPoints(["9H", "9S", "9D"])).toBe(27);
  });

  it("сумира само карти от една боя (A=11, 10/J/Q/K=10)", () => {
    expect(svaraPoints(["AH", "KH", "QH"])).toBe(31);
    expect(svaraPoints(["JH", "QH", "KH"])).toBe(30);
    expect(svaraPoints(["AH", "KH", "9S"])).toBe(21); // 9-ката е друга боя
  });

  it("чифт по ранг се сумира (две деветки = 18, два аса = 22)", () => {
    expect(svaraPoints(["9H", "9S", "KD"])).toBe(18);
    expect(svaraPoints(["AH", "AS", "8D"])).toBe(22);
    expect(svaraPoints(["8H", "8S", "AD"])).toBe(16); // чифтът бие сингъл аса
  });

  it("без комбинация важи най-високата единична карта", () => {
    expect(svaraPoints(["7H", "8S", "QD"])).toBe(10);
    expect(svaraPoints(["7H", "9S", "AD"])).toBe(11);
  });

  it("7♣ е универсална: 11 към всяка боя, всеки чифт или сама", () => {
    expect(svaraPoints(["AH", "KH", "7C"])).toBe(32); // 11+10 купи + 11 wild
    expect(svaraPoints(["AH", "AS", "7C"])).toBe(33); // чифт аса + 7♣ = три аса
    expect(svaraPoints(["7C", "8H", "9S"])).toBe(20); // 9♠ + 7♣
    expect(svaraPoints(["7C", "AC", "KC"])).toBe(32); // в спатии влиза с 11
  });
});

describe("СВАРА — 32-картова колода и раздаване", () => {
  it("раздава само карти 7–A (без 2–6)", () => {
    const s = svaraEngine.init({ seats: 6 }, new SeededRng("svara-deck"));
    const all = s.hands.flat();
    expect(all).toHaveLength(18);
    expect(new Set(all).size).toBe(18); // без дубликати
    const legalRanks = new Set(["7", "8", "9", "T", "J", "Q", "K", "A"]);
    for (const c of all) expect(legalRanks.has(rankOf(c))).toBe(true);
  });

  it("началната ръка ротира от раздаващия: dealer 0, пръв говори seat 1", () => {
    const s = svaraEngine.init({ seats: 4 }, new SeededRng("svara-deal"));
    expect(s.dealer).toBe(0);
    expect(s.turn).toBe(1);
    expect(s.handNo).toBe(1);
    expect(s.pot).toBe(40);
    expect(s.current).toBe(10);
  });
});

describe("СВАРА — opening betting round", () => {
  it("does not resolve after the first CALL (everyone must act)", () => {
    const s = svaraEngine.init({ seats: 4 }, new SeededRng("svara-open"));
    const actor = s.turn;
    // All seats start at the ANTE, so bets are already 'matched' — the opening
    // CALL must NOT trigger a showdown before the other seats act (regression).
    const { state, events } = svaraEngine.reduce(s, { type: "CALL" }, rng());
    expect(events.some((e) => e.type === "SHOWDOWN")).toBe(false);
    expect(events.some((e) => e.type === "HAND")).toBe(false);
    expect(state.done).toBe(false);
    expect(state.phase).toBe("BETTING");
    expect(state.turn).not.toBe(actor); // turn advanced to another seat
    expect(state.acted[actor]).toBe(true);
    expect(state.acted.filter((a) => a)).toHaveLength(1);
  });

  it("resolves only once every active seat has acted", () => {
    let s = svaraEngine.init({ seats: 3 }, new SeededRng("svara-all"));
    let resolved = false;
    for (let i = 0; i < 3; i++) {
      const r = svaraEngine.reduce(s, { type: "CALL" }, rng());
      s = r.state;
      if (r.events.some((e) => e.type === "SHOWDOWN" || e.type === "WIN")) resolved = true;
    }
    // After all three call the opening level, the hand resolves.
    expect(resolved).toBe(true);
    expect(s.phase).toBe("SHOWDOWN");
  });
});

describe("СВАРА — showdown, разкриване и продължаване", () => {
  const showdownState = () =>
    mk({
      hands: [["AH", "KH", "QH"], ["7S", "8D", "9C"]], // 31 срещу 9
      turn: 1,
      acted: [true, false],
    });

  it("по-голямата сума печели пота и ръката спира в SHOWDOWN пауза", () => {
    const { state, events } = svaraEngine.reduce(showdownState(), { type: "CALL" }, rng());
    expect(events.some((e) => e.type === "WIN" && e.seat === 0 && e.pot === 20)).toBe(true);
    expect(state.phase).toBe("SHOWDOWN");
    expect(state.done).toBe(false);
    expect(state.winner).toBe(0);
    expect(state.chips[0]).toBe(510);
    expect(state.pot).toBe(0);
  });

  it("SHOWDOWN събитията носят картите и точките", () => {
    const { events } = svaraEngine.reduce(showdownState(), { type: "CALL" }, rng());
    const shows = events.filter((e): e is Extract<SvaraEvent, { type: "SHOWDOWN" }> => e.type === "SHOWDOWN");
    expect(shows).toHaveLength(2);
    expect(shows[0]).toEqual({ type: "SHOWDOWN", seat: 0, hand: ["AH", "KH", "QH"], points: 31 });
    expect(shows[1]!.points).toBe(9);
  });

  it("redact разкрива всички непаснали ръце по време на SHOWDOWN", () => {
    const pre = showdownState();
    expect(svaraEngine.redact(pre, 1).hands[0]).toEqual(["?", "?", "?"]);
    const { state } = svaraEngine.reduce(pre, { type: "CALL" }, rng());
    expect(svaraEngine.redact(state, 1).hands[0]).toEqual(["AH", "KH", "QH"]);
    expect(svaraEngine.redact(state, 0).hands[1]).toEqual(["7S", "8D", "9C"]);
  });

  it("паснала ръка остава скрита и на showdown (блъфът се пази)", () => {
    const pre = mk({
      hands: [["AH", "KH", "QH"], ["7S", "8D", "9C"], ["AS", "AD", "AC"]],
      folded: [false, false, true],
      acted: [true, false, true],
      turn: 1,
    });
    const { state, events } = svaraEngine.reduce(pre, { type: "CALL" }, rng());
    expect(events.some((e) => e.type === "SHOWDOWN" && e.seat === 2)).toBe(false);
    expect(svaraEngine.redact(state, 0).hands[2]).toEqual(["?", "?", "?"]);
  });

  it("CONTINUE раздава нова ръка: анте, ротация на раздаващия, нов ред", () => {
    const paused = svaraEngine.reduce(showdownState(), { type: "CALL" }, rng()).state;
    // Всяко място може да продължи от паузата.
    expect(svaraEngine.legalActions(paused, 0)).toEqual([{ type: "CONTINUE" }]);
    expect(svaraEngine.legalActions(paused, 1)).toEqual([{ type: "CONTINUE" }]);
    const { state, events } = svaraEngine.reduce(paused, { type: "CONTINUE" }, rng());
    expect(events.some((e) => e.type === "HAND" && e.handNo === 2)).toBe(true);
    expect(state.handNo).toBe(2);
    expect(state.phase).toBe("BETTING");
    expect(state.dealer).toBe(1); // ротация 0 → 1
    expect(state.turn).toBe(0); // пръв говори следващият след раздаващия
    expect(state.pot).toBe(20);
    expect(state.current).toBe(10);
    expect(state.hands.every((h) => h.length === 3)).toBe(true);
  });

  it("победа с фолдове раздава веднага и НЕ разкрива ръката на победителя", () => {
    const s = svaraEngine.init({ seats: 2 }, new SeededRng("svara-fold"));
    const { state, events } = svaraEngine.reduce(s, { type: "FOLD" }, rng());
    expect(events.some((e) => e.type === "WIN")).toBe(true);
    expect(events.some((e) => e.type === "SHOWDOWN")).toBe(false);
    expect(events.some((e) => e.type === "HAND" && e.handNo === 2)).toBe(true);
    expect(state.handNo).toBe(2);
    expect(state.dealer).toBe(1);
    expect(state.phase).toBe("BETTING");
  });

  it("мачът свършва на тавана от ръце с най-богатия като победител", () => {
    const pre = mk({
      hands: [["AH", "KH", "QH"], ["7S", "8D", "9C"]],
      chips: [700, 260],
      pot: 20,
      handNo: MAX_HANDS_SVARA,
      turn: 1,
      acted: [true, false],
    });
    const { state, events } = svaraEngine.reduce(pre, { type: "CALL" }, rng());
    expect(state.done).toBe(true);
    expect(state.winner).toBe(0);
    expect(events.some((e) => e.type === "MATCH" && e.seat === 0)).toBe(true);
    expect(svaraEngine.score(state)[0]!.result).toBe("win");
  });
});

describe("СВАРА — механиката 'свара' при равенство", () => {
  const tiedState = () =>
    mk({
      hands: [["AH", "KH", "QH"], ["AS", "KS", "QS"]], // 31 срещу 31
      turn: 1,
      acted: [true, false],
    });

  it("равни най-силни ръце обявяват СВАРА: потът остава, никой не печели", () => {
    const { state, events } = svaraEngine.reduce(tiedState(), { type: "CALL" }, rng());
    expect(events.some((e) => e.type === "WIN")).toBe(false);
    const sv = events.find((e): e is Extract<SvaraEvent, { type: "SVARA" }> => e.type === "SVARA");
    expect(sv).toEqual({ type: "SVARA", seats: [0, 1], pot: 20 });
    expect(state.phase).toBe("SHOWDOWN");
    expect(state.svaraSeats).toEqual([0, 1]);
    expect(state.svaraFee).toBe(20); // вноската = потът при обявяването
    expect(state.pot).toBe(20);
    expect(state.done).toBe(false);
  });

  it("под-играта: потът се пренася, без анте, залагането тръгва от чек", () => {
    const paused = svaraEngine.reduce(tiedState(), { type: "CALL" }, rng()).state;
    const { state, events } = svaraEngine.reduce(paused, { type: "CONTINUE" }, rng());
    expect(events.some((e) => e.type === "HAND" && e.handNo === 2)).toBe(true);
    expect(state.phase).toBe("BETTING");
    expect(state.pot).toBe(20); // пренесен пот
    expect(state.current).toBe(0); // без анте
    expect(state.bet).toEqual([0, 0]);
    expect(state.folded).toEqual([false, false]);
    expect(state.hands[0]).toHaveLength(3);
    expect(state.chips).toEqual([490, 490]); // никой не е плащал наново
  });

  it("неравен играч може да се включи срещу вноската (JOIN)", () => {
    const pre = mk({
      hands: [["AH", "KH", "QH"], ["AS", "KS", "QS"], ["7H", "8S", "9D"]],
      turn: 2,
      acted: [true, true, false],
    });
    const paused = svaraEngine.reduce(pre, { type: "CALL" }, rng()).state;
    expect(paused.svaraSeats).toEqual([0, 1]);
    const joinPhase = svaraEngine.reduce(paused, { type: "CONTINUE" }, rng()).state;
    expect(joinPhase.phase).toBe("SVARA");
    expect(joinPhase.turn).toBe(2);
    expect(svaraEngine.legalActions(joinPhase, 2)).toEqual([{ type: "JOIN" }, { type: "SKIP" }]);
    expect(svaraEngine.legalActions(joinPhase, 0)).toEqual([]); // равните чакат

    const { state, events } = svaraEngine.reduce(joinPhase, { type: "JOIN" }, rng());
    expect(events.some((e) => e.type === "JOIN" && e.seat === 2 && e.fee === 30)).toBe(true);
    expect(state.chips[2]).toBe(460); // плати вноската (пот 30)
    expect(state.pot).toBe(60); // пренесен пот + вноската
    expect(state.folded).toEqual([false, false, false]); // включен в под-играта
    expect(state.hands[2]).toHaveLength(3);
    expect(state.phase).toBe("BETTING");
  });

  it("SKIP оставя неравния извън под-играта", () => {
    const pre = mk({
      hands: [["AH", "KH", "QH"], ["AS", "KS", "QS"], ["7H", "8S", "9D"]],
      turn: 2,
      acted: [true, true, false],
    });
    const paused = svaraEngine.reduce(pre, { type: "CALL" }, rng()).state;
    const joinPhase = svaraEngine.reduce(paused, { type: "CONTINUE" }, rng()).state;
    const { state } = svaraEngine.reduce(joinPhase, { type: "SKIP" }, rng());
    expect(state.folded).toEqual([false, false, true]);
    expect(state.hands[2]).toEqual([]);
    expect(state.pot).toBe(30); // само пренесеният пот
    expect(state.chips[2]).toBe(490);
  });

  it("чиповете + потът се запазват през целия мач (инвариант)", () => {
    const seats = 4;
    const total = seats * 500;
    const matchRng = new SeededRng("svara-conserve");
    const botRng = new SeededRng("svara-conserve-bot");
    let s = svaraEngine.init({ seats }, matchRng);
    for (let i = 0; i < 800 && !s.done; i++) {
      let action = null;
      for (let seat = 0; seat < seats; seat++) {
        const actions = svaraEngine.legalActions(s, seat);
        if (actions.length > 0) {
          action = actions[botRng.int(actions.length)]!;
          break;
        }
      }
      if (!action) break;
      s = svaraEngine.reduce(s, action, matchRng).state;
      expect(s.chips.reduce((a, b) => a + b, 0) + s.pot).toBe(total);
    }
  });
});

describe("СВАРА — евристичен бот", () => {
  it("вдига със силна ръка", () => {
    const s = mk({ hands: [["7C", "AC", "KC"], ["7H", "8S", "9D"]] }); // 32 точки
    expect(svaraEngine.bot!(s, 0, rng())).toEqual({ type: "RAISE" });
  });

  it("бяга със слаба ръка срещу залог", () => {
    const s = mk({
      hands: [["7H", "8S", "QD"], ["AH", "AS", "AD"]], // 10 точки
      current: 30,
      bet: [10, 30],
    });
    expect(svaraEngine.bot!(s, 0, rng())).toEqual({ type: "FOLD" });
  });

  it("никога не бяга при безплатен чек", () => {
    const s = mk({ hands: [["7H", "8S", "QD"], ["AH", "AS", "AD"]] }); // toCall = 0
    expect(svaraEngine.bot!(s, 0, rng())).toEqual({ type: "CALL" });
  });

  it("играе само легални ходове до края на мача", () => {
    const matchRng = new SeededRng("svara-bot-match");
    const botRng = new SeededRng("svara-bot-bot");
    let s = svaraEngine.init({ seats: 4 }, matchRng);
    let steps = 0;
    while (!s.done && steps < 5000) {
      let acted = false;
      for (let seat = 0; seat < 4; seat++) {
        const actions = svaraEngine.legalActions(s, seat);
        if (actions.length === 0) continue;
        const choice = svaraEngine.bot!(s, seat, botRng) ?? actions[0]!;
        expect(actions.map((a) => JSON.stringify(a))).toContain(JSON.stringify(choice));
        s = svaraEngine.reduce(s, choice, matchRng).state;
        acted = true;
        break;
      }
      if (!acted) break;
      steps++;
    }
    expect(s.done).toBe(true);
  });
});
