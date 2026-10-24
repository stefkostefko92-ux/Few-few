/**
 * Каталог: предмети / чудовища / куестове — общ CRUD (`catalogCrud`).
 * Инвариантите между полета се проверяват върху СЛЕТИЯ ред (и при частичен PUT).
 */
import type { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../db';
import { audit, parseId } from '../../lib/adminKit';
import { destructiveLimiter, pick, sqliteError, type Db, type Row } from './kit';

const bonus = z.number().int().min(-100_000).max(100_000).default(0);
const price = z.number().int().min(0).max(1_000_000_000).default(0);
const slugRule = z.string().trim().min(2).max(60).regex(/^[a-z0-9_]+$/, 'Slug: lowercase letters, digits, underscores');

export const ITEM_CATEGORIES = ['weapon', 'helm', 'armor', 'gloves', 'boots', 'shield', 'cloak', 'ring', 'amulet', 'potion', 'misc'] as const;

const itemSchema = z.object({
  slug: slugRule,
  name: z.string().trim().min(2).max(80),
  category: z.enum(ITEM_CATEGORIES),
  sub_type: z.string().max(20).default(''),
  tier: z.number().int().min(1).max(12).default(1),
  rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']).default('common'),
  level_req: z.number().int().min(1).max(1000).default(1),
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
  slug: slugRule,
  name: z.string().trim().min(2).max(80),
  level: z.number().int().min(1).max(1000),
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
  slug: slugRule,
  title: z.string().trim().min(2).max(120),
  region: z.string().max(40),
  level_req: z.number().int().min(1).max(1000),
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

export interface CatalogDef {
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

/** Общ CRUD за таблица от каталога: list · create · частичен PUT · DELETE (409 при употреба). */
export function catalogCrud(router: Router, d: CatalogDef): void {
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

export function registerCatalog(router: Router): void {
  catalogCrud(router, { path: 'items', table: 'items', listKey: 'items', label: 'Item', orderBy: 'tier, category, level_req, name', schema: itemSchema, check: checkItem });
  catalogCrud(router, {
    path: 'monsters', table: 'monsters', listKey: 'monsters', label: 'Monster', orderBy: 'level, name', schema: monsterSchema, check: checkMonster,
    inUse: (r, db) => {
      const n = (db.prepare('SELECT COUNT(*) AS c FROM quests WHERE monster_slug = ?').get(r.slug) as { c: number }).c;
      return n > 0 ? `Monster is used by ${n} quest(s) — reassign them first.` : null;
    },
  });
  catalogCrud(router, { path: 'quests', table: 'quests', listKey: 'quests', label: 'Quest', orderBy: 'level_req, region, title', schema: questSchema, check: checkQuest });
}
