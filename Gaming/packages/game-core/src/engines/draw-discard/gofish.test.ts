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

describe("gofish: публичното знание от питанията и ботът", () => {
  it("пропуск записва „X няма ранг R“; вдигната карта го изтрива", () => {
    const s = base({ seats: 3, hands: [["7S", "2C"], ["3C", "4D"], ["7H"]], books: [0, 0, 0], ocean: ["9S", "8D"] });
    const miss = goFishEngine.reduce(s, { type: "ASK", target: 1, rank: "7" }, rng()).state;
    expect(miss.noRank).toEqual(["1:7"]);
    expect(miss.turn).toBe(1);
    // Играч 1 пита за тройка, няма такава у 0 и вдига 8♦ от морето: вече не е
    // сигурно, че няма седмица — а за играч 0 се знае, че няма тройка.
    const after = goFishEngine.reduce(miss, { type: "ASK", target: 0, rank: "3" }, rng()).state;
    expect(after.noRank).toEqual(["0:3"]);
  });

  it("който предаде всичките си карти от ранг R, със сигурност няма R", () => {
    const s = base({ hands: [["7S"], ["7H", "7D", "3C"]], ocean: ["9S"] });
    const n = goFishEngine.reduce(s, { type: "ASK", target: 1, rank: "7" }, rng()).state;
    expect(n.noRank).toContain("1:7");
  });

  it("ботът не повтаря питане, за което всички знаят, че е празно", () => {
    // Играч 1 има повече карти (ботът би го предпочел), но се знае, че няма 7.
    const s = base({
      seats: 3,
      hands: [["7S"], ["3C", "4D", "5H"], ["7H"]],
      books: [0, 0, 0],
      ocean: [],
      noRank: ["1:7"],
    });
    expect(goFishEngine.bot!(s, 0, rng())).toEqual({ type: "ASK", target: 2, rank: "7" });
  });

  it("четири бота винаги довършват играта — и с празно море (без безкраен цикъл)", () => {
    // Преди: ботът повтаряше едно и също неуспешно питане завинаги, щом морето
    // свърши — около всяка пета маса от четирима ботове не свършваше.
    for (let g = 0; g < 300; g++) {
      const r = rng(`gofish-bots-${g}`);
      const botRng = rng(`gofish-bots-${g}-b`);
      let s = goFishEngine.init({ seats: 4 }, r);
      let steps = 0;
      while (!s.done && steps < 2_000) {
        const a = goFishEngine.bot!(s, s.turn, botRng);
        expect(a, `игра ${g}: ботът няма ход`).not.toBeNull();
        s = goFishEngine.reduce(s, a!, r).state;
        steps++;
      }
      expect(s.done, `игра ${g} не свърши за ${steps} хода`).toBe(true);
      expect(s.books.reduce((x, y) => x + y, 0)).toBe(13);
    }
  });
});
