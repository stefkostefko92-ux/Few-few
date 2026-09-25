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
    eff >= 440 ? 12 :
    eff >= 380 ? 11 :
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

/** Дял на дроповете, които са СОБСТВЕНА част от сет (seed/sets.ts → kit).
 *  Останалите 75% теглят от общия пул точно както преди преработката на
 *  сетовете — разпределението на generic дропа не се променя. Частите са
 *  класово филтрирани (class_req), затова героят получава своя сет (или
 *  универсален). Честотата на дропа (DROP_RATES) е същата → няма нов
 *  източник на злато; дубликатът се авто-продава на 20% както всичко. */
export const SET_DROP_SHARE = 0.25;

export type DropBranch = 'generic' | 'set';

const DROP_CATEGORIES = "('weapon','armor','helm','shield','gloves','boots','amulet','ring','cloak')";
/** WHERE клаузата на дроп пула (обща за grantDrop и тестовете/източниците). */
function dropWhere(branch: DropBranch): string {
  return `tier = ?
       AND category IN ${DROP_CATEGORIES}
       AND level_req <= ?
       AND (class_req = '' OR class_req = ?)
       AND ${branch === 'set' ? "set_slug != ''" : "set_slug = ''"}`;
}

/** Всички slug-ове, които даден клон може да изтегли (за тестове/източници). */
export function dropPoolSlugs(
  db: ReturnType<typeof getDb>, tier: number, charLevel: number, charClass: string, branch: DropBranch,
): string[] {
  return (db.prepare(`SELECT slug FROM items WHERE ${dropWhere(branch)} ORDER BY slug`)
    .all(tier, charLevel, charClass || '') as { slug: string }[]).map((r) => r.slug);
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
  const cls = charClass || '';
  const pick = (tier: number, branch: DropBranch) => db.prepare(
    `SELECT id, slug, sell_price FROM items
     WHERE ${dropWhere(branch)}
     ORDER BY RANDOM() LIMIT 1`,
  ).get(tier, charLevel, cls) as { id: number; slug: string; sell_price: number } | undefined;
  // Tier fallback: бой НАД нивото на героя (кула етаж 320 с герой 300,
  // върхът на регион) мапва към tier, чиито предмети имат level_req над
  // героя → заявката е празна и дропът тихо се губеше (симулация: 81
  // мъртви нива при eff = ниво+30). Падаме tier по tier надолу, докато
  // намерим предмет за нивото — наградата се запазва, без over-reward
  // (level_req гейтът пази високите tier-ове недостижими за ниски герои).
  // Сет клон: ако в tier-а няма допустима част (напр. герой lv 60–69 и
  // T4 части с level_req 70), падаме към generic пула на СЪЩИЯ tier.
  const wantSet = Math.random() < SET_DROP_SHARE;
  let picked: { id: number; slug: string; sell_price: number } | undefined;
  for (let tier = tierForEffectiveLevel(effLevel); tier >= 1 && !picked; tier--) {
    if (wantSet) picked = pick(tier, 'set');
    if (!picked) picked = pick(tier, 'generic');
  }
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
 *  baseline (~22% per ~3-6min hunt cooldown = ~2-4 drops/hr), tower and
 *  arena trade slower combat cadence for higher per-fight chance. */
export const DROP_RATES = {
  hunt:    0.22,
  tower:   0.08,
  tower_vault: 0.20, // every 5th floor
  arena:   0.06,
  quest:   0.35,     // only when a quest has a monster kill objective
  mythicplus_stage: 0.10,
} as const;

/**
 * Еднократна (уникална) награда: вписва предмета само ако героят НЕ го
 * притежава в НИКАКВО състояние (чанта, екипиран, обявен на пазара, в
 * гилдийния трезор). Връща true, ако е дадено. Ползва се от APEX дропа и от
 * item_reward на куестовете — преди куестът даваше предмета на всяко
 * повторение, а APEX проверката пропускаше обявените (listed) копия.
 */
export function grantUniqueItem(db: ReturnType<typeof getDb>, characterId: number, slug: string): boolean {
  const item = db.prepare('SELECT id FROM items WHERE slug = ?').get(slug) as { id: number } | undefined;
  if (!item) return false;
  const owned = db.prepare('SELECT 1 FROM inventory WHERE character_id = ? AND item_id = ? LIMIT 1').get(characterId, item.id);
  if (owned) return false;
  db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, '')").run(characterId, item.id);
  return true;
}
