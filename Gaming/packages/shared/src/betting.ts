import { BETTING_GAMES, type GameKey } from "./games.js";

/**
 * Chip-wagering games (§11.4 — VIRTUAL chips only, never cashed out). A player
 * must be able to cover `buyIn` wallet chips to sit down, and the match settles
 * a real wallet stake at the end (see realtime `finalizeMatch`): winning the
 * table returns more than the buy-in, busting loses it. This is the single
 * source of truth for both the client gate and the server authority.
 */
export const BETTING_BUYIN: Partial<Record<GameKey, number>> = {
  SVARA: 200,
};

/**
 * Internal stake units a betting engine starts each seat with (the engine's
 * `score().points` reports the final unit count). Settlement maps unit delta to
 * wallet chips proportionally: `walletΔ = round((points - start) / start * buyIn)`.
 * Kept in sync with the engine constant (svara.ts STARTING_CHIPS).
 */
export const BETTING_START_UNITS: Partial<Record<GameKey, number>> = {
  SVARA: 500,
};

export const isBettingGame = (game: GameKey): boolean => BETTING_GAMES.includes(game);

/** Wallet chips required to sit at `game`, or undefined for non-betting games. */
export const buyInFor = (game: GameKey): number | undefined => BETTING_BUYIN[game];

/**
 * Settle a betting seat's wallet delta from its final internal stake units.
 * Positive = net winnings, negative = net loss. Losses are clamped by the
 * caller to the player's available wallet.
 */
export function settleStake(game: GameKey, finalUnits: number): number {
  const start = BETTING_START_UNITS[game];
  const buyIn = BETTING_BUYIN[game];
  if (start === undefined || buyIn === undefined || start <= 0) return 0;
  return Math.round(((finalUnits - start) / start) * buyIn);
}
