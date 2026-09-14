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
  | 'system' | 'security' | 'dsa' | 'moderation';

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

// Audit (security round): admins can register arbitrary webhook URLs
// that this server then POSTs to from inside the cluster. If we don't
// vet the destination, a compromised (or malicious) admin can point a
// webhook at `http://169.254.169.254/...` (cloud metadata) or any
// internal service, and the server will dutifully deliver attacker-
// crafted bodies. Block private/loopback/link-local hostnames + non-
// http(s) schemes before every delivery (and at registration time in
// admin.ts).
export function isSafeWebhookUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  // IPv4 literal — block 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16.
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a >= 224) return false; // multicast / reserved
  }
  // IPv6 literal — block ::1, fc00::/7 (ULA), fe80::/10 (link-local).
  if (host.startsWith('[')) {
    const v6 = host.slice(1, -1).toLowerCase();
    if (v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb')) return false;
  }
  return true;
}

/** true, ако IP литерал е loopback/private/link-local/multicast. */
function isPrivateIp(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
    return false;
  }
  const v6 = ip.toLowerCase();
  return v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd')
    || v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb');
}

/**
 * Анти-DNS-rebinding: резолвва hostname-а при ВСЯКА доставка и отказва, ако
 * сочи към частен адрес. `isSafeWebhookUrl` пази само литералите/имената при
 * регистрация — публичен домейн, който резолвва към 127.0.0.1/RFC1918
 * (rebinding), минаваше. Fail-closed: неуспешен resolve → отказ.
 */
async function hostResolvesPrivate(hostname: string): Promise<boolean> {
  // Литерален IP вече е валидиран от isSafeWebhookUrl — не резолвваме.
  if (/^[\d.]+$/.test(hostname) || hostname.startsWith('[')) return false;
  try {
    const { promises: dns } = await import('node:dns');
    const addrs = await dns.lookup(hostname, { all: true });
    return addrs.some((a) => isPrivateIp(a.address));
  } catch {
    return true; // не може да се резолвне → fail closed
  }
}

/** Discord webhook routes expect a content + embeds payload rather than
 *  a raw JSON envelope. Detect by hostname and re-shape the body before
 *  delivery so admins can paste a Discord webhook URL straight in and
 *  get pretty embeds. The signature header is suppressed for Discord
 *  hosts since Discord ignores custom headers. */
function isDiscordWebhook(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === 'discord.com' || h === 'discordapp.com' || h.endsWith('.discord.com') || h.endsWith('.discordapp.com');
  } catch { return false; }
}

const CATEGORY_COLOR: Record<string, number> = {
  combat:    0xff7468, // red — fights, deaths, raid clears
  payment:   0xd6a13d, // gold — Stripe + premium grants
  inventory: 0x6ad8a4, // green — drops, crafts, sales
  guild:     0x6aa7ff, // blue — wars, raids, donations
  character: 0xd6a13d, // gold — level-ups, profile changes
  daily:     0xffb159, // orange — daily/weekly rolls
  system:    0x9aa3b4, // gray — boot, errors, migrations
  auction:   0xc294ff, // purple — listings, bids, settlements
  market:    0x6ad8a4, // green — market activity
};

function formatDiscordPayload(payload: any): any {
  const color = CATEGORY_COLOR[payload.category] || 0x9aa3b4;
  const fields: any[] = [];
  if (payload.character_id) fields.push({ name: 'Character', value: `#${payload.character_id}`, inline: true });
  if (payload.target_id) fields.push({ name: 'Target', value: `${payload.target_type || ''} #${payload.target_id}`.trim(), inline: true });
  if (payload.route) fields.push({ name: 'Route', value: payload.route, inline: true });
  if (payload.country) fields.push({ name: 'Country', value: payload.country, inline: true });
  if (payload.meta && typeof payload.meta === 'object') {
    const summary = Object.entries(payload.meta)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .slice(0, 8) // keep embeds within Discord limits
      .map(([k, v]) => `**${k}**: ${typeof v === 'object' ? '`' + JSON.stringify(v).slice(0, 120) + '`' : String(v).slice(0, 120)}`)
      .join('\n');
    if (summary) fields.push({ name: 'Details', value: summary });
  }
  return {
    username: 'Nexus Dominion',
    embeds: [{
      title: `[${payload.category || 'event'}] ${payload.action || 'log'}`,
      description: (payload.message || '').slice(0, 1800),
      color,
      fields,
      timestamp: new Date(payload.ts || Date.now()).toISOString(),
      footer: { text: payload.level ? payload.level.toUpperCase() : 'INFO' },
    }],
  };
}

async function deliver(endpoint: { url: string; secret?: string; id?: number }, payload: any): Promise<void> {
  const markUnsafe = () => {
    if (endpoint.id) {
      getDb()
        .prepare('UPDATE webhook_endpoints SET last_called_at = ?, last_status = ?, failures = failures + 1 WHERE id = ?')
        .run(Date.now(), -2, endpoint.id);
    }
  };
  if (!isSafeWebhookUrl(endpoint.url)) { markUnsafe(); return; }
  // Анти-DNS-rebinding: провери резолвнатия IP при доставката.
  let host = '';
  try { host = new URL(endpoint.url).hostname; } catch { markUnsafe(); return; }
  if (await hostResolvesPrivate(host)) { markUnsafe(); return; }
  const discordMode = isDiscordWebhook(endpoint.url);
  const finalPayload = discordMode ? formatDiscordPayload(payload) : payload;
  const body = JSON.stringify(finalPayload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'NexusDominion-Webhook/1',
  };
  if (!discordMode) {
    headers['X-Event-Category'] = payload.category;
    headers['X-Event-Action'] = payload.action;
  }
  if (endpoint.secret && !discordMode) headers['X-Signature'] = `sha256=${sign(endpoint.secret, body)}`;
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

/**
 * Retention: delete event_log rows older than `maxAgeMs` (default 90 days),
 * matching the window stated in the privacy policy. Without this the table
 * kept IP + hashed identifiers indefinitely, contradicting the declared
 * retention. Called on boot and daily from server.ts.
 */
export function pruneEventLog(maxAgeMs: number = 90 * 24 * 60 * 60 * 1000): number {
  try {
    const cutoff = Date.now() - maxAgeMs;
    const r = getDb().prepare('DELETE FROM event_log WHERE ts < ?').run(cutoff);
    return r.changes as number;
  } catch {
    return 0;
  }
}

/* Convenience helper that pulls IP/country/route from a Request. */
import type { Request } from 'express';
export function logFromRequest(req: Request, event: LogEvent): number {
  const ip = (req.ip || '').replace('::ffff:', '');
  const country = (req as any).detectedCountry || '';
  const route = `${req.method} ${req.path}`;
  return logEvent({ ip, country, route, user_id: req.auth?.uid, ...event });
}
