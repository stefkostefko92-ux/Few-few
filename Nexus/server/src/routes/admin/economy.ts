/**
 * Икономика: поръчки (Stripe) + отбелязване на връщане, пазар (отмяна с
 * обосновка по DSA чл. 17), аукцион (отмяна с връщане на гемовете на
 * водещия наддавач), размени (отмяна на чакаща размяна).
 *
 * Пари: сумите са цели центове; „връщане" тук само ОТБЕЛЯЗВА вече
 * направено връщане в Stripe (и по избор отнема кредитираните гемове) —
 * този ендпойнт не мести реални пари.
 */
import type { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../db';
import { audit, parseId, parseQuery, pageQuery, pageMeta, escapeLike } from '../../lib/adminKit';
import { notify } from '../../lib/notify';
import { deliverStatement, type Ground } from '../../lib/adminModeration';
import { destructiveLimiter, fail, inTx, listPage, parseBody, type Db, type Row } from './kit';

const purchasesQuery = pageQuery.extend({
  status: z.enum(['all', 'pending', 'completed', 'failed', 'refunded', 'disputed']).default('all'),
});
const refundSchema = z.object({
  reason: z.string().trim().min(3).max(300),
  revoke_gems: z.boolean().default(true),
}).strict();

const marketQuery = pageQuery.extend({
  status: z.enum(['all', 'active', 'sold', 'cancelled']).default('all'),
});
const cancelSchema = z.object({
  reason: z.string().trim().min(3).max(300),
  ground: z.enum(['terms', 'illegal']).default('terms'),
  notify: z.boolean().default(true),
}).strict();

const reasonSchema = z.object({ reason: z.string().trim().min(3).max(300) }).strict();

/** Отменя АКТИВНА обява (вика се в транзакция) и по избор праща обосновка. */
export function cancelListing(db: Db, id: number, o: { reason: string; ground: Ground; notify: boolean; fromNotice: boolean }) {
  const row = db.prepare('SELECT id, inventory_id, seller_id, status, price_gold FROM marketplace_listings WHERE id = ?').get(id) as
    | { id: number; inventory_id: number; seller_id: number; status: string; price_gold: number } | undefined;
  if (!row) return { status: 404 as const, error: 'Listing not found' };
  if (row.status !== 'active') return { status: 409 as const, error: `Only active listings can be cancelled (this one is ${row.status}).` };
  db.prepare(`UPDATE marketplace_listings SET status = 'cancelled' WHERE id = ?`).run(id);
  if (row.inventory_id) db.prepare('UPDATE inventory SET listed = 0 WHERE id = ?').run(row.inventory_id);
  if (o.notify) deliverStatement(db, row.seller_id, { kind: 'market_listing', reason: o.reason, ground: o.ground, fromNotice: o.fromNotice });
  return { status: 200 as const, row };
}

export function registerEconomy(router: Router): void {
  /* ===================== Поръчки ===================== */
  router.get('/purchases', (req, res) => {
    const q = parseQuery(purchasesQuery, req, res); if (!q) return;
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.status !== 'all') { where.push('p.status = ?'); params.push(q.status); }
    if (q.q) {
      const like = `%${escapeLike(q.q)}%`;
      where.push(`(c.name LIKE ? ESCAPE '\\' OR p.kind LIKE ? ESCAPE '\\' OR p.stripe_session_id = ? OR p.id = ?)`);
      params.push(like, like, q.q, /^\d+$/.test(q.q) ? Number(q.q) : -1);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const db = getDb();
    const total = (db.prepare(`SELECT COUNT(*) AS c FROM purchases p LEFT JOIN characters c ON c.id = p.character_id ${w}`).get(...params) as { c: number }).c;
    const rows = db.prepare(`
      SELECT p.id, p.character_id, c.name AS character_name, p.kind, p.amount_cents, p.currency,
             p.gems_granted, p.status, p.mode, p.stripe_session_id, p.created_at, p.completed_at
      FROM purchases p LEFT JOIN characters c ON c.id = p.character_id ${w}
      ORDER BY p.id DESC LIMIT ? OFFSET ?`).all(...params, q.pageSize, (q.page - 1) * q.pageSize);
    res.json({ ...pageMeta(total, q), purchases: rows });
  });

  /**
   * Отбелязва поръчка като върната (refunded) — след връщане, направено в
   * Stripe (или dev поръчка). По избор отнема кредитираните гемове (не под
   * 0) — същата логика като webhook-а charge.refunded. Само completed/disputed.
   */
  router.post('/purchases/:id/refund', destructiveLimiter, (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const body = parseBody(refundSchema, req, res); if (!body) return;
    const out = inTx(res, 'Purchase', (db) => {
      const p = db.prepare('SELECT id, character_id, kind, status, amount_cents, currency, effect_payload FROM purchases WHERE id = ?').get(id) as Row | undefined;
      if (!p) fail(404, 'Purchase not found');
      if (p!.status !== 'completed' && p!.status !== 'disputed') fail(409, `Only completed or disputed purchases can be marked refunded (this one is ${p!.status}).`);
      let gems = 0;
      try { gems = Number(JSON.parse(p!.effect_payload || '{}').gems || 0) || 0; } catch { gems = 0; }
      let clawed = 0;
      if (body.revoke_gems && gems > 0 && p!.character_id) {
        const ch = db.prepare('SELECT gems FROM characters WHERE id = ?').get(p!.character_id) as { gems: number } | undefined;
        if (ch) {
          clawed = Math.min(ch.gems, gems);
          db.prepare('UPDATE characters SET gems = MAX(0, gems - ?) WHERE id = ?').run(gems, p!.character_id);
        }
      }
      db.prepare(`UPDATE purchases SET status = 'refunded' WHERE id = ?`).run(id);
      return { p: p!, clawed };
    });
    if (!out) return;
    const { p, clawed } = out.value;
    audit(req, res, { action: 'purchase_refund', targetType: 'purchase', targetId: id, level: 'warn', before: { status: p.status }, after: { status: 'refunded' }, meta: { reason: body.reason, gems_clawed_back: clawed, amount_cents: p.amount_cents, currency: p.currency, character_id: p.character_id } });
    res.json({ ok: true, gems_clawed_back: clawed });
  });

  /* ===================== Пазар ===================== */
  router.get('/marketplace', (req, res) => {
    const q = parseQuery(marketQuery, req, res); if (!q) return;
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.status !== 'all') { where.push('m.status = ?'); params.push(q.status); }
    const { rows, ...meta } = listPage(getDb(), {
      select: `m.id, m.item_id, m.seller_id, m.buyer_id, m.price_gold, m.status, m.listed_at, m.sold_at,
               items.name AS item_name, items.rarity, s.name AS seller_name, b.name AS buyer_name`,
      from: `marketplace_listings m JOIN items ON items.id = m.item_id JOIN characters s ON s.id = m.seller_id
             LEFT JOIN characters b ON b.id = m.buyer_id`,
      where, params, orderBy: 'm.listed_at DESC',
      search: { cols: ['items.name', 's.name', 'b.name'] },
    }, q);
    res.json({ ...meta, listings: rows });
  });

  router.post('/marketplace/:id/cancel', destructiveLimiter, (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const parse = cancelSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
    const db = getDb();
    const out = db.transaction(() => cancelListing(db, id, { ...parse.data, fromNotice: false }))();
    if (out.status !== 200) { res.status(out.status).json({ error: out.error }); return; }
    audit(req, res, { category: 'moderation', action: 'listing_cancel', targetType: 'market_listing', targetId: id, level: 'warn', before: { status: 'active' }, after: { status: 'cancelled' }, meta: { reason: parse.data.reason, ground: parse.data.ground, notified: parse.data.notify, seller_id: out.row.seller_id } });
    res.json({ ok: true, notified: parse.data.notify });
  });

  /* ===================== Аукцион (гемове, по час) ===================== */
  router.get('/auction', (req, res) => {
    const q = parseQuery(pageQuery.extend({ status: z.enum(['all', 'open', 'settled', 'cancelled']).default('all') }), req, res); if (!q) return;
    const where: string[] = [];
    if (q.status === 'open') where.push('a.settled = 0');
    if (q.status === 'settled') where.push('a.settled = 1 AND a.cancelled_at = 0');
    if (q.status === 'cancelled') where.push('a.cancelled_at > 0');
    const { rows, ...meta } = listPage(getDb(), {
      select: `a.id, a.hour_bucket, a.item_slug, i.name AS item_name, i.rarity, a.starts_at, a.ends_at, a.starting_bid, a.current_bid,
               a.bidder_id, a.bidder_name, a.settled, a.cancelled_at`,
      from: 'auction_listings a JOIN items i ON i.id = a.item_id',
      where, params: [], orderBy: 'a.hour_bucket DESC',
      search: { cols: ['i.name', 'a.item_slug', 'a.bidder_name'], idCol: 'a.id' },
    }, q);
    res.json({ ...meta, listings: rows, server_now: Date.now() });
  });

  /**
   * Отменя НЕУРЕДЕНА обява: гемовете на водещия наддавач се връщат (той
   * получава писмо), предметът не се дава, обявата се затваря. Уредената
   * (предметът вече е у победителя) → 409.
   */
  router.post('/auction/:id/cancel', destructiveLimiter, (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const body = parseBody(reasonSchema, req, res); if (!body) return;
    const out = inTx(res, 'Auction', (db) => {
      const a = db.prepare('SELECT a.*, i.name AS item_name FROM auction_listings a JOIN items i ON i.id = a.item_id WHERE a.id = ?').get(id) as Row | undefined;
      if (!a) fail(404, 'Auction listing not found');
      if (a!.settled) fail(409, a!.cancelled_at ? 'The auction is already cancelled.' : 'The auction is already settled — the winner has the item.');
      const claim = db.prepare('UPDATE auction_listings SET settled = 1, cancelled_at = ?, bidder_id = NULL, bidder_name = NULL WHERE id = ? AND settled = 0').run(Date.now(), id);
      if (claim.changes !== 1) fail(409, 'The auction changed state — reload and try again.');
      if (a!.bidder_id) {
        db.prepare('UPDATE characters SET gems = gems + ?, total_gems_spent = MAX(0, total_gems_spent - ?) WHERE id = ?').run(a!.current_bid, a!.current_bid, a!.bidder_id);
        db.prepare('INSERT INTO mail (character_id, from_name, subject, body, created_at) VALUES (?, ?, ?, ?, ?)').run(
          a!.bidder_id, 'Auction House', `Auction cancelled: ${a!.item_name}`,
          `The auction for ${a!.item_name} was cancelled by the realm administrators. Your bid of ${a!.current_bid} gems has been returned.\n\nReason: ${body.reason}`, Date.now(),
        );
      }
      return a!;
    });
    if (!out) return;
    const a = out.value;
    audit(req, res, { action: 'auction_cancel', targetType: 'auction_listing', targetId: id, level: 'warn', before: { settled: 0, bidder_id: a.bidder_id, current_bid: a.current_bid }, after: { settled: 1, cancelled: true }, meta: { reason: body.reason, gems_refunded: a.bidder_id ? a.current_bid : 0, item: a.item_slug } });
    res.json({ ok: true, refunded: a.bidder_id ? a.current_bid : 0 });
  });

  /* ===================== Размени (P2P escrow) ===================== */
  router.get('/trades', (req, res) => {
    const q = parseQuery(pageQuery.extend({ status: z.enum(['all', 'pending', 'completed', 'cancelled', 'declined']).default('all') }), req, res); if (!q) return;
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.status !== 'all') { where.push('t.status = ?'); params.push(q.status); }
    const { rows, ...meta } = listPage(getDb(), {
      select: `t.id, t.from_id, f.name AS from_name, t.to_id, tc.name AS to_name, t.from_gold, t.to_gold,
               CASE WHEN json_valid(t.from_items) THEN json_array_length(t.from_items) ELSE 0 END AS from_item_count,
               CASE WHEN json_valid(t.to_items) THEN json_array_length(t.to_items) ELSE 0 END AS to_item_count,
               t.from_ready, t.to_ready, t.status, t.created_at, t.updated_at`,
      from: 'trade_offers t JOIN characters f ON f.id = t.from_id JOIN characters tc ON tc.id = t.to_id',
      where, params, orderBy: '(t.status = \'pending\') DESC, t.updated_at DESC',
      search: { cols: ['f.name', 'tc.name'], idCol: 't.id' },
    }, q);
    res.json({ ...meta, trades: rows });
  });

  /** Отменя чакаща размяна. Escrow-ът е само JSON (предметите не са местени) → нищо за връщане. */
  router.post('/trades/:id/cancel', destructiveLimiter, (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const body = parseBody(reasonSchema, req, res); if (!body) return;
    const out = inTx(res, 'Trade', (db) => {
      const t = db.prepare('SELECT t.*, f.name AS from_name, tc.name AS to_name FROM trade_offers t JOIN characters f ON f.id = t.from_id JOIN characters tc ON tc.id = t.to_id WHERE t.id = ?').get(id) as Row | undefined;
      if (!t) fail(404, 'Trade not found');
      const upd = db.prepare(`UPDATE trade_offers SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'pending'`).run(Date.now(), id);
      if (upd.changes !== 1) fail(409, `Only pending trades can be cancelled (this one is ${t!.status}).`);
      for (const cid of [t!.from_id, t!.to_id]) notify(db, cid, 'trade', `Your trade between ${t!.from_name} and ${t!.to_name} was cancelled by the realm administrators.`);
      return t!;
    });
    if (!out) return;
    audit(req, res, { action: 'trade_cancel', targetType: 'trade', targetId: id, level: 'warn', before: { status: 'pending' }, after: { status: 'cancelled' }, meta: { reason: body.reason, from_id: out.value.from_id, to_id: out.value.to_id } });
    res.json({ ok: true });
  });
}
