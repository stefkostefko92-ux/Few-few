import { describe, expect, it } from "vitest";
import { SeededRng } from "../../kernel/rng.js";
import {
  CATEGORIES,
  UPPER_BONUS,
  diceEngine,
  scoreCategory,
  totalOf,
  upperTotal,
  type Category,
  type DiceAction,
  type DiceState,
} from "./dice.js";

const init = () => diceEngine.init({ seats: 2 }, new SeededRng("dice"));

describe("dice Yahtzee bonus", () => {
  it("awards +100 for a second Yahtzee once the 50 box is filled", () => {
    // seat 0 already scored the Yahtzee box as 50; rolls five 5s again and
    // parks them in the fives box — should bank a +100 Yahtzee bonus.
    const s: DiceState = {
      ...diceEngine.init({ seats: 2 }, new SeededRng("y")),
      dice: [5, 5, 5, 5, 5],
      rolledThisTurn: true,
      scores: [{ yahtzee: 50 }, {}],
    };
    const out = diceEngine.reduce(s, { type: "SCORE", category: "fives" }, new SeededRng("y"));
    expect(out.state.bonusYahtzee[0]).toBe(100);
    expect(out.events.some((e) => e.type === "YAHTZEE_BONUS")).toBe(true);
  });

  it("gives no bonus for the FIRST Yahtzee (box not yet 50)", () => {
    const s: DiceState = {
      ...diceEngine.init({ seats: 2 }, new SeededRng("y2")),
      dice: [3, 3, 3, 3, 3],
      rolledThisTurn: true,
    };
    const out = diceEngine.reduce(s, { type: "SCORE", category: "yahtzee" }, new SeededRng("y2"));
    expect(out.state.bonusYahtzee[0]).toBe(0);
  });
});

/** A mid-turn state: `seat` to act, dice rolled, given rerolls left. */
function rolled(dice: number[], opts: Partial<DiceState> = {}): DiceState {
  return {
    ...init(),
    dice: dice.slice(),
    rolledThisTurn: true,
    rerollsLeft: 2,
    ...opts,
  };
}

/** Fill a sheet with 0 in every category except the given overrides. */
function sheet(over: Partial<Record<Category, number>> = {}): Partial<Record<Category, number>> {
  const s: Partial<Record<Category, number>> = {};
  for (const c of CATEGORIES) s[c] = 0;
  return { ...s, ...over };
}

/** The room's stable, key-order-independent serialization (room.ts) — used to
 *  imitate its legality check for engines without a validate hook. */
