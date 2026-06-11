import type { GameEngine, GameEvent } from "../kernel/contract.js";
import { SeededRng } from "../kernel/rng.js";

/**
 * Drives a full game with every seat played by a random-legal bot. Bots act
 * through the engine contract (§9.3) and use their OWN rng so they never
 * perturb the match's fairness stream. Deterministic: same seeds → same result.
 */
export function playRandom<S, A, E extends GameEvent>(
  engine: GameEngine<S, A, E>,
  opts: { seed: string; botSeed: string; seats?: number; maxSteps?: number },
): { state: S; steps: number; terminal: boolean } {
  const seats = opts.seats ?? 2;
  const maxSteps = opts.maxSteps ?? 100_000;
  const matchRng = new SeededRng(opts.seed);
  const botRng = new SeededRng(opts.botSeed);

  let state = engine.init({ seats }, matchRng);
  let steps = 0;

  while (!engine.isTerminal(state) && steps < maxSteps) {
    let acted = false;
    for (let seat = 0; seat < seats; seat++) {
      const actions = engine.legalActions(state, seat);
      if (actions.length === 0) continue;
      const choice = actions[botRng.int(actions.length)] as A;
      state = engine.reduce(state, choice, matchRng).state;
      acted = true;
      break;
    }
    if (!acted) break; // no seat can move — stuck (should not happen in well-formed engines)
    steps++;
  }

  return { state, steps, terminal: engine.isTerminal(state) };
}
