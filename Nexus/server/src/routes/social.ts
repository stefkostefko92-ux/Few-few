import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { notify } from '../lib/notify';

const router = Router();
router.use(authRequired);

function getChar(uid: number): { id: number; name: string } | undefined {
  return getDb().prepare('SELECT id, name FROM characters WHERE user_id = ?').get(uid) as
    | { id: number; name: string } | undefined;
}

/** Блокиран ли е b от a, ИЛИ a от b (двупосочно — тогава няма взаимодействие). */
function eitherBlocks(a: number, b: number): boolean {
  return !!getDb().prepare(
    'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1',
  ).get(a, b, b, a);
}

const CHAR_COLS = 'c.id, c.name, c.class, c.level, c.avatar, c.frame_slug';

/** Приятели + входящи/изходящи покани + блокирани. */
router.get('/overview', (req, res) => {
  const me = getChar(req.auth!.uid);
  if (!me) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const friends = db.prepare(`
    SELECT ${CHAR_COLS} FROM friends f
      JOIN characters c ON c.id = CASE WHEN f.a_id = ? THEN f.b_id ELSE f.a_id END
     WHERE f.a_id = ? OR f.b_id = ? ORDER BY c.name`).all(me.id, me.id, me.id);
  const incoming = db.prepare(`
    SELECT ${CHAR_COLS}, fr.created_at FROM friend_requests fr
      JOIN characters c ON c.id = fr.from_id WHERE fr.to_id = ? ORDER BY fr.created_at DESC`).all(me.id);
  const outgoing = db.prepare(`
    SELECT ${CHAR_COLS} FROM friend_requests fr
      JOIN characters c ON c.id = fr.to_id WHERE fr.from_id = ? ORDER BY fr.created_at DESC`).all(me.id);
  const blocked = db.prepare(`
    SELECT ${CHAR_COLS} FROM blocks b JOIN characters c ON c.id = b.blocked_id
     WHERE b.blocker_id = ? ORDER BY c.name`).all(me.id);
  res.json({ friends, incoming, outgoing, blocked });
});

const byName = z.object({ name: z.string().min(1).max(30) });
const byId = z.object({ charId: z.number().int().positive() });

router.post('/friend/request', (req, res) => {
  const p = byName.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: 'Invalid' }); return; }
  const me = getChar(req.auth!.uid);
  if (!me) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const target = db.prepare('SELECT id, name, is_npc FROM characters WHERE name = ?').get(p.data.name) as
    | { id: number; name: string; is_npc: number } | undefined;
  if (!target || target.is_npc) { res.status(404).json({ error: 'Player not found' }); return; }
  if (target.id === me.id) { res.status(400).json({ error: 'That’s you.' }); return; }
  if (eitherBlocks(me.id, target.id)) { res.status(403).json({ error: 'Cannot send a request to this player.' }); return; }
  const [lo, hi] = me.id < target.id ? [me.id, target.id] : [target.id, me.id];
  if (db.prepare('SELECT 1 FROM friends WHERE a_id = ? AND b_id = ?').get(lo, hi)) { res.status(400).json({ error: 'Already friends.' }); return; }
  // Ако другият вече ти е пратил покана → приеми директно.
  if (db.prepare('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?').get(target.id, me.id)) {
    db.transaction(() => {
      db.prepare('DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?').run(target.id, me.id);
      db.prepare('INSERT OR IGNORE INTO friends (a_id, b_id, created_at) VALUES (?, ?, ?)').run(lo, hi, Date.now());
    })();
    notify(db, target.id, 'friend_accept', `${me.name} accepted your friend request.`, `char:${me.id}`);
    res.json({ ok: true, status: 'accepted' });
    return;
  }
  const info = db.prepare('INSERT OR IGNORE INTO friend_requests (from_id, to_id, created_at) VALUES (?, ?, ?)').run(me.id, target.id, Date.now());
  if (info.changes === 1) notify(db, target.id, 'friend_request', `${me.name} sent you a friend request.`, `char:${me.id}`);
  res.json({ ok: true, status: 'requested' });
});

router.post('/friend/accept', (req, res) => {
  const p = byId.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: 'Invalid' }); return; }
  const me = getChar(req.auth!.uid);
  if (!me) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const from = p.data.charId;
  const reqRow = db.prepare('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?').get(from, me.id);
  if (!reqRow) { res.status(404).json({ error: 'No such request' }); return; }
  const [lo, hi] = from < me.id ? [from, me.id] : [me.id, from];
  db.transaction(() => {
    db.prepare('DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?').run(from, me.id);
    db.prepare('INSERT OR IGNORE INTO friends (a_id, b_id, created_at) VALUES (?, ?, ?)').run(lo, hi, Date.now());
  })();
  notify(db, from, 'friend_accept', `${me.name} accepted your friend request.`, `char:${me.id}`);
  res.json({ ok: true });
});

router.post('/friend/decline', (req, res) => {
  const p = byId.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: 'Invalid' }); return; }
  const me = getChar(req.auth!.uid);
  if (!me) { res.status(404).json({ error: 'No character' }); return; }
  // Отхвърля входяща ИЛИ отменя изходяща покана към/от charId.
  getDb().prepare('DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)')
    .run(p.data.charId, me.id, me.id, p.data.charId);
  res.json({ ok: true });
});

router.post('/friend/remove', (req, res) => {
  const p = byId.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: 'Invalid' }); return; }
  const me = getChar(req.auth!.uid);
  if (!me) { res.status(404).json({ error: 'No character' }); return; }
  const [lo, hi] = p.data.charId < me.id ? [p.data.charId, me.id] : [me.id, p.data.charId];
  getDb().prepare('DELETE FROM friends WHERE a_id = ? AND b_id = ?').run(lo, hi);
  res.json({ ok: true });
});

router.post('/block', (req, res) => {
  const p = byName.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: 'Invalid' }); return; }
  const me = getChar(req.auth!.uid);
  if (!me) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const target = db.prepare('SELECT id, is_npc FROM characters WHERE name = ?').get(p.data.name) as { id: number; is_npc: number } | undefined;
  if (!target || target.is_npc) { res.status(404).json({ error: 'Player not found' }); return; }
  if (target.id === me.id) { res.status(400).json({ error: 'You cannot block yourself.' }); return; }
  const [lo, hi] = me.id < target.id ? [me.id, target.id] : [target.id, me.id];
  db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').run(me.id, target.id, Date.now());
    // Блокирането маха всяко приятелство/покана между двамата.
    db.prepare('DELETE FROM friends WHERE a_id = ? AND b_id = ?').run(lo, hi);
    db.prepare('DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)').run(me.id, target.id, target.id, me.id);
  })();
  res.json({ ok: true });
});

router.post('/unblock', (req, res) => {
  const p = byId.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: 'Invalid' }); return; }
  const me = getChar(req.auth!.uid);
  if (!me) { res.status(404).json({ error: 'No character' }); return; }
  getDb().prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(me.id, p.data.charId);
  res.json({ ok: true });
});

export default router;

/** Множество id-та, които `characterId` е блокирал ИЛИ които са го блокирали
 *  — за филтриране на чат/взаимодействия. Върнато като Set. */
export function blockedIdSet(characterId: number): Set<number> {
  const rows = getDb().prepare(
    'SELECT blocked_id AS id FROM blocks WHERE blocker_id = ? UNION SELECT blocker_id AS id FROM blocks WHERE blocked_id = ?',
  ).all(characterId, characterId) as { id: number }[];
  return new Set(rows.map((r) => r.id));
}
