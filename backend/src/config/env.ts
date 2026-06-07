/**
 * Startup configuration with fail-fast validation (GDD §11.3/§11.4).
 *
 * In production the server REFUSES TO BOOT rather than fall back to insecure
 * defaults — every senior review flagged that the old code silently booted the
 * non-durable in-memory store on a missing DATABASE_URL and signed/verified with
 * public, in-source dev secrets on missing JWT/IAP keys. Here those are hard
 * errors when NODE_ENV=production. In development the dev defaults are allowed
 * (with the existing warnings) so `npm run dev` stays zero-config.
 */

/** Public, in-source dev defaults that must never be used in production. */
const DEV_DEFAULTS: Record<string, string> = {
  JWT_SECRET: "dev-insecure-secret-change-me-0000",
  IAP_RECEIPT_SECRET: "dev-receipt-secret-change-me",
  IAP_WEBHOOK_SECRET: "dev-webhook-secret-change-me",
};

export interface AppConfig {
  nodeEnv: string;
  isProd: boolean;
  port: number;
  databaseUrl?: string;
  redisUrl?: string;
  jwtSecret: string;
  receiptSecret: string;
  webhookSecret: string;
  adminKey?: string;
  enableDevReceipts: boolean;
  /** Explicit opt-in to ship the sandbox IAP validator (never grants real money safety). */
  allowStubReceipts: boolean;
  corsOrigins: string[];
  /** Value for Express `trust proxy` — hop count behind a load balancer. */
  trustProxy: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? "development";
  const isProd = nodeEnv === "production";

  const jwtSecret = env.JWT_SECRET ?? DEV_DEFAULTS.JWT_SECRET;
  const receiptSecret = env.IAP_RECEIPT_SECRET ?? DEV_DEFAULTS.IAP_RECEIPT_SECRET;
  const webhookSecret = env.IAP_WEBHOOK_SECRET ?? DEV_DEFAULTS.IAP_WEBHOOK_SECRET;
  const enableDevReceipts = env.ENABLE_DEV_RECEIPTS === "true";
  const allowStubReceipts = env.ALLOW_STUB_RECEIPTS === "true";

  const errors: string[] = [];
  if (isProd) {
    if (!env.DATABASE_URL) {
      errors.push("DATABASE_URL is required in production (refusing to boot the non-durable in-memory store)");
    }
    for (const key of ["JWT_SECRET", "IAP_RECEIPT_SECRET", "IAP_WEBHOOK_SECRET"]) {
      if (!env[key]) errors.push(`${key} is required in production`);
      else if (env[key] === DEV_DEFAULTS[key]) errors.push(`${key} is set to a public dev default — set a real secret`);
    }
    if (jwtSecret.length < 16) errors.push("JWT_SECRET must be at least 16 characters");
    if (enableDevReceipts) errors.push("ENABLE_DEV_RECEIPTS must not be 'true' in production");
    if (!allowStubReceipts) {
      // The shipped IAP validator is a sandbox stub; there is no real store-side
      // verification yet. Force an explicit, eyes-open opt-in so a default prod
      // deploy can't silently grant free currency on forged receipts.
      errors.push(
        "no real IAP receipt validator is configured. Implement a store-side validator, " +
          "or set ALLOW_STUB_RECEIPTS=true to deploy with the sandbox stub (NOT for real money).",
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid production configuration:\n  - ${errors.join("\n  - ")}`);
  }

  return {
    nodeEnv,
    isProd,
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    jwtSecret,
    receiptSecret,
    webhookSecret,
    adminKey: env.ADMIN_API_KEY,
    enableDevReceipts,
    allowStubReceipts,
    corsOrigins: (env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    trustProxy: Number.parseInt(env.TRUST_PROXY ?? "0", 10) || 0,
  };
}
