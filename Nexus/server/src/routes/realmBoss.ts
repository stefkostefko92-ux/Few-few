import { Router } from 'express';
import { getDb } from '../db';
import { REALM_DROP_ITEMS, ensureRuntimeItems } from '../seed/runtimeItems';
import { authRequired } from '../middleware/auth';
import { deriveStats, buildHeroActor } from '../game/stats';
import { simulateCombat } from '../game/combat';
import { liveCombatTuning } from '../game/settings';
import { loadEquipped } from '../game/equipment';
import { applyXp } from '../game/progression';
import { applyGuildMultipliers } from '../game/rewards';
import { logFromRequest } from '../lib/logger';
import type { Character } from '../types/domain';
import { REALM_BOSSES, ensureWeekBoss } from '../game/realmBoss';

/**
 * Weekly Realm Boss — one server-wide boss per ISO week.
 *
 * A six-strong rotation of named bosses paints the wall for endgame
 * activity. The boss has a shared HP pool that every character on the
 * server can hit (one strike per character per 4-hour cooldown). The
 * boss is intentionally over-tuned so a single hero can chip a tenth
 * of a percent off — the realm has to collaborate.
 *
 * The character who lands the killing blow gets a one-of-a-kind drop
 * AND the proportional damage payout. Everyone else who landed at
 * least one strike collects a proportional payout (gold + gems + XP)
 * when the week settles.
 *
 * Reset is implicit: next week's row simply doesn't exist yet.
 */

const router = Router();
router.use(authRequired);

/** Уникалните дропове на realm боса — статовете живеят в seed/runtimeItems.ts
 *  (по кривата, game/itemCurve.ts); UPSERT → стар ред получава текущите
 *  статове и продажна цена и без ре-сийд. */
function ensureRealmDropItems() {
  ensureRuntimeItems(getDb(), REALM_DROP_ITEMS);
}
ensureRealmDropItems();

// Strike cooldown: four hours between contributions. Lets the realm
// see ~6 strikes per active hero across a week.
const STRIKE_COOLDOWN_MS = 4 * 60 * 60 * 1000;

router.get('/', (req, res) => {
  const row = ensureWeekBoss();
  const db = getDb();
  // Top-10 contributor board.
  const top = db
    .prepare(
      `SELECT c.id AS character_id, c.name, c.class, c.level, rbc.damage, rbc.strikes
       FROM realm_boss_contributions rbc
       JOIN characters c ON c.id = rbc.character_id
       WHERE rbc.iso_week = ?
       ORDER BY rbc.damage DESC
       LIMIT 10`,
    ).all(row.iso_week) as any[];
  const ch = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  let mine: any = null;
  let nextStrikeAt = 0;
  if (ch) {
    mine = db.prepare(
      'SELECT damage, strikes, last_strike_at, claimed_at FROM realm_boss_contributions WHERE iso_week = ? AND character_id = ?',
    ).get(row.iso_week, ch.id) || null;
    if (mine) nextStrikeAt = (mine.last_strike_at || 0) + STRIKE_COOLDOWN_MS;
  }
  res.json({
    week: row.iso_week,
    boss: {
      slug: row.boss_slug,
      name: row.boss_name,
      hp_max: row.hp_max,
      hp_remaining: row.hp_remaining,
      ends_at: row.ends_at,
      cleared_at: row.cleared_at || 0,
      kill_blow_character_id: row.kill_blow_character_id || 0,
    },
    top_contributors: top,
    mine,
    next_strike_at: nextStrikeAt,
  });
});

