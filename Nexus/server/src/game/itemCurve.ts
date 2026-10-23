/**
 * Кривата на силата на екипировката — ЕДНО място за правилото, което пази
 * уникатите (APEX трофеи, фракционни Exalted, realm boss, сезонни трофеи,
 * Tower of Trials, куест уникати като Dragonbane) да не доминират.
 *
 * Правило: екипируем предмет на ниво L е най-много CURVE_TOLERANCE (+15%)
 * над общия (generic) предмет на СЛЕДВАЩИЯ тир за същия слот —
 *   • основен стат: оръжие → atk_max; броня/шлем/щит/… → def + hp;
 *   • общ бюджет (вторичните статове в същия бюджет): curveScore(), същата
 *     претегляне като кривата на сетовете (__tests__/sets.test.ts):
 *     def + hp/4 + atk_min + atk_max + 2·атрибути (MP не е боен стат).
 * „Следващ тир" = общите предмети на слота с най-малкото level_req > L
 * (над върха на кривата — най-високият общ предмет на слота).
 *
 * Общ предмет = в магазина (buy_price > 0) и не е собствена част на сет
 * (set_slug ''). Уникат = екипируем, извън магазина и извън сетовете.
 * Чиста функция (без БД) — ползват я тестовете и scripts/.
 */

export const EQUIP_CATEGORIES = ['weapon', 'shield', 'helm', 'armor', 'gloves', 'boots', 'cloak', 'ring', 'amulet'] as const;
/** Твърдият таван (тестът); уникатите се калибрират на ~+10%, за да има запас. */
export const CURVE_TOLERANCE = 1.15;

export interface CurveItem {
  slug: string; category: string; level_req: number; buy_price: number; set_slug?: string;
  atk_min: number; atk_max: number; defense: number; hp_bonus: number;
  str_bonus: number; dex_bonus: number; con_bonus: number; int_bonus: number; cha_bonus: number; wis_bonus: number;
}

const ATTRS = ['str_bonus', 'dex_bonus', 'con_bonus', 'int_bonus', 'cha_bonus', 'wis_bonus'] as const;

export const isEquip = (i: { category: string }): boolean => (EQUIP_CATEGORIES as readonly string[]).includes(i.category);
export const isGeneric = (i: CurveItem): boolean => isEquip(i) && i.buy_price > 0 && !i.set_slug;
export const isUnique = (i: CurveItem): boolean => isEquip(i) && i.buy_price <= 0 && !i.set_slug;

export const attrSum = (i: CurveItem): number => ATTRS.reduce((s, k) => s + (i[k] || 0), 0);
/** Основният стат по слот. */
export const primaryStat = (i: CurveItem): number => (i.category === 'weapon' ? i.atk_max : i.defense + i.hp_bonus);
/** Общият боен бюджет на предмета (единици ≈ hp/4). */
export const curveScore = (i: CurveItem): number =>
  i.defense + i.hp_bonus / 4 + i.atk_min + i.atk_max + 2 * attrSum(i);

export interface CurveRef { level: number; slugs: string[]; primary: number; score: number }

/** Референцията „следващ тир" за слота на предмета (по ниво L). */
export function nextTierRef(pool: readonly CurveItem[], category: string, level: number): CurveRef | null {
  const gen = pool.filter((g) => g.category === category && isGeneric(g));
  if (!gen.length) return null;
  const above = gen.filter((g) => g.level_req > level);
  const lvl = above.length
    ? Math.min(...above.map((g) => g.level_req))
    : Math.max(...gen.map((g) => g.level_req));
  const band = gen.filter((g) => g.level_req === lvl);
  return {
    level: lvl,
    slugs: band.map((g) => g.slug),
    primary: Math.max(...band.map(primaryStat)),
    score: Math.max(...band.map(curveScore)),
  };
}

export interface CurveCheck { slug: string; ref: CurveRef; primaryRatio: number; scoreRatio: number }

/** Съотношенията на предмета спрямо следващия тир (1.0 = точно на тира). */
export function curveCheck(pool: readonly CurveItem[], it: CurveItem): CurveCheck | null {
  const ref = nextTierRef(pool, it.category, it.level_req);
  if (!ref) return null;
  return {
    slug: it.slug, ref,
    primaryRatio: ref.primary > 0 ? primaryStat(it) / ref.primary : 0,
    scoreRatio: ref.score > 0 ? curveScore(it) / ref.score : 0,
  };
}
