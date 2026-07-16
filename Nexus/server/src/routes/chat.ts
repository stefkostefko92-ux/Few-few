import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { checkText } from '../lib/textFilter';
import { logFromRequest } from '../lib/logger';
import { blockedIdSet } from './social';
import { notify } from '../lib/notify';
import { pushToAll, pushToChar } from '../lib/stream';

/**
 * Публичен чат (глобален + регионални канали) и лични съобщения (DM) между
 * приятели. Върху SSE слоя — push веднага, polling остава fallback.
 * Модерация: checkText (DSA чл. 28) + блок-филтър + анти-флуд throttle.
 */
const router = Router();
router.use(authRequired);

// Разрешени публични канали: глобален + slug-овете на регионите за лов.
const REGION_CHANNELS = ['whispering_woods', 'mistmoor_hills', 'crystal_caverns', 'ashen_wastes', 'shadowfell'];
const CHANNELS = new Set(['global', ...REGION_CHANNELS]);

const CHAT_MIN_INTERVAL_MS = 1500; // анти-флуд: 1 съобщение / 1.5s
const lastChatAt = new Map<number, number>();

function getChar(uid: number): { id: number; name: string } | undefined {
  return getDb().prepare('SELECT id, name FROM characters WHERE user_id = ?').get(uid) as
    | { id: number; name: string } | undefined;
}

function throttled(charId: number): boolean {
  const now = Date.now();
  const prev = lastChatAt.get(charId) || 0;
  if (now - prev < CHAT_MIN_INTERVAL_MS) return true;
  lastChatAt.set(charId, now);
  return false;
}

const msgSchema = z.object({ message: z.string().trim().min(1).max(280) });
const globalPostSchema = msgSchema.extend({ channel: z.string().max(40).default('global') });

/* ===== Публичен чат (глобален/регионален) ===== */

const CHAT_COLS = 'gc.id, gc.message, gc.created_at, c.id AS character_id, c.name, c.class, c.avatar, c.frame_slug, c.level';

router.get('/global', (req, res) => {
  const me = getChar(req.auth!.uid);
  if (!me) { res.status(404).json({ error: 'No character' }); return; }
  const channel = String(req.query.channel || 'global');
  if (!CHANNELS.has(channel)) { res.status(400).json({ error: 'Unknown channel' }); return; }
  const after = Number(req.query.after) || 0;
  const rows = getDb().prepare(
    `SELECT ${CHAT_COLS} FROM global_chat gc JOIN characters c ON c.id = gc.character_id
      WHERE gc.channel = ? AND gc.id > ? ORDER BY gc.id ASC LIMIT 200`,
  ).all(channel, after) as Array<{ character_id: number }>;
  const blocked = blockedIdSet(me.id);
  const visible = blocked.size ? rows.filter((m) => !blocked.has(m.character_id)) : rows;
  res.json({ messages: visible });
});

router.post('/global', (req, res) => {
  const parse = globalPostSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const { channel, message } = parse.data;
  if (!CHANNELS.has(channel)) { res.status(400).json({ error: 'Unknown channel' }); return; }
  const me = getChar(req.auth!.uid);
  if (!me) { res.status(404).json({ error: 'No character' }); return; }
  if (throttled(me.id)) { res.status(429).json({ error: 'You are sending messages too fast. Slow down.' }); return; }
  const check = checkText(message, 'text');
  if (!check.ok) {
    logFromRequest(req, { category: 'moderation', action: 'chat_blocked', level: 'warn', message: `blocked ${channel} chat (${check.category})` });
    res.status(400).json({ error: 'Your message contains content that isn’t allowed.' });
    return;
  }
  const info = getDb().prepare('INSERT INTO global_chat (channel, character_id, message, created_at) VALUES (?, ?, ?, ?)')
    .run(channel, me.id, message, Date.now());
  // Live push към всички свързани — клиентът дърпа новите за този канал.
  pushToAll('chat_global', { channel });
  res.json({ ok: true, id: info.lastInsertRowid });
});

