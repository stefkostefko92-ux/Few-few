import type { GameKey } from "@aso/shared";
import type { GameEngine, GameEvent } from "../kernel/contract.js";
import { chessEngine } from "../engines/move-validation/chess.js";
import { draughtsEngine } from "../engines/move-validation/draughts.js";
import { backgammonEngine } from "../engines/dice-race/backgammon.js";
import { ludoEngine } from "../engines/dice-race/ludo.js";
import { diceEngine } from "../engines/dice-race/dice.js";
import { santaseEngine } from "../engines/trick/santase.js";
import { beloteEngine } from "../engines/trick/belote.js";
import { kentEngine } from "../engines/trick/kent.js";
import { bridgeEngine } from "../engines/trick/bridge.js";
import { warEngine } from "../engines/draw-discard/war.js";
import { goFishEngine } from "../engines/draw-discard/gofish.js";
import { dominoEngine } from "../engines/draw-discard/domino.js";
import { rummyEngine } from "../engines/draw-discard/rummy.js";
import { svaraEngine } from "../engines/betting/svara.js";
import { holdemEngine } from "../engines/betting/holdem.js";
import { battleshipEngine } from "../engines/grid-guess/battleship.js";
import { bingoEngine } from "../engines/grid-guess/bingo.js";
import { wordsEngine } from "../engines/grid-guess/words.js";
import { eightBallEngine, nineBallEngine, snookerEngine } from "../engines/cue-sports/cue.js";
import { magnatEngine } from "../engines/board-economy/magnat.js";

/**
 * Type-erased engine handle for the realtime host's registry. The host knows
 * the concrete game it loaded and casts back to the specific State/Action types.
 */
export type AnyEngine = GameEngine<unknown, unknown, GameEvent>;

const e = (engine: unknown): AnyEngine => engine as AnyEngine;

/** All 18 engines (§2). 6 reusable cores, not 18 implementations. */
export const GAME_ENGINES: Partial<Record<GameKey, AnyEngine>> = {
  // move-validation
  CHESS: e(chessEngine),
  DRAUGHTS: e(draughtsEngine),
  // dice-race
  BACKGAMMON: e(backgammonEngine),
  LUDO: e(ludoEngine),
  DICE: e(diceEngine),
  // trick
  SANTASE: e(santaseEngine),
  BELOTE: e(beloteEngine),
  KENT: e(kentEngine),
  BRIDGE: e(bridgeEngine),
  // draw-discard
  WAR: e(warEngine),
  GOFISH: e(goFishEngine),
  DOMINO: e(dominoEngine),
  RUMMY: e(rummyEngine),
  // betting (virtual chips only, §11.4)
  SVARA: e(svaraEngine),
  HOLDEM: e(holdemEngine),
  // grid-guess
  BATTLESHIP: e(battleshipEngine),
  BINGO: e(bingoEngine),
  WORDS: e(wordsEngine),
  // cue-sport (deterministic physics, free-form shot validation)
  EIGHTBALL: e(eightBallEngine),
  NINEBALL: e(nineBallEngine),
  SNOOKER: e(snookerEngine),
  // board-economy (property-trading)
  MAGNAT: e(magnatEngine),
};

export function getEngine(key: GameKey): AnyEngine {
  const engine = GAME_ENGINES[key];
  if (!engine) throw new Error(`No engine registered for game ${key}`);
  return engine;
}
