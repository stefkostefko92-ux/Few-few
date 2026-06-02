import * as Sentry from "@sentry/node";
import { env } from "../env.js";
import { logger } from "../logger.js";

/**
 * Sentry error tracking (§ ops). Env-gated: initialised only when SENTRY_DSN is
 * set, so the API runs identically without it. We capture unhandled server
 * errors from the central error handler rather than auto-instrumenting, to keep
 * the footprint small and predictable.
 */
let started = false;

export function initSentry(): void {
  if (!env.sentryEnabled || started) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
  });
  started = true;
  logger.info("sentry initialised");
}

export function captureError(err: unknown): void {
  if (env.sentryEnabled) Sentry.captureException(err);
}
