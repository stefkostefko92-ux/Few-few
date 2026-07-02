import { describe, expect, it } from "vitest";
import { SeededRng } from "../../kernel/rng.js";
import { playRandom } from "../../bots/playout.js";
import { ludoEngine, type LudoState } from "./ludo.js";

const init = (seats = 2) => ludoEngine.init({ seats }, new SeededRng("ludo"));

/** Scripted die faces so rule tests don't fish for lucky seeds. */
function rig(...faces: number[]): SeededRng {
  let i = 0;
  return { die: () => faces[i++ % faces.length]! } as unknown as SeededRng;
}

/** A state with the given per-seat token progress, seat 0 to act. */
function at(progress: number[][], over: Partial<LudoState> = {}): LudoState {
  return { ...init(progress.length), progress: progress.map((p) => p.slice()), ...over };
}

describe("ludo basics", () => {
  it("starts everyone in the base with ROLL as the only action", () => {
    const s = init(4);
    expect(s.progress).toEqual(Array.from({ length: 4 }, () => [-1, -1, -1, -1]));
    expect(ludoEngine.legalActions(s, 0)).toEqual([{ type: "ROLL" }]);
    expect(ludoEngine.legalActions(s, 1)).toEqual([]);
  });

  it("leaves the base only on a 6", () => {
    const six = at([[-1, -1, -1, -1], [-1, -1, -1, -1]], { die: 6, rolledSix: true, attempts: 1 });
    expect(ludoEngine.legalActions(six, 0)).toEqual(
      [0, 1, 2, 3].map((token) => ({ type: "MOVE", token })),
    );
    const { state } = ludoEngine.reduce(six, { type: "MOVE", token: 2 }, rig(1));
    expect(state.progress[0]![2]).toBe(0); // entered at step 0
    expect(state.die).toBeNull(); // the 6 grants another roll…
    expect(state.turn).toBe(0); // …to the same seat
  });

  it("refuses moves that overshoot the finish and finishes on exact rolls", () => {
    const s = at([[43, 40, 44, 44], [-1, -1, -1, -1]], { die: 4, attempts: 1 });
    // 43+4=47 overshoots; 40+4=44 lands home exactly.
    expect(ludoEngine.legalActions(s, 0)).toEqual([{ type: "MOVE", token: 1 }]);
    const { state } = ludoEngine.reduce(s, { type: "MOVE", token: 1 }, rig(1));
    expect(state.progress[0]![1]).toBe(44);
  });

  it("captures an opponent token by landing on its absolute cell", () => {
    // Seat 0 at step 8 moving 2 → abs cell 10; seat 1's entry offset is 10, so
    // its token at step 0 sits on abs 10 and gets sent home.
    const s = at([[8, -1, -1, -1], [0, -1, -1, -1]], { die: 2, attempts: 1 });
    const { state, events } = ludoEngine.reduce(s, { type: "MOVE", token: 0 }, rig(1));
    expect(state.progress[1]![0]).toBe(-1);
    expect(events).toContainEqual({ type: "CAPTURE", seat: 0, victim: 1, token: 0 });
    expect(state.turn).toBe(1); // non-6 → turn passes
  });

  it("wins when the fourth token comes home", () => {
    const s = at([[43, 44, 44, 44], [0, -1, -1, -1]], { die: 1, attempts: 1 });
    const { state, events } = ludoEngine.reduce(s, { type: "MOVE", token: 0 }, rig(1));
    expect(state.done).toBe(true);
    expect(state.winner).toBe(0);
    expect(events).toContainEqual({ type: "WIN", seat: 0 });
    expect(ludoEngine.score(state)).toEqual([
      { seat: 0, result: "win", points: 1 },
      { seat: 1, result: "loss", points: 0 },
    ]);
  });
});

describe("ludo dead rolls stay visible", () => {
  it("emits NO_MOVE, keeps the die in state and ends the turn via PASS", () => {
    // One runner at 43: a 4 overshoots, nothing else can move.
    const s = at([[43, 44, 44, 44], [-1, -1, -1, -1]]);
    const { state, events } = ludoEngine.reduce(s, { type: "ROLL" }, rig(4));
    expect(events).toContainEqual({ type: "ROLL", seat: 0, die: 4 });
    expect(events).toContainEqual({ type: "NO_MOVE", seat: 0, die: 4, retry: false });
    expect(state.die).toBe(4); // everyone can still see what was rolled
    expect(state.turn).toBe(0); // not skipped silently…
    expect(ludoEngine.legalActions(state, 0)).toEqual([{ type: "PASS" }]); // …PASS is live now

    const passed = ludoEngine.reduce(state, { type: "PASS" }, rig(1));
    expect(passed.events).toContainEqual({ type: "PASS", seat: 0 });
    expect(passed.state.turn).toBe(1);
    expect(passed.state.die).toBeNull();
    expect(passed.state.attempts).toBe(0);
  });

  it("a stuck 6 grants another throw instead of a pass", () => {
    const s = at([[43, 42, 44, 44], [-1, -1, -1, -1]]);
    const { state, events } = ludoEngine.reduce(s, { type: "ROLL" }, rig(6));
    expect(events).toContainEqual({ type: "NO_MOVE", seat: 0, die: 6, retry: true });
    expect(ludoEngine.legalActions(state, 0)).toEqual([{ type: "ROLL" }]);
    // The re-throw finds a 2: 42+2=44 finishes, 43+2 overshoots.
    const again = ludoEngine.reduce(state, { type: "ROLL" }, rig(2));
    expect(again.state.die).toBe(2);
    expect(ludoEngine.legalActions(again.state, 0)).toEqual([{ type: "MOVE", token: 1 }]);
  });
});

