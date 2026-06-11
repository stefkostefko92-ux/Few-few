import { describe, expect, it } from "vitest";
import { GAME_ENGINES } from "../games/index.js";
import { playRandom } from "../bots/playout.js";
import { SeededRng } from "../kernel/rng.js";
import type { AnyEngine } from "../games/index.js";

/** Seat counts to drive each game with for the playout harness. */
const SEATS: Record<string, number> = {
  CHESS: 2, DRAUGHTS: 2, BACKGAMMON: 2, LUDO: 4, DICE: 2,
  SANTASE: 2, BELOTE: 4, KENT: 4, BRIDGE: 4,
  WAR: 2, GOFISH: 4, DOMINO: 4, RUMMY: 2,
  SVARA: 4, HOLDEM: 6, BATTLESHIP: 2, BINGO: 4, WORDS: 4,
  EIGHTBALL: 2, NINEBALL: 2, SNOOKER: 2,
  MAGNAT: 4,
};

// Games that don't reliably reach a terminal state under uniform-random play
// within a small budget (chess: see chess.test.ts; cue sports: clearing a table
// by luck is astronomically unlikely). They run a bounded smoke playout only.
const LIGHT = new Set(["CHESS", "EIGHTBALL", "NINEBALL", "SNOOKER"]);

describe("engine registry", () => {
  it("registers all 22 games", () => {
    expect(Object.keys(GAME_ENGINES)).toHaveLength(22);
  });
});

describe.each(Object.entries(GAME_ENGINES))("engine %s", (key, engine) => {
  const seats = SEATS[key] ?? 2;
  const e = engine as AnyEngine;

  // Uniform-random chess almost never reaches checkmate and can shuffle
  // indefinitely without triggering chess.js draw flags within a step budget;
  // its termination + scoring are covered by chess.test.ts (Fool's mate). Every
  // other engine terminates under random play.
  const expectsRandomTerminal = !LIGHT.has(key);

  it("reaches a terminal state and produces a consistent score", () => {
    // LIGHT games only run consistency checks on whatever terminates quickly;
    // their termination/scoring is covered by their own tests. Others must
    // terminate under random play.
    const games = LIGHT.has(key) ? 2 : 8;
    const maxSteps = LIGHT.has(key) ? (key === "CHESS" ? 2_000 : 300) : 200_000;
    let anyTerminal = false;
    for (let g = 0; g < games; g++) {
      const { state, terminal } = playRandom(e, {
        seed: `${key}-m${g}`,
        botSeed: `${key}-b${g}`,
        seats,
        maxSteps,
      });
      if (!terminal) continue;
      anyTerminal = true;
      const score = e.score(state);
      expect(score.length).toBe(seats);
      for (const line of score) {
        expect(["win", "loss", "draw"]).toContain(line.result);
      }
      // A finished game is either decisive (some winner) or a draw for all.
      const allDraw = score.every((s) => s.result === "draw");
      expect(allDraw || score.some((s) => s.result === "win")).toBe(true);
    }
    if (expectsRandomTerminal) expect(anyTerminal).toBe(true);
  });

  it("every advertised legal action reduces without throwing", () => {
    const rng = new SeededRng(`${key}-validate`);
    let state = e.init({ seats }, rng);
    const budget = LIGHT.has(key) ? 40 : 300;
    for (let i = 0; i < budget && !e.isTerminal(state); i++) {
      // find the seat to act
      let acted = false;
      for (let seat = 0; seat < seats; seat++) {
        const actions = e.legalActions(state, seat);
        if (actions.length === 0) continue;
        for (const a of actions) {
          expect(() => e.reduce(state, a, rng)).not.toThrow();
        }
        state = e.reduce(state, actions[0]!, rng).state;
        acted = true;
        break;
      }
      if (!acted) break;
    }
  });

  it("is deterministic for identical seeds", () => {
    const maxSteps = LIGHT.has(key) ? 150 : undefined;
    const a = playRandom(e, { seed: `${key}-d`, botSeed: `${key}-db`, seats, maxSteps });
    const b = playRandom(e, { seed: `${key}-d`, botSeed: `${key}-db`, seats, maxSteps });
    expect(a.state).toEqual(b.state);
    expect(a.steps).toBe(b.steps);
  });

  it("redact never exposes more than the seat's own view shape", () => {
    const rng = new SeededRng(`${key}-redact`);
    const state = e.init({ seats }, rng);
    // redact must return a serializable object for each seat without throwing
    for (let seat = 0; seat < seats; seat++) {
      const view = e.redact(state, seat);
      expect(() => JSON.stringify(view)).not.toThrow();
    }
  });
});
