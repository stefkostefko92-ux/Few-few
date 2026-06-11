/**
 * Production observability helpers. Wires Sentry when SENTRY_DSN is set;
 * otherwise falls back to local stderr so dev environments stay zero-dep.
 *
 * Surfaces:
 *   - captureError(err, ctx?)   — explicit error reporting
 *   - withMonitoring(handler)   — express middleware wrapper
 *   - installProcessGuards()    — uncaughtException / unhandledRejection
 *     hooks; called once from server.ts entrypoint.
 */
import type { Request, Response, NextFunction } from 'express';

interface SentryLike {
  init(opts: any): void;
  captureException(err: any, ctx?: any): void;
}
let sentry: SentryLike | null = null;

export function initObservability(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    // Use eval require so the build doesn't fail if @sentry/node isn't installed.
    // We only import when the operator opts in by setting SENTRY_DSN.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require('@sentry/node') as SentryLike;
    Sentry.init({ dsn, tracesSampleRate: 0.1, environment: process.env.NODE_ENV || 'production' });
    sentry = Sentry;
    console.log('[obs] Sentry initialised');
  } catch (e: any) {
    console.warn('[obs] SENTRY_DSN is set but @sentry/node is not installed; install it to enable.');
  }
}

export function captureError(err: unknown, ctx?: Record<string, any>): void {
  if (sentry) {
    try { sentry.captureException(err, { extra: ctx }); return; } catch { /* fallthrough */ }
  }
  // eslint-disable-next-line no-console
  console.error('[server-error]', err, ctx ?? '');
}

/** Wraps an async express handler so any thrown error is surfaced and
 *  reported instead of leaving the request hanging. */
export function withMonitoring<F extends (req: Request, res: Response, next: NextFunction) => any>(fn: F): F {
  return (async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      captureError(err, { path: req.path, method: req.method, uid: (req as any).auth?.uid });
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
      else res.end();
    }
  }) as F;
}

export function installProcessGuards(): void {
  process.on('uncaughtException', (err) => {
    captureError(err, { kind: 'uncaughtException' });
  });
  process.on('unhandledRejection', (reason) => {
    captureError(reason, { kind: 'unhandledRejection' });
  });
}
