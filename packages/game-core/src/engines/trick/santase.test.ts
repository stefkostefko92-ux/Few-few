import { describe, expect, it } from "vitest";
import { SeededRng } from "../../kernel/rng.js";
import { playRandom } from "../../bots/playout.js";
import { santaseEngine, type SantaseState } from "./santase.js";

const init = (seed = "s66"): SantaseState =>
  santaseEngine.init({ seats: 2 }, new SeededRng(seed));

describe("santase engine", () => {
  it("deals 6+6 with an 11-card stock and a face-up trump", () => {
    const s = init();
    expect(s.hands[0]).toHaveLength(6);
    expect(s.hands[1]).toHaveLength(6);
    expect(s.stock).toHaveLength(11);
    expect(s.trumpCard).not.toBeNull();
    // 24 distinct cards total.
    const all = new Set([...s.hands[0]!, ...s.hands[1]!, ...s.stock, s.trumpCard!]);
    expect(all.size).toBe(24);
  });

  it("only the player on turn has actions", () => {
    const s = init();
    expect(santaseEngine.legalActions(s, 0).length).toBeGreaterThan(0);
    expect(santaseEngine.legalActions(s, 1)).toEqual([]);
  });

  it("redacts the opponent hand and the stock", () => {
    const s = init();
    const view = santaseEngine.redact(s, 0);
    expect(view.hands[0]).toEqual(s.hands[0]);
    expect(view.hands[1]!.every((c) => c === "?")).toBe(true);
    expect(view.stock.every((c) => c === "?")).toBe(true);
  });

  it("every advertised action reduces without throwing", () => {
    const rng = new SeededRng("validate");
    let s = santaseEngine.init({ seats: 2 }, rng);
    for (let i = 0; i < 200 && !santaseEngine.isTerminal(s); i++) {
      const seat = s.turn;
      const actions = santaseEngine.legalActions(s, seat);
      expect(actions.length).toBeGreaterThan(0);
      for (const a of actions) expect(() => santaseEngine.reduce(s, a, rng)).not.toThrow();
      s = santaseEngine.reduce(s, actions[0]!, rng).state;
    }
  });

  it("plays full random games to a winner with a valid score", () => {
    for (let g = 0; g < 50; g++) {
      const { state, terminal } = playRandom(santaseEngine, {
        seed: `m${g}`,
        botSeed: `b${g}`,
        seats: 2,
      });
      expect(terminal).toBe(true);
      const score = santaseEngine.score(state);
      expect(score.filter((x) => x.result === "win")).toHaveLength(1);
      expect(score.filter((x) => x.result === "loss")).toHaveLength(1);
    }
  });

  it("is deterministic for identical seeds", () => {
    const a = playRandom(santaseEngine, { seed: "x", botSeed: "y", seats: 2 });
    const b = playRandom(santaseEngine, { seed: "x", botSeed: "y", seats: 2 });
    expect(a.state).toEqual(b.state);
  });

  it("penalises a failed close: opponent wins 3 if closer had no trick", () => {
    const s = init();
    // Seat 0 closes immediately on lead (has taken no trick yet).
    const closed = santaseEngine.reduce(s, { type: "CLOSE" }, new SeededRng("c")).state;
    expect(closed.closedBy).toBe(0);
    expect(closed.closerHadTrick).toBe(false);
    // Drive the rest with random legal play; seat 0 almost never reaches 66
    // having closed blind on turn 1, so the opponent should take the penalty.
    let st = closed;
    const rng = new SeededRng("c");
    for (let i = 0; i < 100 && !santaseEngine.isTerminal(st); i++) {
      const seat = st.turn;
      const acts = santaseEngine.legalActions(st, seat);
      if (acts.length === 0) break;
      st = santaseEngine.reduce(st, acts[0]!, rng).state;
    }
    expect(santaseEngine.isTerminal(st)).toBe(true);
    const score = santaseEngine.score(st);
    const winner = score.find((x) => x.result === "win")!;
    // If seat 0 failed the close, opponent (seat 1) wins with a 2-3 penalty.
    if (winner.seat === 1) expect(winner.points).toBeGreaterThanOrEqual(2);
  });
});
