import { isGameKey, type GameKey } from "@aso/shared";

/**
 * E2E-only deal pinning: `E2E_SEEDS="RUMMY=e2e-rummy-1,WAR=…"` makes every
 * queue match of that game start from the given seed. The match is still
 * dealt and played by the authoritative engine — only its shuffle is fixed —
 * so a browser spec can reach a situation a random deal offers rarely (a
 * joker swap in Реми on the first turn) without depending on luck.
 *
 * Read only from the server's own environment (never from a client) and
 * refused in production by env validation. Unknown games / empty seeds are
 * ignored; the last entry for a game wins.
 */
export function parseE2eSeeds(raw: string | undefined): ReadonlyMap<GameKey, string> {
  const out = new Map<GameKey, string>();
  for (const part of (raw ?? "").split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const game = part.slice(0, eq).trim().toUpperCase();
    const seed = part.slice(eq + 1).trim();
    if (isGameKey(game) && seed) out.set(game, seed);
  }
  return out;
}