describe("ludo three throws for a six", () => {
  it("grants up to three attempts while all tokens sit in the base", () => {
    let s = init(2);
    const rng = rig(3, 5, 2); // three dead rolls in a row

    let r = ludoEngine.reduce(s, { type: "ROLL" }, rng);
    expect(r.events).toContainEqual({ type: "NO_MOVE", seat: 0, die: 3, retry: true });
    expect(r.state.turn).toBe(0);
    expect(ludoEngine.legalActions(r.state, 0)).toEqual([{ type: "ROLL" }]);

    r = ludoEngine.reduce(r.state, { type: "ROLL" }, rng);
    expect(r.events).toContainEqual({ type: "NO_MOVE", seat: 0, die: 5, retry: true });
    expect(ludoEngine.legalActions(r.state, 0)).toEqual([{ type: "ROLL" }]);

    r = ludoEngine.reduce(r.state, { type: "ROLL" }, rng);
    expect(r.state.attempts).toBe(3);
    expect(r.events).toContainEqual({ type: "NO_MOVE", seat: 0, die: 2, retry: false });
    expect(ludoEngine.legalActions(r.state, 0)).toEqual([{ type: "PASS" }]); // budget spent

    s = ludoEngine.reduce(r.state, { type: "PASS" }, rng).state;
    expect(s.turn).toBe(1);
    expect(s.attempts).toBe(0); // fresh budget for the next player
  });

  it("a six found on a later attempt opens the base", () => {
    let s = init(2);
    const rng = rig(2, 6);
    s = ludoEngine.reduce(s, { type: "ROLL" }, rng).state; // dead 2, attempt 1
    const r = ludoEngine.reduce(s, { type: "ROLL" }, rng); // 6 on attempt 2
    expect(r.state.die).toBe(6);
    expect(ludoEngine.legalActions(r.state, 0)).toEqual(
      [0, 1, 2, 3].map((token) => ({ type: "MOVE", token })),
    );
  });

  it("does not apply while a token is out on the track", () => {
    const s = at([[7, -1, -1, 44], [-1, -1, -1, -1]]);
    // Token at 7 can always take a small die — but rig an overshoot-only case:
    const stuck = at([[43, -1, -1, 44], [-1, -1, -1, -1]]);
    const r = ludoEngine.reduce(stuck, { type: "ROLL" }, rig(3));
    expect(r.events).toContainEqual({ type: "NO_MOVE", seat: 0, die: 3, retry: false });
    expect(ludoEngine.legalActions(r.state, 0)).toEqual([{ type: "PASS" }]);
    // Sanity: with a movable token the roll just plays out normally.
    const ok = ludoEngine.reduce(s, { type: "ROLL" }, rig(3));
    expect(ludoEngine.legalActions(ok.state, 0)).toEqual([{ type: "MOVE", token: 0 }]);
  });
});

describe("ludo bot", () => {
  it("prefers finishing, then capturing, then leaving the base", () => {
    const rng = new SeededRng("ludo-bot");
    // Finishing beats a capture: token 0 can finish (40+4), token 1 could advance.
    const fin = at([[40, 10, -1, -1], [-1, -1, -1, -1]], { die: 4, attempts: 1 });
    expect(ludoEngine.bot!(fin, 0, rng)).toEqual({ type: "MOVE", token: 0 });
    // Capture beats a plain advance: seat 1 token sits on abs 10 (= its step 0).
    const cap = at([[8, 20, -1, -1], [0, -1, -1, -1]], { die: 2, attempts: 1 });
    expect(ludoEngine.bot!(cap, 0, rng)).toEqual({ type: "MOVE", token: 0 });
    // On a 6 with nothing to finish/capture, bring a token out of the base.
    const out = at([[5, -1, -1, -1], [-1, -1, -1, -1]], { die: 6, rolledSix: true, attempts: 1 });
    expect(ludoEngine.bot!(out, 0, rng)).toEqual({ type: "MOVE", token: 1 });
    // Otherwise push the most advanced runner.
    const run = at([[5, 12, -1, 44], [-1, -1, -1, -1]], { die: 3, attempts: 1 });
    expect(ludoEngine.bot!(run, 0, rng)).toEqual({ type: "MOVE", token: 1 });
  });

  it("rolls when it must and passes only when truly stuck", () => {
    const rng = new SeededRng("ludo-bot");
    expect(ludoEngine.bot!(init(2), 0, rng)).toEqual({ type: "ROLL" });
    const stuck = at([[43, 44, 44, 44], [-1, -1, -1, -1]], { die: 4, attempts: 1 });
    expect(ludoEngine.bot!(stuck, 0, rng)).toEqual({ type: "PASS" });
    const retry = at([[-1, -1, -1, -1], [-1, -1, -1, -1]], { die: 3, attempts: 1 });
    expect(ludoEngine.bot!(retry, 0, rng)).toEqual({ type: "ROLL" });
    expect(ludoEngine.bot!(stuck, 1, rng)).toBeNull(); // not their turn
  });
});

describe("ludo playouts", () => {
  it("still terminates under random play with the new rules", () => {
    for (const seats of [2, 4]) {
      const { terminal, state } = playRandom(ludoEngine, {
        seed: `ludo-${seats}`,
        botSeed: `ludo-b${seats}`,
        seats,
        maxSteps: 200_000,
      });
      expect(terminal).toBe(true);
      expect(state.winner).not.toBeNull();
      expect(state.progress[state.winner!]!.every((p) => p >= 44)).toBe(true);
    }
  });
});
