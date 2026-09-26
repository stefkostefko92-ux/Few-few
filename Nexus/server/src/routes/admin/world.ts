/**
 * Живият свят: Кула, награди за глава, боен пропуск, Trial Cache, световен
 * бос (преглед/спаун/нулиране/HP) и сезонът (класиране + финализация).
 *
 * Логиката на боса и сезона НЕ се дублира: спаунът/ротацията идват от
 * game/realmBoss.ts, финализацията — от game/seasons.ts (същата функция,
 * която играта вика lazy в новия месец).
 */
import type { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../db';
import { audit, parseId, parseQuery, pageQuery } from '../../lib/adminKit';
import { REALM_BOSSES, findRealmBoss, isoWeek, pickBossForWeek, realmBossHpFor, spawnWeekBoss, type RealmBossRow } from '../../game/realmBoss';
import { finalizePrevSeasonIfDue, prevSeasonKey, rewardForRank, seasonEndsAt, seasonKeyFor } from '../../game/seasons';
import { destructiveLimiter, fail, inTx, listPage, parseBody } from './kit';

const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM');
const weekKey = z.string().regex(/^\d{4}-W\d{2}$/, 'Week must be YYYY-Www');

const spawnSchema = z.object({
  boss_slug: z.string().max(40).optional(),
  hp_max: z.number().int().min(1).max(1e12).optional(),
}).strict();
const bossPatchSchema = z.object({
  hp_max: z.number().int().min(1).max(1e12).optional(),
  hp_remaining: z.number().int().min(1).max(1e12).optional(),
  ends_at: z.number().int().positive().optional(),
}).strict();

export function registerWorld(router: Router): void {
  /* ===================== Tower of Trials ===================== */
  router.get('/tower', (_req, res) => {
    const climbers = getDb().prepare(
      `SELECT id, name, class, level, tower_best_floor, tower_current_floor, trial_tokens, forge_guarantees
       FROM characters WHERE is_npc = 0 AND tower_best_floor > 0
       ORDER BY tower_best_floor DESC LIMIT 100`,
    ).all();
    res.json({ climbers });
  });

  router.post('/tower/reset/:id', (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const db = getDb();
    const before = db.prepare('SELECT name, tower_current_floor FROM characters WHERE id = ?').get(id) as { name: string; tower_current_floor: number } | undefined;
    if (!before) { res.status(404).json({ error: 'Character not found' }); return; }
    db.prepare('UPDATE characters SET tower_current_floor = 0, tower_run_seed = 0 WHERE id = ?').run(id);
    audit(req, res, { action: 'tower_reset', targetType: 'character', targetId: id, before: { tower_current_floor: before.tower_current_floor }, after: { tower_current_floor: 0 }, message: `Tower run reset for ${before.name}` });
    res.json({ ok: true });
  });

  /* ===================== Bounties ===================== */
  router.get('/bounties', (_req, res) => {
    const rows = getDb().prepare(
      `SELECT cb.character_id, c.name AS character_name, cb.day_index, cb.bounties_json
       FROM character_bounties cb JOIN characters c ON c.id = cb.character_id
       ORDER BY cb.day_index DESC LIMIT 100`,
    ).all();
    res.json({ rows });
  });

  router.post('/bounties/clear/:id', (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const info = getDb().prepare('DELETE FROM character_bounties WHERE character_id = ?').run(id);
    if (info.changes === 0) { res.status(404).json({ error: 'No stored bounties for this character' }); return; }
    audit(req, res, { action: 'bounties_clear', targetType: 'character', targetId: id, before: { boards: info.changes }, after: { boards: 0 } });
    res.json({ ok: true, cleared: info.changes });
  });

  /* ===================== Battle Pass ===================== */
  router.get('/battlepass', (req, res) => {
    const q = parseQuery(z.object({ month: monthKey.optional().or(z.literal('')) }), req, res); if (!q) return;
    const month = q.month || '';
    const rows = getDb().prepare(
      `SELECT bp.character_id, c.name AS character_name, bp.month_key,
              bp.premium_unlocked, bp.generated_at,
              json(bp.progress_json) AS progress_json
       FROM battle_pass bp JOIN characters c ON c.id = bp.character_id
       ${month ? 'WHERE bp.month_key = ?' : ''}
       ORDER BY bp.month_key DESC, c.id LIMIT 200`,
    ).all(...(month ? [month] : []));
    res.json({ rows });
  });

  router.post('/battlepass/unlock-premium/:id', (req, res) => {
    const id = parseId(req, res); if (id === null) return;
    const parse = z.object({ month: monthKey }).safeParse(req.body);
    if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
    const db = getDb();
    const row = db.prepare('SELECT premium_unlocked FROM battle_pass WHERE character_id = ? AND month_key = ?').get(id, parse.data.month) as { premium_unlocked: number } | undefined;
    if (!row) { res.status(404).json({ error: 'No battle pass for this character and month' }); return; }
    if (row.premium_unlocked === 1) { res.status(409).json({ error: 'Premium is already unlocked' }); return; }
    db.prepare('UPDATE battle_pass SET premium_unlocked = 1 WHERE character_id = ? AND month_key = ?').run(id, parse.data.month);
    audit(req, res, { action: 'battlepass_unlock_premium', targetType: 'character', targetId: id, before: { premium_unlocked: 0 }, after: { premium_unlocked: 1 }, meta: { month: parse.data.month } });
    res.json({ ok: true });
  });

  /* ===================== Trial Cache (read-only) ===================== */
  router.get('/trial-purchases', (_req, res) => {
    const rows = getDb().prepare(
      `SELECT tp.character_id, c.name AS character_name, tp.slug, tp.bought_at
       FROM trial_purchases tp JOIN characters c ON c.id = tp.character_id
       ORDER BY tp.bought_at DESC LIMIT 200`,
    ).all();
    res.json({ rows });
  });

  /* ===================== Световен бос ===================== */
  /** Текущата седмица (без да я създава), последните седмици и приносите. */
  router.get('/realm-boss', (req, res) => {
    const q = parseQuery(pageQuery.extend({ week: weekKey.optional().or(z.literal('')) }), req, res); if (!q) return;
    const db = getDb();
    const current = isoWeek();
    const week = q.week || current;
    const boss = (db.prepare('SELECT * FROM realm_boss WHERE iso_week = ?').get(week) as RealmBossRow | undefined) ?? null;
    const weeks = db.prepare(`SELECT rb.iso_week, rb.boss_name, rb.hp_max, rb.hp_remaining, rb.cleared_at, rb.settled_at,
      (SELECT COUNT(*) FROM realm_boss_contributions c WHERE c.iso_week = rb.iso_week) AS contributors
      FROM realm_boss rb ORDER BY rb.iso_week DESC LIMIT 12`).all();
    const { rows, ...meta } = listPage(db, {
      select: 'rbc.character_id, c.name, c.class, c.level, rbc.damage, rbc.strikes, rbc.last_strike_at, rbc.claimed_at',
      from: 'realm_boss_contributions rbc JOIN characters c ON c.id = rbc.character_id',
      where: ['rbc.iso_week = ?'], params: [week], orderBy: 'rbc.damage DESC',
      search: { cols: ['c.name'] },
    }, q);
    const next = pickBossForWeek(current);
    res.json({
      week, current_week: current, boss, weeks,
      rotation: { boss_slug: next.slug, boss_name: next.name, hp_max: realmBossHpFor(db, next) },
      bosses: REALM_BOSSES.map((b) => ({ slug: b.slug, name: b.name, level: b.level, hp_floor: b.hp_floor })),
      ...meta, contributions: rows,
    });
  });

  /** Ръчен спаун за ТЕКУЩАТА седмица (ако още няма бос). */
  router.post('/realm-boss/spawn', (req, res) => {
    const body = parseBody(spawnSchema, req, res); if (!body) return;
    const wk = isoWeek();
    const out = inTx(res, 'Realm boss', (db) => {
      const def = body.boss_slug ? findRealmBoss(body.boss_slug) ?? fail(404, 'Unknown realm boss') : pickBossForWeek(wk);
      if (!spawnWeekBoss(db, wk, def, body.hp_max)) fail(409, `This week (${wk}) already has a realm boss — reset or edit it instead.`);
      return db.prepare('SELECT * FROM realm_boss WHERE iso_week = ?').get(wk) as RealmBossRow;
    });
    if (!out) return;
    audit(req, res, { action: 'realm_boss_spawn', targetType: 'realm_boss', level: 'warn', before: { exists: false }, after: { iso_week: wk, boss_slug: out.value.boss_slug, hp_max: out.value.hp_max } });
    res.status(201).json({ ok: true, boss: out.value });
  });

  /**
   * Нулиране на седмицата: пълно HP, без убиец/уреждане, приносите се трият.
   * Ако някой вече е прибрал награда → 409 (иначе би я взел втори път).
   */
  router.post('/realm-boss/:week/reset', destructiveLimiter, (req, res) => {
    const wk = weekKey.safeParse(req.params.week);
    if (!wk.success) { res.status(400).json({ error: 'Invalid week' }); return; }
    const out = inTx(res, 'Realm boss', (db) => {
      const row = (db.prepare('SELECT * FROM realm_boss WHERE iso_week = ?').get(wk.data) as RealmBossRow | undefined) ?? fail(404, 'No realm boss for that week');
      const claimed = (db.prepare('SELECT COUNT(*) AS c FROM realm_boss_contributions WHERE iso_week = ? AND claimed_at > 0').get(wk.data) as { c: number }).c;
      if (claimed > 0) fail(409, `${claimed} hero(es) already claimed rewards for this week — it can no longer be reset.`);
      const removed = db.prepare('DELETE FROM realm_boss_contributions WHERE iso_week = ?').run(wk.data).changes;
      db.prepare('UPDATE realm_boss SET hp_remaining = hp_max, cleared_at = 0, kill_blow_character_id = 0, settled_at = 0 WHERE iso_week = ?').run(wk.data);
      return { row, removed };
    });
    if (!out) return;
    const { row, removed } = out.value;
    audit(req, res, { action: 'realm_boss_reset', targetType: 'realm_boss', level: 'warn', before: { iso_week: row.iso_week, hp_remaining: row.hp_remaining, cleared_at: row.cleared_at, contributions: removed }, after: { hp_remaining: row.hp_max, cleared_at: 0, contributions: 0 } });
    res.json({ ok: true, contributions_removed: removed });
  });

  /** Редакция на HP / края на седмицата (не за убит бос — нулирай го първо). */
  router.put('/realm-boss/:week', (req, res) => {
    const wk = weekKey.safeParse(req.params.week);
    if (!wk.success) { res.status(400).json({ error: 'Invalid week' }); return; }
    const body = parseBody(bossPatchSchema, req, res); if (!body) return;
    const keys = Object.keys(body);
    if (!keys.length) { res.status(400).json({ error: 'No fields to update' }); return; }
    const out = inTx(res, 'Realm boss', (db) => {
      const row = (db.prepare('SELECT * FROM realm_boss WHERE iso_week = ?').get(wk.data) as RealmBossRow | undefined) ?? fail(404, 'No realm boss for that week');
      if (row.cleared_at) fail(409, 'The boss is already slain — reset the week before editing its HP.');
      const m = { ...row, ...body };
      if (m.hp_remaining > m.hp_max) fail(400, 'HP remaining cannot exceed HP max.');
      if (m.ends_at <= m.started_at) fail(400, 'The end must be after the start.');
      db.prepare(`UPDATE realm_boss SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE iso_week = @wk`).run({ ...body, wk: wk.data });
      return row;
    });
    if (!out) return;
    const before = Object.fromEntries(keys.map((k) => [k, (out.value as unknown as Record<string, unknown>)[k]]));
    audit(req, res, { action: 'realm_boss_update', targetType: 'realm_boss', level: 'warn', before, after: body, meta: { iso_week: wk.data } });
    res.json({ ok: true });
  });

  /* ===================== Сезон ===================== */
  router.get('/season', (req, res) => {
    const q = parseQuery(pageQuery.extend({ season: monthKey.optional().or(z.literal('')) }), req, res); if (!q) return;
    const db = getDb();
    const current = seasonKeyFor();
    const season = q.season || current;
    const results = db.prepare('SELECT COUNT(*) AS c FROM season_results WHERE season_key = ?').get(season) as { c: number };
    const participants = (db.prepare(`SELECT COUNT(*) AS c FROM season_scores s JOIN characters c ON c.id = s.character_id AND c.is_npc = 0 WHERE s.season_key = ?`).get(season) as { c: number }).c;
    const { rows, ...meta } = listPage(db, {
      select: `s.character_id, c.name, c.class, c.level, s.points, s.updated_at,
               r.rank AS final_rank, r.reward_gems, r.reward_gold, r.title`,
      from: `season_scores s JOIN characters c ON c.id = s.character_id AND c.is_npc = 0
             LEFT JOIN season_results r ON r.season_key = s.season_key AND r.character_id = s.character_id`,
      where: ['s.season_key = ?'], params: [season], orderBy: 's.points DESC, s.updated_at ASC',
      search: { cols: ['c.name'] },
    }, q);
    // Прогнозна награда по текущия ранг (същата формула като финализацията).
    const offset = (meta.page - 1) * meta.pageSize;
    const standings = rows.map((r, i) => ({ ...r, projected: q.q ? null : rewardForRank(offset + i + 1, participants) }));
    const seasons = db.prepare(`SELECT season_key, COUNT(*) AS players, MAX(points) AS top_points,
      (SELECT COUNT(*) FROM season_results r WHERE r.season_key = s.season_key) AS finalized
      FROM season_scores s GROUP BY season_key ORDER BY season_key DESC LIMIT 24`).all();
    const prev = prevSeasonKey();
    const prevDue = !!db.prepare('SELECT 1 FROM season_scores WHERE season_key = ? LIMIT 1').get(prev)
      && !db.prepare('SELECT 1 FROM season_results WHERE season_key = ? LIMIT 1').get(prev);
    res.json({
      season, current_season: current, ends_at: seasonEndsAt(), finalized: results.c > 0, participants,
      previous: { season: prev, due: prevDue }, seasons, ...meta, standings,
    });
  });

  /**
   * Приключва ПРЕДИШНИЯ сезон сега (иначе го прави първата сезонна заявка в
   * новия месец). Текущият сезон не се затваря предсрочно — играта няма такава
   * логика и тук не се измисля.
   */
  router.post('/season/finalize', destructiveLimiter, (req, res) => {
    const db = getDb();
    const prev = prevSeasonKey();
    const hasScores = db.prepare('SELECT 1 FROM season_scores WHERE season_key = ? LIMIT 1').get(prev);
    if (!hasScores) { res.status(404).json({ error: `Season ${prev} has no scores to finalize.` }); return; }
    if (db.prepare('SELECT 1 FROM season_results WHERE season_key = ? LIMIT 1').get(prev)) { res.status(409).json({ error: `Season ${prev} is already finalized.` }); return; }
    finalizePrevSeasonIfDue(db);
    const n = (db.prepare('SELECT COUNT(*) AS c FROM season_results WHERE season_key = ?').get(prev) as { c: number }).c;
    if (!n) { res.status(409).json({ error: `Season ${prev} could not be finalized (no eligible players).` }); return; }
    audit(req, res, { action: 'season_finalize', targetType: 'season', level: 'warn', before: { season: prev, finalized: false }, after: { season: prev, finalized: true, ranked: n } });
    res.json({ ok: true, season: prev, ranked: n });
  });
}
