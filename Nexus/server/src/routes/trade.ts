import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { notify } from '../lib/notify';
import { blockedIdSet } from './social';
import { executeTrade, ITEM_GUARD } from '../lib/tradeExec';

/**
 * P2P размяна с escrow. КРИТИЧНО: изпълнението е в ЕДНА транзакция с
 * per-item CAS (UPDATE ... WHERE character_id=giver AND equipped=0 AND
 * soul_bound=0 AND listed=0 AND vaulted_guild_id=0) — ако кой да е item
 * вече не е притежаван/е обременен, changes≠1 → throw → rollback, така че
 * НЯМА частичен трансфер и НЯМА дупликация (семейството guild-vault ексойти).
 */
const router = Router();
router.use(authRequired);

function getChar(uid: number): { id: number; name: string; gold: number } | undefined {
  return getDb().prepare('SELECT id, name, gold FROM characters WHERE user_id = ?').get(uid) as any;
}

// ITEM_GUARD се дели с lib/tradeExec.ts (единствен източник на истина за
// „търгуем ли е предметът").

/** Активната ми размяна (като подател или получател) + двете escrow страни. */
router.get('/active', (req, res) => {
  const me = getChar(req.auth!.uid);
  if (!me) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const offer = db.prepare(
    `SELECT * FROM trade_offers WHERE status = 'pending' AND (from_id = ? OR to_id = ?) ORDER BY created_at DESC LIMIT 1`,
  ).get(me.id, me.id) as any;
  if (!offer) { res.json({ offer: null }); return; }
  const other = offer.from_id === me.id ? offer.to_id : offer.from_id;
  const otherChar = db.prepare('SELECT id, name FROM characters WHERE id = ?').get(other) as { id: number; name: string };
  const hydrate = (ids: number[]) => ids.length
    ? db.prepare(`SELECT inv.id AS inv_id, items.slug, items.name, items.rarity, items.icon FROM inventory inv JOIN items ON items.id = inv.item_id WHERE inv.id IN (${ids.map(() => '?').join(',')})`).all(...ids)
    : [];
  res.json({
    offer: {
      id: offer.id, iAmSender: offer.from_id === me.id,
      me: { ready: (offer.from_id === me.id ? offer.from_ready : offer.to_ready) === 1, gold: offer.from_id === me.id ? offer.from_gold : offer.to_gold, items: hydrate(JSON.parse(offer.from_id === me.id ? offer.from_items : offer.to_items)) },
      them: { name: otherChar.name, ready: (offer.from_id === me.id ? offer.to_ready : offer.from_ready) === 1, gold: offer.from_id === me.id ? offer.to_gold : offer.from_gold, items: hydrate(JSON.parse(offer.from_id === me.id ? offer.to_items : offer.from_items)) },
    },
  });
});

/** Създай размяна към играч по име. */
router.post('/offer', (req, res) => {
  const p = z.object({ toName: z.string().min(1).max(30) }).safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: 'Invalid' }); return; }
  const me = getChar(req.auth!.uid);
  if (!me) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const target = db.prepare('SELECT id, name, is_npc FROM characters WHERE name = ?').get(p.data.toName) as { id: number; name: string; is_npc: number } | undefined;
  if (!target || target.is_npc) { res.status(404).json({ error: 'Player not found' }); return; }
  if (target.id === me.id) { res.status(400).json({ error: 'That’s you.' }); return; }
  if (blockedIdSet(me.id).has(target.id)) { res.status(403).json({ error: 'Cannot trade with this player.' }); return; }
  const existing = db.prepare(`SELECT 1 FROM trade_offers WHERE status = 'pending' AND (from_id IN (?,?) OR to_id IN (?,?))`).get(me.id, target.id, me.id, target.id);
  if (existing) { res.status(400).json({ error: 'One of you already has an active trade.' }); return; }
  const now = Date.now();
  const info = db.prepare(`INSERT INTO trade_offers (from_id, to_id, created_at, updated_at) VALUES (?, ?, ?, ?)`).run(me.id, target.id, now, now);
  notify(db, target.id, 'trade', `${me.name} wants to trade with you.`, `trade:${info.lastInsertRowid}`);
  res.json({ ok: true, id: info.lastInsertRowid });
});

