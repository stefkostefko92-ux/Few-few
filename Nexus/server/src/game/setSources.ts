/**
 * Източници на придобиване на предмет (за частите на сетовете) — изведени от
 * СЪЩИТЕ сийд данни, които ползват маршрутите, затова не могат да се
 * разминат с реалността:
 *
 *   shop                  — buy_price > 0 (routes/shop.ts показва всичко такова)
 *   drop:T<n>             — grantDrop (лов · кула · арена · куест), game/drops.ts:
 *                           tier = tierForEffectiveLevel(ниво на противника);
 *                           собствените части на сет идват от сет клона
 *                           (SET_DROP_SHARE), общите — от generic клона
 *   dungeon:<slug>        — loot_pool на подземието (seed/dungeons.ts)
 *   mythic_plus:<slug>    — milestone дропът на всеки 10-и Mythic+ tier (същият пул)
 *   quest:<slug>          — item_reward на куест
 *
 * Чиста функция (без БД) → ползва се от /api/sets и от тестовете.
 */
import { ITEM_SEED } from '../seed/items';
import { DUNGEONS } from '../seed/dungeons';
import { QUEST_SEED } from '../seed/quests';
import { tierForEffectiveLevel } from './drops';

const EQUIP = new Set(['weapon', 'armor', 'helm', 'shield', 'gloves', 'boots', 'amulet', 'ring', 'cloak']);
/** Най-високото ниво на противник/герой, което играта генерира днес. */
export const MAX_CONTENT_LEVEL = 500;

type SeedRow = { slug: string; category: string; tier: number; level_req: number; buy_price: number };
const bySlug = new Map((ITEM_SEED as SeedRow[]).map((i) => [i.slug, i]));

/** Има ли ниво на противника ≤ MAX_CONTENT_LEVEL, което мапва към този tier. */
function tierReachable(tier: number): boolean {
  for (let eff = 1; eff <= MAX_CONTENT_LEVEL; eff++) if (tierForEffectiveLevel(eff) === tier) return true;
  return false;
}

let cache: Map<string, string[]> | null = null;
function build(): Map<string, string[]> {
  const m = new Map<string, string[]>();
  const add = (slug: string, src: string) => {
    const arr = m.get(slug) ?? [];
    if (!arr.includes(src)) arr.push(src);
    m.set(slug, arr);
  };
  for (const it of bySlug.values()) {
    if (it.buy_price > 0) add(it.slug, 'shop');
    if (EQUIP.has(it.category) && it.level_req <= MAX_CONTENT_LEVEL && tierReachable(it.tier)) add(it.slug, `drop:T${it.tier}`);
  }
  for (const d of DUNGEONS) {
    for (const slug of d.loot_pool) {
      add(slug, `dungeon:${d.slug}`);
      add(slug, `mythic_plus:${d.slug}`);
    }
  }
  for (const q of QUEST_SEED as { slug: string; item_reward?: string }[]) {
    if (q.item_reward) add(q.item_reward, `quest:${q.slug}`);
  }
  return m;
}

/** Източниците на предмета (празен масив = непридобиваем от сийд данните). */
export function itemSources(slug: string): string[] {
  if (!cache) cache = build();
  return cache.get(slug) ?? [];
}
