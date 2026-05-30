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

  // Stripe (S5). Optional so the API boots without billing in dev; shop
  // endpoints return 503 until configured. Secrets never leave env (§14).
  STRIPE_SECRET_KEY: z.string().optional().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
  // Where Stripe redirects after Checkout / Billing Portal.
  PUBLIC_WEB_URL: z.string().url().default("http://localhost:4502"),

  // Shared secret for internal service-to-service calls (realtime -> api).
  INTERNAL_API_SECRET: z.string().min(16).default("dev-internal-secret-change-me"),
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
