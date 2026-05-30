/**
 * Canonical game roster (18 games) and the 6 engine patterns they reduce to.
 * Mirrors the `GameKey` enum in the Prisma schema — keep both in sync.
 */

export const GAME_KEYS = [
  "BELOTE",
  "SANTASE",
  "SVARA",
  "WAR",
  "GOFISH",
  "KENT",
  "CHESS",
  "BACKGAMMON",
  "DRAUGHTS",
  "LUDO",
  "RUMMY",
  "HOLDEM",
  "DOMINO",
  "BRIDGE",
  "BATTLESHIP",
  "DICE",
  "BINGO",
  "WORDS",
] as const;

export type GameKey = (typeof GAME_KEYS)[number];

/** The 6 reusable engine cores (section 7.2). */
export const ENGINE_PATTERNS = [
  "trick",
  "betting",
  "dice-race",
  "move-validation",
  "draw-discard",
  "grid-guess",
] as const;

export type EnginePattern = (typeof ENGINE_PATTERNS)[number];

/** Which engine core powers each game. */
export const GAME_ENGINE: Record<GameKey, EnginePattern> = {
  BELOTE: "trick",
  SANTASE: "trick",
  KENT: "trick",
  BRIDGE: "trick",
  SVARA: "betting",
  HOLDEM: "betting",
  BACKGAMMON: "dice-race",
  LUDO: "dice-race",
  DICE: "dice-race",
  CHESS: "move-validation",
  DRAUGHTS: "move-validation",
  RUMMY: "draw-discard",
  GOFISH: "draw-discard",
  WAR: "draw-discard",
  DOMINO: "draw-discard",
  BATTLESHIP: "grid-guess",
  BINGO: "grid-guess",
  WORDS: "grid-guess",
};

/** Betting games carry the regulatory "social gaming, not real-money gambling" label (S11.4). */
export const BETTING_GAMES: readonly GameKey[] = ["SVARA", "HOLDEM"];

export function isGameKey(value: string): value is GameKey {
  return (GAME_KEYS as readonly string[]).includes(value);
}
