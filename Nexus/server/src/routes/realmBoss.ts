import { Router } from 'express';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { deriveStats, buildHeroActor } from '../game/stats';
import { simulateCombat } from '../game/combat';
import { loadEquipped } from '../game/equipment';
import { applyXp } from '../game/progression';
import { applyGuildMultipliers } from '../game/rewards';
import { logFromRequest } from '../lib/logger';
import type { Character } from '../types/domain';

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

/** ISO-week key like "2026-W23". Must match weekly.ts. */
function isoWeek(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}

interface RealmBossDef {
  slug: string;
  name: string;
  flavor: string;
  hp_per_active_char: number; // scales with realm population
  hp_floor: number;
  atk_min: number;
  atk_max: number;
  defense: number;
  speed: number;
  level: number;
  sprite: string;
  drop_slug: string;
}

/** Six bosses rotate weekly. Boss is picked by iso_week hash → modulo. */
const REALM_BOSSES: RealmBossDef[] = [
  { slug: 'rb_thalion',  name: 'Thalion, the Sunless Crown',  flavor: 'A king who outlived his kingdom and forgot how to stop wearing the throne.',
    hp_per_active_char: 80_000, hp_floor: 600_000, level: 250, atk_min: 1100, atk_max: 1800, defense: 380, speed: 7, sprite: 'shadowlord', drop_slug: 'realm_thalion_crown' },
  { slug: 'rb_vethryx',  name: 'Vethryx, the Spine-of-Sky',   flavor: 'A wyrm long enough to wrap the high mountains. Sleeps for centuries, wakes for grudges.',
    hp_per_active_char: 90_000, hp_floor: 700_000, level: 270, atk_min: 1250, atk_max: 2000, defense: 360, speed: 6, sprite: 'drake',      drop_slug: 'realm_vethryx_scale' },
  { slug: 'rb_orsis',    name: 'Orsis, the Drowned God',      flavor: 'The drowned do not stay drowned forever. Orsis just remembered why he sank.',
    hp_per_active_char: 100_000, hp_floor: 800_000, level: 290, atk_min: 1400, atk_max: 2250, defense: 400, speed: 8, sprite: 'serpent',    drop_slug: 'realm_orsis_pendant' },
  { slug: 'rb_kallosh',  name: 'Kallosh, the Marrow-Keeper',  flavor: 'The librarian who ate the books. Knows every spell, casts none, but the dead do walk now.',
    hp_per_active_char: 110_000, hp_floor: 900_000, level: 310, atk_min: 1550, atk_max: 2480, defense: 420, speed: 6, sprite: 'witch',      drop_slug: 'realm_kallosh_grimoire' },
  { slug: 'rb_dawn_unmaker', name: 'The Dawn-Unmaker',       flavor: 'A figure who walks the line of every morning and unmakes one star at a time.',
    hp_per_active_char: 125_000, hp_floor: 1_000_000, level: 330, atk_min: 1750, atk_max: 2800, defense: 460, speed: 8, sprite: 'shadowlord', drop_slug: 'realm_dawn_unmaker_ash' },
  { slug: 'rb_unnamed',  name: 'The One Who Wasn\'t Named',   flavor: 'The clergy refuses to record this name. There is a reason.',
    hp_per_active_char: 140_000, hp_floor: 1_100_000, level: 340, atk_min: 1950, atk_max: 3100, defense: 500, speed: 8, sprite: 'shadowlord', drop_slug: 'realm_unnamed_sigil' },
];

function pickBossForWeek(wk: string): RealmBossDef {
  // Cheap stable hash of the iso-week string → boss index.
  let h = 0;
  for (let i = 0; i < wk.length; i++) h = ((h << 5) - h + wk.charCodeAt(i)) | 0;
  return REALM_BOSSES[Math.abs(h) % REALM_BOSSES.length];
}

