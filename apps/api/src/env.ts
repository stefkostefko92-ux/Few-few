import { z } from "zod";

/**
 * Zod-validated environment. The process refuses to boot with an invalid
 * config — secrets are never read ad-hoc elsewhere (S14 / S21).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4500),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default("redis://localhost:6383"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),

  // Empty string => host-only cookies (localhost dev).
  COOKIE_DOMAIN: z.string().optional().default(""),

  // Comma-separated CORS whitelist — never "*" on prod.
  CORS_ORIGINS: z.string().default("http://localhost:4502,http://localhost:5173"),
});

function load() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Use console here: logger isn't constructed yet and the process is aborting.
    console.error("❌ Invalid environment configuration:");
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

export type Env = typeof env;
