/**
 * Event logger + webhook fan-out.
 *
 * Every significant action in the game funnels through logEvent(). It:
 *   - persists the row in event_log (always)
 *   - fires-and-forgets a POST to every enabled webhook endpoint whose
 *     category_filter matches (best-effort, never throws)
 *
 * Webhook endpoints are configured in the webhook_endpoints table OR via
 * the WEBHOOK_URLS env var (comma-separated). Each delivery includes an
 * HMAC-SHA256 signature in the X-Signature header (if a secret is set).
 */

import crypto from 'crypto';
import { getDb } from '../db';

export type LogCategory =
  | 'auth' | 'character' | 'combat' | 'inventory' | 'market' | 'guild'
  | 'payment' | 'admin' | 'daily' | 'wheel' | 'achievement' | 'camp'
  | 'system' | 'security';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEvent {
  category: LogCategory;
  action: string;
  level?: LogLevel;
  user_id?: number | null;
  character_id?: number | null;
  target_id?: number | null;
  target_type?: string;
  ip?: string;
  country?: string;
  route?: string;
  message?: string;
  meta?: Record<string, any>;
}

/* ===== Webhook fan-out ===== */

interface EnvEndpoint { url: string; secret?: string }

function envEndpoints(): EnvEndpoint[] {
  const raw = process.env.WEBHOOK_URLS || '';
  if (!raw.trim()) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean).map((url) => ({
    url,
    secret: process.env.WEBHOOK_SECRET || '',
  }));
}

interface DbEndpoint { id: number; url: string; secret: string; category_filter: string }
function dbEndpoints(category: LogCategory): DbEndpoint[] {
  try {
    return getDb()
      .prepare(
        `SELECT id, url, secret, category_filter FROM webhook_endpoints
         WHERE enabled = 1 AND (category_filter = '*' OR category_filter LIKE ?)`,
      )
      .all(`%${category}%`) as DbEndpoint[];
  } catch {
    return [];
  }
}

function sign(secret: string, body: string): string {
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function deliver(endpoint: { url: string; secret?: string; id?: number }, payload: any): Promise<void> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'NexusDominion-Webhook/1',
    'X-Event-Category': payload.category,
    'X-Event-Action': payload.action,
  };
  if (endpoint.secret) headers['X-Signature'] = `sha256=${sign(endpoint.secret, body)}`;
  try {
    const res = await fetch(endpoint.url, { method: 'POST', body, headers });
    if (endpoint.id) {
      getDb()
        .prepare('UPDATE webhook_endpoints SET last_called_at = ?, last_status = ?, failures = CASE WHEN ? >= 400 THEN failures + 1 ELSE 0 END WHERE id = ?')
        .run(Date.now(), res.status, res.status, endpoint.id);
    }
  } catch (e: any) {
    if (endpoint.id) {
      getDb()
        .prepare('UPDATE webhook_endpoints SET last_called_at = ?, last_status = ?, failures = failures + 1 WHERE id = ?')
        .run(Date.now(), -1, endpoint.id);
    }
  }
}

/* ===== Logger entry-point ===== */

export function logEvent(event: LogEvent): number {
  const now = Date.now();
  const level = event.level || 'info';
  const meta = event.meta || {};
  let inserted = -1;
  try {
    const info = getDb()
      .prepare(
        `INSERT INTO event_log (ts, category, action, level, user_id, character_id, target_id, target_type, ip, country, route, message, meta_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        now,
        event.category,
        event.action,
        level,
        event.user_id ?? null,
        event.character_id ?? null,
        event.target_id ?? null,
        event.target_type ?? null,
        event.ip || '',
        event.country || '',
        event.route || '',
        event.message || '',
        JSON.stringify(meta),
      );
    inserted = info.lastInsertRowid as number;
  } catch {
    /* schema may not be migrated yet; swallow */
  }

  // Console mirror (helpful for `docker logs`)
  const tag = `[${level.toUpperCase()}] ${event.category}.${event.action}`;
  // eslint-disable-next-line no-console
  console.log(tag, JSON.stringify({ user_id: event.user_id, character_id: event.character_id, ip: event.ip, ...(event.meta || {}) }));

  // Webhook fan-out
  const payload = {
    id: inserted, ts: now, ...event, meta,
  };
  for (const ep of envEndpoints()) {
    deliver(ep, payload).catch(() => {});
  }
  for (const ep of dbEndpoints(event.category)) {
    deliver(ep, payload).catch(() => {});
    if (inserted > 0) getDb().prepare('UPDATE event_log SET webhook_sent = 1 WHERE id = ?').run(inserted);
  }
  return inserted;
}

/* Convenience helper that pulls IP/country/route from a Request. */
import type { Request } from 'express';
export function logFromRequest(req: Request, event: LogEvent): number {
  const ip = (req.ip || '').replace('::ffff:', '');
  const country = (req as any).detectedCountry || '';
  const route = `${req.method} ${req.path}`;
  return logEvent({ ip, country, route, user_id: req.auth?.uid, ...event });
}
