/**
 * Админ API — /api/admin/*.
 *
 * Инварианти (гейтвани от src/game/__tests__/admin.test.ts):
 *  - ВСЕКИ ендпойнт минава през authRequired + adminRequired (router.use по-долу);
 *    не-админ → 403, без токен → 401.
 *  - ВСЕКИ вход е валидиран със zod (id-та, тела, query; пагинацията е с таван).
 *  - ВСЯКО мутиращо действие оставя одит ред „кой · какво · кога · от → към"
 *    (lib/adminKit.audit); предпазна мрежа логва и пропуснатите.
 *  - Многостъпковите промени са в транзакция.
 *  - Липсващ обект → 404, конфликт със състоянието → 409, лош вход → 400.
 *  - Отговорите никога не съдържат password_hash или тайни на webhook-и.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { adminRequired } from '../middleware/admin';
import { logFromRequest, isSafeWebhookUrl, deliver } from '../lib/logger';
import { passwordRule, PASSWORD_BCRYPT_ROUNDS, ageGateError } from './auth';
import { banUser, unbanUser, clientIp, clientHwid } from '../lib/bans';
import { eraseUser } from '../lib/erasure';
import { getAllSettings, setSetting, findSetting, settingBounds, validateSettingValue } from '../game/settings';
import {
  audit, parseId, parseQuery, pageQuery, pageMeta, escapeLike, ipIsShielded,
} from '../lib/adminKit';
import { deliverStatement, notifyNoticeDecision, type Ground } from '../lib/adminModeration';

const router = Router();
router.use(authRequired, adminRequired);

type Db = ReturnType<typeof getDb>;

/* ---------------------------------------------------------------
   Rate limit за разрушителни действия (бан, изтриване, разпращане,
   сваляне, повишаване). Общият admin limiter в server.ts е 60/мин —
   изтекъл админ токен не бива да трие/банва на едро.
   --------------------------------------------------------------- */
const destructiveLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `admin:${req.auth?.uid ?? 'anon'}`,
  message: { error: 'Too many destructive admin actions — wait a minute and try again.' },
});

/* ---------------------------------------------------------------
   Предпазна мрежа на одита: всяка УСПЕШНА мутация, която хендлърът не е
   одитирал изрично, пак оставя ред (warn), за да няма тих пропуск.
   --------------------------------------------------------------- */
router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const path = req.path;
  const method = req.method;
  res.on('finish', () => {
    if (res.locals.audited || res.statusCode >= 400) return;
    logFromRequest(req, {
      category: 'admin',
      action: `${method.toLowerCase()}_${path.replace(/^\//, '').split('/')[0] || 'root'}`,
      level: 'warn',
      target_type: path.replace(/^\//, '').split('/')[0] || '',
      message: `Unaudited admin ${method} ${path}`,
      meta: { admin_id: req.auth?.uid ?? null, status: res.statusCode },
    });
  });
  next();
});

/** SQLite грешка → коректен HTTP код без изтичане на вътрешни детайли. */
function sqliteError(res: Response, e: unknown, what: string): void {
  const msg = e instanceof Error ? e.message : '';
  if (/UNIQUE constraint failed/i.test(msg)) {
    const col = msg.split('.').pop() || 'value';
    res.status(409).json({ error: `${what}: ${col} already exists.` });
  } else if (/FOREIGN KEY constraint failed/i.test(msg)) {
    res.status(409).json({ error: `${what} is still referenced and cannot be changed/removed.` });
  } else {
    res.status(500).json({ error: `${what} failed.` });
  }
}

const pick = (row: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, row[k]]));

/* =========================================================
   Dashboard / overview
   ========================================================= */
function count(db: Db, sql: string, ...params: unknown[]): number {
  try { return (db.prepare(sql).get(...params) as { c: number }).c; } catch { return 0; }
}

router.get('/overview', (_req, res) => {
  const db = getDb();
  const counts = {
    users: count(db, 'SELECT COUNT(*) AS c FROM users'),
    admins: count(db, 'SELECT COUNT(*) AS c FROM users WHERE is_admin = 1'),
    banned: count(db, 'SELECT COUNT(*) AS c FROM users WHERE banned = 1 AND (banned_until = 0 OR banned_until > ?)', Date.now()),
    characters: count(db, 'SELECT COUNT(*) AS c FROM characters WHERE is_npc = 0'),
    npcs: count(db, 'SELECT COUNT(*) AS c FROM characters WHERE is_npc = 1'),
    items: count(db, 'SELECT COUNT(*) AS c FROM items'),
    monsters: count(db, 'SELECT COUNT(*) AS c FROM monsters'),
    quests: count(db, 'SELECT COUNT(*) AS c FROM quests'),
    battles: count(db, 'SELECT COUNT(*) AS c FROM combat_log'),
    guilds: count(db, 'SELECT COUNT(*) AS c FROM guilds'),
    open_notices: count(db, "SELECT COUNT(*) AS c FROM dsa_notices WHERE status = 'open'"),
    purchases_completed: count(db, "SELECT COUNT(*) AS c FROM purchases WHERE status = 'completed'"),
    market_sales: count(db, "SELECT COUNT(*) AS c FROM marketplace_listings WHERE status = 'sold'"),
    market_listings_active: count(db, "SELECT COUNT(*) AS c FROM marketplace_listings WHERE status = 'active'"),
    tower_climbs: count(db, "SELECT COUNT(*) AS c FROM event_log WHERE action IN ('tower_clear','tower_wipe')"),
    bounty_claims: count(db, "SELECT COUNT(*) AS c FROM event_log WHERE action = 'bounty_claim'"),
    trial_tokens_spent: count(db, 'SELECT COUNT(*) AS c FROM trial_purchases'),
    battle_pass_passes: count(db, 'SELECT COUNT(*) AS c FROM battle_pass'),
    battle_pass_premium: count(db, 'SELECT COUNT(*) AS c FROM battle_pass WHERE premium_unlocked = 1'),
  };
  const recentUsers = db
    .prepare('SELECT id, username, email, created_at, last_seen_at, is_admin FROM users ORDER BY created_at DESC LIMIT 10')
    .all();
  const topChars = db
    .prepare('SELECT id, name, class, level, arena_rating, gold, is_npc FROM characters WHERE is_npc = 0 ORDER BY level DESC, arena_rating DESC LIMIT 10')
    .all();
  res.json({ counts, recentUsers, topChars });
});

