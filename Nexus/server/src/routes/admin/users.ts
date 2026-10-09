/** Потребители: списък/детайл, админ права, диаманти, създаване, GDPR изтриване. */
import type { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { getDb } from '../../db';
import { passwordRule, PASSWORD_BCRYPT_ROUNDS, ageGateError } from '../auth';
import { eraseUser } from '../../lib/erasure';
import { audit, parseId, parseQuery, pageQuery, pageMeta, escapeLike } from '../../lib/adminKit';
import { destructiveLimiter, sqliteError, type Row } from './kit';

const usersQuery = pageQuery.extend({
  filter: z.enum(['all', 'admins', 'banned']).default('all'),
});

// Админ-създадени акаунти: същото passwordRule + bcrypt 12 като /register.
const createUserSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, 'Use letters, numbers, underscores only'),
  email: z.string().trim().toLowerCase().email().max(200),
  password: passwordRule,
  // GDPR чл. 8 — същият age gate като /register (иначе админ-акаунтите го заобикалят).
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth required'),
  country: z.string().length(2).regex(/^[A-Z]{2}$/),
  is_admin: z.boolean().optional(),
}).strict();

/* Грант (или отнемане с отрицателна сума) на диаманти. */
const gemsSchema = z.object({ amount: z.number().int().min(-1_000_000).max(1_000_000).refine((n) => n !== 0, 'Amount must be non-zero') }).strict();

