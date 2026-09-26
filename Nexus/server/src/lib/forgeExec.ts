import type Database from 'better-sqlite3';

/**
 * Атомарно изпълнение на един forge enchant. Изнесено от routes/forge.ts, за
 * да е директно тестваемо (анти-lost-update е критично за икономиката).
 *
 * Гаранция: цялото read→charge→roll→write върви в ЕДНА IMMEDIATE транзакция,
 * която препрочита enchant_count/bonuses_json СВЕЖИ (не от преди HTTP
 * заявката) — две паралелни заявки за същия предмет не могат да платят двете
 * за enchant #N+1 и да запишат само единия резултат (lost update).
 */
export const RARITY_WEIGHTS: Record<string, { small: number; medium: number; greater: number; shatter: number }> = {
  common: { small: 55, medium: 25, greater: 10, shatter: 10 },
  uncommon: { small: 50, medium: 28, greater: 12, shatter: 10 },
  rare: { small: 45, medium: 30, greater: 18, shatter: 7 },
  epic: { small: 40, medium: 32, greater: 24, shatter: 4 },
  legendary: { small: 35, medium: 35, greater: 28, shatter: 2 },
};

export const BONUS_STATS = ['str_bonus', 'dex_bonus', 'con_bonus', 'int_bonus', 'cha_bonus', 'wis_bonus', 'hp_bonus', 'mp_bonus', 'defense', 'atk_max'] as const;

export function enchantCost(tier: number, count: number): number {
  return Math.floor(100 * Math.max(1, tier) * Math.pow(1.6, count));
}

export function rollBucket(weights: { small: number; medium: number; greater: number; shatter: number }, rand: () => number = Math.random): 'small' | 'medium' | 'greater' | 'shatter' {
  const r = rand() * 100;
  if (r < weights.small) return 'small';
  if (r < weights.small + weights.medium) return 'medium';
  if (r < weights.small + weights.medium + weights.greater) return 'greater';
  return 'shatter';
}

export interface ForgeTarget {
  inv_id: number;
  item_id: number;
  tier: number;
  rarity: string;
}

export interface ForgeResult {
  outcome: 'shatter' | 'small' | 'medium' | 'greater';
  cost: number;
  bucket: string;
  stat?: string;
  amount?: number;
  newEnchants?: number;
  newBonuses?: Record<string, number>;
  guaranteeUsed: boolean;
  enchantsBefore: number;
}

export class ForgeError extends Error {}

/**
 * @param rand override за детерминистични тестове (иначе Math.random).
 * @param forcedBucket override на изхода за детерминистични тестове.
 */
export function performEnchant(
  db: Database.Database,
  charId: number,
  target: ForgeTarget,
  rand: () => number = Math.random,
  forcedBucket?: 'small' | 'medium' | 'greater' | 'shatter',
): ForgeResult {
  const exec = db.transaction(() => {
    const fresh = db
      .prepare(
        `SELECT COALESCE(e.enchant_count, 0) AS enchant_count, COALESCE(e.bonuses_json, '{}') AS bonuses_json
         FROM inventory inv LEFT JOIN inventory_enchants e ON e.inventory_id = inv.id
         WHERE inv.id = ?`,
      )
      .get(target.inv_id) as { enchant_count: number; bonuses_json: string };
    if (fresh.enchant_count >= 5) throw new ForgeError('This item is fully enchanted.');

    const cost = enchantCost(target.tier, fresh.enchant_count);
    const spent = db
      .prepare('UPDATE characters SET gold = gold - ? WHERE id = ? AND gold >= ?')
      .run(cost, charId, cost);
    if (spent.changes !== 1) throw new ForgeError(`Not enough gold (${cost}g required).`);

    const weights = RARITY_WEIGHTS[target.rarity] || RARITY_WEIGHTS.common;
    let bucket = forcedBucket ?? rollBucket(weights, rand);

    let guaranteeUsed = false;
    if (bucket === 'shatter') {
      const info = db
        .prepare('UPDATE characters SET forge_guarantees = forge_guarantees - 1 WHERE id = ? AND forge_guarantees > 0')
        .run(charId);
      if (info.changes === 1) {
        bucket = 'small';
        guaranteeUsed = true;
      }
    }

    if (bucket === 'shatter') {
      db.prepare('DELETE FROM inventory WHERE id = ?').run(target.inv_id);
      return { outcome: 'shatter' as const, cost, bucket, guaranteeUsed, enchantsBefore: fresh.enchant_count };
    }

    const amount = bucket === 'small' ? 1 : bucket === 'medium' ? 2 : 3;
    const stat = BONUS_STATS[Math.floor(rand() * BONUS_STATS.length)];
    const bonuses = JSON.parse(fresh.bonuses_json || '{}') as Record<string, number>;
    bonuses[stat] = (bonuses[stat] || 0) + amount;

    db.prepare(
      `INSERT INTO inventory_enchants (inventory_id, enchant_count, bonuses_json)
       VALUES (?, ?, ?)
       ON CONFLICT(inventory_id) DO UPDATE SET enchant_count = excluded.enchant_count, bonuses_json = excluded.bonuses_json`,
    ).run(target.inv_id, fresh.enchant_count + 1, JSON.stringify(bonuses));

    return {
      outcome: bucket as 'small' | 'medium' | 'greater', cost, bucket, stat, amount,
      newEnchants: fresh.enchant_count + 1, newBonuses: bonuses, guaranteeUsed,
      enchantsBefore: fresh.enchant_count,
    };
  });
  return exec.immediate();
}