/* =========================================================
   Tower of Trials — leaderboard, force-reset run
   ========================================================= */
router.get('/tower', (_req, res) => {
  const climbers = getDb()
    .prepare(
      `SELECT id, name, class, level, tower_best_floor, tower_current_floor, trial_tokens, forge_guarantees
       FROM characters WHERE is_npc = 0 AND tower_best_floor > 0
       ORDER BY tower_best_floor DESC LIMIT 100`,
    )
    .all();
  res.json({ climbers });
});

router.post('/tower/reset/:id', (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const db = getDb();
  const before = db.prepare('SELECT name, tower_current_floor FROM characters WHERE id = ?').get(id) as { name: string; tower_current_floor: number } | undefined;
  if (!before) { res.status(404).json({ error: 'Character not found' }); return; }
  db.prepare('UPDATE characters SET tower_current_floor = 0, tower_run_seed = 0 WHERE id = ?').run(id);
  audit(req, res, { action: 'tower_reset', targetType: 'character', targetId: id, before: { tower_current_floor: before.tower_current_floor }, after: { tower_current_floor: 0 }, message: `Tower run reset for ${before.name}` });
  res.json({ ok: true });
});

/* =========================================================
   Bounties — view / force-refresh
   ========================================================= */
router.get('/bounties', (_req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT cb.character_id, c.name AS character_name, cb.day_index, cb.bounties_json
       FROM character_bounties cb JOIN characters c ON c.id = cb.character_id
       ORDER BY cb.day_index DESC LIMIT 100`,
    )
    .all();
  res.json({ rows });
});

router.post('/bounties/clear/:id', (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const info = getDb().prepare('DELETE FROM character_bounties WHERE character_id = ?').run(id);
  if (info.changes === 0) { res.status(404).json({ error: 'No stored bounties for this character' }); return; }
  audit(req, res, { action: 'bounties_clear', targetType: 'character', targetId: id, before: { boards: info.changes }, after: { boards: 0 } });
  res.json({ ok: true, cleared: info.changes });
});

/* =========================================================
   Battle Pass — view subscriptions, force-unlock premium
   ========================================================= */
const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM');

router.get('/battlepass', (req, res) => {
  const q = parseQuery(z.object({ month: monthKey.optional().or(z.literal('')) }), req, res); if (!q) return;
  const month = q.month || '';
  const rows = getDb()
    .prepare(
      `SELECT bp.character_id, c.name AS character_name, bp.month_key,
              bp.premium_unlocked, bp.generated_at,
              json(bp.progress_json) AS progress_json
       FROM battle_pass bp JOIN characters c ON c.id = bp.character_id
       ${month ? 'WHERE bp.month_key = ?' : ''}
       ORDER BY bp.month_key DESC, c.id LIMIT 200`,
    )
    .all(...(month ? [month] : []));
  res.json({ rows });
});

router.post('/battlepass/unlock-premium/:id', (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const parse = z.object({ month: monthKey }).safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const db = getDb();
  const row = db.prepare('SELECT premium_unlocked FROM battle_pass WHERE character_id = ? AND month_key = ?').get(id, parse.data.month) as { premium_unlocked: number } | undefined;
  if (!row) { res.status(404).json({ error: 'No battle pass for this character and month' }); return; }
  if (row.premium_unlocked === 1) { res.status(409).json({ error: 'Premium is already unlocked' }); return; }
  db.prepare('UPDATE battle_pass SET premium_unlocked = 1 WHERE character_id = ? AND month_key = ?').run(id, parse.data.month);
  audit(req, res, { action: 'battlepass_unlock_premium', targetType: 'character', targetId: id, before: { premium_unlocked: 0 }, after: { premium_unlocked: 1 }, meta: { month: parse.data.month } });
  res.json({ ok: true });
});

/* =========================================================
   Trial Cache purchases (read-only)
   ========================================================= */
router.get('/trial-purchases', (_req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT tp.character_id, c.name AS character_name, tp.slug, tp.bought_at
       FROM trial_purchases tp JOIN characters c ON c.id = tp.character_id
       ORDER BY tp.bought_at DESC LIMIT 200`,
    )
    .all();
  res.json({ rows });
});

/* =========================================================
   Guilds — overview + per-track level editing
   ========================================================= */
router.get('/guilds', (_req, res) => {
  const guilds = getDb()
    .prepare(
      `SELECT g.id, g.name, g.tag, g.level AS slots_tier, g.member_slots, g.xp, g.gold,
              g.attr_level, g.power_level, g.defence_level,
              g.exp_bonus_level, g.gold_bonus_level, g.gold_level,
              COUNT(gm.character_id) AS member_count
       FROM guilds g
       LEFT JOIN guild_members gm ON gm.guild_id = g.id
       GROUP BY g.id
       ORDER BY g.xp DESC
       LIMIT 500`,
    )
    .all();
  res.json({ guilds });
});

const GUILD_FIELDS = ['attr_level', 'power_level', 'defence_level', 'exp_bonus_level', 'gold_bonus_level', 'gold_level', 'xp', 'gold'] as const;
const guildTrackPatchSchema = z.object({
  attr_level: z.number().int().min(0).max(100).optional(),
  power_level: z.number().int().min(0).max(100).optional(),
  defence_level: z.number().int().min(0).max(100).optional(),
  exp_bonus_level: z.number().int().min(0).max(100).optional(),
  gold_bonus_level: z.number().int().min(0).max(100).optional(),
  gold_level: z.number().int().min(0).max(100).optional(),
  xp: z.number().int().min(0).max(1e12).optional(),
  gold: z.number().int().min(0).max(1e12).optional(),
}).strict();

