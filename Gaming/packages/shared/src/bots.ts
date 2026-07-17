/**
 * Bot difficulty tiers (§9.3). The realtime host maps these to a play policy:
 *   EASY   — uniform-random legal moves (a relaxed opponent),
 *   NORMAL — the engine's heuristic if it has one, else random (the default),
 *   HARD   — a generic, cost-bounded Monte-Carlo search that plays to win.
 * The tier is chosen by the player when they queue solo-vs-bots.
 */
export const BOT_DIFFICULTIES = ["EASY", "NORMAL", "HARD"] as const;
export type BotDifficulty = (typeof BOT_DIFFICULTIES)[number];

export const DEFAULT_BOT_DIFFICULTY: BotDifficulty = "NORMAL";

export const isBotDifficulty = (v: unknown): v is BotDifficulty =>
  typeof v === "string" && (BOT_DIFFICULTIES as readonly string[]).includes(v);
