/**
 * À-la-carte combat-stat add-ons („скилове") за маунтове.
 *
 * ВСЕКИ маунт има 4 докупваеми линии (phys/mag × dmg/def) — по-рано ги имаше
 * само топ маунтът (World Serpent). Стойностите и цените се извеждат С ФОРМУЛА
 * от tier-а на маунта, закотвена в World Serpent (tier 7: 45/35 за 500 гема),
 * така че стълбицата е автоматично последователна: по-висок tier → по-силна
 * линия на пропорционално по-висока цена. Никакви ръчни таблици за баланс.
 *
 * Споделя се между mount маршрута (каталог + покупка) и equipment loader-а
 * (прилагане на купените add-ons върху derived stats).
 */

export type MountAddonKey = 'phys_dmg' | 'phys_def' | 'mag_dmg' | 'mag_def';

export interface MountAddon {
  key: MountAddonKey;
  label: string;
  amount: number;
  gem_cost: number;
  /** Which DerivedStats axis / enchant field this add-on feeds. */
  bonus_field: 'phys_dmg_bonus' | 'phys_def_bonus' | 'mag_dmg_bonus' | 'mag_def_bonus';
}

// Котва: tier 7 (World Serpent) = 45 dmg / 35 def @ 500 гема на линия.
const ANCHOR_TIER = 7;
const ANCHOR_DMG = 45;
const ANCHOR_DEF = 35;
const ANCHOR_COST = 500;

/** Стойност на линия за даден tier (закръглена; минимум 1). */
function amountFor(tier: number, anchor: number): number {
  return Math.max(1, Math.round((anchor * tier) / ANCHOR_TIER));
}

/** Цена на линия за даден tier (закръглена до 10 гема; минимум 50). */
function costFor(tier: number): number {
  return Math.max(50, Math.round((ANCHOR_COST * tier) / ANCHOR_TIER / 10) * 10);
}

/** Генерира 4-те линии за маунт от неговия tier. */
export function addonsForTier(tier: number): MountAddon[] {
  const dmg = amountFor(tier, ANCHOR_DMG);
  const def = amountFor(tier, ANCHOR_DEF);
  const cost = costFor(tier);
  return [
    { key: 'phys_dmg', label: 'Physical Damage',  amount: dmg, gem_cost: cost, bonus_field: 'phys_dmg_bonus' },
    { key: 'phys_def', label: 'Physical Defence', amount: def, gem_cost: cost, bonus_field: 'phys_def_bonus' },
    { key: 'mag_dmg',  label: 'Magical Damage',   amount: dmg, gem_cost: cost, bonus_field: 'mag_dmg_bonus' },
    { key: 'mag_def',  label: 'Magical Defence',  amount: def, gem_cost: cost, bonus_field: 'mag_def_bonus' },
  ];
}

/** slug → tier за всички маунтове (единствен източник: routes/mount.ts MOUNTS;
 *  дублираме мапинга тук, за да няма циклична зависимост route↔game слой). */
export const MOUNT_TIERS: Record<string, number> = {
  mount_riding_horse:   1,
  mount_warhound:       2,
  mount_arcwing_drake:  3,
  mount_solar_courser:  4,
  mount_voidstrider:    5,
  mount_crowned_griffin: 6,
  mount_world_serpent:  7,
};

/** Пълният каталог add-ons: всеки маунт → 4 линии по формулата. */
export const MOUNT_ADDONS: Record<string, MountAddon[]> = Object.fromEntries(
  Object.entries(MOUNT_TIERS).map(([slug, tier]) => [slug, addonsForTier(tier)]),
);