router.put('/guilds/:id', (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const parse = guildTrackPatchSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const keys = Object.keys(parse.data).filter((k) => (GUILD_FIELDS as readonly string[]).includes(k));
  if (!keys.length) { res.status(400).json({ error: 'No fields to update' }); return; }
  const db = getDb();
  const before = db.prepare(`SELECT name, ${GUILD_FIELDS.join(', ')} FROM guilds WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!before) { res.status(404).json({ error: 'Guild not found' }); return; }
  db.prepare(`UPDATE guilds SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...parse.data, id });
  audit(req, res, { action: 'guild_update', targetType: 'guild', targetId: id, before: pick(before, keys), after: pick(parse.data, keys), message: `Guild ${before.name} updated` });
  res.json({ ok: true });
});

/* =========================================================
   Каталог: предмети / чудовища / куестове — общ CRUD
   ========================================================= */
const bonus = z.number().int().min(-100_000).max(100_000).default(0);
const price = z.number().int().min(0).max(1_000_000_000).default(0);

const itemSchema = z.object({
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9_]+$/, 'Slug: lowercase letters, digits, underscores'),
  name: z.string().trim().min(2).max(80),
  category: z.enum(['weapon', 'helm', 'armor', 'gloves', 'boots', 'shield', 'ring', 'amulet', 'potion', 'misc']),
  sub_type: z.string().max(20).default(''),
  tier: z.number().int().min(1).max(10).default(1),
  rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']).default('common'),
  level_req: z.number().int().min(1).max(500).default(1),
  class_req: z.string().max(20).default(''),
  atk_min: z.number().int().min(0).max(1_000_000).default(0),
  atk_max: z.number().int().min(0).max(1_000_000).default(0),
  defense: z.number().int().min(0).max(1_000_000).default(0),
  hp_bonus: bonus, mp_bonus: bonus, str_bonus: bonus, dex_bonus: bonus,
  con_bonus: bonus, int_bonus: bonus, cha_bonus: bonus, wis_bonus: bonus,
  heal_hp: z.number().int().min(0).max(1_000_000).default(0),
  heal_mp: z.number().int().min(0).max(1_000_000).default(0),
  buy_price: price,
  sell_price: price,
  icon: z.string().max(40).default('sword'),
  description: z.string().max(500).default(''),
});

const monsterSchema = z.object({
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9_]+$/, 'Slug: lowercase letters, digits, underscores'),
  name: z.string().trim().min(2).max(80),
  level: z.number().int().min(1).max(500),
  hp: z.number().int().min(1).max(100_000_000),
  atk_min: z.number().int().min(0).max(1_000_000),
  atk_max: z.number().int().min(0).max(1_000_000),
  defense: z.number().int().min(0).max(1_000_000),
  speed: z.number().int().min(1).max(50).default(5),
  xp_reward: z.number().int().min(0).max(1_000_000_000),
  gold_min: z.number().int().min(0).max(1_000_000_000),
  gold_max: z.number().int().min(0).max(1_000_000_000),
  sprite: z.string().max(40).default('goblin'),
  family: z.string().max(20).default('beast'),
  region: z.string().max(40).default('whispering_woods'),
});

const questSchema = z.object({
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9_]+$/, 'Slug: lowercase letters, digits, underscores'),
  title: z.string().trim().min(2).max(120),
  region: z.string().max(40),
  level_req: z.number().int().min(1).max(500),
  energy_cost: z.number().int().min(0).max(99),
  duration_sec: z.number().int().min(0).max(86_400).default(0),
  intro: z.string().max(800),
  narrative: z.string().max(2000),
  monster_slug: z.string().max(60).default(''),
  xp_reward: z.number().int().min(0).max(1_000_000_000),
  gold_reward: z.number().int().min(0).max(1_000_000_000),
  item_reward: z.string().max(60).default(''),
  success_text: z.string().max(800).default(''),
  failure_text: z.string().max(800).default(''),
});

type Row = Record<string, any>;

/** Инварианти между полета — проверяват се върху СЛЕТИЯ ред (и при частичен PUT). */
function checkItem(r: Row): string | null {
  if (r.atk_min > r.atk_max) return 'ATK min cannot exceed ATK max.';
  // Иначе: купи от магазина → продай → безкрайно злато.
  if (r.buy_price > 0 && r.sell_price > r.buy_price) return 'Sell price cannot exceed buy price (gold exploit).';
  return null;
}
function checkMonster(r: Row): string | null {
  if (r.atk_min > r.atk_max) return 'ATK min cannot exceed ATK max.';
  if (r.gold_min > r.gold_max) return 'Gold min cannot exceed gold max.';
  return null;
}
function checkQuest(r: Row, db: Db): string | null {
  if (r.monster_slug && !db.prepare('SELECT 1 FROM monsters WHERE slug = ?').get(r.monster_slug)) return `Unknown monster slug: ${r.monster_slug}`;
  if (r.item_reward && !db.prepare('SELECT 1 FROM items WHERE slug = ?').get(r.item_reward)) return `Unknown item slug: ${r.item_reward}`;
  return null;
}

interface CatalogDef {
  path: string;
  table: 'items' | 'monsters' | 'quests';
  listKey: string;
  label: string;
  orderBy: string;
  schema: z.AnyZodObject;
  check: (r: Row, db: Db) => string | null;
  /** Връща съобщение за 409, ако обектът е в употреба (преди DELETE). */
  inUse?: (r: Row, db: Db) => string | null;
}

