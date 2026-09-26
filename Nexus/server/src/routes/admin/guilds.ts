/**
 * Гилдии: списък/детайл, редакция, разпускане (членове/покани/войни/трезор в
 * ЕДНА транзакция), членове (изгонване, роля, лидерство), трезор (връщане на
 * предмет на притежателя / унищожаване), войни (прекратяване).
 *
 * Инвариант: гилдия винаги има точно един лидер и guilds.leader_id сочи
 * член с роля 'leader' — затова лидерът не се изгонва, а първо се прехвърля.
 */
import type { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../db';
import { audit, parseId, parseQuery, pageQuery } from '../../lib/adminKit';
import { notify } from '../../lib/notify';
import { MEMBER_SLOTS_BY_LEVEL } from '../../game/guild';
import { destructiveLimiter, fail, inTx, listPage, parseBody, pick, type Db, type Row } from './kit';

const TRACKS = ['attr_level', 'power_level', 'defence_level', 'exp_bonus_level', 'gold_bonus_level', 'gold_level'] as const;

const guildPatchSchema = z.object({
  name: z.string().trim().min(3).max(30).regex(/^[a-zA-Z][a-zA-Z0-9 ']*$/, 'Name: letter first, then letters, digits, spaces, apostrophes').optional(),
  tag: z.string().trim().min(2).max(5).regex(/^[A-Z0-9]+$/, 'Tag: 2–5 capital letters/digits').optional(),
  motto: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional(),
  crest_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  /** Тир на местата (1–5) → member_slots по MEMBER_SLOTS_BY_LEVEL. */
  level: z.number().int().min(1).max(5).optional(),
  attr_level: z.number().int().min(0).max(100).optional(),
  power_level: z.number().int().min(0).max(100).optional(),
  defence_level: z.number().int().min(0).max(100).optional(),
  exp_bonus_level: z.number().int().min(0).max(100).optional(),
  gold_bonus_level: z.number().int().min(0).max(100).optional(),
  gold_level: z.number().int().min(0).max(100).optional(),
  xp: z.number().int().min(0).max(1e12).optional(),
  gold: z.number().int().min(0).max(1e12).optional(),
}).strict();
const GUILD_FIELDS = Object.keys(guildPatchSchema.shape);

const roleSchema = z.object({ role: z.enum(['officer', 'member', 'recruit']) }).strict();
const leaderSchema = z.object({ character_id: z.number().int().positive() }).strict();
const warEndSchema = z.object({ winner: z.enum(['attacker', 'defender', 'none']) }).strict();

function getGuild(db: Db, id: number): Row {
  return (db.prepare('SELECT * FROM guilds WHERE id = ?').get(id) as Row | undefined) ?? fail(404, 'Guild not found');
}
function getMember(db: Db, guildId: number, charId: number): Row {
  return (db.prepare(`SELECT gm.*, c.name FROM guild_members gm JOIN characters c ON c.id = gm.character_id
    WHERE gm.guild_id = ? AND gm.character_id = ?`).get(guildId, charId) as Row | undefined) ?? fail(404, 'Not a member of this guild');
}

export function registerGuilds(router: Router): void {
  router.get('/guilds', (req, res) => {
    const q = parseQuery(pageQuery, req, res); if (!q) return;
    const { rows, ...meta } = listPage(getDb(), {
      select: `g.id, g.name, g.tag, g.level AS slots_tier, g.member_slots, g.xp, g.gold, g.created_at,
               g.attr_level, g.power_level, g.defence_level, g.exp_bonus_level, g.gold_bonus_level, g.gold_level,
               c.name AS leader_name,
               (SELECT COUNT(*) FROM guild_members gm WHERE gm.guild_id = g.id) AS member_count,
               (SELECT COUNT(*) FROM guild_wars w WHERE w.status = 'active' AND (w.attacker_guild_id = g.id OR w.defender_guild_id = g.id)) AS active_wars`,
      from: 'guilds g LEFT JOIN characters c ON c.id = g.leader_id',
      where: [], params: [],
      orderBy: 'g.xp DESC, g.id',
      search: { cols: ['g.name', 'g.tag', 'c.name'], idCol: 'g.id' },
    }, q);
    res.json({ ...meta, guilds: rows });
  });

  router.get('/guilds/:id', (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const db = getDb();
    const guild = db.prepare('SELECT * FROM guilds WHERE id = ?').get(id) as Row | undefined;
    if (!guild) { res.status(404).json({ error: 'Guild not found' }); return; }
    const members = db.prepare(`
      SELECT gm.character_id, c.name, c.class, c.level, gm.role, gm.contribution, gm.joined_at
      FROM guild_members gm JOIN characters c ON c.id = gm.character_id WHERE gm.guild_id = ?
      ORDER BY CASE gm.role WHEN 'leader' THEN 0 WHEN 'officer' THEN 1 WHEN 'member' THEN 2 ELSE 3 END, c.level DESC`).all(id);
    const invitations = db.prepare(`
      SELECT gi.id, gi.character_id, c.name, gi.created_at FROM guild_invitations gi JOIN characters c ON c.id = gi.character_id
      WHERE gi.guild_id = ? ORDER BY gi.created_at DESC`).all(id);
    const wars = db.prepare(`
      SELECT w.id, w.status, w.attacker_guild_id, w.defender_guild_id, w.attacker_score, w.defender_score, w.started_at, w.ends_at, w.winner_guild_id,
             ag.name AS attacker_name, ag.tag AS attacker_tag, dg.name AS defender_name, dg.tag AS defender_tag
      FROM guild_wars w JOIN guilds ag ON ag.id = w.attacker_guild_id JOIN guilds dg ON dg.id = w.defender_guild_id
      WHERE w.attacker_guild_id = ? OR w.defender_guild_id = ?
      ORDER BY (w.status = 'active') DESC, w.started_at DESC LIMIT 50`).all(id, id);
    const vault = db.prepare(`
      SELECT v.id AS vault_id, v.inventory_id, v.deposited_at, v.deposited_by, dc.name AS deposited_by_name,
             inv.character_id AS owner_id, oc.name AS owner_name, inv.quantity,
             items.slug, items.name, items.rarity, items.tier, items.category
      FROM guild_vault v
      JOIN inventory inv ON inv.id = v.inventory_id JOIN items ON items.id = inv.item_id
      LEFT JOIN characters dc ON dc.id = v.deposited_by LEFT JOIN characters oc ON oc.id = inv.character_id
      WHERE v.guild_id = ? ORDER BY v.deposited_at DESC`).all(id);
    res.json({ guild, members, invitations, wars, vault });
  });

  router.put('/guilds/:id', (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const body = parseBody(guildPatchSchema, req, res); if (!body) return;
    const patch: Row = { ...body };
    if (patch.level !== undefined) patch.member_slots = MEMBER_SLOTS_BY_LEVEL[patch.level];
    const keys = Object.keys(patch).filter((k) => GUILD_FIELDS.includes(k) || k === 'member_slots');
    if (!keys.length) { res.status(400).json({ error: 'No fields to update' }); return; }
    const out = inTx(res, 'Guild', (db) => {
      const before = getGuild(db, id);
      if (patch.member_slots !== undefined) {
        const n = (db.prepare('SELECT COUNT(*) AS c FROM guild_members WHERE guild_id = ?').get(id) as { c: number }).c;
        if (n > patch.member_slots) fail(409, `The guild has ${n} members — more than ${patch.member_slots} slots.`);
      }
      db.prepare(`UPDATE guilds SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...patch, id });
      return before;
    });
    if (!out) return;
    audit(req, res, { action: 'guild_update', targetType: 'guild', targetId: id, before: pick(out.value, keys), after: pick(patch, keys), message: `Guild ${out.value.name} updated` });
    res.json({ ok: true });
  });

  /**
   * Разпускане. Необратимо → `?confirm=<таг>`. В една транзакция: трезорът се
   * връща на притежателите (inventory.vaulted_guild_id няма FK → изрично),
   * войни/покани/членове/чат/мисии се трият, членовете получават известие.
   */
  router.delete('/guilds/:id', destructiveLimiter, (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const confirm = typeof req.query.confirm === 'string' ? req.query.confirm : '';
    const out = inTx(res, 'Guild', (db) => {
      const g = getGuild(db, id);
      if (confirm !== g.tag) fail(400, 'Confirmation does not match the guild tag.');
      const memberIds = (db.prepare('SELECT character_id FROM guild_members WHERE guild_id = ?').all(id) as { character_id: number }[]).map((m) => m.character_id);
      const cleaned = {
        vault_returned: db.prepare('UPDATE inventory SET vaulted_guild_id = 0 WHERE vaulted_guild_id = ?').run(id).changes,
        vault_rows: db.prepare('DELETE FROM guild_vault WHERE guild_id = ?').run(id).changes,
        wars: db.prepare('DELETE FROM guild_wars WHERE attacker_guild_id = ? OR defender_guild_id = ?').run(id, id).changes,
        invitations: db.prepare('DELETE FROM guild_invitations WHERE guild_id = ?').run(id).changes,
        members: db.prepare('DELETE FROM guild_members WHERE guild_id = ?').run(id).changes,
        chat: db.prepare('DELETE FROM guild_chat WHERE guild_id = ?').run(id).changes,
      };
      db.prepare('DELETE FROM guild_dungeon_run WHERE guild_id = ?').run(id);
      db.prepare('DELETE FROM guild_mission_progress WHERE guild_id = ?').run(id);
      db.prepare('DELETE FROM guilds WHERE id = ?').run(id);
      for (const cid of memberIds) notify(db, cid, 'system', `Your guild ${g.name} [${g.tag}] was disbanded by the realm administrators. Items in the vault were returned to their owners.`);
      return { g, cleaned };
    });
    if (!out) return;
    const { g, cleaned } = out.value;
    audit(req, res, { action: 'guild_disband', targetType: 'guild', targetId: id, level: 'warn', before: { name: g.name, tag: g.tag, gold: g.gold, xp: g.xp }, after: { exists: false }, meta: cleaned, message: `Guild ${g.name} [${g.tag}] disbanded` });
    res.json({ ok: true, ...cleaned });
  });

  /* ===================== Членове ===================== */
  router.post('/guilds/:id/members/:charId/kick', destructiveLimiter, (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const charId = parseId(req, res, 'charId'); if (charId === null) return;
    const out = inTx(res, 'Guild member', (db) => {
      const g = getGuild(db, id);
      const m = getMember(db, id, charId);
      if (m.role === 'leader' || g.leader_id === charId) fail(409, 'Transfer the leadership before removing the leader.');
      // Дарените от него предмети остават в трезора (както при /guild/leave).
      db.prepare('DELETE FROM guild_members WHERE guild_id = ? AND character_id = ?').run(id, charId);
      notify(db, charId, 'system', `You were removed from the guild ${g.name} [${g.tag}] by the realm administrators.`);
      return { g, m };
    });
    if (!out) return;
    audit(req, res, { action: 'guild_kick', targetType: 'guild', targetId: id, level: 'warn', before: { member: out.value.m.name, role: out.value.m.role }, after: { member: null }, meta: { character_id: charId } });
    res.json({ ok: true });
  });

  router.put('/guilds/:id/members/:charId/role', (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const charId = parseId(req, res, 'charId'); if (charId === null) return;
    const body = parseBody(roleSchema, req, res); if (!body) return;
    const out = inTx(res, 'Guild member', (db) => {
      getGuild(db, id);
      const m = getMember(db, id, charId);
      if (m.role === 'leader') fail(409, 'Use leadership transfer to change the leader’s role.');
      if (m.role === body.role) fail(409, `The member is already ${body.role}.`);
      db.prepare('UPDATE guild_members SET role = ? WHERE guild_id = ? AND character_id = ?').run(body.role, id, charId);
      return m;
    });
    if (!out) return;
    audit(req, res, { action: 'guild_role', targetType: 'guild', targetId: id, before: { role: out.value.role }, after: { role: body.role }, meta: { character_id: charId, member: out.value.name } });
    res.json({ ok: true });
  });

  router.post('/guilds/:id/leader', destructiveLimiter, (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const body = parseBody(leaderSchema, req, res); if (!body) return;
    const out = inTx(res, 'Guild', (db) => {
      const g = getGuild(db, id);
      const m = getMember(db, id, body.character_id);
      if (g.leader_id === body.character_id) fail(409, 'That member already leads the guild.');
      db.prepare("UPDATE guild_members SET role = 'officer' WHERE guild_id = ? AND role = 'leader'").run(id);
      db.prepare("UPDATE guild_members SET role = 'leader' WHERE guild_id = ? AND character_id = ?").run(id, body.character_id);
      db.prepare('UPDATE guilds SET leader_id = ? WHERE id = ?').run(body.character_id, id);
      notify(db, body.character_id, 'system', `The realm administrators made you the leader of ${g.name} [${g.tag}].`);
      return { g, m };
    });
    if (!out) return;
    audit(req, res, { action: 'guild_leader', targetType: 'guild', targetId: id, level: 'warn', before: { leader_id: out.value.g.leader_id }, after: { leader_id: body.character_id }, meta: { new_leader: out.value.m.name } });
    res.json({ ok: true });
  });

  /* ===================== Трезор ===================== */
  /** Връща предмета на притежателя му (inventory.character_id = депозиралия). */
  router.post('/guilds/:id/vault/:vaultId/return', (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const vaultId = parseId(req, res, 'vaultId'); if (vaultId === null) return;
    const out = inTx(res, 'Vault', (db) => {
      getGuild(db, id);
      const v = db.prepare(`SELECT v.id, v.inventory_id, inv.character_id AS owner_id, items.slug FROM guild_vault v
        JOIN inventory inv ON inv.id = v.inventory_id JOIN items ON items.id = inv.item_id WHERE v.id = ? AND v.guild_id = ?`).get(vaultId, id) as Row | undefined;
      if (!v) fail(404, 'Vault entry not found');
      const moved = db.prepare("UPDATE inventory SET vaulted_guild_id = 0, listed = 0, equipped = 0, slot = '' WHERE id = ? AND vaulted_guild_id = ?").run(v!.inventory_id, id);
      if (moved.changes !== 1) fail(409, 'The item is no longer in this vault.');
      db.prepare('DELETE FROM guild_vault WHERE id = ?').run(vaultId);
      return v!;
    });
    if (!out) return;
    audit(req, res, { action: 'guild_vault_return', targetType: 'guild', targetId: id, before: { vaulted: true }, after: { vaulted: false, owner_id: out.value.owner_id }, meta: { item: out.value.slug, inventory_id: out.value.inventory_id } });
    res.json({ ok: true });
  });

  /** Унищожава предмета от трезора (напр. дупликиран чрез експлойт). */
  router.delete('/guilds/:id/vault/:vaultId', destructiveLimiter, (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const vaultId = parseId(req, res, 'vaultId'); if (vaultId === null) return;
    const out = inTx(res, 'Vault', (db) => {
      getGuild(db, id);
      const v = db.prepare(`SELECT v.id, v.inventory_id, inv.character_id AS owner_id, inv.quantity, items.slug FROM guild_vault v
        JOIN inventory inv ON inv.id = v.inventory_id JOIN items ON items.id = inv.item_id WHERE v.id = ? AND v.guild_id = ?`).get(vaultId, id) as Row | undefined;
      if (!v) fail(404, 'Vault entry not found');
      db.prepare('DELETE FROM inventory WHERE id = ?').run(v!.inventory_id); // guild_vault каскадира
      db.prepare('DELETE FROM guild_vault WHERE id = ?').run(vaultId);
      return v!;
    });
    if (!out) return;
    audit(req, res, { action: 'guild_vault_destroy', targetType: 'guild', targetId: id, level: 'warn', before: { item: out.value.slug, quantity: out.value.quantity, owner_id: out.value.owner_id }, after: { item: null } });
    res.json({ ok: true });
  });

  /* ===================== Войни ===================== */
  router.post('/guilds/:id/wars/:warId/end', (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const warId = parseId(req, res, 'warId'); if (warId === null) return;
    const body = parseBody(warEndSchema, req, res); if (!body) return;
    const out = inTx(res, 'War', (db) => {
      const w = db.prepare('SELECT * FROM guild_wars WHERE id = ? AND (attacker_guild_id = ? OR defender_guild_id = ?)').get(warId, id, id) as Row | undefined;
      if (!w) fail(404, 'War not found');
      if (w!.status !== 'active') fail(409, 'The war has already ended.');
      const winner = body.winner === 'attacker' ? w!.attacker_guild_id : body.winner === 'defender' ? w!.defender_guild_id : null;
      db.prepare("UPDATE guild_wars SET status = 'ended', winner_guild_id = ?, ends_at = MIN(ends_at, ?) WHERE id = ? AND status = 'active'").run(winner, Date.now(), warId);
      return { w: w!, winner };
    });
    if (!out) return;
    audit(req, res, { action: 'guild_war_end', targetType: 'guild_war', targetId: warId, level: 'warn', before: { status: 'active' }, after: { status: 'ended', winner_guild_id: out.value.winner }, meta: { attacker: out.value.w.attacker_guild_id, defender: out.value.w.defender_guild_id } });
    res.json({ ok: true });
  });
}
