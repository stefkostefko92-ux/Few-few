import { VIP_TIERS, type VipTier } from "./constants.js";
import { VIP_PERKS, dailyReward, type VipPerks } from "./economy.js";

/**
 * Прилагане на VIP предимствата (§11.2) — чисти функции, споделени от API и
 * realtime, за да няма разминаване между обещаното в магазина и начисленото.
 * Всички предимства са комфорт (опит, дневен бонус, повече задачи), никога
 * игрово предимство.
 */

const isVipTier = (v: unknown): v is VipTier =>
  typeof v === "string" && (VIP_TIERS as readonly string[]).includes(v);

/**
 * Реално активното VIP ниво. Абонаментите пазят `vipUntil`; изтекъл абонамент
 * (дата в миналото) не дава нищо, дори уебхукът за прекратяване да не е
 * пристигнал. `vipUntil = null` при ниво ≠ NONE е ръчно (админско) безсрочно
 * присвояване и остава в сила.
 */
export function effectiveVipTier(
  tier: string | null | undefined,
  vipUntil: Date | string | null | undefined,
  now: Date = new Date(),
): VipTier {
  if (!isVipTier(tier) || tier === "NONE") return "NONE";
  if (vipUntil === null || vipUntil === undefined) return tier;
  const until = vipUntil instanceof Date ? vipUntil : new Date(vipUntil);
  if (Number.isNaN(until.getTime())) return "NONE";
  return until.getTime() > now.getTime() ? tier : "NONE";
}

/** Предимствата, които потребителят реално получава в момента. */
export function vipPerksFor(
  tier: string | null | undefined,
  vipUntil: Date | string | null | undefined,
  now: Date = new Date(),
): VipPerks {
  return VIP_PERKS[effectiveVipTier(tier, vipUntil, now)];
}

/** Опит след VIP множителя (цяло число, никога под базовия). */
export function applyXpMultiplier(baseXp: number, perks: VipPerks): number {
  const base = Math.max(0, Math.floor(baseXp));
  return Math.max(base, Math.round(base * perks.xpMultiplier));
}

/** Дневният бонус с VIP множителя върху чиповете (камъните не се умножават). */
export function vipDailyReward(streakDay: number, perks: VipPerks): { chips: number; gems: number } {
  const base = dailyReward(streakDay);
  return { chips: Math.max(base.chips, Math.round(base.chips * perks.dailyChipMultiplier)), gems: base.gems };
}

/**
 * Допълнителни ротиращи дневни задачи спрямо безплатния профил. Слотовете в
 * `VIP_PERKS` са броят ротиращи игрови дневни задачи (NONE = базовите 3);
 * основните дневни/седмични задачи са винаги налични отгоре.
 */
export function extraQuestSlots(perks: VipPerks): number {
  return Math.max(0, perks.questSlots - VIP_PERKS.NONE.questSlots);
}
