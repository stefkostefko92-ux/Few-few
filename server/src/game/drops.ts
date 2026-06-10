import { getDb } from '../db';

/**
 * Unified drop helper. Every system that grants a random item (hunt,
 * tower, arena, quest, mythic+ filler) should call rollDrop() instead
 * of hand-rolling its own pool query. This keeps three things consistent
 * across the realm:
 *
 *   1. Tier mapping by effective level — `effLevel >= 320` -> T10, etc.
 *      Identical to the hunting.ts mapping so a tower floor 320 foe
 *      drops the same tier as a hunting kill at lv 320.
 *   2. Player gating — drops respect `level_req <= char.level` and
 *      `class_req` so a lv 5 hero can never roll a Lv 50 legendary.
 *   3. Duplicate handling — owners of an unequipped copy get auto-
 *      vendored for 20% sell_price (the round-1 balance landmine fix);
 *      same refund rate everywhere.
 */

export function tierForEffectiveLevel(eff: number): number {
  return (
    eff >= 320 ? 10 :
    eff >= 280 ? 9  :
    eff >= 230 ? 8  :
    eff >= 180 ? 7  :
    eff >= 130 ? 6  :
    eff >= 95  ? 5  :
    eff >= 60  ? 4  :
    eff >= 25  ? 3  :
    eff >= 12  ? 2  : 1
  );
}

export interface DropResult {
  slug: string | null;       // null = nothing rolled
  duplicate: boolean;        // true => auto-vendored, no inventory grant
  refundGold: number;        // 0 unless duplicate
  itemId?: number;
}

/** Roll a single drop. The CALLER is expected to have already decided
 *  the drop fires (rolled the probability gate). This helper just
 *  picks the right item, grants it (or auto-vendors a duplicate), and
 *  returns the outcome.
 *
 *  Set `effLevel` to the source-of-truth level for tier mapping —
 *  monster level for hunt, floor level for tower, opponent level for
 *  arena, quest.monster level for quest kills.
 */
export function grantDrop(
  characterId: number,
  charLevel: number,
  charClass: string,
  effLevel: number,
): DropResult {
  const db = getDb();
  const tier = tierForEffectiveLevel(effLevel);
  const cls = charClass || '';
  const pick = (whereExtra: string) => db.prepare(
    `SELECT id, slug, sell_price FROM items
     WHERE tier = ?
       AND category IN ('weapon','armor','helm','shield','gloves','boots','amulet','ring','cloak')
       AND level_req <= ?
       AND (class_req = '' OR class_req = ?)
       ${whereExtra}
     ORDER BY RANDOM() LIMIT 1`,
  ).get(tier, charLevel, cls) as { id: number; slug: string; sell_price: number } | undefined;
  const picked = pick('') || pick("AND class_req = ''");
  if (!picked) return { slug: null, duplicate: false, refundGold: 0 };
  // Duplicate gate — match the hunting.ts dedup behaviour exactly.
  const owned = db.prepare(
    'SELECT id FROM inventory WHERE character_id=? AND item_id=? AND listed=0 LIMIT 1',
  ).get(characterId, picked.id) as { id: number } | undefined;
  if (owned) {
    const refund = Math.max(1, Math.floor((picked.sell_price || 0) * 0.2));
    db.prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(refund, characterId);
    return { slug: picked.slug + '_dup', duplicate: true, refundGold: refund, itemId: picked.id };
  }
  db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, '')")
    .run(characterId, picked.id);
  return { slug: picked.slug, duplicate: false, refundGold: 0, itemId: picked.id };
}

/** Unified drop probabilities by source. Tuned so the drop-per-hour
 *  rate is roughly comparable across all activities — hunting is the
 *  baseline (~22% per ~5-12min cooldown = ~1-2 drops/hr), tower and
 *  arena trade slower combat cadence for higher per-fight chance. */
export const DROP_RATES = {
  hunt:    0.22,
  tower:   0.08,
  tower_vault: 0.20, // every 5th floor
  arena:   0.06,
  quest:   0.35,     // only when a quest has a monster kill objective
  mythicplus_stage: 0.10,
} as const;
