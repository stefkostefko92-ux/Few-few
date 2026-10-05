/**
 * Герои — пълно управление от админ панела: списък/търсене, детайл, редакция
 * на полетата, инвентар (даване/премахване/екипиране/чар), нулиране на
 * изчакванията, фракционна репутация, постижения и бойна история (четене).
 *
 * Нивото и опитът са обвързани (game/progression.ts: нивото се ИЗВЕЖДА от
 * кумулативния XP) — затова PUT синхронизира двете, вместо да остави героя
 * с ниво, което следващата победа тихо „поправя" надолу.
 */
import type { Request, Response, Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../db';
import { audit, parseId, parseQuery, pageQuery } from '../../lib/adminKit';
import { SLOT_FOR_CATEGORY } from '../../game/equipment';
import { levelFromXp, xpForLevel } from '../../game/progression';
import { ACHIEVEMENTS, findAchievement } from '../../game/achievements';
import { FACTIONS, tierFor } from '../faction';
import { destructiveLimiter, fail, grantItem, inTx, listPage, parseBody, pick, type Db, type Row } from './kit';

const CLASSES = ['warrior', 'ranger', 'mage', 'rogue'] as const;

const charsQuery = pageQuery.extend({
  class: z.enum(['', ...CLASSES]).default(''),
  min_level: z.coerce.number().int().min(1).max(100_000).optional(),
  max_level: z.coerce.number().int().min(1).max(100_000).optional(),
  kind: z.enum(['players', 'npc', 'all']).default('players'),
  sort: z.enum(['level', 'recent', 'gold', 'rating', 'name']).default('level'),
});

const SORTS: Record<string, string> = {
  level: 'c.level DESC, c.xp DESC, c.id',
  recent: 'COALESCE(u.last_seen_at, c.created_at) DESC, c.id DESC',
  gold: 'c.gold DESC, c.id',
  rating: 'c.arena_rating DESC, c.id',
  name: 'c.name COLLATE NOCASE, c.id',
};

const int = (min: number, max: number) => z.number().int().min(min).max(max).optional();
const stat = int(0, 1_000_000);

/** Редактируемите полета на героя (и само тях — `.strict()` гони непознатите). */
const charPatchSchema = z.object({
  name: z.string().trim().min(3).max(20).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Name: letter first, then letters, digits, underscores').optional(),
  class: z.enum(CLASSES).optional(),
  level: int(1, 1000),
  xp: int(0, 1e13),
  gold: int(0, 1e12),
  gems: int(0, 1e9),
  hp: int(1, 10_000_000),
  hp_max: int(1, 10_000_000),
  mp: int(0, 10_000_000),
  mp_max: int(0, 10_000_000),
  energy: int(0, 999),
  energy_max: int(1, 999),
  arena_rating: int(0, 100_000),
  stat_points: int(0, 100_000),
  skill_points: int(0, 100_000),
  strength: stat, dexterity: stat, constitution: stat, intelligence: stat, charisma: stat, wisdom: stat,
  trial_tokens: int(0, 1_000_000),
  forge_guarantees: int(0, 1_000_000),
  tower_best_floor: int(0, 100_000),
  current_title: z.string().trim().max(40).optional(),
  bio: z.string().trim().max(500).optional(),
}).strict();
const CHAR_FIELDS = Object.keys(charPatchSchema.shape);

const giveSchema = z.object({
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9_]+$/),
  quantity: z.number().int().min(1).max(100).default(1),
  soul_bound: z.boolean().default(false),
}).strict();

export const ENCHANT_KEYS = [
  'str_bonus', 'dex_bonus', 'con_bonus', 'int_bonus', 'cha_bonus', 'wis_bonus', 'hp_bonus', 'mp_bonus',
  'defense', 'atk_min', 'atk_max', 'phys_dmg_bonus', 'phys_def_bonus', 'mag_dmg_bonus', 'mag_def_bonus',
] as const;
const invPatchSchema = z.object({
  quantity: z.number().int().min(1).max(100_000).optional(),
  soul_bound: z.boolean().optional(),
  enchant_count: z.number().int().min(0).max(100).optional(),
  bonuses: z.record(z.enum(ENCHANT_KEYS), z.number().int().min(-100_000).max(100_000)).optional(),
}).strict();

