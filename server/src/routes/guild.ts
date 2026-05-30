import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import {
  GUILD_CREATE_COST,
  GUILD_CREATE_LEVEL_REQ,
  GUILD_TRACKS,
  MEMBER_SLOTS_BY_LEVEL,
  MEMBER_SLOT_TIER_XP,
  MEMBER_SLOT_TIER_GEMS,
  computeBuffs,
  loadGuildLevels,
  trackUpgradeCost,
} from '../game/guild';
import { trackBattlePass } from './battlepass';
import { simulateCombat } from '../game/combat';
import { deriveStats, buildHeroActor } from '../game/stats';
import type { Character, Item, InventoryEntry } from '../types/domain';

const router = Router();
router.use(authRequired);

/* ===== Helpers ===== */

function getCharacter(uid: number): Character | undefined {
  return getDb().prepare('SELECT * FROM characters WHERE user_id = ?').get(uid) as Character | undefined;
}

function getCharGuild(charId: number): { id: number; role: string; guild: any } | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT gm.id AS member_id, gm.role, g.*
       FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id
       WHERE gm.character_id = ?`,
    )
    .get(charId) as any;
  if (!row) return null;
  return { id: row.id, role: row.role, guild: row };
}

function isOfficerOrLeader(role: string): boolean {
  return role === 'leader' || role === 'officer';
}

/* ===== Browse + my guild ===== */

router.get('/list', (req, res) => {
  const db = getDb();
  const guilds = db
    .prepare(
      `SELECT g.*, COUNT(gm.id) AS member_count
       FROM guilds g LEFT JOIN guild_members gm ON gm.guild_id = g.id
       GROUP BY g.id
       ORDER BY g.level DESC, member_count DESC LIMIT 100`,
    )
    .all();
  res.json({ guilds });
});

router.get('/me', (req, res) => {
  const char = getCharacter(req.auth!.uid);
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const db = getDb();
  const g = getCharGuild(char.id);
  if (!g) {
    const invites = db
      .prepare(
        `SELECT gi.id, g.id AS guild_id, g.name, g.tag, g.level, g.motto, c.name AS invited_by_name, gi.created_at
         FROM guild_invitations gi
         JOIN guilds g ON g.id = gi.guild_id
         JOIN characters c ON c.id = gi.invited_by
         WHERE gi.character_id = ?
         ORDER BY gi.created_at DESC`,
      )
      .all(char.id);
    res.json({ guild: null, invites });
    return;
  }
  const members = db
    .prepare(
      `SELECT c.id, c.name, c.class, c.level, c.avatar, c.frame_slug, c.current_title,
              gm.role, gm.contribution, gm.joined_at
       FROM guild_members gm JOIN characters c ON c.id = gm.character_id
       WHERE gm.guild_id = ?
       ORDER BY (gm.role = 'leader') DESC, (gm.role = 'officer') DESC, c.level DESC`,
    )
    .all(g.guild.id);
  const wars = db
    .prepare(
      `SELECT w.*, ag.name AS attacker_name, ag.tag AS attacker_tag, dg.name AS defender_name, dg.tag AS defender_tag
       FROM guild_wars w
       JOIN guilds ag ON ag.id = w.attacker_guild_id
       JOIN guilds dg ON dg.id = w.defender_guild_id
       WHERE w.attacker_guild_id = ? OR w.defender_guild_id = ?
       ORDER BY w.started_at DESC LIMIT 10`,
    )
    .all(g.guild.id, g.guild.id);
  const dungeon = db.prepare('SELECT * FROM guild_dungeon_run WHERE guild_id = ?').get(g.guild.id) as any;
  const levels = loadGuildLevels(g.guild.id);
  const buffs = computeBuffs(levels);
  res.json({
    guild: {
      ...g.guild,
      member_count: members.length,
      bonus: buffs,
      track_levels: levels,
      next_level_xp: MEMBER_SLOT_TIER_XP[g.guild.level + 1] || null,
      next_level_gems: MEMBER_SLOT_TIER_GEMS[g.guild.level + 1] || 0,
      premium_threshold: 4,
    },
    members,
    my_role: g.role,
    wars,
    dungeon: dungeon ? { ...dungeon, contributions: JSON.parse(dungeon.contributions_json || '[]') } : null,
  });
});

/* ===== Create / leave / disband ===== */

const createSchema = z.object({
  name: z.string().min(3).max(30).regex(/^[a-zA-Z][a-zA-Z0-9 ']*$/),
  tag: z.string().min(2).max(5).regex(/^[A-Z0-9]+$/),
  motto: z.string().max(80).default(''),
  crest_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#d6a13d'),
});

router.post('/create', (req, res) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.flatten() });
    return;
  }
  const char = getCharacter(req.auth!.uid);
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  if (char.level < GUILD_CREATE_LEVEL_REQ) {
    res.status(400).json({ error: `Requires level ${GUILD_CREATE_LEVEL_REQ}` });
    return;
  }
  if (char.gold < GUILD_CREATE_COST) {
    res.status(400).json({ error: `Founding a guild costs ${GUILD_CREATE_COST} gold.` });
    return;
  }
  const db = getDb();
  if (getCharGuild(char.id)) {
    res.status(400).json({ error: 'You are already in a guild.' });
    return;
  }
  const now = Date.now();
  try {
    const info = db
      .prepare(
        `INSERT INTO guilds (name, tag, motto, description, level, xp, member_slots, gold, crest_color, leader_id, created_at)
         VALUES (?, ?, ?, '', 1, 0, ?, 0, ?, ?, ?)`,
      )
      .run(parse.data.name, parse.data.tag, parse.data.motto, MEMBER_SLOTS_BY_LEVEL[1], parse.data.crest_color, char.id, now);
    const guildId = info.lastInsertRowid as number;
    db.prepare(`INSERT INTO guild_members (guild_id, character_id, role, joined_at) VALUES (?, ?, 'leader', ?)`).run(
      guildId, char.id, now,
    );
    db.prepare('UPDATE characters SET gold = gold - ? WHERE id = ?').run(GUILD_CREATE_COST, char.id);
    res.json({ ok: true, guild_id: guildId });
  } catch (e: any) {
    if (String(e.message).includes('UNIQUE')) {
      res.status(409).json({ error: 'A guild with that name or tag already exists.' });
    } else {
      res.status(400).json({ error: e.message });
    }
  }
});

router.post('/leave', (req, res) => {
  const char = getCharacter(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const g = getCharGuild(char.id);
  if (!g) { res.status(400).json({ error: 'You are not in a guild' }); return; }
  if (g.role === 'leader') {
    // Promote highest-contributing officer/member or disband
    const successor = db
      .prepare(
        `SELECT character_id FROM guild_members WHERE guild_id = ? AND character_id != ?
         ORDER BY (role = 'officer') DESC, contribution DESC LIMIT 1`,
      )
      .get(g.guild.id, char.id) as { character_id: number } | undefined;
    if (successor) {
      db.prepare(`UPDATE guild_members SET role = 'leader' WHERE character_id = ?`).run(successor.character_id);
      db.prepare(`UPDATE guilds SET leader_id = ? WHERE id = ?`).run(successor.character_id, g.guild.id);
    } else {
      // Last man standing — disband the guild
      db.prepare('DELETE FROM guilds WHERE id = ?').run(g.guild.id);
    }
  }
  db.prepare('DELETE FROM guild_members WHERE character_id = ?').run(char.id);
  res.json({ ok: true });
});

/* ===== Invitations ===== */

const inviteSchema = z.object({ characterName: z.string() });

router.post('/invite', (req, res) => {
  const parse = inviteSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const char = getCharacter(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const g = getCharGuild(char.id);
  if (!g) { res.status(400).json({ error: 'You are not in a guild' }); return; }
  if (!isOfficerOrLeader(g.role)) { res.status(403).json({ error: 'Officers and the leader may invite.' }); return; }
  const target = db.prepare("SELECT id, is_npc FROM characters WHERE name = ?").get(parse.data.characterName) as { id: number; is_npc: number } | undefined;
  if (!target) { res.status(404).json({ error: 'No such hero.' }); return; }
  if (target.is_npc) { res.status(400).json({ error: 'You cannot invite a trainer.' }); return; }
  if (getCharGuild(target.id)) { res.status(400).json({ error: 'That hero is already in a guild.' }); return; }
  const members = (db.prepare('SELECT COUNT(*) AS c FROM guild_members WHERE guild_id = ?').get(g.guild.id) as { c: number }).c;
  if (members >= g.guild.member_slots) { res.status(400).json({ error: 'Guild is full.' }); return; }
  try {
    db.prepare(`INSERT INTO guild_invitations (guild_id, character_id, invited_by, created_at) VALUES (?, ?, ?, ?)`)
      .run(g.guild.id, target.id, char.id, Date.now());
    // Mail the invite
    db.prepare(`INSERT INTO mail (character_id, from_name, subject, body, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(target.id, char.name, `Guild invitation from <${g.guild.tag}> ${g.guild.name}`,
        `${char.name} has invited you to join <${g.guild.tag}> ${g.guild.name}. Visit the Guild page to accept.`,
        Date.now());
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: 'Already invited.' });
  }
});

