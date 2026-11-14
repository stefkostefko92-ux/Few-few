import { z } from "zod";
import { parseE2eSeeds } from "./e2eSeeds.js";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  REALTIME_PORT: z.coerce.number().int().positive().default(4501),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default("redis://localhost:6383"),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGINS: z.string().default("http://localhost:4502,http://localhost:5173"),
  /** Seconds to wait for a human opponent before falling back to a bot. */
  BOT_FALLBACK_SECONDS: z.coerce.number().int().positive().default(8),
  /** Optional ops override of the per-turn clock for EVERY game. Unset → the
   *  per-game clock from `GAME_TURN_SECONDS` (@aso/shared). */
  TURN_SECONDS: z.coerce.number().int().positive().optional(),
  /** Grace after a disconnect before a 2-player match is forfeited. */
  DISCONNECT_GRACE_SECONDS: z.coerce.number().int().positive().default(45),
  /** Internal API base + shared secret for progression notifications (S6). */
  API_INTERNAL_URL: z.string().url().default("http://localhost:4500"),
  INTERNAL_API_SECRET: z.string().min(16).default("dev-internal-secret-change-me"),
  /** Само e2e стекът: фиксиран seed по игра (виж e2eSeeds.ts). В продукция се игнорира. */
  E2E_SEEDS: z.string().optional(),
});

function load() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("❌ Invalid realtime environment:");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  if (
    parsed.data.NODE_ENV === "production" &&
    parsed.data.INTERNAL_API_SECRET === "dev-internal-secret-change-me"
  ) {
    console.error("❌ INTERNAL_API_SECRET must be set in production (still the dev default).");
    process.exit(1);
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.E2E_SEEDS) {
    console.warn("⚠ E2E_SEEDS is ignored in production — match seeds stay random.");
  }
  return parsed.data;
}

const raw = load();

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === "production",
  e2eSeeds: parseE2eSeeds(raw.E2E_SEEDS, raw.NODE_ENV === "production"),
  corsOrigins: raw.CORS_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};