/* ===== Лични съобщения (DM) между приятели ===== */

function threadKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function areFriends(a: number, b: number): boolean {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return !!getDb().prepare('SELECT 1 FROM friends WHERE a_id = ? AND b_id = ?').get(lo, hi);
}

/** Списък разговори с непрочетени броячи. */
router.get('/dm', (req, res) => {
  const me = getChar(req.auth!.uid);
  if (!me) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  // Приятели + последно съобщение + непрочетени от тях.
  const friends = db.prepare(`
    SELECT c.id, c.name, c.class, c.avatar, c.frame_slug, c.level
      FROM friends f JOIN characters c ON c.id = CASE WHEN f.a_id = ? THEN f.b_id ELSE f.a_id END
     WHERE f.a_id = ? OR f.b_id = ? ORDER BY c.name`).all(me.id, me.id, me.id) as Array<{ id: number }>;
  const threads = friends.map((fr) => {
    const unread = (db.prepare('SELECT COUNT(*) AS n FROM direct_messages WHERE to_id = ? AND from_id = ? AND read_at = 0')
      .get(me.id, fr.id) as { n: number }).n;
    const last = db.prepare('SELECT message, created_at FROM direct_messages WHERE thread_key = ? ORDER BY id DESC LIMIT 1')
      .get(threadKey(me.id, fr.id)) as { message: string; created_at: number } | undefined;
    return { ...fr, unread, last: last || null };
  });
  const totalUnread = threads.reduce((s, t) => s + t.unread, 0);
  res.json({ threads, totalUnread });
});

/** Разговор с конкретен приятел + маркирай входящите като прочетени. */
router.get('/dm/:charId', (req, res) => {
  const me = getChar(req.auth!.uid);
  if (!me) { res.status(404).json({ error: 'No character' }); return; }
  const other = Number(req.params.charId);
  if (!Number.isInteger(other) || other <= 0) { res.status(400).json({ error: 'Invalid' }); return; }
  if (!areFriends(me.id, other)) { res.status(403).json({ error: 'You can only message friends.' }); return; }
  const db = getDb();
  const after = Number(req.query.after) || 0;
  const messages = db.prepare(
    `SELECT id, from_id, to_id, message, created_at FROM direct_messages
      WHERE thread_key = ? AND id > ? ORDER BY id ASC LIMIT 200`,
  ).all(threadKey(me.id, other), after);
  // Маркирай входящите като прочетени.
  db.prepare('UPDATE direct_messages SET read_at = ? WHERE to_id = ? AND from_id = ? AND read_at = 0')
    .run(Date.now(), me.id, other);
  res.json({ messages });
});

router.post('/dm/:charId', (req, res) => {
  const parse = msgSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const me = getChar(req.auth!.uid);
  if (!me) { res.status(404).json({ error: 'No character' }); return; }
  const other = Number(req.params.charId);
  if (!Number.isInteger(other) || other <= 0) { res.status(400).json({ error: 'Invalid' }); return; }
  if (!areFriends(me.id, other)) { res.status(403).json({ error: 'You can only message friends.' }); return; }
  if (throttled(me.id)) { res.status(429).json({ error: 'You are sending messages too fast. Slow down.' }); return; }
  const check = checkText(parse.data.message, 'text');
  if (!check.ok) {
    logFromRequest(req, { category: 'moderation', action: 'dm_blocked', level: 'warn', message: `blocked DM (${check.category})` });
    res.status(400).json({ error: 'Your message contains content that isn’t allowed.' });
    return;
  }
  const now = Date.now();
  const info = getDb().prepare(
    'INSERT INTO direct_messages (thread_key, from_id, to_id, message, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(threadKey(me.id, other), me.id, other, parse.data.message, now);
  // Live push към получателя + in-app нотификация (feed + камбанка).
  pushToChar(other, 'dm', { from: me.id });
  notify(getDb(), other, 'system', `New message from ${me.name}.`, `dm:${me.id}`);
  res.json({ ok: true, id: info.lastInsertRowid });
});

export default router;
