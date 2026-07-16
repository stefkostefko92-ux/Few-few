import type Database from 'better-sqlite3';
import { ACHIEVEMENTS } from './achievements';
import { trackWeeklyKill } from '../routes/weekly';

export interface CombatOutcome {
  characterId: number;
  victory: boolean;
  kind: 'quest' | 'pvp' | 'pve' | 'hunt' | 'dungeon';
  xpGained: number;
  goldGained: number;
  monsterSlug?: string;
  newItemSlug?: string;
}

export interface UnlockedAchievement {
  slug: string;
  name: string;
  description: string;
  icon: string;
  title?: string;
  goldReward: number;
  xpReward: number;
}

/**
 * Update lifetime counters, bestiary, then evaluate which achievements
 * the character has just newly unlocked. Returns the list of new unlocks
 * (with any title/gold rewards). The caller is responsible for showing
 * them to the user (typically via the API response).
 */
export function applyCombatEvent(db: Database.Database, out: CombatOutcome): UnlockedAchievement[] {
  const now = Date.now();

  // 1. Lifetime counters on the character row.
  const charRow = db.prepare(`SELECT * FROM characters WHERE id = ?`).get(out.characterId) as any;
  if (!charRow) return [];

  const updates: string[] = [];
  const params: any[] = [];
  if (out.victory) {
    updates.push('battles_won = battles_won + 1');
  } else {
    updates.push('battles_lost = battles_lost + 1');
  }
  if (out.xpGained > 0) {
    updates.push('total_xp_earned = total_xp_earned + ?');
    params.push(out.xpGained);
  }
  if (out.goldGained > 0) {
    updates.push('total_gold_earned = total_gold_earned + ?');
    params.push(out.goldGained);
  }
  if (out.victory && out.monsterSlug) {
    updates.push('monsters_slain = monsters_slain + 1');
  }
  if (updates.length) {
    params.push(out.characterId);
    db.prepare(`UPDATE characters SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  // Тик на седмичното предизвикателство (Realm Trial) при победа над
  // чудовище — централизирано тук, за да ловят всички бойни маршрути.
  if (out.victory && out.monsterSlug) {
    try { trackWeeklyKill(out.characterId); } catch { /* weekly table mid-migration */ }
  }

  // 2. Bestiary.
  if (out.victory && out.monsterSlug) {
    const existing = db
      .prepare('SELECT id, kills FROM bestiary WHERE character_id = ? AND monster_slug = ?')
      .get(out.characterId, out.monsterSlug) as { id: number; kills: number } | undefined;
    if (existing) {
      db.prepare('UPDATE bestiary SET kills = kills + 1, last_killed_at = ? WHERE id = ?').run(now, existing.id);
    } else {
      db.prepare(
        'INSERT INTO bestiary (character_id, monster_slug, kills, first_killed_at, last_killed_at) VALUES (?, ?, 1, ?, ?)',
      ).run(out.characterId, out.monsterSlug, now, now);
    }
  }

  // 3. Evaluate achievements.
  return evaluateAchievements(db, out.characterId);
}

export function evaluateAchievements(db: Database.Database, characterId: number): UnlockedAchievement[] {
  const ch = db.prepare(`SELECT * FROM characters WHERE id = ?`).get(characterId) as any;
  if (!ch) return [];

  const uniqueBestiary = (db.prepare('SELECT COUNT(*) AS c FROM bestiary WHERE character_id = ?').get(characterId) as { c: number }).c;
  const dailyState = db.prepare('SELECT streak FROM daily_state WHERE character_id = ?').get(characterId) as { streak: number } | undefined;
  const legendaryOwned = !!db
    .prepare(
      `SELECT 1 FROM inventory inv JOIN items i ON inv.item_id = i.id
       WHERE inv.character_id = ? AND i.rarity = 'legendary' LIMIT 1`,
    )
    .get(characterId);

  const snap = {
    level: ch.level as number,
    monsters_slain: ch.monsters_slain as number,
    battles_won: ch.battles_won as number,
    battles_lost: ch.battles_lost as number,
    total_xp_earned: ch.total_xp_earned as number,
    total_gold_earned: ch.total_gold_earned as number,
    dungeons_cleared: ch.dungeons_cleared as number,
    arena_rating: ch.arena_rating as number,
    unique_bestiary: uniqueBestiary,
    streak: dailyState?.streak ?? 0,
    legendary_owned: legendaryOwned,
  };

  const haveSet = new Set(
    (db.prepare('SELECT slug FROM achievements WHERE character_id = ?').all(characterId) as { slug: string }[]).map(
      (r) => r.slug,
    ),
  );

  const now = Date.now();
  const unlocked: UnlockedAchievement[] = [];
  const insert = db.prepare(
    'INSERT OR IGNORE INTO achievements (character_id, slug, unlocked_at) VALUES (?, ?, ?)',
  );

  for (const def of ACHIEVEMENTS) {
    if (haveSet.has(def.slug)) continue;
    if (!def.unlockedAt(snap)) continue;
    insert.run(characterId, def.slug, now);
    unlocked.push({
      slug: def.slug,
      name: def.name,
      description: def.description,
      icon: def.icon,
      title: def.title,
      goldReward: def.goldReward ?? 0,
      xpReward: def.xpReward ?? 0,
    });
  }

  if (unlocked.length) {
    const totalGold = unlocked.reduce((s, u) => s + (u.goldReward || 0), 0);
    const totalXp = unlocked.reduce((s, u) => s + (u.xpReward || 0), 0);
    if (totalGold || totalXp) {
      // Apply gold directly, and use applyXp so awarded XP properly levels up the character.
      const fresh = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId) as any;
      if (fresh) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { applyXp } = require('./progression') as typeof import('./progression');
        applyXp(fresh, totalXp);
        fresh.gold += totalGold;
        db.prepare(
          'UPDATE characters SET gold = ?, xp = ?, level = ?, stat_points = ?, skill_points = ?, hp_max = ?, mp_max = ?, hp = ?, mp = ?, total_gold_earned = total_gold_earned + ?, total_xp_earned = total_xp_earned + ? WHERE id = ?'
        ).run(
          fresh.gold, fresh.xp, fresh.level, fresh.stat_points, fresh.skill_points,
          fresh.hp_max, fresh.mp_max, fresh.hp, fresh.mp,
          totalGold, totalXp, characterId,
        );
      }
    }
    // Mail-style achievement summary
    for (const u of unlocked) {
      db.prepare(
        'INSERT INTO mail (character_id, from_name, subject, body, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(
        characterId,
        'Heralds of the Crown',
        `Achievement Unlocked — ${u.name}`,
        `${u.icon}  ${u.description}\n${u.title ? `\nTitle earned: "${u.title}"` : ''}${u.goldReward ? `\n+${u.goldReward} gold` : ''}${u.xpReward ? `\n+${u.xpReward} XP` : ''}`,
        Date.now(),
      );
    }
  }

  return unlocked;
}