function catalogCrud(d: CatalogDef): void {
  const cols = Object.keys(d.schema.shape);

  router.get(`/${d.path}`, (_req, res) => {
    const rows = getDb().prepare(`SELECT * FROM ${d.table} ORDER BY ${d.orderBy} LIMIT 5000`).all();
    res.json({ [d.listKey]: rows });
  });

  router.post(`/${d.path}`, (req, res) => {
    const parse = d.schema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
    const db = getDb();
    const err = d.check(parse.data, db);
    if (err) { res.status(400).json({ error: err }); return; }
    try {
      const info = db.prepare(`INSERT INTO ${d.table} (${cols.join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})`).run(parse.data);
      const id = Number(info.lastInsertRowid);
      audit(req, res, { action: `${d.path}_create`, targetType: d.path, targetId: id, after: { slug: parse.data.slug, name: parse.data.name ?? parse.data.title } });
      res.status(201).json({ ok: true, id });
    } catch (e) { sqliteError(res, e, d.label); }
  });

  router.put(`/${d.path}/:id`, (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const parse = d.schema.partial().strict().safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
    const keys = Object.keys(parse.data).filter((k) => cols.includes(k));
    if (!keys.length) { res.status(400).json({ error: 'No fields to update' }); return; }
    const db = getDb();
    try {
      const outcome = db.transaction(() => {
        const before = db.prepare(`SELECT * FROM ${d.table} WHERE id = ?`).get(id) as Row | undefined;
        if (!before) return { status: 404, error: `${d.label} not found` } as const;
        const err = d.check({ ...before, ...parse.data }, db);
        if (err) return { status: 400, error: err } as const;
        db.prepare(`UPDATE ${d.table} SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...parse.data, id });
        return { status: 200, before: pick(before, keys) } as const;
      })();
      if (outcome.status !== 200) { res.status(outcome.status).json({ error: outcome.error }); return; }
      audit(req, res, { action: `${d.path}_update`, targetType: d.path, targetId: id, before: outcome.before, after: pick(parse.data, keys) });
      res.json({ ok: true });
    } catch (e) { sqliteError(res, e, d.label); }
  });

  router.delete(`/${d.path}/:id`, destructiveLimiter, (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const db = getDb();
    const before = db.prepare(`SELECT * FROM ${d.table} WHERE id = ?`).get(id) as Row | undefined;
    if (!before) { res.status(404).json({ error: `${d.label} not found` }); return; }
    const busy = d.inUse?.(before, db);
    if (busy) { res.status(409).json({ error: busy }); return; }
    try {
      db.prepare(`DELETE FROM ${d.table} WHERE id = ?`).run(id);
    } catch {
      // FK RESTRICT — в нечий инвентар/обява/дневник (schema.ts).
      res.status(409).json({ error: `${d.label} is in use by players and cannot be deleted.` });
      return;
    }
    audit(req, res, { action: `${d.path}_delete`, targetType: d.path, targetId: id, level: 'warn', before: { slug: before.slug, name: before.name ?? before.title } });
    res.json({ ok: true });
  });
}

catalogCrud({ path: 'items', table: 'items', listKey: 'items', label: 'Item', orderBy: 'tier, category, level_req, name', schema: itemSchema, check: checkItem });
catalogCrud({
  path: 'monsters', table: 'monsters', listKey: 'monsters', label: 'Monster', orderBy: 'level, name', schema: monsterSchema, check: checkMonster,
  inUse: (r, db) => {
    const n = (db.prepare('SELECT COUNT(*) AS c FROM quests WHERE monster_slug = ?').get(r.slug) as { c: number }).c;
    return n > 0 ? `Monster is used by ${n} quest(s) — reassign them first.` : null;
  },
});
catalogCrud({ path: 'quests', table: 'quests', listKey: 'quests', label: 'Quest', orderBy: 'level_req, region, title', schema: questSchema, check: checkQuest });

/* =========================================================
   Users management
   ========================================================= */
const usersQuery = pageQuery.extend({
  filter: z.enum(['all', 'admins', 'banned']).default('all'),
});

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

/* Грант (или отнемане с отрицателна сума) на диаманти. */
const gemsSchema = z.object({ amount: z.number().int().min(-1_000_000).max(1_000_000).refine((n) => n !== 0, 'Amount must be non-zero') }).strict();
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

const CHAR_FIELDS = ['level', 'gold', 'hp', 'hp_max', 'mp', 'mp_max', 'energy', 'energy_max', 'arena_rating', 'stat_points', 'skill_points', 'current_title'] as const;
const charPatchSchema = z.object({
  level: z.number().int().min(1).max(500).optional(),
  gold: z.number().int().min(0).max(1e12).optional(),
  hp: z.number().int().min(1).max(10_000_000).optional(),
  hp_max: z.number().int().min(1).max(10_000_000).optional(),
  mp: z.number().int().min(0).max(10_000_000).optional(),
  mp_max: z.number().int().min(0).max(10_000_000).optional(),
  energy: z.number().int().min(0).max(999).optional(),
  energy_max: z.number().int().min(1).max(999).optional(),
  arena_rating: z.number().int().min(0).max(100_000).optional(),
  stat_points: z.number().int().min(0).max(100_000).optional(),
  skill_points: z.number().int().min(0).max(100_000).optional(),
  current_title: z.string().trim().max(40).optional(),
}).strict();

router.put('/characters/:id', (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const parse = charPatchSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const keys = Object.keys(parse.data);
  if (!keys.length) { res.status(400).json({ error: 'No fields to update' }); return; }
  const db = getDb();
  const outcome = db.transaction(() => {
    const before = db.prepare(`SELECT name, ${CHAR_FIELDS.join(', ')} FROM characters WHERE id = ?`).get(id) as Row | undefined;
    if (!before) return { status: 404, error: 'Character not found' } as const;
    const m: Row = { ...before, ...parse.data };
    if (m.hp > m.hp_max) return { status: 400, error: 'HP cannot exceed HP max.' } as const;
    if (m.mp > m.mp_max) return { status: 400, error: 'MP cannot exceed MP max.' } as const;
    if (m.energy > m.energy_max) return { status: 400, error: 'Energy cannot exceed energy max.' } as const;
    db.prepare(`UPDATE characters SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...parse.data, id });
    return { status: 200, before } as const;
  })();
  if (outcome.status !== 200) { res.status(outcome.status).json({ error: outcome.error }); return; }
  audit(req, res, { action: 'character_update', targetType: 'character', targetId: id, before: pick(outcome.before, keys), after: pick(parse.data, keys), message: `Character ${outcome.before.name} edited` });
  res.json({ ok: true });
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

/* =========================================================
   Поръчки (Stripe покупки) — само четене, с търсене/пагинация
   ========================================================= */
const purchasesQuery = pageQuery.extend({
  status: z.enum(['all', 'pending', 'completed', 'failed', 'refunded', 'disputed']).default('all'),
});
router.get('/purchases', (req, res) => {
  const q = parseQuery(purchasesQuery, req, res); if (!q) return;
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.status !== 'all') { where.push('p.status = ?'); params.push(q.status); }
  if (q.q) {
    const like = `%${escapeLike(q.q)}%`;
    where.push(`(c.name LIKE ? ESCAPE '\\' OR p.kind LIKE ? ESCAPE '\\' OR p.stripe_session_id = ? OR p.id = ?)`);
    params.push(like, like, q.q, /^\d+$/.test(q.q) ? Number(q.q) : -1);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const db = getDb();
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM purchases p LEFT JOIN characters c ON c.id = p.character_id ${w}`).get(...params) as { c: number }).c;
  const rows = db.prepare(`
    SELECT p.id, p.character_id, c.name AS character_name, p.kind, p.amount_cents, p.currency,
           p.gems_granted, p.status, p.mode, p.stripe_session_id, p.created_at, p.completed_at
    FROM purchases p LEFT JOIN characters c ON c.id = p.character_id ${w}
    ORDER BY p.id DESC LIMIT ? OFFSET ?`).all(...params, q.pageSize, (q.page - 1) * q.pageSize);
  res.json({ ...pageMeta(total, q), purchases: rows });
});

/* =========================================================
   Mail broadcast
   ========================================================= */
const broadcastSchema = z.object({
  subject: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(2000),
  from_name: z.string().trim().min(1).max(40).default('Heralds of the Crown'),
}).strict();

router.post('/broadcast', destructiveLimiter, (req, res) => {
  const parse = broadcastSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const db = getDb();
  const now = Date.now();
  const sent = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO mail (character_id, from_name, subject, body, created_at)
       SELECT id, ?, ?, ?, ? FROM characters WHERE is_npc = 0`,
    ).run(parse.data.from_name, parse.data.subject, parse.data.body, now);
    return info.changes;
  })();
  audit(req, res, { action: 'broadcast', targetType: 'mail', level: 'warn', after: { from_name: parse.data.from_name, subject: parse.data.subject, recipients: sent } });
  res.json({ ok: true, sent });
});

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
   Marketplace admin — списък + отмяна (DSA чл. 17 към продавача)
   ========================================================= */
