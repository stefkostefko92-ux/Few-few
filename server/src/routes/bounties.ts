import { Router } from 'express';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { applyXp } from '../game/progression';
import { logFromRequest } from '../lib/logger';
import { trackBattlePass } from './battlepass';
import { applyGuildMultipliers } from '../game/rewards';
import type { Character, Monster } from '../types/domain';

const router = Router();
router.use(authRequired);

/* =========================================================================
 * Bounty Board — daily refreshing hunt contracts.
 *
 * Every UTC day each character is issued three bounties scaled to their
 * level: easy / standard / brutal. Targets are picked from monsters the
 * character can plausibly hunt (level_req ≤ char.level + 2). Each kill in
 * the Hunting Grounds (see hunting.ts) is forwarded here through
 * applyBountyKill() so the player doesn't have to "report" anything; their
 * progress just ticks up.
 *
 * Rewards on claim:
 *   gold   — payout × tier
 *   xp     — payout × tier
 *   trophy — a "monster_trophy" inventory entry (sellable, soul-bound = 0)
 *
 * The connection is tight by design:
 *   Hunting → kills feed bounties.
 *   Bounty claim → coins for the Shop, XP for level, trophy for Market.
 *
 * Bounties expire at next UTC day boundary. The simplest reset is just
 * "if today's row is missing, generate one"; old days stay in the table
 * for the audit log.
 * ======================================================================= */

interface Bounty {
  id: string;            // stable per-day id ("woods-goblin-3")
  monster_slug: string;
  monster_name: string;
  region: string;
  count_required: number;
  count_done: number;
  tier: 'easy' | 'standard' | 'brutal';
  reward: { gold: number; xp: number; trophy: number };
  claimed: boolean;
}

function dayIndex(now: number = Date.now()): number { return Math.floor(now / 86_400_000); }
function ordinalDay() { return new Date().toISOString().slice(0, 10); }

function pickMonsters(char: Character): Monster[] {
  // The hunt mostly draws from level-appropriate monsters. We pull from one
  // level band lower (so the easy bounty is achievable solo) up to two
  // bands higher (brutal pushes the hero).
  const min = Math.max(1, char.level - 2);
  const max = char.level + 2;
  return getDb()
    .prepare(
      `SELECT * FROM monsters WHERE level BETWEEN ? AND ?
       ORDER BY level ASC, RANDOM()`,
    )
    .all(min, max) as Monster[];
}

function generateDailyBounties(char: Character): Bounty[] {
  const pool = pickMonsters(char);
  if (pool.length === 0) return [];

  const tiers: Bounty['tier'][] = ['easy', 'standard', 'brutal'];
  const countByTier = { easy: 5, standard: 8, brutal: 12 };
  const goldByTier  = { easy: 1.0, standard: 1.6, brutal: 2.6 };
  const xpByTier    = { easy: 1.0, standard: 1.6, brutal: 2.4 };

  // Spread the three daily picks across distinct monsters when possible.
  // If the pool is smaller than 3, the loop falls through and we reuse.
  const seed = dayIndex() * 7919 + char.id;
  const used = new Set<number>();
  const chosen: Monster[] = [];
  let step = 0;
  while (chosen.length < 3 && step < pool.length * 3) {
    const idx = (seed + step * 113) % pool.length;
    if (!used.has(idx)) { used.add(idx); chosen.push(pool[idx]); }
    step++;
  }
  while (chosen.length < 3) chosen.push(pool[chosen.length % pool.length]);

  return tiers.map((tier, i) => {
    const m = chosen[i] || pool[0];
    return {
      id: `${ordinalDay()}-${tier}-${m.slug}`,
      monster_slug: m.slug,
      monster_name: m.name,
      region: m.region,
      count_required: countByTier[tier],
      count_done: 0,
      tier,
      reward: {
        gold:   Math.round((25 + char.level * 3) * goldByTier[tier]),
        xp:     Math.round((30 + char.level * 4) * xpByTier[tier]),
        trophy: tier === 'brutal' ? 2 : 1,
      },
      claimed: false,
    };
  });
}

function loadOrIssueBounties(char: Character): Bounty[] {
  const db = getDb();
  const today = dayIndex();
  const row = db
    .prepare('SELECT bounties_json FROM character_bounties WHERE character_id = ? AND day_index = ?')
    .get(char.id, today) as { bounties_json: string } | undefined;
  if (row) {
    const parsed = JSON.parse(row.bounties_json) as Bounty[];
    // A non-empty cached board is good. An EMPTY one means it was generated
    // while the monsters table had no rows (fresh server) — regenerate now.
    if (parsed.length > 0) return parsed;
  }
  const fresh = generateDailyBounties(char);
  db.prepare(
    `INSERT INTO character_bounties (character_id, day_index, bounties_json) VALUES (?, ?, ?)
     ON CONFLICT(character_id, day_index) DO UPDATE SET bounties_json = excluded.bounties_json`,
  ).run(char.id, today, JSON.stringify(fresh));
  return fresh;
}

function saveBounties(charId: number, bounties: Bounty[]): void {
  const today = dayIndex();
  getDb()
    .prepare('UPDATE character_bounties SET bounties_json = ? WHERE character_id = ? AND day_index = ?')
    .run(JSON.stringify(bounties), charId, today);
}