function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(",")}}`;
}

/** Exactly what GameRoom.onAction does before reducing (room.ts:156-160). */
function roomAccepts(state: DiceState, seat: number, action: DiceAction): boolean {
  return diceEngine.validate
    ? diceEngine.validate(state, seat, action)
    : diceEngine.legalActions(state, seat).some((l) => stable(l) === stable(action));
}

describe("dice scoring", () => {
  it("scores the combination categories", () => {
    expect(scoreCategory([2, 2, 3, 3, 3], "fullHouse")).toBe(25);
    expect(scoreCategory([1, 2, 3, 4, 6], "smallStraight")).toBe(30);
    expect(scoreCategory([2, 3, 4, 5, 6], "largeStraight")).toBe(40);
    expect(scoreCategory([4, 4, 4, 4, 4], "yahtzee")).toBe(50);
    expect(scoreCategory([4, 4, 4, 4, 2], "fourKind")).toBe(18);
    expect(scoreCategory([1, 2, 3, 4, 5], "chance")).toBe(15);
    expect(scoreCategory([6, 6, 1, 2, 3], "sixes")).toBe(12);
    expect(scoreCategory([1, 2, 2, 4, 5], "threeKind")).toBe(0);
  });

  it("adds the +35 upper bonus at 63+", () => {
    const under = sheet({ ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 17 }); // 62
    const over = sheet({ ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 }); // 63
    expect(upperTotal(under)).toBe(62);
    expect(totalOf(under)).toBe(62);
    expect(upperTotal(over)).toBe(63);
    expect(totalOf(over)).toBe(63 + UPPER_BONUS);
  });
});

describe("dice validate (room legality path)", () => {
  it("accepts the view's ROLL-with-hold payload the way the room checks it", () => {
    // Regression: the web view always sends { type:"ROLL", hold:[...] }. Without
    // a validate hook the room's stable() equality rejected it (legalActions
    // only enumerates the bare { type:"ROLL" }) and nobody could roll.
    const s = init();
    const viewAction: DiceAction = { type: "ROLL", hold: [false, false, false, false, false] };
    expect(diceEngine.legalActions(s, 0)).toContainEqual({ type: "ROLL" });
    expect(roomAccepts(s, 0, viewAction)).toBe(true);
    expect(roomAccepts(s, 0, { type: "ROLL" })).toBe(true);
    expect(roomAccepts(s, 0, { type: "ROLL", hold: [true, false, true, false, true] })).toBe(true);
  });

  it("rejects out-of-turn, exhausted and malformed actions", () => {
    const s = init();
    expect(roomAccepts(s, 1, { type: "ROLL" })).toBe(false); // not their turn
    const spent = rolled([1, 2, 3, 4, 5], { rerollsLeft: 0 });
    expect(roomAccepts(spent, 0, { type: "ROLL" })).toBe(false); // no rerolls left
    const badHold = { type: "ROLL", hold: [1, 0, 1, 0, 1] } as unknown as DiceAction;
    expect(roomAccepts(s, 0, badHold)).toBe(false); // non-boolean mask
    const longHold = { type: "ROLL", hold: [false, false, false, false, false, false] };
    expect(roomAccepts(s, 0, longHold as DiceAction)).toBe(false); // 6 entries
  });

  it("validates SCORE against the open categories", () => {
    const s = rolled([2, 2, 3, 3, 3]);
    s.scores[0]!.chance = 12;
    expect(roomAccepts(s, 0, { type: "SCORE", category: "fullHouse" })).toBe(true);
    expect(roomAccepts(s, 0, { type: "SCORE", category: "chance" })).toBe(false); // used
    expect(roomAccepts(init(), 0, { type: "SCORE", category: "ones" })).toBe(false); // not rolled
    const bad = { type: "SCORE", category: "jackpot" } as unknown as DiceAction;
    expect(roomAccepts(s, 0, bad)).toBe(false);
  });
});

describe("dice reduce", () => {
  it("keeps held dice and exposes the hold mask in state", () => {
    const rng = new SeededRng("dice-hold");
    let s = init();
    s = diceEngine.reduce(s, { type: "ROLL", hold: [true, true, true, true, true] }, rng).state;
    // First roll of a turn tumbles everything — holds only apply to re-rolls.
    expect(s.held).toEqual([false, false, false, false, false]);
    expect(s.dice.every((d) => d >= 1 && d <= 6)).toBe(true);

    const before = s.dice.slice();
    s = diceEngine.reduce(s, { type: "ROLL", hold: [true, false, true, false, false] }, rng).state;
    expect(s.held).toEqual([true, false, true, false, false]); // opponents can see the holds
    expect(s.dice[0]).toBe(before[0]);
    expect(s.dice[2]).toBe(before[2]);
    expect(s.rerollsLeft).toBe(1);

    s = diceEngine.reduce(s, { type: "SCORE", category: "chance" }, rng).state;
    expect(s.held).toEqual([false, false, false, false, false]); // reset for the next turn
    expect(s.turn).toBe(1);
  });

  it("ends in a DRAW (not two wins) on equal totals", () => {
    const s = rolled([1, 1, 1, 1, 1], { turn: 1 });
    s.scores[0] = sheet({ chance: 5 });
    s.scores[1] = sheet({ chance: undefined }); // only chance open, dice sum = 5
    delete s.scores[1]!.chance;
    const { state, events } = diceEngine.reduce(
      s,
      { type: "SCORE", category: "chance" },
      new SeededRng("draw"),
    );
    expect(state.done).toBe(true);
    expect(state.winner).toBeNull();
    expect(events).toContainEqual({ type: "DRAW", seats: [0, 1] });
    expect(events.some((e) => e.type === "WIN")).toBe(false);
    expect(diceEngine.score(state)).toEqual([
      { seat: 0, result: "draw", points: 5 },
      { seat: 1, result: "draw", points: 5 },
    ]);
  });

  it("declares a single winner by bonus-inclusive total", () => {
    const s = rolled([1, 1, 1, 1, 2], { turn: 1 });
    // Seat 0 holds a 63 upper section → 63 + 35 bonus = 98 total.
    s.scores[0] = sheet({ ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 });
    // Seat 1 would win on raw sum (97) but loses to the bonus.
    s.scores[1] = sheet({ chance: undefined, yahtzee: 50, fourKind: 41 });
    delete s.scores[1]!.chance;
    const { state, events } = diceEngine.reduce(
      s,
      { type: "SCORE", category: "chance" }, // 6 points → 97 total
      new SeededRng("bonus-win"),
    );
    expect(state.done).toBe(true);
    expect(state.winner).toBe(0);
    expect(events).toContainEqual({ type: "WIN", seat: 0 });
    expect(diceEngine.score(state)).toEqual([
      { seat: 0, result: "win", points: 98 },
      { seat: 1, result: "loss", points: 97 },
    ]);
  });
});

describe("dice bot", () => {
  it("rolls first, then banks a made combination", () => {
    expect(diceEngine.bot!(init(), 0, new SeededRng("b"))).toEqual({ type: "ROLL" });
    const made = rolled([4, 4, 4, 4, 4]);
    expect(diceEngine.bot!(made, 0, new SeededRng("b"))).toEqual({
      type: "SCORE",
      category: "yahtzee",
    });
  });

  it("holds the most frequent face when chasing", () => {
    const s = rolled([3, 3, 1, 2, 5]);
    const a = diceEngine.bot!(s, 0, new SeededRng("b"));
    expect(a).toEqual({ type: "ROLL", hold: [true, true, false, false, false] });
    // Whatever the bot proposes must pass the same check the room applies.
    expect(roomAccepts(s, 0, a!)).toBe(true);
  });

  it("scores the best open category when rerolls are spent", () => {
    const s = rolled([6, 6, 2, 3, 1], { rerollsLeft: 0 });
    expect(diceEngine.bot!(s, 0, new SeededRng("b"))).toEqual({
      type: "SCORE",
      category: "chance", // 18 beats sixes (12) and everything else
    });
    expect(diceEngine.bot!(s, 1, new SeededRng("b"))).toBeNull(); // not their turn
  });
});
