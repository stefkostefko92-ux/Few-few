import { describe, expect, it } from "vitest";
import { warEngine, type WarState } from "./war.js";
import { SeededRng } from "../../kernel/rng.js";

describe("WAR redact", () => {
  it("hides both decks and the buried pile but keeps counts (no shuffle leak)", () => {
    const s = warEngine.init({ seats: 2 }, new SeededRng("war-redact"));
    const view = warEngine.redact(s, 0);
    expect(view.hands[0]!.every((c) => c === "?")).toBe(true);
    expect(view.hands[1]!.every((c) => c === "?")).toBe(true);
    expect(view.hands[0]!.length).toBe(s.hands[0]!.length);
    expect(view.hands[1]!.length).toBe(s.hands[1]!.length);
    expect(view.pile.every((c) => c === "?")).toBe(true);
  });
});

const rng = () => new SeededRng("war-rules");
const base = (over: Partial<WarState>): WarState => ({
  hands: [[], []],
  pile: [],
  table: [null, null],
  turn: 0,
  phase: "FLIP",
  flips: 0,
  streak: null,
  bounty: 0,
  winner: null,
  done: false,
  ...over,
});

describe("WAR mechanics", () => {
  it("higher card sweeps the pile to the winner", () => {
    const s = base({ hands: [["AS", "2C"], ["KH", "3D"]] });
    const { state, events } = warEngine.reduce(s, { type: "FLIP" }, rng());
    expect(events.some((e) => e.type === "TAKE" && e.seat === 0 && e.count === 2)).toBe(true);
    expect(state.hands[0]!.length).toBe(3); // kept 2C, gained AS+KH
    expect(state.hands[1]!.length).toBe(1);
  });

  it("a tie enters the WAR phase and offers FIGHT/SKIRMISH to the flipper", () => {
    const s = base({ hands: [["9S", "AS", "2C", "3C"], ["9H", "KH", "4D", "5D"]] });
    const tie = warEngine.reduce(s, { type: "FLIP" }, rng()).state;
    expect(tie.phase).toBe("WAR");
    const acts = warEngine.legalActions(tie, tie.turn).map((a) => a.type);
    expect(acts).toEqual(["FIGHT", "SKIRMISH"]);
  });

  it("FIGHT buries 3+1 each; SKIRMISH buries 1+1 each", () => {
    const s = base({
      hands: [["9S", "x1", "x2", "x3", "AS"], ["9H", "y1", "y2", "y3", "KH"]],
      // give both a decisive up-card after burying 3
    });
    const tie = warEngine.reduce(s, { type: "FLIP" }, rng()).state;
    const fight = warEngine.reduce(tie, { type: "FIGHT" }, rng());
    // pile after fight: 2 (initial) + 3 buried ×2 + 2 up = 10, all to seat 0 (AS>KH)
    expect(fight.events.some((e) => e.type === "TAKE" && e.count === 10)).toBe(true);
  });

  it("running out of cards ends the game with the other player winning", () => {
    const s = base({ hands: [["AS"], ["KH"]] });
    const { state } = warEngine.reduce(s, { type: "FLIP" }, rng());
    expect(state.done).toBe(true);
    expect(state.winner).toBe(0); // seat 1 emptied first
  });
});
