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
  "EIGHTBALL",
  "NINEBALL",
  "SNOOKER",
  "MAGNAT",
] as const;

export type GameKey = (typeof GAME_KEYS)[number];

/** The reusable engine cores (section 7.2). */
export const ENGINE_PATTERNS = [
  "trick",
  "betting",
  "dice-race",
  "move-validation",
  "draw-discard",
  "grid-guess",
  "cue-sport",
  "board-economy",
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
  EIGHTBALL: "cue-sport",
  NINEBALL: "cue-sport",
  SNOOKER: "cue-sport",
  MAGNAT: "board-economy",
};

/** Betting games carry the regulatory "social gaming, not real-money gambling" label (S11.4). */
export const BETTING_GAMES: readonly GameKey[] = ["SVARA", "HOLDEM"];

/** Number of seats per match. Defaults to 2; team/party games override. */
export const GAME_SEATS: Record<GameKey, number> = {
  BELOTE: 4,
  SANTASE: 2,
  SVARA: 4,
  WAR: 2,
  GOFISH: 4,
  KENT: 4,
  CHESS: 2,
  BACKGAMMON: 2,
  DRAUGHTS: 2,
  LUDO: 4,
  RUMMY: 2,
  HOLDEM: 6,
  DOMINO: 4,
  BRIDGE: 4,
  BATTLESHIP: 2,
  DICE: 2,
  BINGO: 4,
  WORDS: 2,
  EIGHTBALL: 2,
  NINEBALL: 2,
  SNOOKER: 2,
  MAGNAT: 4,
};

export const seatsFor = (game: GameKey): number => GAME_SEATS[game];

export function isGameKey(value: string): value is GameKey {
  return (GAME_KEYS as readonly string[]).includes(value);
}
