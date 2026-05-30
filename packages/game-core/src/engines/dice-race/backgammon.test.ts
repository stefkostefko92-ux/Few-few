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
    expect(s.phase).toBe("ROLL");
  });

  it("offers exactly ROLL at the start of a turn", () => {
    const s = init();
    expect(backgammonEngine.legalActions(s, 0)).toEqual([{ type: "ROLL" }]);
    expect(backgammonEngine.legalActions(s, 1)).toEqual([]);
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
});
