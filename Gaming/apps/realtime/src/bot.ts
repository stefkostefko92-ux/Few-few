import { type AnyEngine, chooseBotAction, SeededRng } from "@aso/game-core";
import { DEFAULT_BOT_DIFFICULTY, type BotDifficulty } from "@aso/shared";

/**
 * Match bot. Delegates to the shared difficulty-aware policy (§9.3):
 *   EASY   — uniform-random legal action,
 *   NORMAL — the engine's heuristic if present, else random (default),
 *   HARD   — cost-bounded Monte-Carlo search that plays to win.
 * Each bot owns its own RNG so it never perturbs the match's fairness stream.
 */
export class RandomBot {
  private readonly rng: SeededRng;
  private readonly difficulty: BotDifficulty;

  constructor(seed: string, difficulty: BotDifficulty = DEFAULT_BOT_DIFFICULTY) {
    this.rng = new SeededRng(seed);
    this.difficulty = difficulty;
  }

  pick(engine: AnyEngine, state: unknown, seat: number): unknown | null {
    return chooseBotAction(engine as never, state as never, seat, this.difficulty, this.rng);
  }
}