const cooldownSchema = z.object({ scope: z.enum(['actions', 'dungeons', 'daily', 'all']) }).strict();
const repSchema = z.object({ rep: z.number().int().min(0).max(1_000_000) }).strict();
const achSchema = z.object({ slug: z.string().trim().min(1).max(60) }).strict();

function getChar(db: Db, id: number): Row {
  const c = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as Row | undefined;
  return c ?? fail(404, 'Character not found');
}

function invRow(db: Db, charId: number, invId: number): Row {
  const r = db.prepare(`
    SELECT inv.*, items.slug, items.name, items.category, items.sub_type, items.level_req, items.class_req
    FROM inventory inv JOIN items ON items.id = inv.item_id
    WHERE inv.id = ? AND inv.character_id = ?`).get(invId, charId) as Row | undefined;
  return r ?? fail(404, 'Inventory entry not found');
}

/** Предмет в чакаща размяна (escrow е JSON с inventory_id-та). */
function inPendingTrade(db: Db, charId: number, invId: number): boolean {
  const rows = db.prepare(`SELECT from_id, from_items, to_items FROM trade_offers WHERE status = 'pending' AND (from_id = ? OR to_id = ?)`).all(charId, charId) as { from_id: number; from_items: string; to_items: string }[];
  return rows.some((t) => {
    try { return (JSON.parse(t.from_id === charId ? t.from_items : t.to_items) as number[]).includes(invId); } catch { return false; }
  });
}

