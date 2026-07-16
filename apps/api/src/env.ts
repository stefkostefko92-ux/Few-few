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

  // First-run owner bootstrap (§14): at boot, the account registered with this
  // email is promoted to OWNER (idempotent no-op otherwise). Removes the need
  // for manual SQL to reach the admin panel on a fresh database.
  BOOTSTRAP_OWNER_EMAIL: z.string().optional().default(""),

  // Comma-separated CORS whitelist — never "*" on prod.
  CORS_ORIGINS: z.string().default("http://localhost:4502,http://localhost:5173"),

  // Stripe (S5). Optional so the API boots without billing in dev; shop
  // endpoints return 503 until configured. Secrets never leave env (§14).
  STRIPE_SECRET_KEY: z.string().optional().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
  // Where Stripe redirects after Checkout / Billing Portal, and where email
  // links / OAuth success redirects send the player.
  PUBLIC_WEB_URL: z.string().url().default("http://localhost:4502"),
  // Public origin of this API — used to build OAuth callback URLs that must
  // match what is registered with Google/Facebook.
  PUBLIC_API_URL: z.string().url().default("http://localhost:4500"),
  // Path the SPA is served under (e.g. "/app" in prod). Email/OAuth redirects
  // route through it so deep links resolve under the single domain.
  WEB_BASE_PATH: z.string().default(""),

  // SMTP (optional). When unset, transactional emails are written to the log
  // instead of sent, so verify/reset flows stay testable without a provider.
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASSWORD: z.string().optional().default(""),
  SMTP_SECURE: z.coerce.boolean().default(false),
  EMAIL_FROM: z.string().default("АСО <no-reply@gaming.carbonstealth.eu>"),

  // OAuth (optional, env-gated). A provider is enabled only when BOTH its id
  // and secret are present. Secrets never leave env (§14).
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  FACEBOOK_APP_ID: z.string().optional().default(""),
  FACEBOOK_APP_SECRET: z.string().optional().default(""),

  // Discord webhook (optional, env-gated). When set, key events and admin
  // actions are posted as rich embeds. Secrets never leave env (§14).
  DISCORD_WEBHOOK_URL: z.string().optional().default(""),
  DISCORD_WEBHOOK_NAME: z.string().default("АСО"),

  // Sentry error tracking (optional). Init only when a DSN is present.
  SENTRY_DSN: z.string().optional().default(""),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),

  // Shared secret for internal service-to-service calls (realtime <-> api).
  INTERNAL_API_SECRET: z.string().min(16).default("dev-internal-secret-change-me"),
  // Internal base URL of the realtime node, used by the admin live-tables view
  // to read its in-memory room list (§14). Single-node by default.
  REALTIME_INTERNAL_URL: z.string().url().default("http://localhost:4501"),
});

const DEV_INTERNAL_SECRET = "dev-internal-secret-change-me";

function load() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Use console here: logger isn't constructed yet and the process is aborting.
    console.error("❌ Invalid environment configuration:");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  // Never ship the well-known dev secret to production.
  if (parsed.data.NODE_ENV === "production" && parsed.data.INTERNAL_API_SECRET === DEV_INTERNAL_SECRET) {
    console.error("❌ INTERNAL_API_SECRET must be set in production (still the dev default).");
    process.exit(1);
  }
  // Reject placeholder / weak / duplicated auth secrets in production: a length
  // check alone passes the 36-char `change-me-…` examples, which would allow
  // anyone to forge tokens (full auth bypass).
  if (parsed.data.NODE_ENV === "production") {
    const { JWT_SECRET, JWT_REFRESH_SECRET } = parsed.data;
    const placeholder = (s: string) => /change-me|changeme|placeholder|example|secret-min/i.test(s);
    if (placeholder(JWT_SECRET) || placeholder(JWT_REFRESH_SECRET)) {
      console.error("❌ JWT_SECRET / JWT_REFRESH_SECRET are still placeholders in production.");
      process.exit(1);
    }
    if (JWT_SECRET === JWT_REFRESH_SECRET) {
      console.error("❌ JWT_SECRET and JWT_REFRESH_SECRET must differ in production.");
      process.exit(1);
    }
    if (parsed.data.CORS_ORIGINS.includes("localhost")) {
      console.error("❌ CORS_ORIGINS still points at localhost in production.");
      process.exit(1);
    }
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
  // SMTP is "configured" once a host is set; otherwise we log emails.
  emailEnabled: raw.SMTP_HOST.length > 0,
  // A provider is usable only when both halves of its credential are present.
  oauth: {
    google: raw.GOOGLE_CLIENT_ID.length > 0 && raw.GOOGLE_CLIENT_SECRET.length > 0,
    facebook: raw.FACEBOOK_APP_ID.length > 0 && raw.FACEBOOK_APP_SECRET.length > 0,
  },
  // Discord notifications are sent only when a webhook URL is configured.
  discordEnabled: raw.DISCORD_WEBHOOK_URL.length > 0,
  // Sentry is initialised only when a DSN is configured.
  sentryEnabled: raw.SENTRY_DSN.length > 0,
};

export type Env = typeof env;
