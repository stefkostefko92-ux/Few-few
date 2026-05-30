import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { adminRequired } from '../middleware/admin';

const router = Router();
router.use(authRequired, adminRequired);

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
  };
  const recentUsers = db
    .prepare('SELECT id, username, email, created_at, last_seen_at, is_admin FROM users ORDER BY created_at DESC LIMIT 12')
    .all();
  const topChars = db
    .prepare("SELECT name, class, level, arena_rating, gold, is_npc FROM characters ORDER BY level DESC, arena_rating DESC LIMIT 10")
    .all();
  res.json({ counts, recentUsers, topChars });
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

const charPatchSchema = z.object({
  level: z.number().int().min(1).max(100).optional(),
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

const createUserSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email(),
  password: z.string().min(6),
  is_admin: z.boolean().optional(),
});

router.post('/users', async (req, res) => {
  const parse = createUserSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const { username, email, password, is_admin } = parse.data;
  const db = getDb();
  const ex = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (ex) { res.status(409).json({ error: 'Username or email already in use' }); return; }
  const hash = await bcrypt.hash(password, 10);
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

router.get('/server', (_req, res) => {
  res.json({
    node: process.version,
    uptime_sec: Math.floor(process.uptime()),
    memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    env: process.env.NODE_ENV || 'development',
    pid: process.pid,
  });
});

export default router;
