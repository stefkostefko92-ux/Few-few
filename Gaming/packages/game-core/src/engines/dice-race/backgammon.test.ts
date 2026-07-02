import { describe, expect, it } from "vitest";
import { SeededRng } from "../../kernel/rng.js";
import { playRandom } from "../../bots/playout.js";
import { backgammonEngine, type BackgammonState } from "./backgammon.js";

const init = () => backgammonEngine.init({ seats: 2 }, new SeededRng("bg"));

describe("backgammon engine", () => {
  it("sets up 15 checkers per side", () => {
    const s = init();
    const white = s.points.filter((v) => v > 0).reduce((a, v) => a + v, 0);
    const black = -s.points.filter((v) => v < 0).reduce((a, v) => a + v, 0);
    expect(white).toBe(15);
    expect(black).toBe(15);
  });

  it("opens with an opening roll: two different dice, higher roller starts mid-MOVE", () => {
    for (const seed of ["bg", "bg-2", "bg-3", "bg-4", "bg-5"]) {
      const s = backgammonEngine.init({ seats: 2 }, new SeededRng(seed));
      expect(s.phase).toBe("MOVE");
      expect(s.openingRoll).toBeDefined();
      const [w, b] = s.openingRoll!;
      expect(w).not.toBe(b); // ties are re-rolled — the opening is never doubles
      expect(s.turn).toBe(w > b ? 0 : 1);
      expect(s.dice).toEqual([w, b]);
      expect(s.remaining).toEqual([w, b]);
      // The starter has MOVE actions; the opponent has none.
      const starter = backgammonEngine.legalActions(s, s.turn);
      expect(starter.length).toBeGreaterThan(0);
      expect(starter.every((a) => a.type === "MOVE" || a.type === "PASS")).toBe(true);
      expect(backgammonEngine.legalActions(s, s.turn === 0 ? 1 : 0)).toEqual([]);
    }
  });

  it("clears the opening roll and hands a ROLL turn to the opponent", () => {
    const rng = new SeededRng("bg-open");
    let s = backgammonEngine.init({ seats: 2 }, rng);
    const starter = s.turn;
    // Play out the opening dice.
    for (let i = 0; i < 8 && s.turn === starter; i++) {
      const actions = backgammonEngine.legalActions(s, starter);
      expect(actions.length).toBeGreaterThan(0);
      s = backgammonEngine.reduce(s, actions[0]!, rng).state;
    }
    expect(s.turn).toBe(starter === 0 ? 1 : 0);
    expect(s.phase).toBe("ROLL");
    expect(s.openingRoll).toBeUndefined();
    expect(backgammonEngine.legalActions(s, s.turn)).toEqual([{ type: "ROLL" }]);
  });

  it("every advertised legal action is reducible without throwing", () => {
    const rng = new SeededRng("bg-validate");
    let s: BackgammonState = backgammonEngine.init({ seats: 2 }, rng);
    for (let i = 0; i < 300 && !backgammonEngine.isTerminal(s); i++) {
      const seat = s.turn;
      const actions = backgammonEngine.legalActions(s, seat);
      expect(actions.length).toBeGreaterThan(0);
      for (const a of actions) {
        expect(() => backgammonEngine.reduce(s, a, rng)).not.toThrow();
      }
      s = backgammonEngine.reduce(s, actions[0]!, rng).state;
    }
  });

  it("plays a full random game to a winner with 15 borne off", () => {
    const { state, terminal } = playRandom(backgammonEngine, {
      seed: "match-7",
      botSeed: "bots-7",
      maxSteps: 200_000,
    });
    expect(terminal).toBe(true);
    expect(state.off[0] === 15 || state.off[1] === 15).toBe(true);
    const score = backgammonEngine.score(state);
    expect(score.find((x) => x.result === "win")).toBeDefined();
    expect(score.find((x) => x.result === "loss")).toBeDefined();
  });

  it("is deterministic for identical seeds", () => {
    const a = playRandom(backgammonEngine, { seed: "m", botSeed: "b" });
    const b = playRandom(backgammonEngine, { seed: "m", botSeed: "b" });
    expect(a.state).toEqual(b.state);
    expect(a.steps).toBe(b.steps);
  });

  it("enforces the larger die when only one of two can be played", () => {
    // White must come in from the bar; black holds 5 of the 6 entry points so
    // only one die can ever be played. Construct: white on bar, dice [3,5].
    // Block white entry for die=3 (point 21 for white = 24-3) with 2+ black,
    // leave die=5 entry (point 19) open. Then the only legal move uses die 5.
    const s: BackgammonState = {
      points: new Array(24).fill(0),
      bar: [1, 0],
      off: [0, 0],
      turn: 0,
      phase: "MOVE",
      dice: [3, 5],
      remaining: [3, 5],
    };
    s.points[21] = -2; // block white's die-3 entry (24-3)
    // point 19 (24-5) left open for die-5 entry
    const actions = backgammonEngine.legalActions(s, 0);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.type === "MOVE" && a.die === 5)).toBe(true);
  });

  describe("gammon / backgammon scoring", () => {
    const base = (): BackgammonState => ({
      points: new Array(24).fill(0),
      bar: [0, 0],
      off: [15, 0],
      turn: 0,
      phase: "ROLL",
      dice: [],
      remaining: [],
    });

    it("scores a plain win as 1 point when the loser has borne off", () => {
      const s = base();
      s.off[1] = 3;
      s.points[10] = -12;
      expect(backgammonEngine.score(s)).toContainEqual({ seat: 0, result: "win", points: 1 });
    });

    it("scores a gammon (loser bore off none) as 2 points", () => {
      const s = base();
      s.points[10] = -15; // outside white's home, none on the bar
      expect(backgammonEngine.score(s)).toContainEqual({ seat: 0, result: "win", points: 2 });
    });

    it("scores a backgammon (loser still in winner's home) as 3 points", () => {
      const s = base();
      s.points[2] = -1; // black checker inside white's home
      s.points[10] = -14;
      expect(backgammonEngine.score(s)).toContainEqual({ seat: 0, result: "win", points: 3 });
    });

    it("scores a backgammon (loser on the bar) as 3 points", () => {
      const s = base();
      s.bar[1] = 1;
      s.points[10] = -14;
      expect(backgammonEngine.score(s)).toContainEqual({ seat: 0, result: "win", points: 3 });
    });

    it("emits WIN with the points on the final bear-off", () => {
      // White: one checker on point 0, 14 already off; black never bore off.
      const s: BackgammonState = {
        points: new Array(24).fill(0),
        bar: [0, 0],
        off: [14, 0],
        turn: 0,
        phase: "MOVE",
        dice: [1, 2],
        remaining: [1],
      };
      s.points[0] = 1;
      s.points[10] = -15;
      const r = backgammonEngine.reduce(s, { type: "MOVE", from: 0, die: 1 }, new SeededRng("w"));
      expect(r.events).toContainEqual({ type: "WIN", seat: 0, points: 2 });
      expect(backgammonEngine.isTerminal(r.state)).toBe(true);
    });
  });
});