const marketQuery = pageQuery.extend({
  status: z.enum(['all', 'active', 'sold', 'cancelled']).default('all'),
});
router.get('/marketplace', (req, res) => {
  const q = parseQuery(marketQuery, req, res); if (!q) return;
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.status !== 'all') { where.push('m.status = ?'); params.push(q.status); }
  if (q.q) {
    const like = `%${escapeLike(q.q)}%`;
    where.push(`(items.name LIKE ? ESCAPE '\\' OR s.name LIKE ? ESCAPE '\\' OR b.name LIKE ? ESCAPE '\\')`);
    params.push(like, like, like);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = `FROM marketplace_listings m
       JOIN items ON items.id = m.item_id
       JOIN characters s ON s.id = m.seller_id
       LEFT JOIN characters b ON b.id = m.buyer_id ${w}`;
  const db = getDb();
  const total = (db.prepare(`SELECT COUNT(*) AS c ${from}`).get(...params) as { c: number }).c;
  const rows = db.prepare(`
    SELECT m.id, m.item_id, m.seller_id, m.buyer_id, m.price_gold, m.status, m.listed_at, m.sold_at,
           items.name AS item_name, items.rarity, s.name AS seller_name, b.name AS buyer_name
    ${from} ORDER BY m.listed_at DESC LIMIT ? OFFSET ?`).all(...params, q.pageSize, (q.page - 1) * q.pageSize);
  res.json({ ...pageMeta(total, q), listings: rows });
});

const cancelSchema = z.object({
  reason: z.string().trim().min(3).max(300),
  ground: z.enum(['terms', 'illegal']).default('terms'),
  notify: z.boolean().default(true),
}).strict();

/** Отменя АКТИВНА обява (в транзакция) и по избор праща обосновка. */
function cancelListing(db: Db, id: number, o: { reason: string; ground: Ground; notify: boolean; fromNotice: boolean }) {
  const row = db.prepare('SELECT id, inventory_id, seller_id, status, price_gold FROM marketplace_listings WHERE id = ?').get(id) as
    | { id: number; inventory_id: number; seller_id: number; status: string; price_gold: number } | undefined;
  if (!row) return { status: 404 as const, error: 'Listing not found' };
  if (row.status !== 'active') return { status: 409 as const, error: `Only active listings can be cancelled (this one is ${row.status}).` };
  db.prepare(`UPDATE marketplace_listings SET status = 'cancelled' WHERE id = ?`).run(id);
  if (row.inventory_id) db.prepare('UPDATE inventory SET listed = 0 WHERE id = ?').run(row.inventory_id);
  if (o.notify) deliverStatement(db, row.seller_id, { kind: 'market_listing', reason: o.reason, ground: o.ground, fromNotice: o.fromNotice });
  return { status: 200 as const, row };
}

