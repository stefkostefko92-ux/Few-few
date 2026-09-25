/**
 * Чисти наградни формули — единствен източник на истина за маршрутите
 * (hunting / quest / arena / tower / dungeon / mythicPlus) И за баланс
 * харнеса (__tests__/balanceHarness.ts). Никакъв достъп до БД тук: всичко е
 * детерминистична функция от входа, за да се мери и тества директно.
 */
import { paceXpForKill } from './progression';

/* ───────────── Лов ───────────── */

/**
 * APEX XP таван: × pace на нивото на боса. Seed-ът дава ~5× pace. Мерено с
 * харнеса (фаза 2 + този одит): с пълен класов сет APEX-ът се печели 50–98%
 * на своето ниво, а се среща с APEX_ENCOUNTER_CHANCE (20%) само в ±3 нива →
 * при 5× ловът в прозореца даваше ~1.6× XP/ч (≈ +4 нива на регион, ×16
 * региона) — отделно от уникалния легендарен предмет и 20× фракционната
 * репутация, които са истинската награда на боса. 3× пази APEX-а най-
 * доходното единично убийство (над 1.8× тавана на обикновените), но
 * прозорецът пада до ~1.3×.
 */
export const APEX_XP_PACE_MULT = 3;

/** Per-kill XP: клампнат в темпова лента 0.6×–1.8× pace; APEX — до
 *  APEX_XP_PACE_MULT × pace (премийна, но ограничена награда). */
export function huntKillXp(monsterLevel: number, seedXp: number, isApex: boolean): number {
  if (isApex) return Math.min(seedXp, Math.round(paceXpForKill(monsterLevel) * APEX_XP_PACE_MULT));
  const pace = paceXpForKill(monsterLevel);
  return Math.max(Math.round(pace * 0.6), Math.min(Math.round(pace * 1.8), seedXp));
}

/* ───────────── Куестове ───────────── */

export interface QuestLike { level_req: number; xp_reward: number; gold_reward: number }
export interface MonsterLike { level: number; xp_reward: number; gold_min: number; gold_max: number }

/** Таван на „дизайнерската" XP на куест: 3× pace на входното му ниво.
 *  Expansion куестовете са ~2.5× (под тавана → непроменени); act-1 seed-ът
 *  стигаше до 30× (shadowfell 3000 XP) и се фармеше безкрайно на всяко ниво. */
export const QUEST_XP_PACE_CAP = 3;
/** Таван на куест-златото: 2× средното злато на целевото чудовище. */
export const QUEST_GOLD_MONSTER_CAP = 2;

export function questBaseXp(q: QuestLike): number {
  return Math.min(q.xp_reward, Math.round(paceXpForKill(q.level_req) * QUEST_XP_PACE_CAP));
}

export function questBaseGold(q: QuestLike, monster?: MonsterLike | null): number {
  if (!monster) return q.gold_reward;
  const avg = (monster.gold_min + monster.gold_max) / 2;
  return Math.min(q.gold_reward, Math.round(avg * QUEST_GOLD_MONSTER_CAP));
}

/** XP на победен бойни куест: куест-частта + пейс-клампнатата XP на чудовището. */
export function questCombatXp(q: QuestLike, monster: MonsterLike): number {
  return questBaseXp(q) + Math.min(Math.round(paceXpForKill(monster.level) * 1.8), monster.xp_reward);
}

/** Загуба на куест: −10% злато, но не повече от наградата на куеста
 *  (рискът е съразмерен на залога, не на цялото състояние на героя). */
export function questLossPenalty(currentGold: number, q: QuestLike): number {
  return Math.max(0, Math.min(Math.floor(currentGold * 0.1), q.gold_reward));
}

/* ───────────── Арена ───────────── */

export function arenaReward(oppLevel: number): { xp: number; gold: number } {
  return {
    xp: Math.min(Math.round(paceXpForKill(oppLevel) * 1.8), 25 + oppLevel * 5),
    gold: 12 + oppLevel * 6,
  };
}

/** Позволен ли е двубоят: ±3 нива за ВСИЧКИ противници (вкл. NPC тренировъчни
 *  кукли) — същото, което /arena/opponents показва. */
export const ARENA_BRACKET = 3;
export function arenaInBracket(heroLevel: number, oppLevel: number): boolean {
  return oppLevel >= heroLevel - ARENA_BRACKET && oppLevel <= heroLevel + ARENA_BRACKET;
}

/* ───────────── Кула ───────────── */

const ARCHETYPES = ['Wraith', 'Golem', 'Drake', 'Phantom', 'Devourer', 'Sentinel', 'Reaver', 'Hydraform'];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/** Противник на етаж `floor` (квадратична рампа — виж tower.ts за историята). */
export function towerFoe(floor: number, seed: number) {
  const arch = ARCHETYPES[(seed + floor) % ARCHETYPES.length];
  const lvlScale = Math.max(1, Math.floor(floor * 1.2));
  const hp = Math.round(60 + floor * 22 + floor * floor * 1.0);
  return {
    name: `${arch} of the ${floor}${ordinal(floor)} Vault`,
    side: 'foe' as const,
    level: lvlScale,
    hp,
    hp_max: hp,
    atk_min: Math.round(8 + floor * 1.4 + floor * floor * 0.035),
    atk_max: Math.round(14 + floor * 1.8 + floor * floor * 0.045),
    defense: Math.round(3 + floor * 0.6 + floor * floor * 0.008),
    speed: 6 + Math.floor(floor * 0.2),
    crit_chance: 0.05 + Math.min(0.25, floor * 0.005),
    dodge_chance: 0.03 + Math.min(0.18, floor * 0.003),
    sprite: 'monster-dragon',
  };
}

export function towerGold(floor: number): number { return 8 + floor * 5; }
export function towerXp(floor: number): number { return 12 + floor * 7; }

/* ───────────── Подземия / Mythic+ ───────────── */

/** Награда за изчистен етап на подземие (влиза в „купчината"). */
export function dungeonStageReward(m: MonsterLike): { xp: number; gold: number } {
  return {
    xp: Math.min(Math.round(paceXpForKill(m.level) * 1.8), Math.floor(m.xp_reward * 1.5)),
    gold: Math.floor((m.gold_min + m.gold_max) / 2),
  };
}

export const MYTHIC_TIER_SCALE = 0.12;

/**
 * Mythic+ claim. Пълният бонус на подземието (× мащаба на tier-а) се плаща
 * САМО при ПЪРВО изчистване на нов tier (tier > best_tier) — това е
 * прогресията. Повторно изчистване на вече бит tier плаща „купчината" на
 * етапите (като обикновено подземие без дневния бонус), мащабирана по tier.
 * Преди: всеки claim плащаше пълния бонус → M+ заобикаляше 24-часовия
 * per-dungeon lock и печаташе ~20× лова на час.
 */
export function mythicPlusReward(
  dungeon: { xp_bonus: number; gold_bonus: number },
  stageMonsters: MonsterLike[],
  tier: number,
  prevBestTier: number,
): { xp: number; gold: number; firstClear: boolean } {
  const scale = 1 + tier * MYTHIC_TIER_SCALE;
  const firstClear = tier > prevBestTier;
  if (firstClear) {
    return { xp: Math.round(dungeon.xp_bonus * scale), gold: Math.round(dungeon.gold_bonus * scale), firstClear };
  }
  let xp = 0, gold = 0;
  for (const m of stageMonsters) { const r = dungeonStageReward(m); xp += r.xp; gold += r.gold; }
  return { xp: Math.round(xp * scale), gold: Math.round(gold * scale), firstClear };
}