router.post('/strike', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  if (char.level < 100) { res.status(400).json({ error: 'Realm Boss strikes unlock at level 100.' }); return; }
  const row = ensureWeekBoss();
  if (row.cleared_at) { res.status(400).json({ error: 'The boss is already dead this week.' }); return; }
  if (row.ends_at < Date.now()) { res.status(400).json({ error: 'The realm ran out of time.' }); return; }
  const bossDef = REALM_BOSSES.find((b) => b.slug === row.boss_slug)!;
  // Cooldown check (per character).
  const now = Date.now();
  const existing = db.prepare(
    'SELECT damage, strikes, last_strike_at FROM realm_boss_contributions WHERE iso_week = ? AND character_id = ?',
  ).get(row.iso_week, char.id) as { damage: number; strikes: number; last_strike_at: number } | undefined;
  if (existing && now - existing.last_strike_at < STRIKE_COOLDOWN_MS) {
    res.status(429).json({ error: 'Strike cooldown active.', next_at: existing.last_strike_at + STRIKE_COOLDOWN_MS });
    return;
  }
  // Simulate a single round against the boss segment scaled to player HP*4.
  const derived = deriveStats(char, loadEquipped(char.id));
  const hero = buildHeroActor(char, derived, char.hp);
  const segHp = Math.min(row.hp_remaining, derived.hp_max * 4);
  const foe = {
    name: bossDef.name, side: 'foe' as const, level: bossDef.level, hp: segHp, hp_max: segHp,
    atk_min: bossDef.atk_min, atk_max: bossDef.atk_max, defense: bossDef.defense, speed: bossDef.speed,
    crit_chance: 0.08, dodge_chance: 0.02, sprite: bossDef.sprite,
  };
  const result = simulateCombat(hero, foe, liveCombatTuning());
  const damageDealt = Math.max(0, segHp - result.foe.hp);
  // Atomic update — boss HP can't go negative; contribution row CAS-inserted.
  try {
    const out = db.transaction(() => {
      // Decrement boss HP (clamped at zero).
      db.prepare('UPDATE realm_boss SET hp_remaining = MAX(0, hp_remaining - ?) WHERE iso_week = ?')
        .run(damageDealt, row.iso_week);
      // Upsert contribution.
      db.prepare(
        `INSERT INTO realm_boss_contributions (iso_week, character_id, damage, strikes, last_strike_at)
         VALUES (?, ?, ?, 1, ?)
         ON CONFLICT(iso_week, character_id) DO UPDATE SET
           damage = damage + excluded.damage,
           strikes = strikes + 1,
           last_strike_at = excluded.last_strike_at`,
      ).run(row.iso_week, char.id, damageDealt, now);
      // Update hero HP from the segment fight (drained, but never below 1).
      db.prepare('UPDATE characters SET hp = ? WHERE id = ?').run(Math.max(1, result.hero.hp), char.id);
      // Did we land the killing blow?
      const after = db.prepare('SELECT hp_remaining, cleared_at FROM realm_boss WHERE iso_week = ?').get(row.iso_week) as { hp_remaining: number; cleared_at: number };
      let cleared = false;
      if (after.hp_remaining <= 0 && !after.cleared_at) {
        const killBlow = db.prepare('UPDATE realm_boss SET cleared_at = ?, kill_blow_character_id = ? WHERE iso_week = ? AND cleared_at = 0').run(now, char.id, row.iso_week);
        if (killBlow.changes === 1) {
          cleared = true;
          // Killing-blow hero gets the unique legendary instantly.
          const dropItem = db.prepare('SELECT id FROM items WHERE slug = ?').get(bossDef.drop_slug) as { id: number } | undefined;
          if (dropItem) {
            db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, '')").run(char.id, dropItem.id);
          }
        }
      }
      return { cleared, hp_remaining: after.hp_remaining };
    }).immediate();
    logFromRequest(req, {
      category: 'combat', action: out.cleared ? 'realmboss_kill' : 'realmboss_strike',
      character_id: char.id,
      message: `${char.name} struck ${bossDef.name} for ${damageDealt}`,
      meta: { iso_week: row.iso_week, boss: bossDef.slug, damage: damageDealt, cleared: out.cleared },
    });
    res.json({
      ok: true,
      damageDealt,
      hp_remaining: out.hp_remaining,
      cleared: out.cleared,
      kill_drop: out.cleared ? bossDef.drop_slug : null,
      next_strike_at: now + STRIKE_COOLDOWN_MS,
      rounds: result.rounds,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Settle a past week: pay every contributor a share of the pool.
 *  Called lazily — first /claim from anyone triggers it for that week. */
function settleWeek(isoWeekKey: string): void {
  const db = getDb();
  db.transaction(() => {
    const row = db.prepare('SELECT * FROM realm_boss WHERE iso_week = ?').get(isoWeekKey) as any;
    if (!row) return;
    if (row.settled_at) return;
    if (!row.cleared_at && row.ends_at > Date.now()) return; // still in progress
    db.prepare('UPDATE realm_boss SET settled_at = ? WHERE iso_week = ? AND settled_at = 0').run(Date.now(), isoWeekKey);
  }).immediate();
}

router.post('/claim', (req, res) => {
  const wk = req.body?.iso_week as string | undefined;
  if (!wk) { res.status(400).json({ error: 'iso_week required' }); return; }
  settleWeek(wk);
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  try {
    const result = db.transaction(() => {
      const row = db.prepare('SELECT * FROM realm_boss WHERE iso_week = ?').get(wk) as any;
      if (!row) { const e: any = new Error('Unknown week'); e.clientSafe = true; e.status = 404; throw e; }
      if (!row.cleared_at && row.ends_at > Date.now()) { const e: any = new Error('Week is still in progress'); e.clientSafe = true; e.status = 400; throw e; }
      const upd = db.prepare(
        'UPDATE realm_boss_contributions SET claimed_at = ? WHERE iso_week = ? AND character_id = ? AND claimed_at = 0',
      ).run(Date.now(), wk, char.id);
      if (upd.changes !== 1) { const e: any = new Error('Already claimed (or nothing to claim).'); e.clientSafe = true; e.status = 400; throw e; }
      const c = db.prepare('SELECT damage FROM realm_boss_contributions WHERE iso_week = ? AND character_id = ?').get(wk, char.id) as { damage: number };
      // Reward formula: 1g per 100 boss-HP damage dealt + flat 3 gems for
      // any strike + 25 gems if you landed the killing blow + an XP slice
      // scaled to total damage.
      const goldReward = Math.floor(c.damage / 100);
      const gemReward = 3 + (row.kill_blow_character_id === char.id ? 25 : 0);
      const xpReward = Math.floor(c.damage / 50);
      const r = applyGuildMultipliers(char.id, goldReward, xpReward);
      char.gold += r.gold;
      const lvlRes = applyXp(char, r.xp);
      db.prepare(
        `UPDATE characters SET gold = ?, gems = gems + ?, xp = ?, level = ?, stat_points = ?, skill_points = ?,
           hp_max = ?, mp_max = ?, hp = ?, mp = ?, total_gold_earned = total_gold_earned + ?,
           total_xp_earned = total_xp_earned + ?, total_gems_earned = total_gems_earned + ?
         WHERE id = ?`,
      ).run(char.gold, gemReward, char.xp, char.level, char.stat_points, char.skill_points, char.hp_max, char.mp_max, char.hp, char.mp, r.gold, r.xp, gemReward, char.id);
      return { gold: r.gold, gems: gemReward, xp: r.xp, lvlRes };
    }).immediate();
    res.json({ ok: true, ...result });
  } catch (e: any) {
    if (e?.clientSafe) { res.status(e.status || 400).json({ error: e.message }); return; }
    throw e;
  }
});

export default router;
