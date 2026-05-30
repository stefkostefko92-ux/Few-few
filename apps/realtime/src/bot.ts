import type { AnyEngine } from "@aso/game-core";
import { SeededRng } from "@aso/game-core";

/**
 * Baseline AI: picks a uniformly random legal action through the engine
 * contract (§9.3). Stronger play (heuristics / Monte-Carlo, stockfish.wasm for
 * chess) is a later upgrade — this keeps S3 dependency-light while exercising
 * the full realtime loop. Each bot owns its own RNG so it never perturbs the
 * match's fairness stream.
 */
export class RandomBot {
  private readonly rng: SeededRng;

  constructor(seed: string) {
    this.rng = new SeededRng(seed);
  }

  pick(engine: AnyEngine, state: unknown, seat: number): unknown | null {
    const actions = engine.legalActions(state, seat);
    if (actions.length === 0) return null;
    return actions[this.rng.int(actions.length)] ?? null;
  }
}
