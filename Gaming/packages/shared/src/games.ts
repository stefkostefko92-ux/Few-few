/**
 * Canonical game roster (21 games) and the engine patterns they reduce to.
 * The Prisma `GameKey` enum keeps the retired HOLDEM value (dropping a Postgres
 * enum value is unsafe) — the roster below is the source of truth for play.
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
export const BETTING_GAMES: readonly GameKey[] = ["SVARA"];

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

/**
 * Allowed seat range for a *custom room* (the ranked queue always uses the
 * canonical GAME_SEATS). Only games whose engine is verified to run correctly
 * at multiple counts widen beyond their default; all others are fixed.
 */
const SEAT_RANGES: Partial<Record<GameKey, { min: number; max: number }>> = {
  LUDO: { min: 2, max: 4 },
  DICE: { min: 2, max: 4 },
  GOFISH: { min: 2, max: 4 },
  DOMINO: { min: 2, max: 4 },
  WORDS: { min: 2, max: 4 },
  SVARA: { min: 2, max: 6 },
  BINGO: { min: 2, max: 6 },
  MAGNAT: { min: 2, max: 6 },
};

export const seatRange = (game: GameKey): { min: number; max: number } =>
  SEAT_RANGES[game] ?? { min: GAME_SEATS[game], max: GAME_SEATS[game] };

/**
 * Number of teams a game is played in. 1 = free-for-all (every seat its own
 * side). Partnership games seat partners on alternating seats (0,2 vs 1,3).
 */
const PARTNERED_GAMES: Partial<Record<GameKey, number>> = {
  BELOTE: 2,
  BRIDGE: 2,
  KENT: 2,
};

export const teamsFor = (game: GameKey): number => PARTNERED_GAMES[game] ?? 1;

/** Which team a seat belongs to. Partners alternate; FFA → seat is its own team. */
export const teamOfSeat = (game: GameKey, seat: number): number => {
  const t = teamsFor(game);
  return t > 1 ? seat % t : seat;
};

export function isGameKey(value: string): value is GameKey {
  return (GAME_KEYS as readonly string[]).includes(value);
}
