/**
 * Системна поща и известия от админ панела.
 *
 *  - Писмо до един герой или до всички играчи, по избор с прикачено злато
 *    и/или предмет. Прикаченото се ЗАЧИСЛЯВА ВЕДНАГА в същата транзакция
 *    (играта няма поток „вземи от писмото") — писмото само съобщава какво е
 *    получено. Изтриването изтегля писмата, но НЕ отнема зачисленото.
 *  - Всяко изпращане е партида в admin_mail; копията в mail носят
 *    admin_mail_id → списък на изпратеното и изтегляне наведнъж.
 *  - In-app известие (notifications, kind 'system') до един или до всички.
 */
import type { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../db';
import { audit, parseId, parseQuery, pageQuery } from '../../lib/adminKit';
import { notify } from '../../lib/notify';
import { destructiveLimiter, fail, grantItem, inTx, listPage, parseBody } from './kit';

const mailSchema = z.object({
  target: z.enum(['all', 'character']),
  character_id: z.number().int().positive().optional(),
  from_name: z.string().trim().min(1).max(40).default('Heralds of the Crown'),
  subject: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(2000),
  gold: z.number().int().min(0).max(1_000_000_000).default(0),
  item_slug: z.string().trim().regex(/^[a-z0-9_]{2,60}$/).optional().or(z.literal('')),
  item_qty: z.number().int().min(1).max(100).default(1),
}).strict().refine((m) => m.target === 'all' || !!m.character_id, { message: 'character_id is required for a single recipient', path: ['character_id'] });

const notifySchema = z.object({
  target: z.enum(['all', 'character']),
  character_id: z.number().int().positive().optional(),
  message: z.string().trim().min(1).max(300),
}).strict().refine((m) => m.target === 'all' || !!m.character_id, { message: 'character_id is required for a single recipient', path: ['character_id'] });

export function registerMail(router: Router): void {
  /** Разпращането до всички е разрушително (не се връща) → destructiveLimiter. */
  router.post('/mail', destructiveLimiter, (req, res) => {
    const m = parseBody(mailSchema, req, res); if (!m) return;
    const now = Date.now();
    const out = inTx(res, 'Mail', (db) => {
      let item: { id: number; slug: string; name: string; category: string } | undefined;
      if (m.item_slug) {
        item = db.prepare('SELECT id, slug, name, category FROM items WHERE slug = ?').get(m.item_slug) as typeof item;
        if (!item) fail(404, `Unknown item slug: ${m.item_slug}`);
      }
      const recipients = m.target === 'all'
        ? (db.prepare('SELECT id FROM characters WHERE is_npc = 0').all() as { id: number }[]).map((r) => r.id)
        : [((db.prepare('SELECT id FROM characters WHERE id = ? AND is_npc = 0').get(m.character_id) as { id: number } | undefined) ?? fail(404, 'Character not found')).id];
      if (!recipients.length) fail(409, 'There are no player characters to send to.');
      const qty = item ? m.item_qty : 0;
      const batch = Number(db.prepare(`INSERT INTO admin_mail (target, character_id, from_name, subject, body, gold, item_id, item_qty, recipients, sent_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(m.target, m.target === 'character' ? m.character_id : null, m.from_name, m.subject, m.body, m.gold, item?.id ?? null, qty, recipients.length, req.auth!.uid, now).lastInsertRowid);
      // Писмото казва какво е зачислено — играчът вижда подаръка без „вземи".
      const attached = [m.gold ? `+${m.gold.toLocaleString('en')} gold` : '', item ? `${qty}× ${item.name}` : ''].filter(Boolean).join(', ');
      const body = attached ? `${m.body}\n\n— Credited to your hero: ${attached}.` : m.body;
      const insMail = db.prepare('INSERT INTO mail (character_id, from_name, subject, body, created_at, admin_mail_id) VALUES (?, ?, ?, ?, ?, ?)');
      const addGold = db.prepare('UPDATE characters SET gold = gold + ?, total_gold_earned = total_gold_earned + ? WHERE id = ?');
      for (const cid of recipients) {
        insMail.run(cid, m.from_name, m.subject, body, now, batch);
        if (m.gold) addGold.run(m.gold, m.gold, cid);
        if (item) grantItem(db, cid, item, qty);
      }
      return { batch, recipients: recipients.length, item };
    });
    if (!out) return;
    const { batch, recipients, item } = out.value;
    audit(req, res, {
      action: 'mail_send', targetType: m.target === 'all' ? 'mail' : 'character', targetId: m.target === 'all' ? batch : m.character_id,
      level: m.target === 'all' || m.gold || item ? 'warn' : 'info',
      after: { from_name: m.from_name, subject: m.subject, recipients, gold: m.gold, item: item?.slug ?? null, item_qty: item ? m.item_qty : 0 },
      meta: { batch_id: batch },
    });
    res.status(201).json({ ok: true, id: batch, sent: recipients });
  });

  /** Изпратената системна поща (партиди), най-новата отгоре. */
  router.get('/mail', (req, res) => {
    const q = parseQuery(pageQuery.extend({ target: z.enum(['', 'all', 'character']).default('') }), req, res); if (!q) return;
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.target) { where.push('am.target = ?'); params.push(q.target); }
    const { rows, ...meta } = listPage(getDb(), {
      select: `am.id, am.target, am.character_id, c.name AS character_name, am.from_name, am.subject, am.body, am.gold,
               am.item_qty, i.slug AS item_slug, i.name AS item_name, am.recipients, am.created_at, u.username AS sent_by_name,
               (SELECT COUNT(*) FROM mail m WHERE m.admin_mail_id = am.id) AS remaining,
               (SELECT COUNT(*) FROM mail m WHERE m.admin_mail_id = am.id AND m.read_at IS NOT NULL) AS read_count`,
      from: `admin_mail am LEFT JOIN characters c ON c.id = am.character_id LEFT JOIN items i ON i.id = am.item_id
             LEFT JOIN users u ON u.id = am.sent_by`,
      where, params, orderBy: 'am.id DESC',
      search: { cols: ['am.subject', 'am.body', 'c.name'], idCol: 'am.id' },
    }, q);
    res.json({ ...meta, mail: rows });
  });

  /** Изтегля всички копия на партидата. Зачисленото злато/предмет остава. */
  router.delete('/mail/:id', destructiveLimiter, (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const out = inTx(res, 'Mail', (db) => {
      const b = db.prepare('SELECT id, subject, recipients, gold, item_id, item_qty FROM admin_mail WHERE id = ?').get(id) as { id: number; subject: string; recipients: number; gold: number; item_id: number | null; item_qty: number } | undefined;
      if (!b) fail(404, 'Mail batch not found');
      const removed = db.prepare('DELETE FROM mail WHERE admin_mail_id = ?').run(id).changes;
      db.prepare('DELETE FROM admin_mail WHERE id = ?').run(id);
      return { b: b!, removed };
    });
    if (!out) return;
    const { b, removed } = out.value;
    audit(req, res, { action: 'mail_delete', targetType: 'mail', targetId: id, level: 'warn', before: { subject: b.subject, copies: removed }, after: { copies: 0 }, meta: { attachments_kept: !!(b.gold || b.item_id) } });
    res.json({ ok: true, removed, attachments_kept: !!(b.gold || b.item_id) });
  });

  /** In-app известие (камбанката) — до един герой или до всички играчи. */
  router.post('/notifications', destructiveLimiter, (req, res) => {
    const n = parseBody(notifySchema, req, res); if (!n) return;
    const out = inTx(res, 'Notification', (db) => {
      if (n.target === 'character') {
        if (!db.prepare('SELECT 1 FROM characters WHERE id = ? AND is_npc = 0').get(n.character_id)) fail(404, 'Character not found');
        notify(db, n.character_id!, 'system', n.message);
        return 1;
      }
      // До всички: един INSERT … SELECT (без SSE push към всеки — камбанката
      // се опреснява при следващия polling).
      return db.prepare(`INSERT INTO notifications (character_id, kind, message, ref, created_at)
        SELECT id, 'system', ?, '', ? FROM characters WHERE is_npc = 0`).run(n.message, Date.now()).changes;
    });
    if (!out) return;
    audit(req, res, { action: 'notification_send', targetType: n.target === 'all' ? 'notification' : 'character', targetId: n.target === 'all' ? null : n.character_id, level: n.target === 'all' ? 'warn' : 'info', after: { message: n.message, recipients: out.value } });
    res.status(201).json({ ok: true, sent: out.value });
  });
}
