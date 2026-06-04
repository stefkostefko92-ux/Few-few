import type { AnyEngine } from "@aso/game-core";
import { SeededRng } from "@aso/game-core";

/**
 * Baseline AI: prefers an engine-provided heuristic `bot` policy when present
 * (e.g. МАГНАТ's property strategy), otherwise picks a uniformly random legal
 * action through the engine contract (§9.3). Stronger play (Monte-Carlo,
 * stockfish.wasm for chess) is a later upgrade. Each bot owns its own RNG so it
 * never perturbs the match's fairness stream.
 */
export class RandomBot {
  private readonly rng: SeededRng;

  constructor(seed: string) {
    this.rng = new SeededRng(seed);
  }

  pick(engine: AnyEngine, state: unknown, seat: number): unknown | null {
    if (engine.bot) {
      const chosen = engine.bot(state, seat, this.rng);
      if (chosen !== null && chosen !== undefined) return chosen;
    }
    const actions = engine.legalActions(state, seat);
    if (actions.length === 0) return null;
    return actions[this.rng.int(actions.length)] ?? null;
  }
}
