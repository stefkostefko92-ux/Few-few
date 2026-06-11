import { describe, expect, it } from "vitest";
import { distributePots, type HoldemState } from "./holdem.js";

/** Minimal state for distributePots: only contribution/fold/chips/seats matter. */
function stateWith(totalBet: number[], folded: boolean[]): HoldemState {
  const n = totalBet.length;
  return {
    hole: Array.from({ length: n }, () => []),
    community: [],
    deck: [],
    chips: new Array(n).fill(0),
    bet: new Array(n).fill(0),
    totalBet,
    folded,
    allIn: new Array(n).fill(false),
    pot: totalBet.reduce((a, b) => a + b, 0),
    currentBet: 0,
    lastRaise: 0,
    street: "river",
    turn: 0,
    button: 0,
    actedThisStreet: new Array(n).fill(true),
    seats: n,
    winner: null,
    done: false,
  };
}

describe("holdem side pots", () => {
  it("short all-in can only win the main pot; side pot goes to a bigger stack", () => {
    // Seat0 all-in 50, seat1 & seat2 contributed 200 each.
    // Main pot = 50*3 = 150 (all eligible). Side pot = 150*2 = 300 (seats 1,2).
    const state = stateWith([50, 200, 200], [false, false, false]);
    // Hand strength: seat0 best, then seat1, then seat2.
    const rank = (s: number) => (s === 0 ? 100 : s === 1 ? 50 : 10);
    const { state: out } = distributePots(state, rank, []);
    // Seat0 wins only the main pot (150). Seat1 wins the side pot (300).
    expect(out.chips[0]).toBe(150);
    expect(out.chips[1]).toBe(300);
    expect(out.chips[2]).toBe(0);
    // Conservation: all contributed chips are distributed.
    expect((out.chips[0] ?? 0) + (out.chips[1] ?? 0) + (out.chips[2] ?? 0)).toBe(450);
  });

  it("folded contributors add to the pot but cannot win it", () => {
    // Seat2 folded after contributing 200; seats 0,1 contest.
    const state = stateWith([200, 200, 200], [false, false, true]);
    const rank = (s: number) => (s === 0 ? 100 : s === 1 ? 50 : -1);
    const { state: out } = distributePots(state, rank, []);
    expect(out.chips[0]).toBe(600); // wins the whole 600
    expect(out.chips[1]).toBe(0);
    expect(out.chips[2]).toBe(0);
  });

  it("splits a tied pot evenly, odd chip to the earlier seat", () => {
    const state = stateWith([15, 15, 0], [false, false, true]);
    const rank = (s: number) => (s === 0 || s === 1 ? 100 : -1);
    const { state: out } = distributePots(state, rank, []);
    // pot 30 split: 15/15
    expect(out.chips[0]).toBe(15);
    expect(out.chips[1]).toBe(15);
  });
});