export function registerCharacters(router: Router): void {
  router.get('/characters', (req, res) => {
    const q = parseQuery(charsQuery, req, res); if (!q) return;
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.kind === 'players') where.push('c.is_npc = 0');
    if (q.kind === 'npc') where.push('c.is_npc = 1');
    if (q.class) { where.push('c.class = ?'); params.push(q.class); }
    if (q.min_level) { where.push('c.level >= ?'); params.push(q.min_level); }
    if (q.max_level) { where.push('c.level <= ?'); params.push(q.max_level); }
    const out = listPage(getDb(), {
      select: `c.id, c.name, c.class, c.level, c.xp, c.gold, c.gems, c.arena_rating, c.is_npc, c.current_title, c.created_at,
               u.id AS user_id, u.username, u.last_seen_at, u.banned, u.banned_until,
               g.id AS guild_id, g.tag AS guild_tag`,
      from: `characters c LEFT JOIN users u ON u.id = c.user_id
             LEFT JOIN guild_members gm ON gm.character_id = c.id LEFT JOIN guilds g ON g.id = gm.guild_id`,
      where, params,
      orderBy: SORTS[q.sort],
      search: { cols: ['c.name', 'u.username'], idCol: 'c.id' },
    }, q);
    const { rows, ...meta } = out;
    res.json({ ...meta, characters: rows });
  });

  /** Всичко за героя на един екран (без rounds_json — той е в /combat/:logId). */
  router.get('/characters/:id', (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const db = getDb();
    const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as Row | undefined;
    if (!character) { res.status(404).json({ error: 'Character not found' }); return; }
    const user = character.user_id
      ? db.prepare('SELECT id, username, email, is_admin, banned, banned_until, last_seen_at, country FROM users WHERE id = ?').get(character.user_id) ?? null
      : null;
    const guild = db.prepare(`SELECT g.id, g.name, g.tag, gm.role, gm.contribution, gm.joined_at
      FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id WHERE gm.character_id = ?`).get(id) ?? null;
    const repRows = db.prepare('SELECT faction_slug, rep, updated_at FROM character_faction_rep WHERE character_id = ?').all(id) as { faction_slug: string; rep: number; updated_at: number }[];
    const factions = FACTIONS.map((f) => {
      const r = repRows.find((x) => x.faction_slug === f.slug);
      const rep = r?.rep ?? 0;
      return { slug: f.slug, name: f.name, rep, tier: tierFor(rep), updated_at: r?.updated_at ?? 0 };
    });
    const unlocked = new Map((db.prepare('SELECT slug, unlocked_at FROM achievements WHERE character_id = ?').all(id) as { slug: string; unlocked_at: number }[]).map((a) => [a.slug, a.unlocked_at]));
    const achievements = ACHIEVEMENTS.map((a) => ({ slug: a.slug, name: a.name, description: a.description, icon: a.icon, title: a.title ?? '', unlocked_at: unlocked.get(a.slug) ?? 0 }));
    const cooldowns = {
      actions: db.prepare('SELECT action_kind, next_available_at FROM character_cooldowns WHERE character_id = ? ORDER BY action_kind').all(id),
      dungeons: db.prepare('SELECT slug, next_available_at FROM dungeon_cooldowns WHERE character_id = ? ORDER BY slug').all(id),
      daily: db.prepare('SELECT streak, longest_streak, last_claim_day, last_spin_day, quests_day FROM daily_state WHERE character_id = ?').get(id) ?? null,
      today: Math.floor(Date.now() / 86_400_000),
    };
    const counts = {
      inventory: (db.prepare('SELECT COUNT(*) AS c FROM inventory WHERE character_id = ?').get(id) as { c: number }).c,
      battles: (db.prepare('SELECT COUNT(*) AS c FROM combat_log WHERE character_id = ?').get(id) as { c: number }).c,
      quests: (db.prepare('SELECT COUNT(*) AS c FROM quest_log WHERE character_id = ?').get(id) as { c: number }).c,
      mail: (db.prepare('SELECT COUNT(*) AS c FROM mail WHERE character_id = ?').get(id) as { c: number }).c,
    };
    res.json({ character, user, guild, factions, achievements, cooldowns, counts });
  });

  router.put('/characters/:id', (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const body = parseBody(charPatchSchema, req, res); if (!body) return;
    const patch: Row = { ...body };
    if (!Object.keys(patch).length) { res.status(400).json({ error: 'No fields to update' }); return; }
    const out = inTx(res, 'Character', (db) => {
      const before = getChar(db, id);
      // Ниво ↔ XP: едното без другото → изведи другото по кривата.
      if (patch.level !== undefined && patch.xp === undefined) patch.xp = xpForLevel(patch.level);
      else if (patch.xp !== undefined && patch.level === undefined) patch.level = levelFromXp(patch.xp);
      else if (patch.xp !== undefined && patch.level !== undefined && levelFromXp(patch.xp) !== patch.level) {
        fail(400, `XP ${patch.xp} corresponds to level ${levelFromXp(patch.xp)}, not ${patch.level}.`);
      }
      const m: Row = { ...before, ...patch };
      if (m.hp > m.hp_max) fail(400, 'HP cannot exceed HP max.');
      if (m.mp > m.mp_max) fail(400, 'MP cannot exceed MP max.');
      if (m.energy > m.energy_max) fail(400, 'Energy cannot exceed energy max.');
      if (patch.name && patch.name.toLowerCase() !== String(before.name).toLowerCase()
        && db.prepare('SELECT 1 FROM characters WHERE name = ? COLLATE NOCASE AND id != ?').get(patch.name, id)) {
        fail(409, 'That character name is taken.');
      }
      const keys = Object.keys(patch).filter((k) => CHAR_FIELDS.includes(k));
      db.prepare(`UPDATE characters SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...patch, id });
      return { before, keys };
    });
    if (!out) return;
    const { before, keys } = out.value;
    audit(req, res, { action: 'character_update', targetType: 'character', targetId: id, before: pick(before, keys), after: pick(patch, keys), message: `Character ${before.name} edited` });
    res.json({ ok: true, level: patch.level ?? before.level, xp: patch.xp ?? before.xp });
  });

  /* ===================== Инвентар ===================== */
  router.get('/characters/:id/inventory', (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const db = getDb();
    const ch = db.prepare('SELECT id, mount_inventory_id FROM characters WHERE id = ?').get(id) as { id: number; mount_inventory_id: number } | undefined;
    if (!ch) { res.status(404).json({ error: 'Character not found' }); return; }
    const items = db.prepare(`
      SELECT inv.id AS inv_id, inv.quantity, inv.equipped, inv.slot, inv.soul_bound, inv.listed, inv.vaulted_guild_id, inv.gem_bought,
             COALESCE(e.enchant_count, 0) AS enchant_count, COALESCE(e.bonuses_json, '{}') AS enchant_bonuses_json,
             items.id AS item_id, items.slug, items.name, items.category, items.sub_type, items.tier, items.rarity,
             items.level_req, items.class_req, items.icon
      FROM inventory inv JOIN items ON items.id = inv.item_id
      LEFT JOIN inventory_enchants e ON e.inventory_id = inv.id
      WHERE inv.character_id = ?
      ORDER BY inv.equipped DESC, items.category, items.tier DESC, inv.id`).all(id) as Row[];
    res.json({ items: items.map((r) => ({ ...r, is_mount: r.inv_id === ch.mount_inventory_id ? 1 : 0 })) });
  });

  router.post('/characters/:id/inventory', (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const body = parseBody(giveSchema, req, res); if (!body) return;
    const out = inTx(res, 'Inventory', (db) => {
      const ch = getChar(db, id);
      const item = db.prepare('SELECT id, slug, name, category FROM items WHERE slug = ?').get(body.slug) as { id: number; slug: string; name: string; category: string } | undefined;
      if (!item) fail(404, `Unknown item slug: ${body.slug}`);
      grantItem(db, id, item!, body.quantity, { soulBound: body.soul_bound });
      return { ch, item: item! };
    });
    if (!out) return;
    audit(req, res, { action: 'inventory_give', targetType: 'character', targetId: id, level: 'warn', after: { item: out.value.item.slug, quantity: body.quantity, soul_bound: body.soul_bound }, message: `Gave ${body.quantity}× ${out.value.item.name} to ${out.value.ch.name}` });
    res.status(201).json({ ok: true });
  });

  router.patch('/characters/:id/inventory/:invId', (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const invId = parseId(req, res, 'invId'); if (invId === null) return;
    const body = parseBody(invPatchSchema, req, res); if (!body) return;
    if (!Object.keys(body).length) { res.status(400).json({ error: 'No fields to update' }); return; }
    const out = inTx(res, 'Inventory', (db) => {
      getChar(db, id);
      const row = invRow(db, id, invId);
      const ench = db.prepare('SELECT enchant_count, bonuses_json FROM inventory_enchants WHERE inventory_id = ?').get(invId) as { enchant_count: number; bonuses_json: string } | undefined;
      const before: Row = { quantity: row.quantity, soul_bound: row.soul_bound, enchant_count: ench?.enchant_count ?? 0, bonuses: ench ? JSON.parse(ench.bonuses_json || '{}') : {} };
      if (body.quantity !== undefined && body.quantity !== row.quantity) {
        if (body.quantity > 1 && row.category !== 'potion' && row.category !== 'misc') fail(400, 'Only potions and materials stack.');
        if (row.equipped) fail(409, 'Unequip the item before changing its quantity.');
        db.prepare('UPDATE inventory SET quantity = ? WHERE id = ?').run(body.quantity, invId);
      }
      if (body.soul_bound !== undefined) db.prepare('UPDATE inventory SET soul_bound = ? WHERE id = ?').run(body.soul_bound ? 1 : 0, invId);
      if (body.enchant_count !== undefined || body.bonuses !== undefined) {
        const count = body.enchant_count ?? before.enchant_count;
        const bonuses = Object.fromEntries(Object.entries(body.bonuses ?? before.bonuses).filter(([, v]) => v !== 0));
        if (count === 0 && !Object.keys(bonuses).length) db.prepare('DELETE FROM inventory_enchants WHERE inventory_id = ?').run(invId);
        else {
          db.prepare(`INSERT INTO inventory_enchants (inventory_id, enchant_count, bonuses_json) VALUES (?, ?, ?)
                      ON CONFLICT(inventory_id) DO UPDATE SET enchant_count = excluded.enchant_count, bonuses_json = excluded.bonuses_json`)
            .run(invId, count, JSON.stringify(bonuses));
        }
      }
      return { before, row };
    });
    if (!out) return;
    const keys = Object.keys(body);
    audit(req, res, { action: 'inventory_edit', targetType: 'inventory', targetId: invId, level: 'warn', before: pick(out.value.before, keys), after: body, meta: { character_id: id, item: out.value.row.slug } });
    res.json({ ok: true });
  });

  router.delete('/characters/:id/inventory/:invId', destructiveLimiter, (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const invId = parseId(req, res, 'invId'); if (invId === null) return;
    const q = parseQuery(z.object({ quantity: z.coerce.number().int().min(1).max(100_000).optional() }), req, res); if (!q) return;
    const out = inTx(res, 'Inventory', (db) => {
      const ch = getChar(db, id);
      const row = invRow(db, id, invId);
      if (row.listed) fail(409, 'The item is listed on the marketplace — cancel the listing first.');
      if (row.vaulted_guild_id) fail(409, 'The item is in a guild vault — return it from the guild screen.');
      if (inPendingTrade(db, id, invId)) fail(409, 'The item is offered in a pending trade — cancel the trade first.');
      const removeAll = !q.quantity || q.quantity >= row.quantity;
      if (removeAll) {
        if (ch.mount_inventory_id === invId) db.prepare('UPDATE characters SET mount_inventory_id = 0 WHERE id = ?').run(id);
        db.prepare('DELETE FROM inventory WHERE id = ?').run(invId);
      } else {
        db.prepare('UPDATE inventory SET quantity = quantity - ? WHERE id = ?').run(q.quantity, invId);
      }
      return { ch, row, removed: removeAll ? row.quantity : q.quantity! };
    });
    if (!out) return;
    const { ch, row, removed } = out.value;
    audit(req, res, { action: 'inventory_remove', targetType: 'inventory', targetId: invId, level: 'warn', before: { item: row.slug, quantity: row.quantity, equipped: row.equipped }, after: { quantity: row.quantity - removed }, message: `Removed ${removed}× ${row.name} from ${ch.name}`, meta: { character_id: id } });
    res.json({ ok: true, removed });
  });

  const equipToggle = (equip: boolean) => (req: Request, res: Response) => {
    const id = parseId(req, res); if (id === null) return;
    const invId = parseId(req, res, 'invId'); if (invId === null) return;
    const out = inTx(res, 'Inventory', (db) => {
      const ch = getChar(db, id);
      const row = invRow(db, id, invId);
      const isMount = row.sub_type === 'mount';
      const wasOn = isMount ? ch.mount_inventory_id === invId : row.equipped === 1;
      if (equip === wasOn) fail(409, equip ? 'The item is already equipped.' : 'The item is not equipped.');
      if (equip) {
        if (row.listed) fail(409, 'The item is listed on the marketplace — cancel the listing first.');
        if (row.vaulted_guild_id) fail(409, 'The item is in a guild vault.');
        if (row.level_req > ch.level) fail(409, `Requires level ${row.level_req}.`);
        if (row.class_req && row.class_req !== ch.class) fail(409, `Requires class ${row.class_req}.`);
        if (isMount) db.prepare('UPDATE characters SET mount_inventory_id = ? WHERE id = ?').run(invId, id);
        else {
          const slot = SLOT_FOR_CATEGORY[row.category] ?? fail(409, 'This item cannot be equipped.');
          db.prepare("UPDATE inventory SET equipped = 0, slot = '' WHERE character_id = ? AND slot = ?").run(id, slot);
          db.prepare('UPDATE inventory SET equipped = 1, slot = ? WHERE id = ?').run(slot, invId);
        }
      } else if (isMount) db.prepare('UPDATE characters SET mount_inventory_id = 0 WHERE id = ?').run(id);
      else db.prepare("UPDATE inventory SET equipped = 0, slot = '' WHERE id = ?").run(invId);
      return { ch, row };
    });
    if (!out) return;
    audit(req, res, { action: equip ? 'inventory_equip' : 'inventory_unequip', targetType: 'inventory', targetId: invId, before: { equipped: equip ? 0 : 1 }, after: { equipped: equip ? 1 : 0 }, meta: { character_id: id, item: out.value.row.slug } });
    res.json({ ok: true });
  };
  router.post('/characters/:id/inventory/:invId/equip', equipToggle(true));
  router.post('/characters/:id/inventory/:invId/unequip', equipToggle(false));

  /* ===================== Изчаквания ===================== */
  router.post('/characters/:id/cooldowns/reset', (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const body = parseBody(cooldownSchema, req, res); if (!body) return;
    const s = body.scope;
    const out = inTx(res, 'Cooldowns', (db) => {
      const ch = getChar(db, id);
      const cleared = { actions: 0, dungeons: 0, daily: 0 };
      if (s === 'actions' || s === 'all') cleared.actions = db.prepare('DELETE FROM character_cooldowns WHERE character_id = ?').run(id).changes;
      if (s === 'dungeons' || s === 'all') cleared.dungeons = db.prepare('DELETE FROM dungeon_cooldowns WHERE character_id = ?').run(id).changes;
      if (s === 'daily' || s === 'all') {
        // Вчерашен ден → наградата/колелото са свободни, а серията НЕ се къса.
        const yesterday = Math.floor(Date.now() / 86_400_000) - 1;
        cleared.daily = db.prepare(`UPDATE daily_state SET last_claim_day = MIN(last_claim_day, ?), last_spin_day = MIN(last_spin_day, ?), quests_day = 0
          WHERE character_id = ? AND (last_claim_day > ? OR last_spin_day > ? OR quests_day != 0)`).run(yesterday, yesterday, id, yesterday, yesterday).changes;
      }
      if (!cleared.actions && !cleared.dungeons && !cleared.daily) fail(409, 'Nothing to reset — no active cooldowns in that scope.');
      return { ch, cleared };
    });
    if (!out) return;
    audit(req, res, { action: 'cooldowns_reset', targetType: 'character', targetId: id, before: out.value.cleared, after: { actions: 0, dungeons: 0, daily: 0 }, meta: { scope: s }, message: `Cooldowns (${s}) reset for ${out.value.ch.name}` });
    res.json({ ok: true, cleared: out.value.cleared });
  });

  /* ===================== Репутация ===================== */
  router.put('/characters/:id/reputation/:faction', (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const faction = FACTIONS.find((f) => f.slug === req.params.faction);
    if (!faction) { res.status(404).json({ error: 'Unknown faction' }); return; }
    const body = parseBody(repSchema, req, res); if (!body) return;
    const out = inTx(res, 'Reputation', (db) => {
      const ch = getChar(db, id);
      const prev = (db.prepare('SELECT rep FROM character_faction_rep WHERE character_id = ? AND faction_slug = ?').get(id, faction.slug) as { rep: number } | undefined)?.rep ?? 0;
      db.prepare(`INSERT INTO character_faction_rep (character_id, faction_slug, rep, updated_at) VALUES (?, ?, ?, ?)
                  ON CONFLICT(character_id, faction_slug) DO UPDATE SET rep = excluded.rep, updated_at = excluded.updated_at`)
        .run(id, faction.slug, body.rep, Date.now());
      return { ch, prev };
    });
    if (!out) return;
    audit(req, res, { action: 'reputation_set', targetType: 'character', targetId: id, before: { [faction.slug]: out.value.prev }, after: { [faction.slug]: body.rep } });
    res.json({ ok: true, tier: tierFor(body.rep) });
  });

  /* ===================== Постижения / титли ===================== */
  router.post('/characters/:id/achievements', (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const body = parseBody(achSchema, req, res); if (!body) return;
    const def = findAchievement(body.slug);
    if (!def) { res.status(404).json({ error: 'Unknown achievement' }); return; }
    const out = inTx(res, 'Achievement', (db) => {
      const ch = getChar(db, id);
      if (db.prepare('SELECT 1 FROM achievements WHERE character_id = ? AND slug = ?').get(id, def.slug)) fail(409, 'The achievement is already unlocked.');
      db.prepare('INSERT INTO achievements (character_id, slug, unlocked_at) VALUES (?, ?, ?)').run(id, def.slug, Date.now());
      return ch;
    });
    if (!out) return;
    audit(req, res, { action: 'achievement_grant', targetType: 'character', targetId: id, before: { [def.slug]: false }, after: { [def.slug]: true }, message: `Achievement ${def.slug} granted to ${out.value.name}` });
    res.status(201).json({ ok: true });
  });

  router.delete('/characters/:id/achievements/:slug', destructiveLimiter, (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const def = findAchievement(String(req.params.slug));
    if (!def) { res.status(404).json({ error: 'Unknown achievement' }); return; }
    const out = inTx(res, 'Achievement', (db) => {
      const ch = getChar(db, id);
      const del = db.prepare('DELETE FROM achievements WHERE character_id = ? AND slug = ?').run(id, def.slug);
      if (del.changes === 0) fail(404, 'The achievement is not unlocked.');
      // Отнетото постижение взема и титлата си, ако е активна.
      const titleCleared = !!def.title && ch.current_title === def.title;
      if (titleCleared) db.prepare("UPDATE characters SET current_title = '' WHERE id = ?").run(id);
      return { ch, titleCleared };
    });
    if (!out) return;
    audit(req, res, { action: 'achievement_revoke', targetType: 'character', targetId: id, level: 'warn', before: { [def.slug]: true, ...(out.value.titleCleared ? { current_title: def.title } : {}) }, after: { [def.slug]: false, ...(out.value.titleCleared ? { current_title: '' } : {}) } });
    res.json({ ok: true, title_cleared: out.value.titleCleared });
  });

  /* ===================== Бойна история (само четене) ===================== */
  router.get('/characters/:id/combat', (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const q = parseQuery(pageQuery.extend({ kind: z.string().regex(/^[a-z_]{0,20}$/).default(''), result: z.enum(['', 'win', 'loss', 'flee']).default('') }), req, res); if (!q) return;
    const db = getDb();
    if (!db.prepare('SELECT 1 FROM characters WHERE id = ?').get(id)) { res.status(404).json({ error: 'Character not found' }); return; }
    const where = ['character_id = ?'];
    const params: unknown[] = [id];
    if (q.kind) { where.push('kind = ?'); params.push(q.kind); }
    if (q.result) { where.push('result = ?'); params.push(q.result); }
    const { rows, ...meta } = listPage(db, {
      select: 'id, opponent, kind, result, xp_gained, gold_gained, created_at, CASE WHEN json_valid(rounds_json) THEN json_array_length(rounds_json) ELSE 0 END AS rounds',
      from: 'combat_log', where, params, orderBy: 'id DESC', search: { cols: ['opponent'] },
    }, q);
    res.json({ ...meta, battles: rows });
  });

  router.get('/characters/:id/combat/:logId', (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const logId = parseId(req, res, 'logId'); if (logId === null) return;
    const row = getDb().prepare('SELECT id, opponent, kind, result, xp_gained, gold_gained, created_at, rounds_json FROM combat_log WHERE id = ? AND character_id = ?').get(logId, id) as Row | undefined;
    if (!row) { res.status(404).json({ error: 'Battle not found' }); return; }
    let rounds: unknown = [];
    try { rounds = JSON.parse(row.rounds_json || '[]'); } catch { /* повреден запис → празно */ }
    const { rounds_json: _r, ...rest } = row;
    res.json({ battle: { ...rest, rounds } });
  });
}
