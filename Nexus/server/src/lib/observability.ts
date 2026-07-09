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
  // GDPR Art. 44–46 — telemetry leaving the EU needs SCCs or adequacy.
  // Sentry SaaS runs `*.ingest.sentry.io` (US) by default and `*.ingest.
  // de.sentry.io` for the EU region. Refuse to boot against the US
  // ingest in production unless the operator explicitly opts in via
  // SENTRY_ALLOW_NON_EU=1 — surfaces the compliance gap loudly.
  const dsnUrl = (() => { try { return new URL(dsn); } catch { return null; } })();
  const host = dsnUrl?.host || '';
  const isEu = /\.de\.sentry\.io$|\.eu\.sentry\.io$/.test(host) || /^([a-z0-9-]+\.)?ingest\.de\.sentry\.io$/.test(host);
  if (!isEu && process.env.NODE_ENV === 'production' && process.env.SENTRY_ALLOW_NON_EU !== '1') {
    console.error(
      `[obs] SENTRY_DSN points at a non-EU ingest host (${host}). ` +
      'Configure an EU-region project at sentry.io or set SENTRY_ALLOW_NON_EU=1 ' +
      '(only after signing SCCs and updating the Privacy Policy sub-processor table).',
    );
    return;
  }
  try {
    // Use eval require so the build doesn't fail if @sentry/node isn't installed.
    // We only import when the operator opts in by setting SENTRY_DSN.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require('@sentry/node') as SentryLike;
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV || 'production',
      // Stripe / Express / express-rate-limit can leak PII into breadcrumbs
      // (req.body.email, headers). Drop common PII fields before send.
      beforeSend(event: any) {
        try {
          const r = event?.request;
          if (r?.headers) {
            delete r.headers.authorization;
            delete r.headers.cookie;
            delete r.headers['x-csrf-token'];
          }
          if (r?.data && typeof r.data === 'object') {
            for (const k of ['password', 'current', 'next', 'email', 'token']) {
              if (k in r.data) r.data[k] = '[redacted]';
            }
          }
          if (event.user) {
            event.user = { id: event.user.id }; // keep id only, drop email/ip
          }
        } catch { /* best-effort */ }
        return event;
      },
    } as any);
    sentry = Sentry;
    console.log(`[obs] Sentry initialised (host=${host})`);
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
