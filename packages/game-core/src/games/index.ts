import type { GameKey } from "@aso/shared";
import type { GameEngine, GameEvent } from "../kernel/contract.js";
import { chessEngine } from "../engines/move-validation/chess.js";
import { backgammonEngine } from "../engines/dice-race/backgammon.js";

/**
 * Type-erased engine handle for the realtime host's registry. The host knows
 * the concrete game it loaded and casts back to the specific State/Action types.
 */
export type AnyEngine = GameEngine<unknown, unknown, GameEvent>;

/** Engines implemented so far. Grows as sprints land (S4, S7…). */
export const GAME_ENGINES: Partial<Record<GameKey, AnyEngine>> = {
  CHESS: chessEngine as unknown as AnyEngine,
  BACKGAMMON: backgammonEngine as unknown as AnyEngine,
};

export function getEngine(key: GameKey): AnyEngine {
  const engine = GAME_ENGINES[key];
  if (!engine) throw new Error(`No engine registered for game ${key}`);
  return engine;
}
