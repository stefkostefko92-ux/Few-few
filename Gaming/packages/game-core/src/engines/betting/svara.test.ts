import { describe, expect, it } from "vitest";
import {
  svaraEngine,
  svaraPoints,
  MAX_HANDS_SVARA,
  svaraPots,
  svaraRaiseBounds,
  svaraRaisePresets,
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
    minRaise: 10,
    pots: [],
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

  it("две седмици = 23 (автентично) и бият чифт аса (22)", () => {
    expect(svaraPoints(["7H", "7S", "KD"])).toBe(23);
    expect(svaraPoints(["7C", "7H", "KD"])).toBe(23); // и с универсалната 7♣
    expect(svaraPoints(["7H", "7S", "KD"])).toBeGreaterThan(svaraPoints(["AH", "AS", "8D"]));
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

describe("СВАРА — край на мача при равни чипове", () => {
  it("равен максимум чипове [510,510,480] → [draw, draw, loss], без победител", () => {
    const pre = mk({
      hands: [["AH", "KH", "QH"], ["7S", "8D", "9C"], ["8S", "9D", "TC"]],
      chips: [480, 510, 480],
      pot: 30,
      handNo: MAX_HANDS_SVARA,
      turn: 2,
      acted: [true, true, false],
    });
    const { state, events } = svaraEngine.reduce(pre, { type: "CALL" }, rng());
    expect(state.done).toBe(true);
    expect(state.chips).toEqual([510, 510, 480]);
    expect(state.winner).toBe(null);
    expect(events.some((e) => e.type === "MATCH")).toBe(false);
    expect(svaraEngine.score(state).map((x) => x.result)).toEqual(["draw", "draw", "loss"]);
  });

  it("при равни чипове НЕ печели по-ниското място (2 играчи → реми)", () => {
    const pre = mk({
      hands: [["7S", "8D", "9C"], ["AH", "KH", "QH"]],
      chips: [500, 480],
      pot: 20,
      handNo: MAX_HANDS_SVARA,
      turn: 1,
      acted: [true, false],
    });
    const { state } = svaraEngine.reduce(pre, { type: "CALL" }, rng());
    expect(state.chips).toEqual([500, 500]);
    expect(svaraEngine.score(state).map((x) => x.result)).toEqual(["draw", "draw"]);
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

  it("изборът JOIN/SKIP върви по реда на хода — от мястото след раздаващия", () => {
    // Раздаващ 2; равни са местата 1 и 2 → първо решава място 3, после място 0.
    const pre = mk({
      hands: [["7H", "8S", "9D"], ["AH", "KH", "QH"], ["AS", "KS", "QS"], ["8H", "9S", "TD"]],
      dealer: 2,
      turn: 3,
      acted: [true, true, true, false],
    });
    const paused = svaraEngine.reduce(pre, { type: "CALL" }, rng()).state;
    expect(paused.svaraSeats).toEqual([1, 2]);
    const joinPhase = svaraEngine.reduce(paused, { type: "CONTINUE" }, rng()).state;
    expect(joinPhase.phase).toBe("SVARA");
    expect(joinPhase.svaraPending).toEqual([3, 0]);
    expect(joinPhase.turn).toBe(3);
    const after = svaraEngine.reduce(joinPhase, { type: "SKIP" }, rng()).state;
    expect(after.turn).toBe(0);
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
    expect(svaraEngine.bot!(s, 0, rng())?.type).toBe("RAISE");
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

const wins = (events: SvaraEvent[]) =>
  events.filter((e): e is Extract<SvaraEvent, { type: "WIN" }> => e.type === "WIN");
const total = (st: SvaraState) => st.chips.reduce((a, b) => a + b, 0) + st.pot;

describe("СВАРА — вдигане с избор на размер", () => {
  const base = () =>
    mk({ hands: [["AH", "KH", "QH"], ["7H", "8S", "9D"], ["8H", "9S", "TD"]], pot: 30 });

  it("legalActions дава мин / ½ пот / пот и ALLIN; минимумът е базовият залог", () => {
    const s = base(); // current 10, minRaise 10, pot 30, toCall 0
    expect(svaraRaiseBounds(s, 0)).toEqual({ min: 20, max: 500 });
    expect(svaraEngine.legalActions(s, 0)).toEqual([
      { type: "FOLD" },
      { type: "CALL" },
      { type: "RAISE", to: 20 },
      { type: "RAISE", to: 25 },
      { type: "RAISE", to: 40 },
      { type: "ALLIN" },
    ]);
    expect(svaraRaisePresets(s, 0)).toEqual({ min: 20, halfPot: 25, pot: 40, allIn: 500 });
  });

  it("validate приема произволен размер в границите и отхвърля извън тях", () => {
    const s = base();
    const v = (a: unknown) => svaraEngine.validate!(s, 0, a as never);
    expect(v({ type: "RAISE", to: 137 })).toBe(true);
    expect(v({ type: "RAISE", to: 500 })).toBe(true); // целият стек = all-in
    expect(v({ type: "RAISE", to: 19 })).toBe(false); // под минимума
    expect(v({ type: "RAISE", to: 501 })).toBe(false); // над стека
    expect(v({ type: "RAISE", to: 30.5 })).toBe(false);
    expect(v({ type: "RAISE", to: "40" })).toBe(false);
    expect(v({ type: "RAISE", to: 40, x: 1 })).toBe(false);
    expect(v({ type: "RAISE" })).toBe(false);
    expect(v({ type: "CALL" })).toBe(true);
    expect(v({ type: "CALL", to: 3 })).toBe(false);
    expect(svaraEngine.validate!(s, 1, { type: "CALL" })).toBe(false); // не е на ход
  });

  it("вдигането мести минимума: след вдигане с 50 следващото е поне +50", () => {
    const { state, events } = svaraEngine.reduce(base(), { type: "RAISE", to: 60 }, rng());
    expect(events).toContainEqual({ type: "RAISE", seat: 0, to: 60 });
    expect(state.current).toBe(60);
    expect(state.minRaise).toBe(50);
    expect(state.chips[0]).toBe(440);
    expect(svaraRaiseBounds(state, 1)).toEqual({ min: 110, max: 500 });
    expect(() => svaraEngine.reduce(state, { type: "RAISE", to: 100 }, rng())).toThrow();
  });

  it("къс стек: стига за изравняване, но не и за минимално вдигане → само ALLIN", () => {
    const s = mk({
      hands: [["AH", "KH", "QH"], ["7H", "8S", "9D"]],
      chips: [45, 400],
      bet: [10, 50],
      current: 50,
      minRaise: 40,
      pot: 60,
      acted: [true, true],
    });
    expect(svaraRaiseBounds(s, 0)).toBeNull();
    expect(svaraEngine.legalActions(s, 0)).toEqual([{ type: "FOLD" }, { type: "CALL" }, { type: "ALLIN" }]);
    const { state, events } = svaraEngine.reduce(s, { type: "ALLIN" }, rng());
    expect(events).toContainEqual({ type: "ALLIN", seat: 0, amount: 45, to: 55 });
    expect(state.current).toBe(55);
    expect(state.minRaise).toBe(40); // непълно вдигане не мести минимума
    expect(state.turn).toBe(1); // противникът трябва да отговори
  });
});

describe("СВАРА — all-in и странични потове", () => {
  it("all-in с по-малко: без CALL, само ALLIN/FOLD; излишъкът се връща", () => {
    const s = mk({
      hands: [["7H", "8S", "9D"], ["AH", "KH", "QH"]], // seat 1 е по-силен
      chips: [400, 30],
      bet: [100, 10],
      current: 100,
      pot: 110,
      turn: 1,
      acted: [true, false],
    });
    expect(svaraEngine.legalActions(s, 1)).toEqual([{ type: "FOLD" }, { type: "ALLIN" }]);
    const { state, events } = svaraEngine.reduce(s, { type: "ALLIN" }, rng());
    expect(events).toContainEqual({ type: "ALLIN", seat: 1, amount: 30, to: 40 });
    expect(state.phase).toBe("SHOWDOWN"); // никой друг не може да залага
    const w = wins(events);
    expect(w).toContainEqual({ type: "WIN", seat: 0, pot: 60, potIndex: 1, split: false });
    expect(w).toContainEqual({ type: "WIN", seat: 1, pot: 80 });
    expect(state.chips).toEqual([460, 80]);
    expect(state.pot).toBe(0);
    expect(total(state)).toBe(total(s) + 0);
  });

  it("два странични пота: всеки се печели от най-силния сред правоимащите", () => {
    const s = mk({
      hands: [
        ["AH", "AS", "AD"], // 33 — all-in 30
        ["AC", "KC", "QC"], // 31 — all-in 60
        ["7H", "8S", "9D"], // 9
        ["JH", "QH", "8D"], // 20
      ],
      chips: [0, 0, 200, 300],
      bet: [30, 60, 100, 10],
      current: 100,
      minRaise: 40,
      pot: 200,
      turn: 3,
      acted: [true, true, true, false],
    });
    expect(svaraPots({ ...s, bet: [30, 60, 100, 100], pot: 290 })).toEqual([
      { amount: 120, eligible: [0, 1, 2, 3] },
      { amount: 90, eligible: [1, 2, 3] },
      { amount: 80, eligible: [2, 3] },
    ]);
    const { state, events } = svaraEngine.reduce(s, { type: "CALL" }, rng());
    expect(state.phase).toBe("SHOWDOWN");
    const w = wins(events);
    expect(w).toContainEqual({ type: "WIN", seat: 0, pot: 120 });
    expect(w).toContainEqual({ type: "WIN", seat: 1, pot: 90, potIndex: 1, split: false });
    expect(w).toContainEqual({ type: "WIN", seat: 3, pot: 80, potIndex: 2, split: false });
    expect(state.chips).toEqual([120, 90, 200, 290]);
    expect(state.winner).toBe(0);
    expect(total(state)).toBe(total(s));
  });

  it("равенство в страничен пот: дели се поравно, нечетният чип по реда на хода", () => {
    const s = mk({
      hands: [
        ["AH", "AS", "AD"], // 33 — all-in 30
        ["KH", "QH", "8D"], // 20
        ["KS", "QS", "8C"], // 20
      ],
      chips: [0, 300, 300],
      bet: [30, 81, 30],
      current: 81,
      minRaise: 51,
      pot: 141,
      dealer: 1,
      turn: 2,
      acted: [true, true, true],
    });
    const { state, events } = svaraEngine.reduce(s, { type: "CALL" }, rng());
    const w = wins(events);
    // Странично: (81−30)×2 = 102 → 51/51; основно 90 → seat 0.
    expect(w).toContainEqual({ type: "WIN", seat: 1, pot: 51, potIndex: 1, split: true });
    expect(w).toContainEqual({ type: "WIN", seat: 2, pot: 51, potIndex: 1, split: true });
    expect(w).toContainEqual({ type: "WIN", seat: 0, pot: 90 });
    expect(total(state)).toBe(total(s));

    // Нечетен страничен пот (101 за двама, с мъртви пари от паснал): допълнителният
    // чип отива на първия по реда на хода след раздаващия.
    const odd = mk({
      hands: [["AH", "AS", "AD"], ["KH", "QH", "8D"], ["KS", "QS", "8C"], ["7H", "8S", "9D"]],
      chips: [0, 300, 300, 300],
      bet: [30, 80, 29, 31],
      folded: [false, false, false, true],
      current: 80,
      minRaise: 50,
      pot: 170,
      dealer: 1,
      turn: 2,
      acted: [true, true, false, true],
    });
    const r2 = svaraEngine.reduce(odd, { type: "CALL" }, rng());
    expect(r2.state.phase).toBe("SHOWDOWN");
    expect(wins(r2.events).filter((e) => e.potIndex === 1)).toEqual([
      { type: "WIN", seat: 2, pot: 51, potIndex: 1, split: true },
      { type: "WIN", seat: 1, pot: 50, potIndex: 1, split: true },
    ]);
    expect(wins(r2.events)).toContainEqual({ type: "WIN", seat: 0, pot: 120 });
    expect(total(r2.state)).toBe(total(odd));
  });

  it("свара след all-in: равенство за основния пот → под-игра, all-in играчът е вътре", () => {
    const s = mk({
      hands: [
        ["AH", "KH", "QH"], // 31 — all-in 40
        ["AS", "KS", "QS"], // 31
        ["7H", "8S", "9D"], // 9
      ],
      chips: [0, 300, 50],
      bet: [40, 100, 40],
      current: 100,
      minRaise: 60,
      pot: 180,
      turn: 2,
      acted: [true, true, true],
    });
    expect(svaraEngine.legalActions(s, 2)).toEqual([{ type: "FOLD" }, { type: "ALLIN" }]);
    const { state: paused, events } = svaraEngine.reduce(s, { type: "ALLIN" }, rng());
    // Странични: 90..100 → seat 1 (10, сам); 40..90 → seat 1 (100, 31 срещу 9).
    expect(wins(events)).toContainEqual({ type: "WIN", seat: 1, pot: 10, potIndex: 2, split: false });
    expect(wins(events)).toContainEqual({ type: "WIN", seat: 1, pot: 100, potIndex: 1, split: false });
    expect(events).toContainEqual({ type: "SVARA", seats: [0, 1], pot: 120 });
    expect(paused.phase).toBe("SHOWDOWN");
    expect(paused.svaraSeats).toEqual([0, 1]);
    expect(paused.svaraFee).toBe(120);
    expect(paused.pot).toBe(120);
    expect(paused.pots).toEqual([{ amount: 120, eligible: [0, 1] }]);
    expect(paused.chips).toEqual([0, 410, 0]);
    expect(total(paused)).toBe(total(s));

    // Под-играта: all-in играчът (0 чипа) участва безплатно; никой друг не може
    // да залага срещу него → направо showdown за пренесения пот.
    const sub = svaraEngine.reduce(paused, { type: "CONTINUE" }, rng());
    expect(sub.state.folded).toEqual([false, false, true]);
    expect(sub.state.hands[0]).toHaveLength(3);
    expect(sub.events.some((e) => e.type === "SHOWDOWN" && e.seat === 0)).toBe(true);
    expect(sub.state.phase).toBe("SHOWDOWN");
    expect(total(sub.state)).toBe(total(s));
    const potWins = wins(sub.events);
    if (potWins.length > 0) expect(potWins.reduce((a, e) => a + e.pot, 0)).toBe(120);
    else expect(sub.state.svaraSeats).toEqual([0, 1]); // нова свара
  });

  it("all-in вдигане не е позволено, ако всички останали вече са all-in", () => {
    const s = mk({
      hands: [["AH", "KH", "QH"], ["7H", "8S", "9D"], ["8H", "9S", "TD"]],
      chips: [0, 300, 200],
      bet: [60, 10, 60],
      current: 60,
      folded: [false, false, true],
      pot: 130,
      turn: 1,
      acted: [true, false, true],
    });
    expect(svaraEngine.legalActions(s, 1)).toEqual([{ type: "FOLD" }, { type: "CALL" }]);
    expect(() => svaraEngine.reduce(s, { type: "ALLIN" }, rng())).toThrow();
  });

  it("all-in играч не получава ход; validate приема всеки легален ход (произволни мачове)", () => {
    for (const seed of ["a", "b", "c"]) {
      const m = new SeededRng(`svara-allin-${seed}`);
      const pick = new SeededRng(`svara-allin-pick-${seed}`);
      let st = svaraEngine.init({ seats: 4 }, m);
      const t0 = total(st);
      for (let i = 0; i < 600 && !st.done; i++) {
        const seat = [0, 1, 2, 3].find((x) => svaraEngine.legalActions(st, x).length > 0);
        if (seat === undefined) break;
        const acts = svaraEngine.legalActions(st, seat);
        for (const a of acts) expect(svaraEngine.validate!(st, seat, a)).toBe(true);
        if (st.phase === "BETTING") expect(st.chips[seat]).toBeGreaterThan(0);
        // Предпочитай ALLIN по-често, за да има много странични потове.
        const allin = acts.find((a) => a.type === "ALLIN");
        const a = allin && pick.next() < 0.3 ? allin : acts[pick.int(acts.length)]!;
        st = svaraEngine.reduce(st, a, m).state;
        expect(total(st)).toBe(t0);
        expect(st.chips.every((c) => c >= 0)).toBe(true);
        if (st.phase === "BETTING") expect(st.pots.reduce((x, p) => x + p.amount, 0)).toBe(st.pot);
      }
    }
  });
});

describe("СВАРА — ботът и all-in", () => {
  const facing = (hand: string[]) =>
    mk({
      hands: [hand, ["AH", "AS", "AD"]],
      chips: [30, 300],
      bet: [10, 100],
      current: 100,
      pot: 110,
      acted: [false, true],
    });

  it("със силна ръка срещу по-голям залог влиза all-in", () => {
    expect(svaraEngine.bot!(facing(["AC", "KC", "QC"]), 0, rng())).toEqual({ type: "ALLIN" });
  });

  it("със слаба ръка срещу по-голям залог бяга", () => {
    expect(svaraEngine.bot!(facing(["7H", "8S", "QD"]), 0, rng())).toEqual({ type: "FOLD" });
  });

  it("с чудовище вдига най-големия наличен размер", () => {
    const s = mk({ hands: [["AH", "AS", "AD"], ["7H", "8S", "9D"]] });
    const legal = svaraEngine.legalActions(s, 0).filter((a) => a.type === "RAISE");
    expect(svaraEngine.bot!(s, 0, rng())).toEqual(legal[legal.length - 1]);
  });
});
