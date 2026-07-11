import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { AVATARS, FRAMES, findAvatar, findFrame } from '../seed/cosmetics';
import { logFromRequest } from '../lib/logger';
import { checkText } from '../lib/textFilter';
import type { Character } from '../types/domain';

const router = Router();
router.use(authRequired);

const RENAME_COST = 250;
const RENAME_COOLDOWN_MS = 24 * 60 * 60 * 1000;

router.get('/me', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  let unlocks: string[] = [];
  try { unlocks = JSON.parse((char as any).cosmetic_unlocks || '[]'); } catch { /* ignore */ }
  const owned = new Set<string>([...unlocks, 'default']);
  const earnedAch = (db.prepare('SELECT slug FROM achievements WHERE character_id = ?').all(char.id) as { slug: string }[])
    .map((r) => r.slug);
  const earnedSet = new Set(earnedAch);

  const avail_avatars = AVATARS.map((a) => ({
    ...a,
    unlocked: a.unlocked_by === 'default' || owned.has(a.slug) || (a.unlocked_by && earnedSet.has(a.unlocked_by)),
  }));
  const avail_frames = FRAMES.map((f) => ({
    ...f,
    unlocked: f.unlocked_by === 'default' || owned.has(f.slug) || (f.unlocked_by && earnedSet.has(f.unlocked_by)),
  }));

  res.json({
    avatar: (char as any).avatar || `${char.class}_01`,
    frame_slug: (char as any).frame_slug || 'plain',
    bio: (char as any).bio || '',
    current_title: (char as any).current_title || '',
    last_rename_at: (char as any).last_rename_at || 0,
    rename_cost: RENAME_COST,
    rename_cooldown_ms: RENAME_COOLDOWN_MS,
    available_avatars: avail_avatars,
    available_frames: avail_frames,
  });
});

const renameSchema = z.object({
  name: z.string().min(3).max(20).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
});

router.post('/rename', (req, res) => {
  const parse = renameSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Invalid name' });
    return;
  }
  const nameCheck = checkText(parse.data.name, 'name');
  if (!nameCheck.ok) {
    logFromRequest(req, { category: 'moderation', action: 'name_blocked', level: 'warn', message: `blocked rename (${nameCheck.category})` });
    res.status(400).json({ error: 'That name isn’t allowed. Please choose another.' });
    return;
  }
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  if (char.gold < RENAME_COST) {
    res.status(400).json({ error: `Renaming costs ${RENAME_COST} gold.` });
    return;
  }
  const since = Date.now() - ((char as any).last_rename_at || 0);
  if (since < RENAME_COOLDOWN_MS) {
    const hoursLeft = Math.ceil((RENAME_COOLDOWN_MS - since) / 3_600_000);
    res.status(400).json({ error: `You can rename again in ${hoursLeft}h.` });
    return;
  }
  const exists = db.prepare('SELECT id FROM characters WHERE name = ? AND id != ?').get(parse.data.name, char.id);
  if (exists) {
    res.status(409).json({ error: 'That name is already taken.' });
    return;
  }
  db.prepare('UPDATE characters SET name = ?, gold = gold - ?, last_rename_at = ? WHERE id = ?').run(
    parse.data.name, RENAME_COST, Date.now(), char.id,
  );
  logFromRequest(req, {
    category: 'character', action: 'rename', character_id: char.id,
    message: `${char.name} renamed to ${parse.data.name}`,
    meta: { old_name: char.name, new_name: parse.data.name, gold_cost: RENAME_COST },
  });
  res.json({ ok: true, name: parse.data.name, gold: char.gold - RENAME_COST });
});

const cosmeticSchema = z.object({ avatar: z.string().optional(), frame: z.string().optional(), bio: z.string().max(500).optional() });

router.post('/cosmetics', (req, res) => {
  const parse = cosmeticSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.flatten() });
    return;
  }
  // Публично bio → филтрирай като свободен текст (вграждане).
  if (parse.data.bio !== undefined && parse.data.bio.trim() !== '') {
    const bioCheck = checkText(parse.data.bio, 'text');
    if (!bioCheck.ok) {
      logFromRequest(req, { category: 'moderation', action: 'bio_blocked', level: 'warn', message: `blocked bio (${bioCheck.category})` });
      res.status(400).json({ error: 'Your bio contains content that isn’t allowed.' });
      return;
    }
  }
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const earned = new Set(
    (db.prepare('SELECT slug FROM achievements WHERE character_id = ?').all(char.id) as { slug: string }[]).map((r) => r.slug),
  );
  let unlocks: string[] = [];
  try { unlocks = JSON.parse((char as any).cosmetic_unlocks || '[]'); } catch { /* ignore */ }
  const owned = new Set([...unlocks, 'default']);

  const updates: string[] = [];
  const params: any[] = [];
  if (parse.data.avatar) {
    const a = findAvatar(parse.data.avatar);
    if (!a) { res.status(404).json({ error: 'Unknown avatar' }); return; }
    if (!(a.unlocked_by === 'default' || owned.has(a.slug) || (a.unlocked_by && earned.has(a.unlocked_by)))) {
      res.status(403).json({ error: 'You have not unlocked that avatar.' });
      return;
    }
    updates.push('avatar = ?');
    params.push(a.slug);
  }
  if (parse.data.frame) {
    const f = findFrame(parse.data.frame);
    if (!f) { res.status(404).json({ error: 'Unknown frame' }); return; }
    if (!(f.unlocked_by === 'default' || owned.has(f.slug) || (f.unlocked_by && earned.has(f.unlocked_by)))) {
      res.status(403).json({ error: 'You have not unlocked that frame.' });
      return;
    }
    updates.push('frame_slug = ?');
    params.push(f.slug);
  }
  if (parse.data.bio !== undefined) {
    updates.push('bio = ?');
    params.push(parse.data.bio);
  }
  if (!updates.length) {
    res.status(400).json({ error: 'Nothing to update' });
    return;
  }
  params.push(char.id);
  db.prepare(`UPDATE characters SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

router.get('/character/:nameOrId', (req, res) => {
  const db = getDb();
  const idOrName = req.params.nameOrId;
  const asNum = Number(idOrName);
  const char = !Number.isNaN(asNum) && Number.isFinite(asNum)
    ? db.prepare('SELECT * FROM characters WHERE id = ?').get(asNum)
    : db.prepare('SELECT * FROM characters WHERE name = ?').get(idOrName);
  if (!char) {
    res.status(404).json({ error: 'Character not found' });
    return;
  }
  const c = char as any;
  // Public profile view
  const guildRow = db.prepare(`SELECT g.id, g.name, g.tag, g.crest_color, gm.role
                                FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id
                                WHERE gm.character_id = ?`).get(c.id);
  res.json({
    id: c.id,
    name: c.name,
    class: c.class,
    level: c.level,
    avatar: c.avatar || `${c.class}_01`,
    frame_slug: c.frame_slug || 'plain',
    bio: c.bio || '',
    current_title: c.current_title || '',
    arena_rating: c.arena_rating,
    wins: c.wins,
    losses: c.losses,
    monsters_slain: c.monsters_slain,
    dungeons_cleared: c.dungeons_cleared,
    battles_won: c.battles_won,
    battles_lost: c.battles_lost,
    is_npc: c.is_npc,
    created_at: c.created_at,
    guild: guildRow || null,
  });
});

export default router;