/**
 * Called from hunting.ts after every successful kill. Looks up today's
 * active bounties for the character, increments any whose target matches
 * the slain monster, and persists.
 *
 * Returns a list of bounty ids that *just* reached completion so the
 * caller can show a "Bounty complete!" toast.
 */
export function applyBountyKill(char: Character, monsterSlug: string): string[] {
  const bounties = loadOrIssueBounties(char);
  const completed: string[] = [];
  let dirty = false;
  for (const b of bounties) {
    if (b.claimed || b.count_done >= b.count_required) continue;
    if (b.monster_slug !== monsterSlug) continue;
    b.count_done += 1;
    dirty = true;
    if (b.count_done === b.count_required) completed.push(b.id);
  }
  if (dirty) saveBounties(char.id, bounties);
  return completed;
}

router.get('/', (req, res) => {
  const char = getDb().prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  res.json({ bounties: loadOrIssueBounties(char), refresh_at: (dayIndex() + 1) * 86_400_000 });
});

router.post('/claim', (req, res) => {
  const id = String(req.body?.id || '');
  if (!id) { res.status(400).json({ error: 'Missing bounty id' }); return; }
  const db = getDb();
  const ch = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!ch) { res.status(404).json({ error: 'No character' }); return; }
  // Audit (backend round): old flow read the bounties_json blob, marked
  // claimed in-memory, then wrote back — two concurrent claims of the
  // same bounty both saw claimed=false and double-granted (especially
  // brutal-tier bounties: 4x gold + extra trophies). Now wrapped in
  // BEGIN IMMEDIATE and gated on a JSON CAS: only the writer whose old
  // bounties_json matches what we read wins, so the loser sees
  // claimed=true on re-read and bails.
  try {
    const result = db.transaction(() => {
      const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(ch.id) as Character;
      const bountiesBefore = loadOrIssueBounties(char);
      const oldJson = db.prepare('SELECT bounties_json FROM character_bounties WHERE character_id = ? AND day_index = ?').get(ch.id, dayIndex()) as { bounties_json: string } | undefined;
      const b = bountiesBefore.find((x) => x.id === id);
      if (!b) { const e: any = new Error('Bounty not found'); e.clientSafe = true; e.status = 404; throw e; }
      if (b.claimed) { const e: any = new Error('Already claimed'); e.clientSafe = true; e.status = 400; throw e; }
      if (b.count_done < b.count_required) { const e: any = new Error(`Need ${b.count_required - b.count_done} more ${b.monster_name} kills.`); e.clientSafe = true; e.status = 400; throw e; }
      const reward = applyGuildMultipliers(char.id, b.reward.gold, b.reward.xp);
      char.gold += reward.gold;
      const lvlRes = applyXp(char, reward.xp);
      db.prepare(
        `UPDATE characters SET gold = ?, xp = ?, level = ?, stat_points = ?, skill_points = ?,
           hp_max = ?, mp_max = ?, hp = hp_max, mp = mp_max WHERE id = ?`,
      ).run(char.gold, char.xp, char.level, char.stat_points, char.skill_points, char.hp_max, char.mp_max, char.id);
      b.claimed = true;
      const newJson = JSON.stringify(bountiesBefore);
      const upd = db.prepare('UPDATE character_bounties SET bounties_json = ? WHERE character_id = ? AND day_index = ? AND bounties_json = ?')
        .run(newJson, ch.id, dayIndex(), oldJson?.bounties_json ?? '');
      if (upd.changes !== 1) { const e: any = new Error('Already claimed'); e.clientSafe = true; e.status = 400; throw e; }
      // Mint trophies.
      db.prepare(
        `INSERT OR IGNORE INTO items (slug, name, category, sub_type, tier, rarity, level_req, class_req,
           atk_min, atk_max, defense, hp_bonus, mp_bonus, str_bonus, dex_bonus, con_bonus,
           int_bonus, cha_bonus, wis_bonus, heal_hp, heal_mp, buy_price, sell_price, icon, description, set_slug)
         VALUES ('monster_trophy', 'Monster Trophy', 'misc', '', 1, 'uncommon', 1, '',
                 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 35, 'icon-skull',
                 'A grisly memento of the hunt. Buyable on the market or sold for coin.', '')`,
      ).run();
      const trophyId = (db.prepare("SELECT id FROM items WHERE slug = 'monster_trophy'").get() as any).id;
      for (let i = 0; i < b.reward.trophy; i++) {
        db.prepare('INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, \'\')').run(char.id, trophyId);
      }
      return { b, reward, lvlRes, charName: char.name };
    }).immediate();
    trackBattlePass(ch.id, 'bounty_claim', 1);
    logFromRequest(req, {
      category: 'character', action: 'bounty_claim',
      character_id: ch.id,
      message: `${result.charName} claimed bounty: ${result.b.monster_name} ×${result.b.count_required}`,
      meta: { id: result.b.id, tier: result.b.tier, monster: result.b.monster_slug, gold: result.reward.gold, xp: result.reward.xp, trophies: result.b.reward.trophy },
    });
    res.json({
      ok: true,
      gold: result.reward.gold,
      xp: result.reward.xp,
      trophy: result.b.reward.trophy,
      levelUp: result.lvlRes && result.lvlRes.leveled ? result.lvlRes : null,
    });
  } catch (e: any) {
    if (e?.clientSafe) { res.status(e.status || 400).json({ error: e.message }); return; }
    throw e;
  }
});

export default router;
