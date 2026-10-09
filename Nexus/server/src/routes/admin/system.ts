/** Система: настройки на играта (с граници), одит/дневници, webhook-и, сървър. */
import type { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../db';
import { isSafeWebhookUrl, deliver } from '../../lib/logger';
import { getAllSettings, setSetting, findSetting, settingBounds, validateSettingValue } from '../../game/settings';
import { audit, parseId, parseQuery, escapeLike } from '../../lib/adminKit';
import { destructiveLimiter, pick, type Row } from './kit';

export function registerSystem(router: Router): void {
  /* =========================================================
     Game settings (runtime knobs) — с граници по ключ
     ========================================================= */
  router.get('/settings', (_req, res) => {
    // Границите идват от самото описание (game/settings.ts) — един източник.
    const settings = getAllSettings().map((s) => ({ ...s, bounds: settingBounds(s.def) }));
    res.json({ settings });
  });

  const settingPutSchema = z.object({ value: z.union([z.string().max(500), z.number(), z.boolean()]) }).strict();

  router.put('/settings/:key', (req, res) => {
    const key = req.params.key;
    const def = findSetting(key);
    if (!def) { res.status(404).json({ error: 'Unknown setting' }); return; }
    const parse = settingPutSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
    const checked = validateSettingValue(def, parse.data.value);
    if (!checked.ok) { res.status(400).json({ error: checked.error }); return; }
    const v = checked.value;
    const before = getAllSettings().find((s) => s.def.key === key)?.value;
    setSetting(key, v, req.auth!.uid);
    audit(req, res, { action: 'setting_update', targetType: 'setting', level: def.group === 'security' ? 'warn' : 'info', before: { [key]: before }, after: { [key]: v }, message: `Setting ${key} changed` });
    res.json({ ok: true, key, value: v });
  });

  /* =========================================================
     Event logs — филтри + курсорна пагинация (по id)
     ========================================================= */
  const logsQuery = z.object({
    limit: z.coerce.number().int().min(1).max(500).default(100),
    before_id: z.coerce.number().int().positive().optional(),
    category: z.string().regex(/^[a-z_]{0,24}$/).optional().default(''),
    level: z.enum(['', 'debug', 'info', 'warn', 'error']).optional().default(''),
    q: z.string().trim().max(80).optional().default(''),
    user_id: z.coerce.number().int().positive().optional(),
  });
  router.get('/logs', (req, res) => {
    // Преди: `?limit=-1` → `LIMIT -1` в SQLite = БЕЗ таван (целият дневник).
    const q = parseQuery(logsQuery, req, res); if (!q) return;
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.before_id) { where.push('id < ?'); params.push(q.before_id); }
    // 'audit' = пълният одит на админите: админ действия + модерация.
    if (q.category === 'audit') where.push("category IN ('admin', 'moderation')");
    else if (q.category) { where.push('category = ?'); params.push(q.category); }
    if (q.level) { where.push('level = ?'); params.push(q.level); }
    if (q.user_id) { where.push('user_id = ?'); params.push(q.user_id); }
    if (q.q) {
      const like = `%${escapeLike(q.q)}%`;
      where.push(`(action LIKE ? ESCAPE '\\' OR message LIKE ? ESCAPE '\\')`);
      params.push(like, like);
    }
    const rows = getDb()
      .prepare(`SELECT id, ts, category, action, level, user_id, character_id, target_id, target_type, ip, country, route, message, meta_json, webhook_sent
                FROM event_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`)
      .all(...params, q.limit) as { id: number }[];
    res.json({ logs: rows, next_before_id: rows.length === q.limit ? rows[rows.length - 1].id : null });
  });

  /* =========================================================
     Webhook endpoints — тайните НЕ се връщат към клиента
     ========================================================= */
  const categoryFilter = z.string().trim().max(120).regex(/^(\*|[a-z_]+(,[a-z_]+)*)$/, 'Use * or a comma-separated list of categories');

  router.get('/webhooks', (_req, res) => {
    const rows = getDb().prepare(`
      SELECT id, url, category_filter, enabled, created_at, last_called_at, last_status, failures,
             (secret <> '') AS has_secret
      FROM webhook_endpoints ORDER BY created_at DESC`).all();
    res.json({ webhooks: rows });
  });

  const webhookSchema = z.object({
    // Отхвърля loopback / RFC1918 / link-local още при регистрация (SSRF).
    url: z.string().trim().url().max(500).refine(isSafeWebhookUrl, 'URL must be a public http(s) endpoint — loopback, private, and link-local addresses are blocked'),
    secret: z.string().max(120).default(''),
    category_filter: categoryFilter.default('*'),
    enabled: z.boolean().default(true),
  }).strict();

  router.post('/webhooks', (req, res) => {
    const parse = webhookSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
    const info = getDb()
      .prepare('INSERT INTO webhook_endpoints (url, secret, category_filter, enabled, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(parse.data.url, parse.data.secret, parse.data.category_filter, parse.data.enabled ? 1 : 0, Date.now());
    const id = Number(info.lastInsertRowid);
    audit(req, res, { action: 'webhook_create', targetType: 'webhook', targetId: id, level: 'warn', after: { url: parse.data.url, category_filter: parse.data.category_filter, enabled: parse.data.enabled, secret: parse.data.secret } });
    res.status(201).json({ ok: true, id });
  });

  const webhookPatchSchema = z.object({
    enabled: z.boolean().optional(),
    category_filter: categoryFilter.optional(),
    secret: z.string().max(120).optional(),
  }).strict();

  router.patch('/webhooks/:id', (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const parse = webhookPatchSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
    const keys = Object.keys(parse.data);
    if (!keys.length) { res.status(400).json({ error: 'No fields to update.' }); return; }
    const db = getDb();
    const before = db.prepare('SELECT enabled, category_filter, secret FROM webhook_endpoints WHERE id = ?').get(id) as Row | undefined;
    if (!before) { res.status(404).json({ error: 'Webhook not found' }); return; }
    const vals: Row = { ...parse.data, id };
    if (typeof vals.enabled === 'boolean') vals.enabled = vals.enabled ? 1 : 0;
    db.prepare(`UPDATE webhook_endpoints SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run(vals);
    audit(req, res, { action: 'webhook_update', targetType: 'webhook', targetId: id, level: 'warn', before: pick(before, keys), after: pick(vals, keys) });
    res.json({ ok: true });
  });

  router.delete('/webhooks/:id', destructiveLimiter, (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const db = getDb();
    const before = db.prepare('SELECT url, category_filter FROM webhook_endpoints WHERE id = ?').get(id) as Row | undefined;
    if (!before) { res.status(404).json({ error: 'Webhook not found' }); return; }
    db.prepare('DELETE FROM webhook_endpoints WHERE id = ?').run(id);
    audit(req, res, { action: 'webhook_delete', targetType: 'webhook', targetId: id, level: 'warn', before });
    res.json({ ok: true });
  });

  /**
   * Тестово събитие КЪМ ТОЗИ webhook (преди: logEvent към ВСИЧКИ webhook-и с
   * филтър 'system' — избраният изобщо не получаваше нищо, ако филтърът му не
   * включваше system). Минава през същия deliver() със SSRF/DNS-rebinding защита.
   */
  router.post('/webhooks/:id/test', async (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const db = getDb();
    const row = db.prepare('SELECT id, url, secret FROM webhook_endpoints WHERE id = ?').get(id) as { id: number; url: string; secret: string } | undefined;
    if (!row) { res.status(404).json({ error: 'Webhook not found' }); return; }
    const payload = {
      id: 0, ts: Date.now(), category: 'system', action: 'webhook_test', level: 'info',
      message: 'Webhook test fired from the Nexus Dominion admin panel.',
      meta: { webhook_id: id },
    };
    await Promise.race([
      deliver(row, payload).catch(() => undefined),
      new Promise((r) => setTimeout(r, 8000)),
    ]);
    const after = db.prepare('SELECT last_status, last_called_at FROM webhook_endpoints WHERE id = ?').get(id) as { last_status: number | null; last_called_at: number | null };
    const delivered = typeof after.last_status === 'number' && after.last_status >= 200 && after.last_status < 300;
    audit(req, res, { action: 'webhook_test', targetType: 'webhook', targetId: id, after: { last_status: after.last_status }, meta: { delivered } });
    res.json({ ok: true, delivered, status: after.last_status });
  });

  router.get('/server', (_req, res) => {
    res.json({
      node: process.version,
      uptime_sec: Math.floor(process.uptime()),
      memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      env: process.env.NODE_ENV || 'development',
      pid: process.pid,
    });
  });
}