function loadMyOffer(db: ReturnType<typeof getDb>, id: number, meId: number): any {
  return db.prepare(`SELECT * FROM trade_offers WHERE id = ? AND status = 'pending' AND (from_id = ? OR to_id = ?)`).get(id, meId, meId);
}

/** Задай моята страна (items + gold). Всяка промяна нулира двете ready. */
router.post('/:id/set', (req, res) => {
  const p = z.object({ items: z.array(z.number().int().positive()).max(12), gold: z.number().int().min(0) }).safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: 'Invalid' }); return; }
  const me = getChar(req.auth!.uid);
  if (!me) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const offer = loadMyOffer(db, Number(req.params.id), me.id);
  if (!offer) { res.status(404).json({ error: 'No such trade' }); return; }
  if (p.data.gold > me.gold) { res.status(400).json({ error: 'Not enough gold.' }); return; }
  // Валидирай, че всеки item е мой и не е обременен (soft-check; финалната
  // сигурност е CAS-ът при confirm).
  const ids = [...new Set(p.data.items)];
  for (const invId of ids) {
    const ok = db.prepare(`SELECT 1 FROM inventory WHERE id = ? AND character_id = ? AND ${ITEM_GUARD}`).get(invId, me.id);
    if (!ok) { res.status(400).json({ error: 'One of the items is not tradable (equipped/soul-bound/listed).' }); return; }
  }
  const iAmSender = offer.from_id === me.id;
  const col = iAmSender ? 'from_items = ?, from_gold = ?, from_ready = 0, to_ready = 0' : 'to_items = ?, to_gold = ?, from_ready = 0, to_ready = 0';
  db.prepare(`UPDATE trade_offers SET ${col}, updated_at = ? WHERE id = ?`).run(JSON.stringify(ids), p.data.gold, Date.now(), offer.id);
  res.json({ ok: true });
});

/** Готов/не съм готов. Ако СЛЕД това и двамата са готови → изпълни. */
router.post('/:id/ready', (req, res) => {
  const p = z.object({ ready: z.boolean() }).safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: 'Invalid' }); return; }
  const me = getChar(req.auth!.uid);
  if (!me) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const offer = loadMyOffer(db, Number(req.params.id), me.id);
  if (!offer) { res.status(404).json({ error: 'No such trade' }); return; }
  const iAmSender = offer.from_id === me.id;
  db.prepare(`UPDATE trade_offers SET ${iAmSender ? 'from_ready' : 'to_ready'} = ?, updated_at = ? WHERE id = ?`).run(p.data.ready ? 1 : 0, Date.now(), offer.id);

  const fresh = db.prepare('SELECT * FROM trade_offers WHERE id = ?').get(offer.id) as any;
  if (!(fresh.from_ready === 1 && fresh.to_ready === 1)) { res.json({ ok: true, executed: false }); return; }

  // ——— Изпълнение: една транзакция, CAS на всеки item + всяко злато ———
  // (изнесено в lib/tradeExec.ts за директно тестване на анти-дупликацията).
  try {
    executeTrade(db, fresh);
  } catch (e: any) {
    // Остави размяната pending, но нулирай ready, за да я преразгледат.
    db.prepare(`UPDATE trade_offers SET from_ready = 0, to_ready = 0 WHERE id = ? AND status = 'pending'`).run(fresh.id);
    res.status(409).json({ error: e.message || 'Trade failed.' });
    return;
  }
  notify(db, fresh.from_id === me.id ? fresh.to_id : fresh.from_id, 'trade', `Trade with ${me.name} completed.`, '');
  res.json({ ok: true, executed: true });
});

/** Отказ/отхвърляне на активна размяна (от която и да е страна). */
router.post('/:id/cancel', (req, res) => {
  const me = getChar(req.auth!.uid);
  if (!me) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const offer = loadMyOffer(db, Number(req.params.id), me.id);
  if (!offer) { res.status(404).json({ error: 'No such trade' }); return; }
  db.prepare(`UPDATE trade_offers SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'pending'`).run(Date.now(), offer.id);
  res.json({ ok: true });
});

export default router;
