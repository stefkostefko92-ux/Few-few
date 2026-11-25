import { type AnyEngine, chooseBotAction, SeededRng } from "@aso/game-core";
import { DEFAULT_BOT_DIFFICULTY, type BotDifficulty } from "@aso/shared";

/**
 * Match bot. Delegates to the shared difficulty-aware policy (§9.3):
 *   EASY   — engine heuristic with 35 % random blunders (not uniform-random),
 *   NORMAL — the engine's heuristic if present, else random (default),
 *   HARD   — cost-bounded Monte-Carlo search that plays to win.
 * EASY/NORMAL see only the seat's REDACTED view (defence in depth: the bot
 * never reads hidden cards even by accident); HARD gets the full state and
 * builds its own fair view via `determinizer`. Each bot owns its own RNG so it never perturbs the match's fairness stream.
 */
export class RandomBot {
  private readonly rng: SeededRng;
  private readonly difficulty: BotDifficulty;

  constructor(seed: string, difficulty: BotDifficulty = DEFAULT_BOT_DIFFICULTY) {
    this.rng = new SeededRng(seed);
    this.difficulty = difficulty;
  }

  pick(engine: AnyEngine, state: unknown, seat: number): unknown | null {
    // HARD сам строи честния си изглед (determinizer иска пълното състояние).
    const view = this.difficulty === "HARD" ? state : engine.redact(state as never, seat);
    return chooseBotAction(engine as never, view as never, seat, this.difficulty, this.rng);
  }
}
