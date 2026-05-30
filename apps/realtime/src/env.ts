import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  REALTIME_PORT: z.coerce.number().int().positive().default(4501),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default("redis://localhost:6383"),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGINS: z.string().default("http://localhost:4502,http://localhost:5173"),
  /** Seconds to wait for a human opponent before falling back to a bot. */
  BOT_FALLBACK_SECONDS: z.coerce.number().int().positive().default(8),
  /** Internal API base + shared secret for progression notifications (S6). */
  API_INTERNAL_URL: z.string().url().default("http://localhost:4500"),
  INTERNAL_API_SECRET: z.string().min(16).default("dev-internal-secret-change-me"),
});

function load() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("❌ Invalid realtime environment:");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

const raw = load();

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === "production",
  corsOrigins: raw.CORS_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};
