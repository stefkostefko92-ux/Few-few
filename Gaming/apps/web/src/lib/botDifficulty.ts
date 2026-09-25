import { DEFAULT_BOT_DIFFICULTY, isBotDifficulty, type BotDifficulty } from "@aso/shared";

/**
 * Persisted preference for how strong the AI opponents play when a match is
 * filled with bots. Stored locally and sent on QUEUE_JOIN; the realtime host is
 * authoritative and defaults to NORMAL when absent.
 */
const KEY = "aso_bot_difficulty";

export function getBotDifficulty(): BotDifficulty {
  try {
    const v = localStorage.getItem(KEY);
    if (isBotDifficulty(v)) return v;
  } catch {
    /* storage blocked */
  }
  return DEFAULT_BOT_DIFFICULTY;
}

export function setBotDifficulty(d: BotDifficulty): void {
  try {
    localStorage.setItem(KEY, d);
  } catch {
    /* storage blocked */
  }
}
