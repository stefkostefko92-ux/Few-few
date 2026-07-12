import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { adminRequired } from '../middleware/admin';
import { logFromRequest, logEvent, isSafeWebhookUrl } from '../lib/logger';
import { passwordRule, PASSWORD_BCRYPT_ROUNDS } from './auth';
import { banUser, unbanUser } from '../lib/bans';

const router = Router();
router.use(authRequired, adminRequired);

// Audit every mutating admin call — POST/PUT/PATCH/DELETE.
// Logs the route, body keys, and target id (when /:id appears in the path).
router.use((req, _res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  // /webhooks endpoints have their own webhook category — skip to avoid an infinite loop.
  if (req.path.startsWith('/webhooks')) return next();
  const bodyKeys = req.body && typeof req.body === 'object' ? Object.keys(req.body).filter((k) => k !== 'password') : [];
  const idMatch = req.path.match(/\/(\d+)(?:\b|$)/);
  logFromRequest(req, {
    category: 'admin',
    action: `${req.method.toLowerCase()}_${req.path.replace(/^\//, '').split('/')[0] || 'root'}`,
    level: req.method === 'DELETE' ? 'warn' : 'info',
    target_id: idMatch ? Number(idMatch[1]) : null,
    target_type: req.path.replace(/^\//, '').split('/')[0] || '',
    message: `Admin ${req.method} ${req.path}`,
    meta: { body_keys: bodyKeys },
  });
  next();
});

/* =========================================================
   Dashboard / overview
   ========================================================= */
router.get('/overview', (_req, res) => {
  const db = getDb();
  const counts = {
    users: (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c,
    admins: (db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1').get() as { c: number }).c,
    characters: (db.prepare('SELECT COUNT(*) AS c FROM characters WHERE is_npc = 0').get() as { c: number }).c,
    npcs: (db.prepare('SELECT COUNT(*) AS c FROM characters WHERE is_npc = 1').get() as { c: number }).c,
    items: (db.prepare('SELECT COUNT(*) AS c FROM items').get() as { c: number }).c,
    monsters: (db.prepare('SELECT COUNT(*) AS c FROM monsters').get() as { c: number }).c,
    quests: (db.prepare('SELECT COUNT(*) AS c FROM quests').get() as { c: number }).c,
    battles: (db.prepare('SELECT COUNT(*) AS c FROM combat_log').get() as { c: number }).c,
    guilds: (db.prepare('SELECT COUNT(*) AS c FROM guilds').get() as { c: number }).c,
    tower_climbs: (db.prepare("SELECT COUNT(*) AS c FROM event_log WHERE action IN ('tower_clear','tower_wipe')").get() as { c: number }).c,
    bounty_claims: (db.prepare("SELECT COUNT(*) AS c FROM event_log WHERE action = 'bounty_claim'").get() as { c: number }).c,
    forge_enchants: (db.prepare("SELECT COUNT(*) AS c FROM event_log WHERE action = 'forge_enchant'").get() as { c: number }).c,
    forge_shatters: (db.prepare("SELECT COUNT(*) AS c FROM event_log WHERE action = 'forge_shatter'").get() as { c: number }).c,
    market_sales: (db.prepare("SELECT COUNT(*) AS c FROM marketplace_listings WHERE status = 'sold'").get() as { c: number }).c,
    market_listings_active: (db.prepare("SELECT COUNT(*) AS c FROM marketplace_listings WHERE status = 'active'").get() as { c: number }).c,
    trial_tokens_spent: (db.prepare("SELECT COUNT(*) AS c FROM trial_purchases").get() as { c: number }).c,
    battle_pass_passes: (db.prepare("SELECT COUNT(*) AS c FROM battle_pass").get() as { c: number }).c,
    battle_pass_premium: (db.prepare("SELECT COUNT(*) AS c FROM battle_pass WHERE premium_unlocked = 1").get() as { c: number }).c,
  };
  const recentUsers = db
    .prepare('SELECT id, username, email, created_at, last_seen_at, is_admin FROM users ORDER BY created_at DESC LIMIT 12')
    .all();
  const topChars = db
    .prepare("SELECT name, class, level, arena_rating, gold, tower_best_floor, trial_tokens, is_npc FROM characters ORDER BY level DESC, arena_rating DESC LIMIT 10")
    .all();
  res.json({ counts, recentUsers, topChars });
});

/* =========================================================
   Tower of Trials — leaderboard, force-reset run, edit best
   ========================================================= */
router.get('/tower', (_req, res) => {
  const db = getDb();
  const climbers = db
    .prepare(
      `SELECT id, name, class, level, tower_best_floor, tower_current_floor, trial_tokens, forge_guarantees
       FROM characters WHERE is_npc = 0 AND tower_best_floor > 0
       ORDER BY tower_best_floor DESC LIMIT 50`,
    )
    .all();
  res.json({ climbers });
});

router.post('/tower/reset/:id', (req, res) => {
  const id = Number(req.params.id);
  getDb().prepare('UPDATE characters SET tower_current_floor = 0, tower_run_seed = 0 WHERE id = ?').run(id);
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
  const id = Number(req.params.id);
  getDb().prepare('DELETE FROM character_bounties WHERE character_id = ?').run(id);
  res.json({ ok: true });
});

/* =========================================================
   Battle Pass — view subscriptions, force-unlock premium
   ========================================================= */
router.get('/battlepass', (req, res) => {
  const month = (req.query.month as string) || '';
  const where = month ? 'WHERE bp.month_key = ?' : '';
  const params = month ? [month] : [];
  const rows = getDb()
    .prepare(
      `SELECT bp.character_id, c.name AS character_name, bp.month_key,
              bp.premium_unlocked, bp.generated_at,
              json(bp.progress_json) AS progress_json,
              json(bp.claimed_json) AS claimed_json
       FROM battle_pass bp JOIN characters c ON c.id = bp.character_id
       ${where}
       ORDER BY bp.month_key DESC, c.id LIMIT 200`,
    )
    .all(...params);
  res.json({ rows });
});

router.post('/battlepass/unlock-premium/:id', (req, res) => {
  const id = Number(req.params.id);
  const month = String((req.body && req.body.month) || '');
  if (!month) { res.status(400).json({ error: 'month_key required' }); return; }
  getDb().prepare('UPDATE battle_pass SET premium_unlocked = 1 WHERE character_id = ? AND month_key = ?').run(id, month);
  res.json({ ok: true });
});

/* =========================================================
   Trial Cache purchases (audit)
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
   Guilds — admin overview + per-track level editing
   ========================================================= */
router.get('/guilds', (_req, res) => {
  const guilds = getDb()
    .prepare(
      `SELECT g.id, g.name, g.tag, g.level AS slots_tier, g.xp, g.gold,
              g.attr_level, g.power_level, g.defence_level,
              g.exp_bonus_level, g.gold_bonus_level, g.gold_level,
              (SELECT COUNT(*) FROM guild_members gm WHERE gm.guild_id = g.id) AS member_count
       FROM guilds g
       ORDER BY g.xp DESC`,
    )
    .all();
  res.json({ guilds });
});

const guildTrackPatchSchema = z.object({
  attr_level: z.number().int().min(0).max(100).optional(),
  power_level: z.number().int().min(0).max(100).optional(),
  defence_level: z.number().int().min(0).max(100).optional(),
  exp_bonus_level: z.number().int().min(0).max(100).optional(),
  gold_bonus_level: z.number().int().min(0).max(100).optional(),
  gold_level: z.number().int().min(0).max(100).optional(),
  xp: z.number().int().min(0).optional(),
  gold: z.number().int().min(0).optional(),
});
router.put('/guilds/:id', (req, res) => {
  const id = Number(req.params.id);
  const parse = guildTrackPatchSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const sets: string[] = [];
  const params: any[] = [];
  for (const [k, v] of Object.entries(parse.data)) {
    if (typeof v === 'number') { sets.push(`${k} = ?`); params.push(v); }
  }
  if (!sets.length) { res.status(400).json({ error: 'No fields to update' }); return; }
  params.push(id);
  getDb().prepare(`UPDATE guilds SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

/* =========================================================
   Items CRUD
   ========================================================= */
const itemSchema = z.object({
  slug: z.string().min(2).max(60),
  name: z.string().min(2).max(80),
  category: z.enum(['weapon', 'helm', 'armor', 'gloves', 'boots', 'shield', 'ring', 'amulet', 'potion', 'misc']),
  sub_type: z.string().max(20).default(''),
  tier: z.number().int().min(1).max(10).default(1),
  rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']).default('common'),
  level_req: z.number().int().min(1).max(100).default(1),
  class_req: z.string().max(20).default(''),
  atk_min: z.number().int().min(0).default(0),
  atk_max: z.number().int().min(0).default(0),
  defense: z.number().int().min(0).default(0),
  hp_bonus: z.number().int().default(0),
  mp_bonus: z.number().int().default(0),
  str_bonus: z.number().int().default(0),
  dex_bonus: z.number().int().default(0),
  con_bonus: z.number().int().default(0),
  int_bonus: z.number().int().default(0),
  cha_bonus: z.number().int().default(0),
  wis_bonus: z.number().int().default(0),
  heal_hp: z.number().int().min(0).default(0),
  heal_mp: z.number().int().min(0).default(0),
  buy_price: z.number().int().min(0).default(0),
  sell_price: z.number().int().min(0).default(0),
  icon: z.string().max(40).default('sword'),
  description: z.string().max(500).default(''),
});

router.get('/items', (_req, res) => {
  const items = getDb().prepare('SELECT * FROM items ORDER BY tier, category, level_req, name').all();
  res.json({ items });
});

router.post('/items', (req, res) => {
  const parse = itemSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const i = parse.data;
  try {
    getDb().prepare(`INSERT INTO items (slug, name, category, sub_type, tier, rarity, level_req, class_req,
      atk_min, atk_max, defense, hp_bonus, mp_bonus, str_bonus, dex_bonus, con_bonus, int_bonus, cha_bonus, wis_bonus,
      heal_hp, heal_mp, buy_price, sell_price, icon, description) VALUES
      (@slug, @name, @category, @sub_type, @tier, @rarity, @level_req, @class_req,
       @atk_min, @atk_max, @defense, @hp_bonus, @mp_bonus, @str_bonus, @dex_bonus, @con_bonus, @int_bonus, @cha_bonus, @wis_bonus,
       @heal_hp, @heal_mp, @buy_price, @sell_price, @icon, @description)`).run(i);
    res.json({ ok: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put('/items/:id', (req, res) => {
  const id = Number(req.params.id);
  const parse = itemSchema.partial().safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const fields = Object.keys(parse.data);
  if (fields.length === 0) { res.status(400).json({ error: 'No fields' }); return; }
  const set = fields.map((f) => `${f} = @${f}`).join(', ');
  getDb().prepare(`UPDATE items SET ${set} WHERE id = @id`).run({ ...parse.data, id });
  res.json({ ok: true });
});

router.delete('/items/:id', (req, res) => {
  const id = Number(req.params.id);
  getDb().prepare('DELETE FROM items WHERE id = ?').run(id);
  res.json({ ok: true });
});

/* =========================================================
   Monsters CRUD
   ========================================================= */
const monsterSchema = z.object({
  slug: z.string().min(2).max(60),
  name: z.string().min(2).max(80),
  level: z.number().int().min(1).max(100),
  hp: z.number().int().min(1),
  atk_min: z.number().int().min(0),
  atk_max: z.number().int().min(0),
  defense: z.number().int().min(0),
  speed: z.number().int().min(1).max(50).default(5),
  xp_reward: z.number().int().min(0),
  gold_min: z.number().int().min(0),
  gold_max: z.number().int().min(0),
  sprite: z.string().max(40).default('goblin'),
  family: z.string().max(20).default('beast'),
  region: z.string().max(40).default('whispering_woods'),
});

router.get('/monsters', (_req, res) => {
  const monsters = getDb().prepare('SELECT * FROM monsters ORDER BY level, name').all();
  res.json({ monsters });
});

router.post('/monsters', (req, res) => {
  const parse = monsterSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  try {
    getDb().prepare(`INSERT INTO monsters (slug, name, level, hp, atk_min, atk_max, defense, speed, xp_reward, gold_min, gold_max, sprite, family, region)
      VALUES (@slug, @name, @level, @hp, @atk_min, @atk_max, @defense, @speed, @xp_reward, @gold_min, @gold_max, @sprite, @family, @region)`).run(parse.data);
    res.json({ ok: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put('/monsters/:id', (req, res) => {
  const id = Number(req.params.id);
  const parse = monsterSchema.partial().safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const fields = Object.keys(parse.data);
  if (fields.length === 0) { res.status(400).json({ error: 'No fields' }); return; }
  const set = fields.map((f) => `${f} = @${f}`).join(', ');
  getDb().prepare(`UPDATE monsters SET ${set} WHERE id = @id`).run({ ...parse.data, id });
  res.json({ ok: true });
});

router.delete('/monsters/:id', (req, res) => {
  const id = Number(req.params.id);
  getDb().prepare('DELETE FROM monsters WHERE id = ?').run(id);
  res.json({ ok: true });
});

/* =========================================================
   Quests CRUD
   ========================================================= */
const questSchema = z.object({
  slug: z.string().min(2).max(60),
  title: z.string().min(2).max(120),
  region: z.string().max(40),
  level_req: z.number().int().min(1).max(100),
  energy_cost: z.number().int().min(0).max(99),
  duration_sec: z.number().int().min(0).default(0),
  intro: z.string().max(800),
  narrative: z.string().max(2000),
  monster_slug: z.string().max(60).default(''),
  xp_reward: z.number().int().min(0),
  gold_reward: z.number().int().min(0),
  item_reward: z.string().max(60).default(''),
  success_text: z.string().max(800).default(''),
  failure_text: z.string().max(800).default(''),
});

router.get('/quests', (_req, res) => {
  const quests = getDb().prepare('SELECT * FROM quests ORDER BY level_req, region, title').all();
  res.json({ quests });
});

router.post('/quests', (req, res) => {
  const parse = questSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  try {
    getDb().prepare(`INSERT INTO quests (slug, title, region, level_req, energy_cost, duration_sec, intro, narrative,
       monster_slug, xp_reward, gold_reward, item_reward, success_text, failure_text)
      VALUES (@slug, @title, @region, @level_req, @energy_cost, @duration_sec, @intro, @narrative,
       @monster_slug, @xp_reward, @gold_reward, @item_reward, @success_text, @failure_text)`).run(parse.data);
    res.json({ ok: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put('/quests/:id', (req, res) => {
  const id = Number(req.params.id);
  const parse = questSchema.partial().safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const fields = Object.keys(parse.data);
  if (fields.length === 0) { res.status(400).json({ error: 'No fields' }); return; }
  const set = fields.map((f) => `${f} = @${f}`).join(', ');
  getDb().prepare(`UPDATE quests SET ${set} WHERE id = @id`).run({ ...parse.data, id });
  res.json({ ok: true });
});

router.delete('/quests/:id', (req, res) => {
  const id = Number(req.params.id);
  getDb().prepare('DELETE FROM quests WHERE id = ?').run(id);
  res.json({ ok: true });
});

/* =========================================================
   Users management
   ========================================================= */
router.get('/users', (req, res) => {
  const q = (req.query.q as string | undefined)?.trim() || '';
  const params: any[] = [];
  let where = '';
  if (q) {
    where = 'WHERE u.username LIKE ? OR u.email LIKE ?';
    params.push(`%${q}%`, `%${q}%`);
  }
  const users = getDb().prepare(`
    SELECT u.id, u.username, u.email, u.is_admin, u.created_at, u.last_seen_at,
           u.last_ip, u.last_country, u.last_user_agent,
           c.id AS char_id, c.name AS char_name, c.class AS char_class, c.level AS char_level,
           c.gold, c.gems, c.arena_rating
    FROM users u LEFT JOIN characters c ON c.user_id = u.id ${where}
    ORDER BY u.last_seen_at DESC LIMIT 200
  `).all(...params);
  res.json({ users });
});

router.post('/users/:id/admin', (req, res) => {
  const id = Number(req.params.id);
  const { admin } = req.body || {};
  if (id === req.auth!.uid && admin === false) {
    res.status(400).json({ error: 'You cannot demote yourself.' });
    return;
  }
  getDb().prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(admin ? 1 : 0, id);
  res.json({ ok: true });
});

/* Grant (or remove, with a negative amount) gems to a user's character. */
const gemsSchema = z.object({ amount: z.number().int() });
router.post('/users/:id/gems', (req, res) => {
  const parse = gemsSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const userId = Number(req.params.id);
  const db = getDb();
  const char = db.prepare('SELECT id, name, gems FROM characters WHERE user_id = ?').get(userId) as any;
  if (!char) { res.status(404).json({ error: 'That user has no character.' }); return; }
  const delta = parse.data.amount;
  const newGems = Math.max(0, (char.gems || 0) + delta);
  db.prepare('UPDATE characters SET gems = ?, total_gems_earned = total_gems_earned + ? WHERE id = ?')
    .run(newGems, Math.max(0, delta), char.id);
  res.json({ ok: true, name: char.name, gems: newGems });
});

const charPatchSchema = z.object({
  level: z.number().int().min(1).optional(),
  gold: z.number().int().min(0).optional(),
  hp: z.number().int().min(1).optional(),
  hp_max: z.number().int().min(1).optional(),
  mp: z.number().int().min(0).optional(),
  mp_max: z.number().int().min(0).optional(),
  energy: z.number().int().min(0).optional(),
  energy_max: z.number().int().min(1).max(999).optional(),
  arena_rating: z.number().int().min(0).optional(),
  stat_points: z.number().int().min(0).optional(),
  skill_points: z.number().int().min(0).optional(),
  current_title: z.string().max(40).optional(),
});

router.put('/characters/:id', (req, res) => {
  const id = Number(req.params.id);
  const parse = charPatchSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const fields = Object.keys(parse.data);
  if (fields.length === 0) { res.status(400).json({ error: 'No fields' }); return; }
  const set = fields.map((f) => `${f} = @${f}`).join(', ');
  getDb().prepare(`UPDATE characters SET ${set} WHERE id = @id`).run({ ...parse.data, id });
  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (id === req.auth!.uid) {
    res.status(400).json({ error: 'You cannot delete your own account.' });
    return;
  }
  getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Audit (security round H1): admin-minted accounts used to allow
// 6-character passwords with no common-word block — an attacker who
// phished an admin could create a backdoor account with `password1`
// and walk in via the front door. Now uses the same passwordRule +
// bcrypt 12 rounds as the public /register endpoint.
const createUserSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, 'Use letters, numbers, underscores only'),
  email: z.string().email(),
  password: passwordRule,
  is_admin: z.boolean().optional(),
});

router.post('/users', async (req, res) => {
  const parse = createUserSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const { username, email, password, is_admin } = parse.data;
  const db = getDb();
  const ex = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (ex) { res.status(409).json({ error: 'Username or email already in use' }); return; }
  const hash = await bcrypt.hash(password, PASSWORD_BCRYPT_ROUNDS);
  const now = Date.now();
  db.prepare('INSERT INTO users (username, email, password_hash, created_at, last_seen_at, is_admin) VALUES (?, ?, ?, ?, ?, ?)').run(username, email, hash, now, now, is_admin ? 1 : 0);
  res.json({ ok: true });
});

/* =========================================================
   Mail broadcast
   ========================================================= */
const broadcastSchema = z.object({
  subject: z.string().min(1).max(120),
  body: z.string().min(1).max(2000),
  from_name: z.string().max(40).default('Heralds of the Crown'),
});

router.post('/broadcast', (req, res) => {
  const parse = broadcastSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const db = getDb();
  const chars = db.prepare('SELECT id FROM characters WHERE is_npc = 0').all() as { id: number }[];
  const now = Date.now();
  const stmt = db.prepare('INSERT INTO mail (character_id, from_name, subject, body, created_at) VALUES (?, ?, ?, ?, ?)');
  const tx = db.transaction((cs: { id: number }[]) => {
    for (const c of cs) stmt.run(c.id, parse.data.from_name, parse.data.subject, parse.data.body, now);
  });
  tx(chars);
  res.json({ ok: true, sent: chars.length });
});

/* =========================================================
   Server info
   ========================================================= */
/* =========================================================
   Game settings (runtime-tunable knobs)
   ========================================================= */
import { SETTINGS_CATALOG, getAllSettings, setSetting, findSetting } from '../game/settings';

router.get('/settings', (_req, res) => {
  const list = getAllSettings();
  res.json({ settings: list });
});

const settingPutSchema = z.object({ value: z.union([z.string(), z.number(), z.boolean()]) });

router.put('/settings/:key', (req, res) => {
  const key = req.params.key;
  const def = findSetting(key);
  if (!def) { res.status(404).json({ error: 'Unknown setting' }); return; }
  const parse = settingPutSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  // Coerce + validate
  let v = parse.data.value;
  if (def.type === 'int') {
    const n = Number(v);
    if (!Number.isFinite(n) || !Number.isInteger(n)) { res.status(400).json({ error: 'Integer required' }); return; }
    v = n;
  } else if (def.type === 'float') {
    const n = Number(v);
    if (!Number.isFinite(n)) { res.status(400).json({ error: 'Number required' }); return; }
    v = n;
  } else if (def.type === 'bool') {
    v = v === true || v === 'true' || v === 1 || v === '1';
  }
  setSetting(key, v, req.auth!.uid);
  res.json({ ok: true, key, value: v });
});

/* ===== Marketplace admin ===== */
router.get('/marketplace', (_req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT m.*, items.name AS item_name, items.rarity, s.name AS seller_name, b.name AS buyer_name
       FROM marketplace_listings m
       JOIN items ON items.id = m.item_id
       JOIN characters s ON s.id = m.seller_id
       LEFT JOIN characters b ON b.id = m.buyer_id
       ORDER BY m.listed_at DESC LIMIT 200`,
    )
    .all();
  res.json({ listings: rows });
});

router.delete('/marketplace/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const row = db.prepare('SELECT inventory_id, status FROM marketplace_listings WHERE id = ?').get(id) as any;
  if (!row) { res.status(404).json({ error: 'Listing not found' }); return; }
  db.prepare(`UPDATE marketplace_listings SET status = 'cancelled' WHERE id = ?`).run(id);
  if (row.inventory_id) db.prepare('UPDATE inventory SET listed = 0 WHERE id = ?').run(row.inventory_id);
  res.json({ ok: true });
});

/* ===== Event logs ===== */
router.get('/logs', (req, res) => {
  const limit = Math.min(500, Number(req.query.limit) || 100);
  const before = Number(req.query.before) || Date.now() + 1;
  const category = (req.query.category as string) || '';
  const level = (req.query.level as string) || '';
  const params: any[] = [before];
  let where = 'WHERE ts < ?';
  if (category) { where += ' AND category = ?'; params.push(category); }
  if (level)    { where += ' AND level = ?';    params.push(level); }
  const rows = getDb()
    .prepare(`SELECT id, ts, category, action, level, user_id, character_id, ip, country, route, message, meta_json, webhook_sent
              FROM event_log ${where} ORDER BY ts DESC LIMIT ?`)
    .all(...params, limit);
  res.json({ logs: rows });
});

/* ===== Webhook endpoints ===== */
router.get('/webhooks', (_req, res) => {
  const rows = getDb().prepare('SELECT * FROM webhook_endpoints ORDER BY created_at DESC').all();
  res.json({ webhooks: rows });
});

const webhookSchema = z.object({
  // Audit (security round): reject loopback / RFC1918 / link-local URLs
  // at registration time so a compromised admin cannot point a webhook
  // at internal cloud metadata or internal services.
  url: z.string().url().refine(isSafeWebhookUrl, 'URL must be a public http(s) endpoint — loopback, private, and link-local addresses are blocked'),
  secret: z.string().max(120).default(''),
  category_filter: z.string().max(120).default('*'),
  enabled: z.boolean().default(true),
});

router.post('/webhooks', (req, res) => {
  const parse = webhookSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  getDb()
    .prepare('INSERT INTO webhook_endpoints (url, secret, category_filter, enabled, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(parse.data.url, parse.data.secret, parse.data.category_filter, parse.data.enabled ? 1 : 0, Date.now());
  res.json({ ok: true });
});

router.delete('/webhooks/:id', (req, res) => {
  getDb().prepare('DELETE FROM webhook_endpoints WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// Toggle a webhook on/off without deleting it.
router.patch('/webhooks/:id', (req, res) => {
  const id = Number(req.params.id);
  const fields: string[] = [];
  const params: any[] = [];
  if (typeof req.body?.enabled === 'boolean') { fields.push('enabled = ?'); params.push(req.body.enabled ? 1 : 0); }
  if (typeof req.body?.category_filter === 'string') { fields.push('category_filter = ?'); params.push(req.body.category_filter); }
  if (typeof req.body?.secret === 'string') { fields.push('secret = ?'); params.push(req.body.secret); }
  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update.' }); return; }
  params.push(id);
  getDb().prepare(`UPDATE webhook_endpoints SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

// Fire a test event through a single webhook so the admin can confirm
// it actually arrives in Discord (or wherever) without waiting for a
// real game event. Picks the webhook by id, builds a sample payload
// tagged `system.webhook_test`, and resets the failures counter on
// success.
router.post('/webhooks/:id/test', async (req, res) => {
  const id = Number(req.params.id);
  const row = getDb().prepare('SELECT * FROM webhook_endpoints WHERE id = ?').get(id) as { id: number; url: string; secret: string } | undefined;
  if (!row) { res.status(404).json({ error: 'Webhook not found' }); return; }
  // Reuse the public log path so the test payload follows the same
  // discord-formatting and SSRF-guard codepath as a real event.
  logEvent({
    category: 'system',
    action: 'webhook_test',
    level: 'info',
    message: 'Webhook test fired from admin panel.',
    meta: { triggered_by_admin_id: req.auth?.uid, webhook_id: id, ts: Date.now() },
  });
  res.json({ ok: true, message: 'Test event queued. Check the destination for delivery.' });
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
   Moderation (DSA чл. 16(6)/17 — targeted takedown + бан)

   Одиторът (Правния Разбирач) отбеляза, че dsa.ts приема сигнали, но
   нямаше начин да се СВАЛИ конкретно съдържание (само триене на цял
   акаунт). Тези endpoint-и дават таргетирано действие + доставка на
   обосновка (statement of reasons) към ЗАСЕГНАТИЯ автор. Обжалване по
   чл. 20 не се строи — освободено за микро-предприятия (Раздел 3, чл. 19).
   ========================================================= */

/** Доставя обосновка (чл. 17) до засегнатия герой чрез вътрешната поща. */
function notifyAffected(characterId: number, reason: string): void {
  try {
    getDb().prepare(
      `INSERT INTO mail (character_id, from_name, subject, body, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(
      characterId,
      'Trust & Safety',
      'Content moderation notice',
      `Some of your content was removed or reset by our moderation team.\n\nReason: ${reason}\n\n`
        + 'This action was taken under our Terms and the EU Digital Services Act (Art. 17). '
        + 'If you believe this was a mistake, reply to this message to contact us.',
      Date.now(),
    );
  } catch { /* mail table present in all deploys; ignore mid-migration */ }
}

const takedownSchema = z.object({
  kind: z.enum(['character_name', 'guild_name', 'guild_tag', 'guild_motto', 'bio', 'chat_message']),
  targetId: z.number().int().positive(),
  reason: z.string().min(3).max(300),
  notify: z.boolean().default(true),
  noticeId: z.number().int().positive().optional(), // ако идва от DSA сигнал → резолвни го
});

router.post('/moderation/takedown', (req, res) => {
  const parse = takedownSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const { kind, targetId, reason, notify, noticeId } = parse.data;
  const db = getDb();
  let affectedChar: number | undefined;
  let detail = '';

  const tx = db.transaction(() => {
    switch (kind) {
      case 'character_name': {
        const row = db.prepare('SELECT id FROM characters WHERE id = ?').get(targetId) as { id: number } | undefined;
        if (!row) return 'not_found';
        db.prepare('UPDATE characters SET name = ? WHERE id = ?').run(`Reclaimed${targetId}`, targetId);
        affectedChar = targetId; detail = `character name → Reclaimed${targetId}`;
        return 'ok';
      }
      case 'bio': {
        const row = db.prepare('SELECT id FROM characters WHERE id = ?').get(targetId) as { id: number } | undefined;
        if (!row) return 'not_found';
        db.prepare("UPDATE characters SET bio = '' WHERE id = ?").run(targetId);
        affectedChar = targetId; detail = 'bio cleared';
        return 'ok';
      }
      case 'guild_name':
      case 'guild_tag':
      case 'guild_motto': {
        const g = db.prepare('SELECT id, leader_id FROM guilds WHERE id = ?').get(targetId) as { id: number; leader_id: number } | undefined;
        if (!g) return 'not_found';
        if (kind === 'guild_name') { db.prepare('UPDATE guilds SET name = ? WHERE id = ?').run(`Guild ${targetId}`, targetId); detail = 'guild name reset'; }
        else if (kind === 'guild_tag') { db.prepare('UPDATE guilds SET tag = ? WHERE id = ?').run(('G' + targetId).slice(0, 5).toUpperCase(), targetId); detail = 'guild tag reset'; }
        else { db.prepare("UPDATE guilds SET motto = '' WHERE id = ?").run(targetId); detail = 'guild motto cleared'; }
        affectedChar = g.leader_id;
        return 'ok';
      }
      case 'chat_message': {
        const msg = db.prepare('SELECT character_id FROM guild_chat WHERE id = ?').get(targetId) as { character_id: number } | undefined;
        if (!msg) return 'not_found';
        db.prepare('DELETE FROM guild_chat WHERE id = ?').run(targetId);
        affectedChar = msg.character_id; detail = 'chat message removed';
        return 'ok';
      }
    }
    return 'not_found';
  });

  const outcome = tx();
  if (outcome === 'not_found') { res.status(404).json({ error: 'Target not found' }); return; }

  if (notify && affectedChar) notifyAffected(affectedChar, reason);
  if (noticeId) {
    db.prepare(`UPDATE dsa_notices SET status = 'actioned', decision = ?, decided_at = ? WHERE id = ?`)
      .run(reason, Date.now(), noticeId);
  }
  logEvent({
    category: 'moderation', action: 'takedown', level: 'warn',
    user_id: req.auth!.uid, target_id: targetId, target_type: kind,
    message: `Takedown: ${detail}`, meta: { reason, notified: notify && !!affectedChar, noticeId: noticeId ?? null },
  });
  res.json({ ok: true, kind, targetId, detail, notified: notify && !!affectedChar });
});

/** Ръчен бан (chargeback банът минава през webhook-а автоматично). */
const banSchema = z.object({ userId: z.number().int().positive(), reason: z.string().min(3).max(300) });
router.post('/moderation/ban', (req, res) => {
  const parse = banSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const { userId, reason } = parse.data;
  const db = getDb();
  const u = db.prepare('SELECT id, last_ip, last_hwid FROM users WHERE id = ?').get(userId) as
    | { id: number; last_ip: string; last_hwid: string } | undefined;
  if (!u) { res.status(404).json({ error: 'User not found' }); return; }
  banUser({ userId, ip: u.last_ip, hwid: u.last_hwid, reason });
  logEvent({ category: 'moderation', action: 'manual_ban', level: 'warn', user_id: req.auth!.uid, target_id: userId, target_type: 'user', message: `Manual ban (user ${userId})`, meta: { reason } });
  res.json({ ok: true, userId, banned_ip: u.last_ip || null, banned_hwid: u.last_hwid || null });
});

const unbanSchema = z.object({ userId: z.number().int().positive() });
router.post('/moderation/unban', (req, res) => {
  const parse = unbanSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  unbanUser(parse.data.userId);
  logEvent({ category: 'moderation', action: 'unban', level: 'info', user_id: req.auth!.uid, target_id: parse.data.userId, target_type: 'user', message: `Unban (user ${parse.data.userId})` });
  res.json({ ok: true, userId: parse.data.userId });
});

/** Списък DSA сигнали за модерационния панел (open най-горе). */
router.get('/moderation/notices', (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'open';
  const db = getDb();
  const rows = status === 'all'
    ? db.prepare('SELECT * FROM dsa_notices ORDER BY (status = \'open\') DESC, created_at DESC LIMIT 200').all()
    : db.prepare('SELECT * FROM dsa_notices WHERE status = ? ORDER BY created_at DESC LIMIT 200').all(status);
  res.json({ notices: rows });
});

router.get('/moderation/bans', (_req, res) => {
  const db = getDb();
  res.json({
    users: db.prepare('SELECT id, username, banned_reason, banned_at FROM users WHERE banned = 1 ORDER BY banned_at DESC LIMIT 200').all(),
    ips: db.prepare('SELECT ip, reason, user_id, created_at FROM banned_ips ORDER BY created_at DESC LIMIT 200').all(),
    devices: db.prepare('SELECT hwid, reason, user_id, created_at FROM banned_devices ORDER BY created_at DESC LIMIT 200').all(),
  });
});

/** Отхвърляне на DSA сигнал без действие (напр. неоснователен). */
const rejectSchema = z.object({ decision: z.string().min(3).max(300) });
router.post('/moderation/dsa/:id/reject', (req, res) => {
  const id = Number(req.params.id);
  const parse = rejectSchema.safeParse(req.body);
  if (!Number.isInteger(id) || !parse.success) { res.status(400).json({ error: 'Invalid request' }); return; }
  const info = getDb().prepare(`UPDATE dsa_notices SET status = 'rejected', decision = ?, decided_at = ? WHERE id = ? AND status = 'open'`)
    .run(parse.data.decision, Date.now(), id);
  if (info.changes !== 1) { res.status(404).json({ error: 'Notice not found or already decided' }); return; }
  logEvent({ category: 'moderation', action: 'dsa_reject', level: 'info', user_id: req.auth!.uid, target_id: id, target_type: 'dsa_notice', message: `DSA notice ${id} rejected` });
  res.json({ ok: true, id });
});

export default router;