const inviteIdSchema = z.object({ inviteId: z.number().int() });
router.post('/invite/accept', (req, res) => {
  const parse = inviteIdSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const char = getCharacter(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  if (getCharGuild(char.id)) { res.status(400).json({ error: 'Already in a guild' }); return; }
  const inv = db.prepare('SELECT * FROM guild_invitations WHERE id = ? AND character_id = ?').get(parse.data.inviteId, char.id) as any;
  if (!inv) { res.status(404).json({ error: 'Invitation not found' }); return; }
  const g = db.prepare('SELECT * FROM guilds WHERE id = ?').get(inv.guild_id) as any;
  if (!g) { res.status(404).json({ error: 'Guild no longer exists' }); return; }
  const members = (db.prepare('SELECT COUNT(*) AS c FROM guild_members WHERE guild_id = ?').get(g.id) as { c: number }).c;
  if (members >= g.member_slots) { res.status(400).json({ error: 'Guild is full' }); return; }
  // New joiners start as recruits — they can deposit to the vault but
  // can't take. Officers (or the leader) promote them to full member.
  db.prepare(`INSERT INTO guild_members (guild_id, character_id, role, joined_at) VALUES (?, ?, 'recruit', ?)`).run(g.id, char.id, Date.now());
  db.prepare('DELETE FROM guild_invitations WHERE character_id = ?').run(char.id);
  res.json({ ok: true });
});

router.post('/invite/decline', (req, res) => {
  const parse = inviteIdSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const char = getCharacter(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  getDb().prepare('DELETE FROM guild_invitations WHERE id = ? AND character_id = ?').run(parse.data.inviteId, char.id);
  res.json({ ok: true });
});

/* ===== Roles ===== */

const memberOpSchema = z.object({ targetId: z.number().int() });

router.post('/promote', (req, res) => {
  const parse = memberOpSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const char = getCharacter(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const g = getCharGuild(char.id);
  if (!g || g.role !== 'leader') { res.status(403).json({ error: 'Only the leader may promote.' }); return; }
  const t = db.prepare('SELECT * FROM guild_members WHERE character_id = ? AND guild_id = ?').get(parse.data.targetId, g.guild.id) as any;
  if (!t) { res.status(404).json({ error: 'Not in your guild.' }); return; }
  if (t.role === 'leader') { res.status(400).json({ error: 'Already the leader.' }); return; }
  // recruit → member → officer → leader
  const newRole = t.role === 'recruit' ? 'member' : t.role === 'member' ? 'officer' : 'leader';
  db.prepare('UPDATE guild_members SET role = ? WHERE id = ?').run(newRole, t.id);
  if (newRole === 'leader') {
    db.prepare(`UPDATE guild_members SET role = 'officer' WHERE character_id = ?`).run(char.id);
    db.prepare('UPDATE guilds SET leader_id = ? WHERE id = ?').run(parse.data.targetId, g.guild.id);
  }
  res.json({ ok: true });
});

router.post('/demote', (req, res) => {
  const parse = memberOpSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const char = getCharacter(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const g = getCharGuild(char.id);
  if (!g || g.role !== 'leader') { res.status(403).json({ error: 'Only the leader may demote.' }); return; }
  const t = db.prepare('SELECT * FROM guild_members WHERE character_id = ? AND guild_id = ?').get(parse.data.targetId, g.guild.id) as any;
  if (!t || t.role !== 'officer') { res.status(400).json({ error: 'No such officer.' }); return; }
  db.prepare(`UPDATE guild_members SET role = 'member' WHERE id = ?`).run(t.id);
  res.json({ ok: true });
});

router.post('/kick', (req, res) => {
  const parse = memberOpSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const char = getCharacter(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const g = getCharGuild(char.id);
  if (!g || !isOfficerOrLeader(g.role)) { res.status(403).json({ error: 'Officers may kick.' }); return; }
  const t = db.prepare('SELECT * FROM guild_members WHERE character_id = ? AND guild_id = ?').get(parse.data.targetId, g.guild.id) as any;
  if (!t) { res.status(404).json({ error: 'Not in your guild' }); return; }
  if (t.role === 'leader') { res.status(400).json({ error: 'You cannot kick the leader.' }); return; }
  if (g.role === 'officer' && t.role === 'officer') { res.status(400).json({ error: 'Officers cannot kick other officers.' }); return; }
  db.prepare('DELETE FROM guild_members WHERE id = ?').run(t.id);
  res.json({ ok: true });
});

/* ===== Bank / upgrade ===== */

// Donations now take either gold or gems. Gem donations are weighted
// because gems are scarcer and (often) bought with real money — 1 gem
// counts as 10g toward the guild XP/treasury, mirroring how the upgrade
// gates treat them.
const GEM_TO_GOLD_RATIO = 10;
const donateSchema = z.object({
  amount: z.number().int().min(1),
  currency: z.enum(['gold', 'gems']).default('gold'),
});

router.post('/donate', (req, res) => {
  const parse = donateSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const char = getCharacter(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const g = getCharGuild(char.id);
  if (!g) { res.status(400).json({ error: 'You are not in a guild' }); return; }

  const { amount, currency } = parse.data;
  // Atomic debit so concurrent requests can't double-spend.
  const debit = currency === 'gold'
    ? db.prepare('UPDATE characters SET gold = gold - ? WHERE id = ? AND gold >= ?').run(amount, char.id, amount)
    : db.prepare('UPDATE characters SET gems = gems - ?, total_gems_spent = total_gems_spent + ? WHERE id = ? AND gems >= ?').run(amount, amount, char.id, amount);
  if (debit.changes !== 1) {
    res.status(400).json({ error: currency === 'gold' ? 'Not enough gold' : 'Not enough gems' });
    return;
  }

  const goldEquivalent = currency === 'gems' ? amount * GEM_TO_GOLD_RATIO : amount;
  db.prepare('UPDATE guilds SET gold = gold + ?, xp = xp + ? WHERE id = ?').run(goldEquivalent, goldEquivalent, g.guild.id);
  db.prepare('UPDATE guild_members SET contribution = contribution + ? WHERE character_id = ?').run(goldEquivalent, char.id);
  trackBattlePass(char.id, 'guild_donate', goldEquivalent);

  res.json({ ok: true, gold_equivalent: goldEquivalent, currency, amount });
});

/* ──────────────────────────────────────────────────────────────────────
 * Multi-track upgrades — Bloodlines / Power / Defence / Scholarship /
 * Merchant Charter / Strongroom. Each track 0..100, independent levels.
 *
 *   GET  /upgrade/status — current levels + next-level cost per track
 *   POST /upgrade/track  — { track } advance that track by 1 (costs XP)
 *
 * Member slots stay on the legacy 5-tier system because uncapped roster
 * sizes break raids and chat. The slots upgrade lives at /upgrade/slots.
 * ────────────────────────────────────────────────────────────────────── */

router.get('/upgrade/status', (req, res) => {
  const char = getCharacter(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const g = getCharGuild(char.id);
  if (!g) { res.status(400).json({ error: 'You are not in a guild' }); return; }
  const levels = loadGuildLevels(g.guild.id);
  const buffs = computeBuffs(levels);
  res.json({
    guild_xp: g.guild.xp,
    member_slots_level: levels.member_slots_level,
    member_slots_max: buffs.member_slots,
    member_slots_next_xp: MEMBER_SLOT_TIER_XP[levels.member_slots_level + 1] || null,
    member_slots_next_gems: MEMBER_SLOT_TIER_GEMS[levels.member_slots_level + 1] || 0,
    tracks: GUILD_TRACKS.map((t) => {
      const cur = levels[t.key as keyof typeof levels] as number;
      return {
        key: t.key,
        label: t.label,
        description: t.description,
        level: cur,
        max: t.max,
        next_cost: cur >= t.max ? null : trackUpgradeCost(cur),
      };
    }),
    buffs,
  });
});

router.post('/upgrade/track', (req, res) => {
  const trackKey = String(req.body?.track || '');
  const def = GUILD_TRACKS.find((t) => t.key === trackKey);
  if (!def) { res.status(400).json({ error: 'Unknown track' }); return; }
  const char = getCharacter(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const g = getCharGuild(char.id);
  if (!g) { res.status(400).json({ error: 'You are not in a guild' }); return; }
  if (g.role !== 'leader' && g.role !== 'officer') {
    res.status(403).json({ error: 'Only the leader or officers may invest in upgrades.' });
    return;
  }
  const levels = loadGuildLevels(g.guild.id);
  const current = levels[def.key as keyof typeof levels] as number;
  if (current >= def.max) { res.status(400).json({ error: `${def.label} is already maxed.` }); return; }
  const cost = trackUpgradeCost(current);
  if (g.guild.xp < cost) {
    res.status(400).json({ error: `Need ${cost.toLocaleString()} guild XP for the next ${def.label} level.` });
    return;
  }
  // Atomic — only succeed if XP is still present (concurrent upgrades guarded).
  const updated = db
    .prepare(`UPDATE guilds SET ${def.column} = ${def.column} + 1, xp = xp - ? WHERE id = ? AND xp >= ?`)
    .run(cost, g.guild.id, cost);
  if (updated.changes !== 1) {
    res.status(400).json({ error: 'Guild XP shifted — retry.' });
    return;
  }
  res.json({
    ok: true,
    track: def.key,
    new_level: current + 1,
    cost_paid: cost,
    next_cost: current + 1 >= def.max ? null : trackUpgradeCost(current + 1),
  });
});

router.post('/upgrade/slots', (req, res) => {
  // Legacy 1..5 member-slots upgrade — kept on its own track since
  // uncapped guild membership breaks balance.
  const char = getCharacter(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const g = getCharGuild(char.id);
  if (!g) { res.status(400).json({ error: 'You are not in a guild' }); return; }
  if (g.role !== 'leader') { res.status(403).json({ error: 'Only the leader may expand the roster.' }); return; }
  const next = g.guild.level + 1;
  const needXp = MEMBER_SLOT_TIER_XP[next];
  const needGems = MEMBER_SLOT_TIER_GEMS[next] || 0;
  if (!needXp) { res.status(400).json({ error: 'Maximum roster size reached.' }); return; }
  if (g.guild.xp < needXp) {
    res.status(400).json({ error: `Need ${needXp.toLocaleString()} guild XP for the next tier.` });
    return;
  }
  if (needGems > 0) {
    const currentGems = ((char as any).gems || 0);
    if (currentGems < needGems) {
      res.status(402).json({
        error: `Roster tier ${next} requires ${needGems} gems. You have ${currentGems}.`,
        needGems,
        haveGems: currentGems,
        purchase_required: true,
      });
      return;
    }
  }
  const slots = MEMBER_SLOTS_BY_LEVEL[next];
  db.prepare(`UPDATE guilds SET level = ?, xp = xp - ?, member_slots = ? WHERE id = ?`).run(next, needXp, slots, g.guild.id);
  if (needGems > 0) {
    db.prepare(`UPDATE characters SET gems = gems - ?, total_gems_spent = total_gems_spent + ? WHERE id = ?`).run(needGems, needGems, char.id);
  }
  res.json({ ok: true, level: next, member_slots: slots, gems_spent: needGems });
});

/* Back-compat: old single /upgrade endpoint becomes an alias for /upgrade/slots. */
router.post('/upgrade', (req, res, next) => { (req.url as any) = '/upgrade/slots'; next(); });

/* ===== Chat ===== */

const chatSchema = z.object({ message: z.string().min(1).max(280) });

router.get('/chat', (req, res) => {
  const char = getCharacter(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const g = getCharGuild(char.id);
  if (!g) { res.json({ messages: [] }); return; }
  const after = Number(req.query.after) || 0;
  const messages = getDb()
    .prepare(
      `SELECT gc.id, gc.message, gc.created_at, c.id AS character_id, c.name, c.class, c.avatar, c.frame_slug, c.level
       FROM guild_chat gc JOIN characters c ON c.id = gc.character_id
       WHERE gc.guild_id = ? AND gc.id > ?
       ORDER BY gc.id ASC LIMIT 200`,
    )
    .all(g.guild.id, after);
  res.json({ messages });
});

router.post('/chat', (req, res) => {
  const parse = chatSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const char = getCharacter(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const g = getCharGuild(char.id);
  if (!g) { res.status(400).json({ error: 'You are not in a guild' }); return; }
  const info = getDb().prepare(`INSERT INTO guild_chat (guild_id, character_id, message, created_at) VALUES (?, ?, ?, ?)`)
    .run(g.guild.id, char.id, parse.data.message, Date.now());
  res.json({ ok: true, id: info.lastInsertRowid });
});

/* ===== Wars ===== */

const warDeclareSchema = z.object({ defenderGuildId: z.number().int() });

router.post('/wars/declare', (req, res) => {
  const parse = warDeclareSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const char = getCharacter(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const g = getCharGuild(char.id);
  if (!g) { res.status(400).json({ error: 'You are not in a guild' }); return; }
  if (!isOfficerOrLeader(g.role)) { res.status(403).json({ error: 'Officers may declare war.' }); return; }
  if (g.guild.id === parse.data.defenderGuildId) { res.status(400).json({ error: 'You cannot war yourself.' }); return; }
  const defender = db.prepare('SELECT id FROM guilds WHERE id = ?').get(parse.data.defenderGuildId);
  if (!defender) { res.status(404).json({ error: 'Defender guild not found' }); return; }
  const active = db.prepare(`SELECT id FROM guild_wars WHERE status = 'active' AND (attacker_guild_id = ? OR defender_guild_id = ?)`).get(g.guild.id, g.guild.id);
  if (active) { res.status(400).json({ error: 'You are already at war.' }); return; }
  const cost = 500;
  if (g.guild.gold < cost) { res.status(400).json({ error: `War costs ${cost} guild gold.` }); return; }
  const now = Date.now();
  const ends = now + 24 * 60 * 60 * 1000;
  const info = db
    .prepare(`INSERT INTO guild_wars (attacker_guild_id, defender_guild_id, status, started_at, ends_at) VALUES (?, ?, 'active', ?, ?)`)
    .run(g.guild.id, parse.data.defenderGuildId, now, ends);
  db.prepare('UPDATE guilds SET gold = gold - ? WHERE id = ?').run(cost, g.guild.id);
  res.json({ ok: true, war_id: info.lastInsertRowid });
});

router.get('/wars/active', (_req, res) => {
  const wars = getDb()
    .prepare(
      `SELECT w.*, ag.name AS attacker_name, ag.tag AS attacker_tag, ag.crest_color AS attacker_color,
              dg.name AS defender_name, dg.tag AS defender_tag, dg.crest_color AS defender_color
       FROM guild_wars w JOIN guilds ag ON ag.id = w.attacker_guild_id JOIN guilds dg ON dg.id = w.defender_guild_id
       WHERE w.status = 'active' ORDER BY w.started_at DESC`,
    )
    .all();
  res.json({ wars });
});

const warFightSchema = z.object({ warId: z.number().int() });

router.post('/wars/fight', (req, res) => {
  const parse = warFightSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const char = getCharacter(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  if (char.energy < 5) { res.status(400).json({ error: '5 energy required for a war strike' }); return; }
  const db = getDb();
  const g = getCharGuild(char.id);
  if (!g) { res.status(400).json({ error: 'You are not in a guild' }); return; }
  const war = db.prepare(`SELECT * FROM guild_wars WHERE id = ? AND status = 'active'`).get(parse.data.warId) as any;
  if (!war) { res.status(404).json({ error: 'War not found' }); return; }
  if (war.ends_at < Date.now()) {
    // Resolve war
    const winner = war.attacker_score > war.defender_score
      ? war.attacker_guild_id
      : war.defender_score > war.attacker_score ? war.defender_guild_id : null;
    db.prepare(`UPDATE guild_wars SET status = 'ended', winner_guild_id = ? WHERE id = ?`).run(winner, war.id);
    res.status(400).json({ error: 'War has ended.' });
    return;
  }
  const attackerSide = war.attacker_guild_id === g.guild.id ? 'attacker' : war.defender_guild_id === g.guild.id ? 'defender' : null;
  if (!attackerSide) { res.status(400).json({ error: 'Your guild is not in this war.' }); return; }
  const enemyGuildId = attackerSide === 'attacker' ? war.defender_guild_id : war.attacker_guild_id;
  // Find a random enemy combatant of similar level
  const enemy = db
    .prepare(
      `SELECT c.* FROM guild_members gm JOIN characters c ON c.id = gm.character_id
       WHERE gm.guild_id = ? AND c.level BETWEEN ? AND ?
       ORDER BY RANDOM() LIMIT 1`,
    )
    .get(enemyGuildId, Math.max(1, char.level - 4), char.level + 4) as Character | undefined;
  if (!enemy) {
    res.status(404).json({ error: 'No matchable enemy in the opposing guild.' });
    return;
  }

  // Build actors
  function loadActor(c: Character) {
    const equipped = db
      .prepare(
        `SELECT inv.id as inv_id, inv.quantity, inv.equipped, inv.slot, items.* FROM inventory inv
         JOIN items ON inv.item_id = items.id WHERE inv.character_id = ? AND inv.equipped = 1`,
      )
      .all(c.id) as any[];
    const eqList = equipped.map((row) => ({
      item: row as Item,
      entry: { id: row.inv_id, character_id: c.id, item_id: row.id, quantity: row.quantity, equipped: row.equipped, slot: row.slot } as InventoryEntry,
    }));
    const derived = deriveStats(c, eqList);
    return { actor: buildHeroActor(c, derived, derived.hp_max), derived };
  }
  const hero = loadActor(char).actor;
  hero.hp = char.hp;
  const foeActor = loadActor(enemy).actor;
  foeActor.side = 'foe';
  foeActor.sprite = enemy.class;

  const result = simulateCombat(hero, foeActor);

  // Apply outcomes
  const isWin = result.winner === 'hero';
  const scoreCol = attackerSide === 'attacker' ? 'attacker_score' : 'defender_score';
  const enemyScoreCol = attackerSide === 'attacker' ? 'defender_score' : 'attacker_score';
  if (isWin) db.prepare(`UPDATE guild_wars SET ${scoreCol} = ${scoreCol} + 10 WHERE id = ?`).run(war.id);
  else db.prepare(`UPDATE guild_wars SET ${enemyScoreCol} = ${enemyScoreCol} + 4 WHERE id = ?`).run(war.id);

  db.prepare('INSERT INTO guild_war_battles (war_id, attacker_char_id, defender_char_id, winner_side, rounds_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(war.id, char.id, enemy.id, isWin ? attackerSide : (attackerSide === 'attacker' ? 'defender' : 'attacker'),
      JSON.stringify({ hero, foe: foeActor, rounds: result.rounds, victory: isWin }), Date.now());

  // Update player
  char.hp = Math.max(1, result.hero.hp);
  char.energy -= 5;
  if (isWin) {
    char.gold += 30 + enemy.level * 3;
  }
  db.prepare('UPDATE characters SET hp = ?, energy = ?, gold = ? WHERE id = ?').run(char.hp, char.energy, char.gold, char.id);
  db.prepare('UPDATE guild_members SET contribution = contribution + ? WHERE character_id = ?')
    .run(isWin ? 50 : 15, char.id);

  res.json({
    success: isWin,
    hero: result.hero,
    foe: result.foe,
    rounds: result.rounds,
    enemy_name: enemy.name,
    enemy_level: enemy.level,
  });
});

/* ===== Guild dungeon (cooperative boss) ===== */

const DUNGEON_BOSSES = [
  { slug: 'sentinel_of_dawn',  name: 'Sentinel of Dawn',  level: 12, hp_per_member: 1500, atk_min: 25, atk_max: 45 },
  { slug: 'maw_of_voidshade',  name: 'Maw of Voidshade',  level: 18, hp_per_member: 3500, atk_min: 45, atk_max: 75 },
  { slug: 'colossus_unbound',  name: 'Colossus Unbound',  level: 24, hp_per_member: 7500, atk_min: 70, atk_max: 110 },
];

router.get('/dungeon/bosses', (_req, res) => {
  res.json({ bosses: DUNGEON_BOSSES });
});

const dungeonEnterSchema = z.object({ slug: z.string() });

router.post('/dungeon/enter', (req, res) => {
  const parse = dungeonEnterSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const char = getCharacter(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const g = getCharGuild(char.id);
  if (!g) { res.status(400).json({ error: 'You are not in a guild' }); return; }
  if (!isOfficerOrLeader(g.role)) { res.status(403).json({ error: 'Officers may start a guild dungeon.' }); return; }
  const boss = DUNGEON_BOSSES.find((b) => b.slug === parse.data.slug);
  if (!boss) { res.status(404).json({ error: 'Unknown boss' }); return; }
  const existing = db.prepare('SELECT id FROM guild_dungeon_run WHERE guild_id = ?').get(g.guild.id);
  if (existing) { res.status(400).json({ error: 'A guild raid is already in progress.' }); return; }
  const members = (db.prepare('SELECT COUNT(*) AS c FROM guild_members WHERE guild_id = ?').get(g.guild.id) as { c: number }).c;
  const hp = boss.hp_per_member * Math.max(3, members);
  const now = Date.now();
  db.prepare(`INSERT INTO guild_dungeon_run (guild_id, slug, boss_hp, boss_hp_max, contributions_json, started_at, ends_at) VALUES (?, ?, ?, ?, '[]', ?, ?)`)
    .run(g.guild.id, boss.slug, hp, hp, now, now + 48 * 60 * 60 * 1000);
  res.json({ ok: true, boss: boss.slug, hp });
});

router.post('/dungeon/attack', (req, res) => {
  const char = getCharacter(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  if (char.energy < 8) { res.status(400).json({ error: '8 energy required to strike the raid boss' }); return; }
  const db = getDb();
  const g = getCharGuild(char.id);
  if (!g) { res.status(400).json({ error: 'You are not in a guild' }); return; }
  const run = db.prepare('SELECT * FROM guild_dungeon_run WHERE guild_id = ?').get(g.guild.id) as any;
  if (!run) { res.status(404).json({ error: 'No active raid' }); return; }
  if (run.boss_hp <= 0) { res.status(400).json({ error: 'Boss already slain. Claim rewards.' }); return; }
  if (run.ends_at < Date.now()) { res.status(400).json({ error: 'Raid timed out.' }); return; }
  const boss = DUNGEON_BOSSES.find((b) => b.slug === run.slug);
  if (!boss) { res.status(500).json({ error: 'Boss missing' }); return; }

  // Compute hero damage by averaging combat 1v1 result against a scaled boss segment
  const equipped = db
    .prepare(
      `SELECT inv.id as inv_id, inv.quantity, inv.equipped, inv.slot, items.* FROM inventory inv
       JOIN items ON inv.item_id = items.id WHERE inv.character_id = ? AND inv.equipped = 1`,
    )
    .all(char.id) as any[];
  const eqList = equipped.map((row) => ({
    item: row as Item,
    entry: { id: row.inv_id, character_id: char.id, item_id: row.id, quantity: row.quantity, equipped: row.equipped, slot: row.slot } as InventoryEntry,
  }));
  const derived = deriveStats(char, eqList);
  const hero = buildHeroActor(char, derived, char.hp);

  const segHp = Math.min(run.boss_hp, Math.floor(derived.hp_max * 1.5));
  const segFoe = {
    name: boss.name, side: 'foe' as const, level: boss.level, hp: segHp, hp_max: segHp,
    atk_min: boss.atk_min, atk_max: boss.atk_max, defense: 8, speed: 6, crit_chance: 0.1, dodge_chance: 0.02, sprite: 'titan',
  };
  const result = simulateCombat(hero, segFoe);
  const damageDealt = segFoe.hp_max - result.foe.hp;

  const newBossHp = Math.max(0, run.boss_hp - damageDealt);
  const contributions: Record<string, number> = JSON.parse(run.contributions_json || '[]') as any;
  const map: Record<string, number> = Array.isArray(contributions) ? {} : (contributions as any);
  map[String(char.id)] = (map[String(char.id)] || 0) + damageDealt;
  db.prepare('UPDATE guild_dungeon_run SET boss_hp = ?, contributions_json = ? WHERE guild_id = ?')
    .run(newBossHp, JSON.stringify(map), g.guild.id);

  char.hp = Math.max(1, result.hero.hp);
  char.energy -= 8;
  db.prepare('UPDATE characters SET hp = ?, energy = ? WHERE id = ?').run(char.hp, char.energy, char.id);
  db.prepare('UPDATE guild_members SET contribution = contribution + ? WHERE character_id = ?').run(Math.floor(damageDealt / 10), char.id);

  let cleared = false;
  if (newBossHp <= 0 && !run.cleared_at) {
    db.prepare('UPDATE guild_dungeon_run SET cleared_at = ? WHERE guild_id = ?').run(Date.now(), g.guild.id);
    cleared = true;
    // Reward all members
    const members = db.prepare('SELECT character_id FROM guild_members WHERE guild_id = ?').all(g.guild.id) as { character_id: number }[];
    const xpReward = 200 + boss.level * 40;
    const goldReward = 100 + boss.level * 20;
    for (const m of members) {
      db.prepare('UPDATE characters SET xp = xp + ?, gold = gold + ?, total_xp_earned = total_xp_earned + ?, total_gold_earned = total_gold_earned + ? WHERE id = ?')
        .run(xpReward, goldReward, xpReward, goldReward, m.character_id);
    }
    db.prepare('UPDATE guilds SET xp = xp + ?, gold = gold + ? WHERE id = ?').run(2000, 500, g.guild.id);
  }

  res.json({
    success: result.winner === 'hero',
    damageDealt,
    bossHp: newBossHp,
    bossHpMax: run.boss_hp_max,
    cleared,
    hero: result.hero,
    foe: result.foe,
    rounds: result.rounds,
  });
});

router.post('/dungeon/end', (req, res) => {
  const char = getCharacter(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const g = getCharGuild(char.id);
  if (!g || !isOfficerOrLeader(g.role)) { res.status(403).json({ error: 'Officers may end a raid.' }); return; }
  db.prepare('DELETE FROM guild_dungeon_run WHERE guild_id = ?').run(g.guild.id);
  res.json({ ok: true });
});

/* ─────────────────────────────────────────────────────────────────────
 * Guild Vault — shared item bank.
 *
 *   Deposit: anyone in the guild may donate one of their bag items.
 *   Take:    everyone EXCEPT recruits (the lowest rank). The cooldown of
 *            new joiners as recruits means item donations can't be drained
 *            by alts the second they're invited.
 *   Vaulted items keep their enchants — the vault row references the same
 *   inventory_id; we just flip character_id back when someone takes it.
 * ───────────────────────────────────────────────────────────────────── */
router.get('/vault', (req, res) => {
  const char = getCharacter(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const g = getCharGuild(char.id);
  if (!g) { res.status(400).json({ error: 'You are not in a guild' }); return; }
  const rows = getDb()
    .prepare(
      `SELECT v.id AS vault_id, v.deposited_at, v.deposited_by,
              items.*, c.name AS depositor_name,
              COALESCE(e.enchant_count, 0) AS enchant_count,
              COALESCE(e.bonuses_json, '{}') AS enchant_bonuses_json
       FROM guild_vault v
       JOIN inventory inv ON inv.id = v.inventory_id
       JOIN items ON items.id = inv.item_id
       JOIN characters c ON c.id = v.deposited_by
       LEFT JOIN inventory_enchants e ON e.inventory_id = v.inventory_id
       WHERE v.guild_id = ?
       ORDER BY v.deposited_at DESC`,
    )
    .all(g.guild.id);
  res.json({ vault: rows, can_take: g.role !== 'recruit', my_role: g.role });
});

router.post('/vault/deposit', (req, res) => {
  const invId = Number(req.body?.inventoryId);
  if (!invId) { res.status(400).json({ error: 'inventoryId required' }); return; }
  const char = getCharacter(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const g = getCharGuild(char.id);
  if (!g) { res.status(400).json({ error: 'You are not in a guild' }); return; }
  const inv = db
    .prepare(
      `SELECT inv.id, inv.character_id, inv.equipped, inv.soul_bound, inv.listed,
              items.category, items.name
       FROM inventory inv JOIN items ON items.id = inv.item_id
       WHERE inv.id = ? AND inv.character_id = ?`,
    )
    .get(invId, char.id) as any;
  if (!inv) { res.status(404).json({ error: 'Item not in your bag' }); return; }
  if (inv.equipped) { res.status(400).json({ error: 'Unequip it first' }); return; }
  if (inv.listed) { res.status(400).json({ error: 'It is listed on the market' }); return; }
  if (inv.soul_bound) { res.status(400).json({ error: 'Soul-bound items cannot be donated' }); return; }
  if (inv.category === 'potion') { res.status(400).json({ error: 'Consumables cannot be donated' }); return; }

  const tx = db.transaction(() => {
    // Mark the row as vaulted — character_id stays so the FK is satisfied,
    // but the inventory query filters out vaulted_guild_id > 0 so the
    // depositor no longer sees it in their bag.
    db.prepare(`UPDATE inventory SET vaulted_guild_id = ? WHERE id = ?`).run(g.guild.id, inv.id);
    db.prepare(
      `INSERT INTO guild_vault (guild_id, inventory_id, deposited_by, deposited_at) VALUES (?, ?, ?, ?)`,
    ).run(g.guild.id, inv.id, char.id, Date.now());
  });
  tx();
  res.json({ ok: true, item_name: inv.name });
});

router.post('/vault/take', (req, res) => {
  const vaultId = Number(req.body?.vaultId);
  if (!vaultId) { res.status(400).json({ error: 'vaultId required' }); return; }
  const char = getCharacter(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const g = getCharGuild(char.id);
  if (!g) { res.status(400).json({ error: 'You are not in a guild' }); return; }
  if (g.role === 'recruit') {
    res.status(403).json({ error: 'Recruits can only deposit. Ask an officer for a promotion to take from the vault.' });
    return;
  }
  const row = db
    .prepare(
      `SELECT v.id, v.inventory_id, v.guild_id, items.name AS item_name
       FROM guild_vault v
       JOIN inventory inv ON inv.id = v.inventory_id
       JOIN items ON items.id = inv.item_id
       WHERE v.id = ?`,
    )
    .get(vaultId) as any;
  if (!row) { res.status(404).json({ error: 'Vault entry not found' }); return; }
  if (row.guild_id !== g.guild.id) { res.status(403).json({ error: 'Not your guild\'s vault.' }); return; }

  const tx = db.transaction(() => {
    // Transfer ownership to the taker and clear the vault flag.
    db.prepare('UPDATE inventory SET character_id = ?, vaulted_guild_id = 0, equipped = 0, slot = \'\' WHERE id = ?')
      .run(char.id, row.inventory_id);
    db.prepare('DELETE FROM guild_vault WHERE id = ?').run(row.id);
  });
  tx();
  res.json({ ok: true, item_name: row.item_name });
});

export default router;
