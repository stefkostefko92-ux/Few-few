/**
 * Модерация (DSA чл. 16/17 — таргетирано сваляне + бан) и преглед на чата.
 *
 * Поток: сигнал (dsa.ts) → „Разреши" (resolve: какво реално сочи сигналът,
 * с преглед на съдържанието и автора) → сваляне с основание → обосновка по
 * чл. 17 в пощата на засегнатия, в СЪЩАТА транзакция, в която се затваря
 * сигналът. Обжалване по чл. 20 не се строи — освободено за микро-
 * предприятия (чл. 19); обосновката сочи извънсъдебен (чл. 21) и съдебен път.
 *
 * Чатът (глобален/гилдийски) се преглежда тук; изтриването на съобщение
 * минава през СЪЩОТО сваляне (`/moderation/takedown`, kind *_chat_message) —
 * с одит и по избор обосновка до автора, без втори път за триене.
 */
import type { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../db';
import { banUser, unbanUser, clientIp, clientHwid } from '../../lib/bans';
import { audit, parseId, parseQuery, pageQuery, pageMeta, ipIsShielded } from '../../lib/adminKit';
import { deliverStatement, notifyNoticeDecision } from '../../lib/adminModeration';
import { cancelListing } from './economy';
import { destructiveLimiter, listPage, type Db, type Row } from './kit';

const TAKEDOWN_KINDS = ['character_name', 'bio', 'guild_name', 'guild_tag', 'guild_motto', 'guild_chat_message', 'global_chat_message', 'market_listing'] as const;
type TakedownKind = (typeof TAKEDOWN_KINDS)[number];

interface TargetInfo {
  kind: TakedownKind;
  targetId: number;
  /** Кратък контекст за админа (име на герой/гилдия, статус на обява); празно за чат. */
  label: string;
  preview: string;
  authorCharId: number | null;
  authorName: string | null;
}

/** Какво реално има зад (kind, id) — за преглед преди сваляне и за одит „от". */
function describeTarget(db: Db, kind: TakedownKind, id: number): TargetInfo | null {
  const charName = (cid: number | null) => (cid ? (db.prepare('SELECT name FROM characters WHERE id = ?').get(cid) as { name: string } | undefined)?.name ?? null : null);
  switch (kind) {
    case 'character_name':
    case 'bio': {
      const c = db.prepare('SELECT id, name, bio FROM characters WHERE id = ?').get(id) as { id: number; name: string; bio: string } | undefined;
      if (!c) return null;
      return { kind, targetId: id, label: c.name, preview: kind === 'bio' ? c.bio || '' : c.name, authorCharId: c.id, authorName: c.name };
    }
    case 'guild_name':
    case 'guild_tag':
    case 'guild_motto': {
      const g = db.prepare('SELECT id, name, tag, motto, leader_id FROM guilds WHERE id = ?').get(id) as { id: number; name: string; tag: string; motto: string; leader_id: number } | undefined;
      if (!g) return null;
      const preview = kind === 'guild_name' ? g.name : kind === 'guild_tag' ? g.tag : g.motto || '';
      return { kind, targetId: id, label: `${g.name} [${g.tag}]`, preview, authorCharId: g.leader_id, authorName: charName(g.leader_id) };
    }
    case 'guild_chat_message':
    case 'global_chat_message': {
      const table = kind === 'guild_chat_message' ? 'guild_chat' : 'global_chat';
      const m = db.prepare(`SELECT id, character_id, message FROM ${table} WHERE id = ?`).get(id) as { id: number; character_id: number; message: string } | undefined;
      if (!m) return null;
      return { kind, targetId: id, label: '', preview: m.message, authorCharId: m.character_id, authorName: charName(m.character_id) };
    }
    case 'market_listing': {
      const l = db.prepare(`SELECT m.id, m.seller_id, m.status, m.price_gold, i.name AS item FROM marketplace_listings m JOIN items i ON i.id = m.item_id WHERE m.id = ?`).get(id) as { id: number; seller_id: number; status: string; price_gold: number; item: string } | undefined;
      if (!l) return null;
      return { kind, targetId: id, label: l.status, preview: `${l.item} — ${l.price_gold}g`, authorCharId: l.seller_id, authorName: charName(l.seller_id) };
    }
  }
}

/** Всички възможни цели на сигнал. „chat:N" е двусмислен (глобален и гилдийски
 *  чат ползват един и същ префикс) → връщаме и двата кандидата с преглед,
 *  вместо да трием на сляпо грешното съобщение. */
function resolveNotice(db: Db, n: { content_kind: string; content_ref: string }): TargetInfo[] {
  const ref = String(n.content_ref || '').trim();
  const out: TargetInfo[] = [];
  const push = (t: TargetInfo | null) => { if (t) out.push(t); };
  let m: RegExpMatchArray | null;
  if ((m = ref.match(/^(?:chat|gchat|global):(\d+)$/i))) {
    push(describeTarget(db, 'global_chat_message', Number(m[1])));
    if (!/^(gchat|global):/i.test(ref)) push(describeTarget(db, 'guild_chat_message', Number(m[1])));
  } else if ((m = ref.match(/^guildchat:(\d+)$/i))) {
    push(describeTarget(db, 'guild_chat_message', Number(m[1])));
  } else if ((m = ref.match(/^char(?:acter)?:(.+)$/i))) {
    const key = m[1].trim();
    const c = (/^\d+$/.test(key)
      ? db.prepare('SELECT id FROM characters WHERE id = ?').get(Number(key))
      : db.prepare('SELECT id FROM characters WHERE name = ? COLLATE NOCASE').get(key)) as { id: number } | undefined;
    if (c) { push(describeTarget(db, 'character_name', c.id)); push(describeTarget(db, 'bio', c.id)); }
  } else if ((m = ref.match(/^guild:(.+)$/i))) {
    const key = m[1].trim();
    const g = (/^\d+$/.test(key)
      ? db.prepare('SELECT id FROM guilds WHERE id = ?').get(Number(key))
      : db.prepare('SELECT id FROM guilds WHERE name = ? COLLATE NOCASE OR tag = ? COLLATE NOCASE').get(key, key)) as { id: number } | undefined;
    if (g) (['guild_name', 'guild_tag', 'guild_motto'] as const).forEach((k) => push(describeTarget(db, k, g.id)));
  } else if ((m = ref.match(/^(?:market|listing):(\d+)$/i))) {
    push(describeTarget(db, 'market_listing', Number(m[1])));
  }
  return out;
}


export function registerModeration(router: Router): void {
  const noticesQuery = pageQuery.extend({
    status: z.enum(['open', 'actioned', 'rejected', 'all']).default('open'),
  });
  /** Списък DSA сигнали (open най-горе), с броячи по статус. */
  router.get('/moderation/notices', (req, res) => {
    const q = parseQuery(noticesQuery, req, res); if (!q) return;
    const db = getDb();
    const w = q.status === 'all' ? '' : 'WHERE status = ?';
    const p = q.status === 'all' ? [] : [q.status];
    const total = (db.prepare(`SELECT COUNT(*) AS c FROM dsa_notices ${w}`).get(...p) as { c: number }).c;
    const rows = db.prepare(`
      SELECT id, content_kind, content_ref, reason, description, notifier_name, notifier_email,
             status, decision, decided_at, created_at
      FROM dsa_notices ${w}
      ORDER BY (status = 'open') DESC, created_at DESC LIMIT ? OFFSET ?`).all(...p, q.pageSize, (q.page - 1) * q.pageSize);
    const byStatus = Object.fromEntries((db.prepare('SELECT status, COUNT(*) AS c FROM dsa_notices GROUP BY status').all() as { status: string; c: number }[]).map((r) => [r.status, r.c]));
    res.json({ ...pageMeta(total, q), notices: rows, counts: byStatus });
  });

  router.get('/moderation/notices/:id/resolve', (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const db = getDb();
    const notice = db.prepare('SELECT id, content_kind, content_ref, reason, description, status, created_at FROM dsa_notices WHERE id = ?').get(id) as Row | undefined;
    if (!notice) { res.status(404).json({ error: 'Notice not found' }); return; }
    res.json({ notice, candidates: resolveNotice(db, notice as { content_kind: string; content_ref: string }) });
  });

  /** Преглед на цел по (kind, id) — ръчно въведени цели също се виждат преди сваляне. */
  router.get('/moderation/target', (req, res) => {
    const q = parseQuery(z.object({ kind: z.enum(TAKEDOWN_KINDS), id: z.coerce.number().int().positive() }), req, res); if (!q) return;
    const t = describeTarget(getDb(), q.kind, q.id);
    if (!t) { res.status(404).json({ error: 'Target not found' }); return; }
    res.json({ target: t });
  });

  const takedownSchema = z.object({
    // 'chat_message' = стар псевдоним за guild_chat_message (обратна съвместимост).
    kind: z.union([z.enum(TAKEDOWN_KINDS), z.literal('chat_message')]),
    targetId: z.number().int().positive(),
    reason: z.string().trim().min(3).max(300),
    ground: z.enum(['terms', 'illegal']).default('terms'),
    notify: z.boolean().default(true),
    noticeId: z.number().int().positive().optional(), // идва от DSA сигнал → затвори го
  }).strict();

  // Гарантирано-уникална стойност за UNIQUE колона (squat-нато „Reclaimed<id>").
  function uniqueValue(db: Db, table: 'characters' | 'guilds', col: 'name' | 'tag', candidate: (i: number) => string): string {
    for (let i = 0; i < 30; i++) {
      const v = candidate(i);
      if (!db.prepare(`SELECT 1 FROM ${table} WHERE ${col} = ? LIMIT 1`).get(v)) return v;
    }
    return candidate(Math.floor(Math.random() * 1e9));
  }
  const rnd = (n: number) => Math.random().toString(36).slice(2, 2 + n);
  const rndTag = () => Array.from({ length: 5 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('');

  router.post('/moderation/takedown', destructiveLimiter, (req, res) => {
    const parse = takedownSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
    const kind: TakedownKind = parse.data.kind === 'chat_message' ? 'guild_chat_message' : parse.data.kind;
    const { targetId, reason, ground, notify, noticeId } = parse.data;
    const db = getDb();

    type Outcome = { status: number; error?: string; detail?: string; before?: TargetInfo; notified?: boolean };
    let outcome: Outcome;
    try {
      outcome = db.transaction((): Outcome => {
        if (noticeId) {
          const n = db.prepare('SELECT status FROM dsa_notices WHERE id = ?').get(noticeId) as { status: string } | undefined;
          if (!n) return { status: 404, error: 'Notice not found' };
          if (n.status !== 'open') return { status: 409, error: 'Notice was already decided' };
        }
        const before = describeTarget(db, kind, targetId);
        if (!before) return { status: 404, error: 'Target not found' };
        let detail = '';
        switch (kind) {
          case 'character_name': {
            const name = uniqueValue(db, 'characters', 'name', (i) => (i === 0 ? `Reclaimed${targetId}` : `Reclaimed${targetId}_${rnd(4)}`).slice(0, 20));
            db.prepare('UPDATE characters SET name = ? WHERE id = ?').run(name, targetId);
            detail = `character name → ${name}`;
            break;
          }
          case 'bio':
            db.prepare("UPDATE characters SET bio = '' WHERE id = ?").run(targetId);
            detail = 'bio cleared';
            break;
          case 'guild_name': {
            const gn = uniqueValue(db, 'guilds', 'name', (i) => (i === 0 ? `Guild ${targetId}` : `Guild ${targetId} ${rnd(4)}`).slice(0, 30));
            db.prepare('UPDATE guilds SET name = ? WHERE id = ?').run(gn, targetId);
            detail = `guild name → ${gn}`;
            break;
          }
          case 'guild_tag': {
            const tag = uniqueValue(db, 'guilds', 'tag', () => rndTag());
            db.prepare('UPDATE guilds SET tag = ? WHERE id = ?').run(tag, targetId);
            detail = `guild tag → ${tag}`;
            break;
          }
          case 'guild_motto':
            db.prepare("UPDATE guilds SET motto = '' WHERE id = ?").run(targetId);
            detail = 'guild motto cleared';
            break;
          case 'guild_chat_message':
            db.prepare('DELETE FROM guild_chat WHERE id = ?').run(targetId);
            detail = 'guild chat message removed';
            break;
          case 'global_chat_message':
            db.prepare('DELETE FROM global_chat WHERE id = ?').run(targetId);
            detail = 'public chat message removed';
            break;
          case 'market_listing': {
            const r = cancelListing(db, targetId, { reason, ground, notify: false, fromNotice: !!noticeId });
            if (r.status !== 200) return { status: r.status, error: r.error };
            detail = 'listing cancelled';
            break;
          }
        }
        let notified = false;
        if (notify && before.authorCharId) {
          deliverStatement(db, before.authorCharId, { kind, reason, ground, fromNotice: !!noticeId });
          notified = true;
        }
        if (noticeId) {
          db.prepare(`UPDATE dsa_notices SET status = 'actioned', decision = ?, decided_at = ? WHERE id = ?`)
            .run(`${detail} — ${reason}`.slice(0, 500), Date.now(), noticeId);
        }
        return { status: 200, detail, before, notified };
      })();
    } catch {
      // Неочаквана колизия/грешка — без голо 500 с вътрешен текст.
      res.status(409).json({ error: 'Takedown failed (conflict) — try again.' });
      return;
    }
    if (outcome.status !== 200) { res.status(outcome.status).json({ error: outcome.error }); return; }
    audit(req, res, {
      category: 'moderation', action: 'takedown', level: 'warn', targetType: kind, targetId,
      before: { content: outcome.before!.preview }, after: { result: outcome.detail },
      message: `Takedown: ${outcome.detail}`,
      meta: { reason, ground, notified: outcome.notified, noticeId: noticeId ?? null, author_character_id: outcome.before!.authorCharId },
    });
    // Чл. 16(5): подателят на сигнала научава решението (след записа, извън
    // транзакцията; best-effort — SMTP забавяне не бави админа).
    if (noticeId) void notifyNoticeDecision(db, noticeId);
    res.json({ ok: true, kind, targetId, detail: outcome.detail, notified: outcome.notified });
  });

  /**
   * Ръчен бан (chargeback банът минава през webhook-а автоматично).
   * `durationMs`: 0/липсва = ПОСТОЯНЕН; >0 = временен.
   * IP/устройство се банват САМО ако не са непублични и не съвпадат с
   * админски IP/устройство — иначе банът заключва и администраторите.
   */
  const banSchema = z.object({
    userId: z.number().int().positive(),
    reason: z.string().trim().min(3).max(300),
    durationMs: z.number().int().nonnegative().max(3_153_600_000_000).optional(), // ≤ ~100г
    banIp: z.boolean().default(true),
    banDevice: z.boolean().default(true),
  }).strict();

  router.post('/moderation/ban', destructiveLimiter, (req, res) => {
    const parse = banSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
    const { userId, reason, durationMs, banIp, banDevice } = parse.data;
    if (userId === req.auth!.uid) { res.status(409).json({ error: 'You cannot ban your own account.' }); return; }
    const db = getDb();
    const u = db.prepare('SELECT id, username, last_ip, last_hwid, is_admin, banned, banned_until FROM users WHERE id = ?').get(userId) as
      | { id: number; username: string; last_ip: string; last_hwid: string; is_admin: number; banned: number; banned_until: number } | undefined;
    if (!u) { res.status(404).json({ error: 'User not found' }); return; }
    // Не банвай друг администратор (ескалация при компрометиран акаунт).
    if (u.is_admin === 1) { res.status(409).json({ error: 'Cannot ban an administrator. Demote them first.' }); return; }
    const admins = db.prepare('SELECT last_ip, last_hwid FROM users WHERE is_admin = 1').all() as { last_ip: string; last_hwid: string }[];
    const adminIps = [clientIp(req), ...admins.map((a) => a.last_ip)];
    const adminDevices = new Set([clientHwid(req), ...admins.map((a) => a.last_hwid)].filter(Boolean));
    const ip = banIp && u.last_ip && !ipIsShielded(u.last_ip, adminIps) ? u.last_ip : '';
    const hwid = banDevice && u.last_hwid && !adminDevices.has(u.last_hwid) ? u.last_hwid : '';
    const skipped = {
      ip: banIp && !!u.last_ip && !ip ? 'shielded' : null,
      device: banDevice && !!u.last_hwid && !hwid ? 'shielded' : null,
    };
    banUser({ userId, ip, hwid, reason, durationMs });
    const until = durationMs && durationMs > 0 ? Date.now() + durationMs : 0;
    audit(req, res, {
      category: 'moderation', action: 'manual_ban', level: 'warn', targetType: 'user', targetId: userId,
      before: { banned: u.banned, banned_until: u.banned_until }, after: { banned: 1, banned_until: until },
      message: `Manual ban (user ${userId})`, meta: { reason, ip_banned: !!ip, device_banned: !!hwid, skipped },
    });
    res.json({ ok: true, userId, until, ip_banned: !!ip, device_banned: !!hwid, skipped });
  });

  const unbanSchema = z.object({ userId: z.number().int().positive() }).strict();
  router.post('/moderation/unban', (req, res) => {
    const parse = unbanSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
    const { userId } = parse.data;
    const db = getDb();
    const u = db.prepare('SELECT banned, banned_until FROM users WHERE id = ?').get(userId) as { banned: number; banned_until: number } | undefined;
    if (!u) { res.status(404).json({ error: 'User not found' }); return; }
    const residual = (db.prepare('SELECT (SELECT COUNT(*) FROM banned_ips WHERE user_id = ?) + (SELECT COUNT(*) FROM banned_devices WHERE user_id = ?) AS c').get(userId, userId) as { c: number }).c;
    if (u.banned !== 1 && residual === 0) { res.status(409).json({ error: 'User is not banned' }); return; }
    unbanUser(userId);
    audit(req, res, { category: 'moderation', action: 'unban', targetType: 'user', targetId: userId, before: { banned: u.banned, banned_until: u.banned_until }, after: { banned: 0, banned_until: 0 }, message: `Unban (user ${userId})` });
    res.json({ ok: true, userId });
  });

  router.get('/moderation/bans', (_req, res) => {
    const db = getDb();
    res.json({
      users: db.prepare('SELECT id, username, banned_reason, banned_at, banned_until FROM users WHERE banned = 1 ORDER BY banned_at DESC LIMIT 200').all(),
      ips: db.prepare('SELECT ip, reason, user_id, created_at, expires_at FROM banned_ips ORDER BY created_at DESC LIMIT 200').all(),
      devices: db.prepare('SELECT hwid, reason, user_id, created_at, expires_at FROM banned_devices ORDER BY created_at DESC LIMIT 200').all(),
    });
  });

  /** Отхвърляне на DSA сигнал без действие (напр. неоснователен). */
  const rejectSchema = z.object({ decision: z.string().trim().min(3).max(300) }).strict();
  router.post('/moderation/dsa/:id/reject', (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const parse = rejectSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
    const db = getDb();
    const n = db.prepare('SELECT status FROM dsa_notices WHERE id = ?').get(id) as { status: string } | undefined;
    if (!n) { res.status(404).json({ error: 'Notice not found' }); return; }
    if (n.status !== 'open') { res.status(409).json({ error: 'Notice was already decided' }); return; }
    db.prepare(`UPDATE dsa_notices SET status = 'rejected', decision = ?, decided_at = ? WHERE id = ? AND status = 'open'`)
      .run(parse.data.decision, Date.now(), id);
    audit(req, res, { category: 'moderation', action: 'dsa_reject', targetType: 'dsa_notice', targetId: id, before: { status: 'open' }, after: { status: 'rejected', decision: parse.data.decision } });
    void notifyNoticeDecision(db, id); // чл. 16(5) — и отказът се съобщава на подателя
    res.json({ ok: true, id });
  });


  /* ===================== Чат — преглед по потребител/време ===================== */
  const chatQuery = pageQuery.extend({
    source: z.enum(['global', 'guild']).default('global'),
    character_id: z.coerce.number().int().positive().optional(),
    guild_id: z.coerce.number().int().positive().optional(),
    channel: z.string().regex(/^[a-z_]{0,40}$/).optional().default(''),
    since: z.coerce.number().int().nonnegative().optional(),
    until: z.coerce.number().int().positive().optional(),
  });

  router.get('/chat', (req, res) => {
    const q = parseQuery(chatQuery, req, res); if (!q) return;
    const guild = q.source === 'guild';
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.character_id) { where.push('m.character_id = ?'); params.push(q.character_id); }
    if (q.since) { where.push('m.created_at >= ?'); params.push(q.since); }
    if (q.until) { where.push('m.created_at <= ?'); params.push(q.until); }
    if (guild && q.guild_id) { where.push('m.guild_id = ?'); params.push(q.guild_id); }
    if (!guild && q.channel) { where.push('m.channel = ?'); params.push(q.channel); }
    const { rows, ...meta } = listPage(getDb(), {
      select: guild
        ? "m.id, 'guild' AS source, m.guild_id, g.tag AS guild_tag, '' AS channel, m.character_id, c.name AS character_name, u.username, m.message, m.created_at"
        : "m.id, 'global' AS source, NULL AS guild_id, NULL AS guild_tag, m.channel, m.character_id, c.name AS character_name, u.username, m.message, m.created_at",
      from: guild
        ? 'guild_chat m LEFT JOIN guilds g ON g.id = m.guild_id LEFT JOIN characters c ON c.id = m.character_id LEFT JOIN users u ON u.id = c.user_id'
        : 'global_chat m LEFT JOIN characters c ON c.id = m.character_id LEFT JOIN users u ON u.id = c.user_id',
      where, params, orderBy: 'm.id DESC',
      search: { cols: ['m.message', 'c.name', 'u.username'], idCol: 'm.id' },
    }, q);
    res.json({ ...meta, messages: rows });
  });
}