/** Lazy-create the week's row if it doesn't exist. */
function ensureWeekBoss(): { iso_week: string; boss_slug: string; boss_name: string; hp_max: number; hp_remaining: number; started_at: number; ends_at: number; cleared_at: number; kill_blow_character_id: number; settled_at: number } {
  const db = getDb();
  const wk = isoWeek();
  let row = db.prepare('SELECT * FROM realm_boss WHERE iso_week = ?').get(wk) as any;
  if (row) return row;
  const boss = pickBossForWeek(wk);
  const activeChars = (db.prepare("SELECT COUNT(*) AS c FROM characters WHERE level >= 100 AND is_npc = 0").get() as { c: number }).c;
  const hp_max = Math.max(boss.hp_floor, boss.hp_per_active_char * Math.max(1, activeChars));
  const started_at = Date.now();
  const now = new Date();
  const days = (8 - (now.getUTCDay() || 7)) % 7 || 7;
  const ends_at = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, 0, 0, 0);
  db.prepare(
    `INSERT INTO realm_boss (iso_week, boss_slug, boss_name, hp_max, hp_remaining, started_at, ends_at)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(iso_week) DO NOTHING`,
  ).run(wk, boss.slug, boss.name, hp_max, hp_max, started_at, ends_at);
  row = db.prepare('SELECT * FROM realm_boss WHERE iso_week = ?').get(wk) as any;
  return row;
}

/** Ensure the unique realm-boss drop items exist in the items table. */
function ensureRealmDropItems() {
  const db = getDb();
  const items: Array<[string, string, string, string, number, number, number, number, number]> = [
    // [slug, name, category, sub_type, hp, mp, primary_stat, atk_min, atk_max]
    ['realm_thalion_crown',     'Sunless Crown of Thalion',         'helm',   '',      420, 150, 24, 0, 0],
    ['realm_vethryx_scale',     'Spine-of-Sky Scaleplate',          'armor',  '',      500, 0,   28, 0, 0],
    ['realm_orsis_pendant',     'Drowned-God Pendant of Orsis',     'amulet', '',      380, 220, 0,  0, 0],
    ['realm_kallosh_grimoire',  "Kallosh's Marrow Grimoire",        'weapon', 'staff', 280, 320, 0,  600, 950],
    ['realm_dawn_unmaker_ash',  'Ash of the Dawn-Unmaker',          'cloak',  '',      460, 280, 22, 0, 0],
    ['realm_unnamed_sigil',     "The Sigil That Wasn't Named",      'ring',   '',      350, 200, 26, 0, 0],
  ];
  for (const [slug, name, cat, sub, hp, mp, primary, amin, amax] of items) {
    const have = db.prepare('SELECT 1 FROM items WHERE slug = ?').get(slug);
    if (have) continue;
    const defense = cat === 'helm' ? 120 : cat === 'armor' ? 140 : cat === 'cloak' ? 90 : 0;
    db.prepare(
      `INSERT INTO items (slug, name, category, sub_type, tier, rarity, level_req, class_req,
         atk_min, atk_max, defense, hp_bonus, mp_bonus, str_bonus, dex_bonus, con_bonus,
         int_bonus, cha_bonus, wis_bonus, heal_hp, heal_mp, buy_price, sell_price, icon, description, set_slug)
       VALUES (?, ?, ?, ?, 10, 'legendary', 250, '', ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, 0, 0, 0, 0, 500000, ?, ?, '')`,
    ).run(
      slug, name, cat, sub, amin, amax, defense, hp, mp,
      cat === 'weapon' || cat === 'armor' || cat === 'ring' ? primary : 0,
      cat === 'helm' || cat === 'cloak' ? Math.floor(primary * 0.7) : 0,
      cat === 'amulet' || cat === 'weapon' && sub === 'staff' ? primary : 0,
      cat === 'helm' ? 'helm' : cat === 'armor' ? 'armor' : cat === 'amulet' ? 'amulet' : cat === 'cloak' ? 'cloak' : cat === 'ring' ? 'ring' : 'staff',
      `One of the six Realm Boss legendaries. Only drops to the hero who lands the killing blow.`,
    );
  }
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
  const result = simulateCombat(hero, foe);
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