export function registerUsers(router: Router): void {
  router.get('/users', (req, res) => {
    const q = parseQuery(usersQuery, req, res); if (!q) return;
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.q) {
      const like = `%${escapeLike(q.q)}%`;
      where.push(`(u.username LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR u.id = ?)`);
      params.push(like, like, like, /^\d+$/.test(q.q) ? Number(q.q) : -1);
    }
    if (q.filter === 'admins') where.push('u.is_admin = 1');
    if (q.filter === 'banned') {
      where.push('u.banned = 1 AND (u.banned_until = 0 OR u.banned_until > ?)');
      params.push(Date.now());
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const db = getDb();
    const total = (db.prepare(`SELECT COUNT(*) AS c FROM users u LEFT JOIN characters c ON c.user_id = u.id ${w}`).get(...params) as { c: number }).c;
    const rows = db.prepare(`
      SELECT u.id, u.username, u.email, u.is_admin, u.created_at, u.last_seen_at,
             u.last_ip, u.last_country, u.country,
             u.banned, u.banned_until, u.banned_reason,
             c.id AS char_id, c.name AS char_name, c.class AS char_class, c.level AS char_level,
             c.gold, c.gems, c.arena_rating,
             c.hp, c.hp_max, c.mp, c.mp_max, c.stat_points, c.skill_points,
             c.energy, c.energy_max, c.current_title
      FROM users u LEFT JOIN characters c ON c.user_id = u.id ${w}
      ORDER BY u.last_seen_at DESC, u.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, q.pageSize, (q.page - 1) * q.pageSize);
    res.json({ ...pageMeta(total, q), users: rows });
  });

  /** Детайл на потребител — акаунт, герой, плащания, последни събития. */
  router.get('/users/:id', (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const db = getDb();
    const user = db.prepare(`
      SELECT id, username, email, is_admin, created_at, last_seen_at, last_ip, last_country,
             last_user_agent, country, banned, banned_reason, banned_at, banned_until
      FROM users WHERE id = ?`).get(id) as Row | undefined;
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    const character = db.prepare('SELECT id, name, class, level, xp, gold, gems, arena_rating, created_at FROM characters WHERE user_id = ?').get(id) ?? null;
    const purchases = db.prepare(`
      SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN status = 'completed' THEN amount_cents END), 0) AS paid_cents
      FROM purchases WHERE character_id = ?`).get((character as Row | null)?.id ?? -1);
    const events = db.prepare(`
      SELECT id, ts, category, action, level, message FROM event_log
      WHERE user_id = ? OR (target_type = 'user' AND target_id = ?)
      ORDER BY id DESC LIMIT 20`).all(id, id);
    res.json({ user, character, purchases, events });
  });

  router.post('/users/:id/admin', destructiveLimiter, (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    // Строго boolean — преди `{admin:"false"}` беше truthy и ПОВИШАВАШЕ.
    const parse = z.object({ admin: z.boolean() }).strict().safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
    const want = parse.data.admin ? 1 : 0;
    const db = getDb();
    const outcome = db.transaction(() => {
      const u = db.prepare('SELECT username, is_admin FROM users WHERE id = ?').get(id) as { username: string; is_admin: number } | undefined;
      if (!u) return { status: 404, error: 'User not found' };
      if (u.is_admin === want) return { status: 409, error: want ? 'User is already an administrator.' : 'User is not an administrator.' };
      if (!want && id === req.auth!.uid) return { status: 409, error: 'You cannot demote yourself.' };
      if (!want) {
        const admins = (db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1').get() as { c: number }).c;
        if (admins <= 1) return { status: 409, error: 'Cannot remove the last administrator.' };
      }
      db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(want, id);
      return { status: 200, username: u.username };
    })();
    if (outcome.status !== 200) { res.status(outcome.status).json({ error: outcome.error }); return; }
    audit(req, res, { action: want ? 'admin_promote' : 'admin_demote', targetType: 'user', targetId: id, level: 'warn', before: { is_admin: 1 - want }, after: { is_admin: want }, message: `${outcome.username} ${want ? 'promoted to' : 'demoted from'} admin` });
    res.json({ ok: true, is_admin: want });
  });

  router.post('/users/:id/gems', (req, res) => {
    const userId = parseId(req, res); if (userId === null) return;
    const parse = gemsSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
    const delta = parse.data.amount;
    const db = getDb();
    const out = db.transaction(() => {
      const ch = db.prepare('SELECT id, name, gems FROM characters WHERE user_id = ?').get(userId) as { id: number; name: string; gems: number } | undefined;
      if (!ch) return null;
      const next = Math.max(0, (ch.gems || 0) + delta);
      db.prepare('UPDATE characters SET gems = ?, total_gems_earned = total_gems_earned + ? WHERE id = ?').run(next, Math.max(0, delta), ch.id);
      return { ch, next };
    })();
    if (!out) { res.status(404).json({ error: 'That user has no character.' }); return; }
    audit(req, res, { action: 'gems_grant', targetType: 'character', targetId: out.ch.id, level: 'warn', before: { gems: out.ch.gems }, after: { gems: out.next }, meta: { delta, user_id: userId } });
    res.json({ ok: true, name: out.ch.name, gems: out.next });
  });

  /**
   * GDPR чл. 17 — изтриване на акаунт от админ. Необратимо, затова изисква
   * `?confirm=<потребителско име>` (двойна защита освен UI диалога) и НЕ
   * позволява изтриване на себе си или на друг администратор.
   */
  router.delete('/users/:id', destructiveLimiter, (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const confirm = typeof req.query.confirm === 'string' ? req.query.confirm : '';
    if (id === req.auth!.uid) { res.status(409).json({ error: 'You cannot delete your own account here.' }); return; }
    const db = getDb();
    const target = db.prepare('SELECT id, username, is_admin FROM users WHERE id = ?').get(id) as { id: number; username: string; is_admin: number } | undefined;
    if (!target) { res.status(404).json({ error: 'User not found' }); return; }
    if (target.is_admin === 1) { res.status(409).json({ error: 'Cannot delete an administrator. Demote them first.' }); return; }
    if (confirm !== target.username) { res.status(400).json({ error: 'Confirmation does not match the username.' }); return; }
    // Споделен erasure — разпуска водени гилдии, чисти event_log PII, отменя обявите.
    db.transaction((uid: number) => eraseUser(db, uid))(id);
    // Одитът пази само id (минимизация — останалото е изтрито по чл. 17).
    audit(req, res, { action: 'user_erase', targetType: 'user', targetId: id, level: 'warn', before: { exists: true }, after: { exists: false }, message: `User #${id} erased (GDPR Art. 17)` });
    res.json({ ok: true });
  });

  router.post('/users', destructiveLimiter, async (req, res) => {
    const parse = createUserSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
    const { username, email, password, dateOfBirth, country, is_admin } = parse.data;
    const gate = ageGateError(dateOfBirth, country);
    if (gate) { res.status(gate.status).json({ error: gate.error }); return; }
    const db = getDb();
    const ex = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (ex) { res.status(409).json({ error: 'Username or email already in use' }); return; }
    const hash = await bcrypt.hash(password, PASSWORD_BCRYPT_ROUNDS);
    const now = Date.now();
    try {
      const info = db.prepare('INSERT INTO users (username, email, password_hash, created_at, last_seen_at, is_admin, date_of_birth, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(username, email, hash, now, now, is_admin ? 1 : 0, dateOfBirth, country);
      const id = Number(info.lastInsertRowid);
      audit(req, res, { action: 'user_create', targetType: 'user', targetId: id, level: is_admin ? 'warn' : 'info', after: { username, is_admin: is_admin ? 1 : 0 } });
      res.status(201).json({ ok: true, id });
    } catch (e) { sqliteError(res, e, 'User'); }
  });
}
