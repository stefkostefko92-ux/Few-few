import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default("redis://localhost:6383"),
  /** Season length in days (§12). */
  SEASON_DAYS: z.coerce.number().int().positive().default(35),
});

function load() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("❌ Invalid worker environment:");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

const raw = load();
export const env = { ...raw, isProd: raw.NODE_ENV === "production" };