router.post('/marketplace/:id/cancel', destructiveLimiter, (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const parse = cancelSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const db = getDb();
  const out = db.transaction(() => cancelListing(db, id, { ...parse.data, fromNotice: false }))();
  if (out.status !== 200) { res.status(out.status).json({ error: out.error }); return; }
  audit(req, res, { category: 'moderation', action: 'listing_cancel', targetType: 'market_listing', targetId: id, level: 'warn', before: { status: 'active' }, after: { status: 'cancelled' }, meta: { reason: parse.data.reason, ground: parse.data.ground, notified: parse.data.notify, seller_id: out.row.seller_id } });
  res.json({ ok: true, notified: parse.data.notify });
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

/* =========================================================
   Moderation (DSA чл. 16/17 — таргетирано сваляне + бан)

   Поток: сигнал (dsa.ts) → „Разреши" (resolve: какво реално сочи сигналът,
   с преглед на съдържанието и автора) → сваляне с основание → обосновка по
   чл. 17 в пощата на засегнатия, в СЪЩАТА транзакция, в която се затваря
   сигналът. Обжалване по чл. 20 не се строи — освободено за микро-
   предприятия (чл. 19); обосновката сочи извънсъдебен (чл. 21) и съдебен път.
   ========================================================= */
const TAKEDOWN_KINDS = ['character_name', 'bio', 'guild_name', 'guild_tag', 'guild_motto', 'guild_chat_message', 'global_chat_message', 'market_listing'] as const;
type TakedownKind = (typeof TAKEDOWN_KINDS)[number];

interface TargetInfo {
  kind: TakedownKind;
  targetId: number;
  /** Кратък контекст за админа (име на герой/гилдия, статус на обява); празно за чат. */
  label: string;
  preview: string;
  authorCharId: number | null;
  authorName: string | null;
}

/** Какво реално има зад (kind, id) — за преглед преди сваляне и за одит „от". */
function describeTarget(db: Db, kind: TakedownKind, id: number): TargetInfo | null {
  const charName = (cid: number | null) => (cid ? (db.prepare('SELECT name FROM characters WHERE id = ?').get(cid) as { name: string } | undefined)?.name ?? null : null);
  switch (kind) {
    case 'character_name':
    case 'bio': {
      const c = db.prepare('SELECT id, name, bio FROM characters WHERE id = ?').get(id) as { id: number; name: string; bio: string } | undefined;
      if (!c) return null;
      return { kind, targetId: id, label: c.name, preview: kind === 'bio' ? c.bio || '' : c.name, authorCharId: c.id, authorName: c.name };
    }
    case 'guild_name':
    case 'guild_tag':
    case 'guild_motto': {
      const g = db.prepare('SELECT id, name, tag, motto, leader_id FROM guilds WHERE id = ?').get(id) as { id: number; name: string; tag: string; motto: string; leader_id: number } | undefined;
      if (!g) return null;
      const preview = kind === 'guild_name' ? g.name : kind === 'guild_tag' ? g.tag : g.motto || '';
      return { kind, targetId: id, label: `${g.name} [${g.tag}]`, preview, authorCharId: g.leader_id, authorName: charName(g.leader_id) };
    }
    case 'guild_chat_message':
    case 'global_chat_message': {
      const table = kind === 'guild_chat_message' ? 'guild_chat' : 'global_chat';
      const m = db.prepare(`SELECT id, character_id, message FROM ${table} WHERE id = ?`).get(id) as { id: number; character_id: number; message: string } | undefined;
      if (!m) return null;
      return { kind, targetId: id, label: '', preview: m.message, authorCharId: m.character_id, authorName: charName(m.character_id) };
    }
    case 'market_listing': {
      const l = db.prepare(`SELECT m.id, m.seller_id, m.status, m.price_gold, i.name AS item FROM marketplace_listings m JOIN items i ON i.id = m.item_id WHERE m.id = ?`).get(id) as { id: number; seller_id: number; status: string; price_gold: number; item: string } | undefined;
      if (!l) return null;
      return { kind, targetId: id, label: l.status, preview: `${l.item} — ${l.price_gold}g`, authorCharId: l.seller_id, authorName: charName(l.seller_id) };
    }
  }
}

/** Всички възможни цели на сигнал. „chat:N" е двусмислен (глобален и гилдийски
 *  чат ползват един и същ префикс) → връщаме и двата кандидата с преглед,
 *  вместо да трием на сляпо грешното съобщение. */
function resolveNotice(db: Db, n: { content_kind: string; content_ref: string }): TargetInfo[] {
  const ref = String(n.content_ref || '').trim();
  const out: TargetInfo[] = [];
  const push = (t: TargetInfo | null) => { if (t) out.push(t); };
  let m: RegExpMatchArray | null;
  if ((m = ref.match(/^(?:chat|gchat|global):(\d+)$/i))) {
    push(describeTarget(db, 'global_chat_message', Number(m[1])));
    if (!/^(gchat|global):/i.test(ref)) push(describeTarget(db, 'guild_chat_message', Number(m[1])));
  } else if ((m = ref.match(/^guildchat:(\d+)$/i))) {
    push(describeTarget(db, 'guild_chat_message', Number(m[1])));
  } else if ((m = ref.match(/^char(?:acter)?:(.+)$/i))) {
    const key = m[1].trim();
    const c = (/^\d+$/.test(key)
      ? db.prepare('SELECT id FROM characters WHERE id = ?').get(Number(key))
      : db.prepare('SELECT id FROM characters WHERE name = ? COLLATE NOCASE').get(key)) as { id: number } | undefined;
    if (c) { push(describeTarget(db, 'character_name', c.id)); push(describeTarget(db, 'bio', c.id)); }
  } else if ((m = ref.match(/^guild:(.+)$/i))) {
    const key = m[1].trim();
    const g = (/^\d+$/.test(key)
      ? db.prepare('SELECT id FROM guilds WHERE id = ?').get(Number(key))
      : db.prepare('SELECT id FROM guilds WHERE name = ? COLLATE NOCASE OR tag = ? COLLATE NOCASE').get(key, key)) as { id: number } | undefined;
    if (g) (['guild_name', 'guild_tag', 'guild_motto'] as const).forEach((k) => push(describeTarget(db, k, g.id)));
  } else if ((m = ref.match(/^(?:market|listing):(\d+)$/i))) {
    push(describeTarget(db, 'market_listing', Number(m[1])));
  }
  return out;
}

const noticesQuery = pageQuery.extend({
  status: z.enum(['open', 'actioned', 'rejected', 'all']).default('open'),
});
/** Списък DSA сигнали (open най-горе), с броячи по статус. */
router.get('/moderation/notices', (req, res) => {
  const q = parseQuery(noticesQuery, req, res); if (!q) return;
  const db = getDb();
  const w = q.status === 'all' ? '' : 'WHERE status = ?';
  const p = q.status === 'all' ? [] : [q.status];
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM dsa_notices ${w}`).get(...p) as { c: number }).c;
  const rows = db.prepare(`
    SELECT id, content_kind, content_ref, reason, description, notifier_name, notifier_email,
           status, decision, decided_at, created_at
    FROM dsa_notices ${w}
    ORDER BY (status = 'open') DESC, created_at DESC LIMIT ? OFFSET ?`).all(...p, q.pageSize, (q.page - 1) * q.pageSize);
  const byStatus = Object.fromEntries((db.prepare('SELECT status, COUNT(*) AS c FROM dsa_notices GROUP BY status').all() as { status: string; c: number }[]).map((r) => [r.status, r.c]));
  res.json({ ...pageMeta(total, q), notices: rows, counts: byStatus });
});

router.get('/moderation/notices/:id/resolve', (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const db = getDb();
  const notice = db.prepare('SELECT id, content_kind, content_ref, reason, description, status, created_at FROM dsa_notices WHERE id = ?').get(id) as Row | undefined;
  if (!notice) { res.status(404).json({ error: 'Notice not found' }); return; }
  res.json({ notice, candidates: resolveNotice(db, notice as { content_kind: string; content_ref: string }) });
});

/** Преглед на цел по (kind, id) — ръчно въведени цели също се виждат преди сваляне. */
router.get('/moderation/target', (req, res) => {
  const q = parseQuery(z.object({ kind: z.enum(TAKEDOWN_KINDS), id: z.coerce.number().int().positive() }), req, res); if (!q) return;
  const t = describeTarget(getDb(), q.kind, q.id);
  if (!t) { res.status(404).json({ error: 'Target not found' }); return; }
  res.json({ target: t });
});

const takedownSchema = z.object({
  // 'chat_message' = стар псевдоним за guild_chat_message (обратна съвместимост).
  kind: z.union([z.enum(TAKEDOWN_KINDS), z.literal('chat_message')]),
  targetId: z.number().int().positive(),
  reason: z.string().trim().min(3).max(300),
  ground: z.enum(['terms', 'illegal']).default('terms'),
  notify: z.boolean().default(true),
  noticeId: z.number().int().positive().optional(), // идва от DSA сигнал → затвори го
}).strict();

// Гарантирано-уникална стойност за UNIQUE колона (squat-нато „Reclaimed<id>").
function uniqueValue(db: Db, table: 'characters' | 'guilds', col: 'name' | 'tag', candidate: (i: number) => string): string {
  for (let i = 0; i < 30; i++) {
    const v = candidate(i);
    if (!db.prepare(`SELECT 1 FROM ${table} WHERE ${col} = ? LIMIT 1`).get(v)) return v;
  }
  return candidate(Math.floor(Math.random() * 1e9));
}
const rnd = (n: number) => Math.random().toString(36).slice(2, 2 + n);
const rndTag = () => Array.from({ length: 5 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('');

router.post('/moderation/takedown', destructiveLimiter, (req, res) => {
  const parse = takedownSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const kind: TakedownKind = parse.data.kind === 'chat_message' ? 'guild_chat_message' : parse.data.kind;
  const { targetId, reason, ground, notify, noticeId } = parse.data;
  const db = getDb();

  type Outcome = { status: number; error?: string; detail?: string; before?: TargetInfo; notified?: boolean };
  let outcome: Outcome;
  try {
    outcome = db.transaction((): Outcome => {
      if (noticeId) {
        const n = db.prepare('SELECT status FROM dsa_notices WHERE id = ?').get(noticeId) as { status: string } | undefined;
        if (!n) return { status: 404, error: 'Notice not found' };
        if (n.status !== 'open') return { status: 409, error: 'Notice was already decided' };
      }
      const before = describeTarget(db, kind, targetId);
      if (!before) return { status: 404, error: 'Target not found' };
      let detail = '';
      switch (kind) {
        case 'character_name': {
          const name = uniqueValue(db, 'characters', 'name', (i) => (i === 0 ? `Reclaimed${targetId}` : `Reclaimed${targetId}_${rnd(4)}`).slice(0, 20));
          db.prepare('UPDATE characters SET name = ? WHERE id = ?').run(name, targetId);
          detail = `character name → ${name}`;
          break;
        }
        case 'bio':
          db.prepare("UPDATE characters SET bio = '' WHERE id = ?").run(targetId);
          detail = 'bio cleared';
          break;
        case 'guild_name': {
          const gn = uniqueValue(db, 'guilds', 'name', (i) => (i === 0 ? `Guild ${targetId}` : `Guild ${targetId} ${rnd(4)}`).slice(0, 30));
          db.prepare('UPDATE guilds SET name = ? WHERE id = ?').run(gn, targetId);
          detail = `guild name → ${gn}`;
          break;
        }
        case 'guild_tag': {
          const tag = uniqueValue(db, 'guilds', 'tag', () => rndTag());
          db.prepare('UPDATE guilds SET tag = ? WHERE id = ?').run(tag, targetId);
          detail = `guild tag → ${tag}`;
          break;
        }
        case 'guild_motto':
          db.prepare("UPDATE guilds SET motto = '' WHERE id = ?").run(targetId);
          detail = 'guild motto cleared';
          break;
        case 'guild_chat_message':
          db.prepare('DELETE FROM guild_chat WHERE id = ?').run(targetId);
          detail = 'guild chat message removed';
          break;
        case 'global_chat_message':
          db.prepare('DELETE FROM global_chat WHERE id = ?').run(targetId);
          detail = 'public chat message removed';
          break;
        case 'market_listing': {
          const r = cancelListing(db, targetId, { reason, ground, notify: false, fromNotice: !!noticeId });
          if (r.status !== 200) return { status: r.status, error: r.error };
          detail = 'listing cancelled';
          break;
        }
      }
      let notified = false;
      if (notify && before.authorCharId) {
        deliverStatement(db, before.authorCharId, { kind, reason, ground, fromNotice: !!noticeId });
        notified = true;
      }
      if (noticeId) {
        db.prepare(`UPDATE dsa_notices SET status = 'actioned', decision = ?, decided_at = ? WHERE id = ?`)
          .run(`${detail} — ${reason}`.slice(0, 500), Date.now(), noticeId);
      }
      return { status: 200, detail, before, notified };
    })();
  } catch {
    // Неочаквана колизия/грешка — без голо 500 с вътрешен текст.
    res.status(409).json({ error: 'Takedown failed (conflict) — try again.' });
    return;
  }
  if (outcome.status !== 200) { res.status(outcome.status).json({ error: outcome.error }); return; }
  audit(req, res, {
    category: 'moderation', action: 'takedown', level: 'warn', targetType: kind, targetId,
    before: { content: outcome.before!.preview }, after: { result: outcome.detail },
    message: `Takedown: ${outcome.detail}`,
    meta: { reason, ground, notified: outcome.notified, noticeId: noticeId ?? null, author_character_id: outcome.before!.authorCharId },
  });
  // Чл. 16(5): подателят на сигнала научава решението (след записа, извън
  // транзакцията; best-effort — SMTP забавяне не бави админа).
  if (noticeId) void notifyNoticeDecision(db, noticeId);
  res.json({ ok: true, kind, targetId, detail: outcome.detail, notified: outcome.notified });
});

/**
 * Ръчен бан (chargeback банът минава през webhook-а автоматично).
 * `durationMs`: 0/липсва = ПОСТОЯНЕН; >0 = временен.
 * IP/устройство се банват САМО ако не са непублични и не съвпадат с
 * админски IP/устройство — иначе банът заключва и администраторите.
 */
const banSchema = z.object({
  userId: z.number().int().positive(),
  reason: z.string().trim().min(3).max(300),
  durationMs: z.number().int().nonnegative().max(3_153_600_000_000).optional(), // ≤ ~100г
  banIp: z.boolean().default(true),
  banDevice: z.boolean().default(true),
}).strict();

router.post('/moderation/ban', destructiveLimiter, (req, res) => {
  const parse = banSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const { userId, reason, durationMs, banIp, banDevice } = parse.data;
  if (userId === req.auth!.uid) { res.status(409).json({ error: 'You cannot ban your own account.' }); return; }
  const db = getDb();
  const u = db.prepare('SELECT id, username, last_ip, last_hwid, is_admin, banned, banned_until FROM users WHERE id = ?').get(userId) as
    | { id: number; username: string; last_ip: string; last_hwid: string; is_admin: number; banned: number; banned_until: number } | undefined;
  if (!u) { res.status(404).json({ error: 'User not found' }); return; }
  // Не банвай друг администратор (ескалация при компрометиран акаунт).
  if (u.is_admin === 1) { res.status(409).json({ error: 'Cannot ban an administrator. Demote them first.' }); return; }
  const admins = db.prepare('SELECT last_ip, last_hwid FROM users WHERE is_admin = 1').all() as { last_ip: string; last_hwid: string }[];
  const adminIps = [clientIp(req), ...admins.map((a) => a.last_ip)];
  const adminDevices = new Set([clientHwid(req), ...admins.map((a) => a.last_hwid)].filter(Boolean));
  const ip = banIp && u.last_ip && !ipIsShielded(u.last_ip, adminIps) ? u.last_ip : '';
  const hwid = banDevice && u.last_hwid && !adminDevices.has(u.last_hwid) ? u.last_hwid : '';
  const skipped = {
    ip: banIp && !!u.last_ip && !ip ? 'shielded' : null,
    device: banDevice && !!u.last_hwid && !hwid ? 'shielded' : null,
  };
  banUser({ userId, ip, hwid, reason, durationMs });
  const until = durationMs && durationMs > 0 ? Date.now() + durationMs : 0;
  audit(req, res, {
    category: 'moderation', action: 'manual_ban', level: 'warn', targetType: 'user', targetId: userId,
    before: { banned: u.banned, banned_until: u.banned_until }, after: { banned: 1, banned_until: until },
    message: `Manual ban (user ${userId})`, meta: { reason, ip_banned: !!ip, device_banned: !!hwid, skipped },
  });
  res.json({ ok: true, userId, until, ip_banned: !!ip, device_banned: !!hwid, skipped });
});

const unbanSchema = z.object({ userId: z.number().int().positive() }).strict();
router.post('/moderation/unban', (req, res) => {
  const parse = unbanSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const { userId } = parse.data;
  const db = getDb();
  const u = db.prepare('SELECT banned, banned_until FROM users WHERE id = ?').get(userId) as { banned: number; banned_until: number } | undefined;
  if (!u) { res.status(404).json({ error: 'User not found' }); return; }
  const residual = (db.prepare('SELECT (SELECT COUNT(*) FROM banned_ips WHERE user_id = ?) + (SELECT COUNT(*) FROM banned_devices WHERE user_id = ?) AS c').get(userId, userId) as { c: number }).c;
  if (u.banned !== 1 && residual === 0) { res.status(409).json({ error: 'User is not banned' }); return; }
  unbanUser(userId);
  audit(req, res, { category: 'moderation', action: 'unban', targetType: 'user', targetId: userId, before: { banned: u.banned, banned_until: u.banned_until }, after: { banned: 0, banned_until: 0 }, message: `Unban (user ${userId})` });
  res.json({ ok: true, userId });
});

router.get('/moderation/bans', (_req, res) => {
  const db = getDb();
  res.json({
    users: db.prepare('SELECT id, username, banned_reason, banned_at, banned_until FROM users WHERE banned = 1 ORDER BY banned_at DESC LIMIT 200').all(),
    ips: db.prepare('SELECT ip, reason, user_id, created_at, expires_at FROM banned_ips ORDER BY created_at DESC LIMIT 200').all(),
    devices: db.prepare('SELECT hwid, reason, user_id, created_at, expires_at FROM banned_devices ORDER BY created_at DESC LIMIT 200').all(),
  });
});

/** Отхвърляне на DSA сигнал без действие (напр. неоснователен). */
const rejectSchema = z.object({ decision: z.string().trim().min(3).max(300) }).strict();
router.post('/moderation/dsa/:id/reject', (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const parse = rejectSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const db = getDb();
  const n = db.prepare('SELECT status FROM dsa_notices WHERE id = ?').get(id) as { status: string } | undefined;
  if (!n) { res.status(404).json({ error: 'Notice not found' }); return; }
  if (n.status !== 'open') { res.status(409).json({ error: 'Notice was already decided' }); return; }
  db.prepare(`UPDATE dsa_notices SET status = 'rejected', decision = ?, decided_at = ? WHERE id = ? AND status = 'open'`)
    .run(parse.data.decision, Date.now(), id);
  audit(req, res, { category: 'moderation', action: 'dsa_reject', targetType: 'dsa_notice', targetId: id, before: { status: 'open' }, after: { status: 'rejected', decision: parse.data.decision } });
  void notifyNoticeDecision(db, id); // чл. 16(5) — и отказът се съобщава на подателя
  res.json({ ok: true, id });
});

export default router;
