import { randomUUID } from "node:crypto";
import { env } from "./env.js";
import { logger } from "./logger.js";

/**
 * Notifies the API's internal progression endpoint after a match so quests +
 * leaderboards advance (S6). Fire-and-forget with a short timeout — a failure
 * here must never block the game-over broadcast.
 */
export async function notifyMatchResult(input: {
  matchId: string;
  userId: string;
  game: string;
  won: boolean;
  rating: number;
  displayName: string;
}): Promise<void> {
  try {
    const res = await fetch(`${env.API_INTERNAL_URL}/api/progression/internal/match`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": env.INTERNAL_API_SECRET,
        // Correlate this match's progression with the API's request log.
        "x-request-id": `match-${input.matchId}-${randomUUID().slice(0, 8)}`,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status, userId: input.userId }, "progression notify non-200");
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message, userId: input.userId }, "progression notify failed");
  }
}
