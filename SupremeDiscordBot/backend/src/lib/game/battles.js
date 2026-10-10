// backend/src/lib/game/battles.js
// v53 — статистиките на спътниците и битките. ЧИСТ модул (без база, без
// Discord): операциите са в battleOps.js, тук са правилата и симулаторът, за да
// се тестват докрай и да са едни и същи за бота, таблото и тестовете.
//
// Четири статистики: ⚔️ атака · 🛡️ защита · 💨 бързина · ❤️ живот.
//  • Точките са ЦЕЛИ числа и се СЪБИРАТ: основа 20 + редкост (0…4) +
//    отместването на семейството + формата (0/2/4) + 2 на всяко тренирано ниво.
//    Без множители → без закръгляния, които правят едно семейство по-силно.
//  • Всяка статистика се тренира с искри на нива; таванът расте с формата
//    (4 / 7 / 10), за да не изпревари тренировката еволюцията.
//  • Битката е симулирана на сървъра с PRNG от записано зърно (seed) — същото
//    зърно дава същата битка (одит/повторение), а резултатът не зависи от бота.
//  • Загубилият губи 1–3 % от искрите си (никога спътник): колкото по-силен е
//    бил противникът, толкова по-малко — виж lossPct. Наградата на победителя
//    идва от играта, с дневен таван (виж battleOps.js); изгубените искри изгарят.
//
// Балансът (симулация, 6 000 битки на двойка, 09.10.2026 — гейтът е в
// battles.test.js): равни 50 % · +1 ниво на КОЯ ДА Е статистика 55 % (и
// четирите тежат еднакво) · +1 ниво на всичко 72 % · +2 → 87 % · +4 → 99 % ·
// форма 2 срещу 1 72 % · uncommon срещу common 62 % · legendary срещу common
// 87 % · всеки две семейства при една редкост 46–52 %.
import { companionById } from "./companions.js";

export const STAT_KEYS = Object.freeze(["atk", "def", "spd", "hp"]);
export const STAT_EMOJI = Object.freeze({ atk: "⚔️", def: "🛡️", spd: "💨", hp: "❤️" });
/** Колоната в member_companions за нивото на всяка статистика. */
export const STAT_COLUMN = Object.freeze({ atk: "atkLevel", def: "defLevel", spd: "spdLevel", hp: "hpLevel" });

export const BASE_POINTS = 20;
/** Редкостта добавя към всяка статистика. */
export const RARITY_BONUS = Object.freeze({ common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 });
/** Формата добавя към всяка статистика — еволюцията (/companion feed) има смисъл и в битка. */
export const STAGE_BONUS = Object.freeze({ 1: 0, 2: 2, 3: 4 });

// Отместване по семейство за [атака, защита, бързина, живот]. Подбрани така, че
// ПРОИЗВЕДЕНИЕТО на четирите (то решава битката, виж simulateBattle) да е в
// ±1,5 % от това на lime при всяка редкост и форма — семействата са различни,
// не по-силни.
export const FAMILY_OFFSETS = Object.freeze({
  lime:   Object.freeze([0, 0, 0, 0]),     // равностоен
  teal:   Object.freeze([-1, -2, 6, -2]),  // бързак
  violet: Object.freeze([3, -3, 4, -3]),   // стъклено оръдие
  amber:  Object.freeze([-1, 3, -4, 3]),   // крепост
  rose:   Object.freeze([-2, -1, -2, 6]),  // жилав
  ice:    Object.freeze([-2, 6, -2, -1]),  // стена
  ember:  Object.freeze([6, -2, -1, -2]),  // нападател
  shadow: Object.freeze([3, -2, 4, -4]),   // убиец
  coral:  Object.freeze([-3, -3, 3, 4]),   // издръжлив бегач
  gold:   Object.freeze([3, 4, -3, -3]),   // рицар
  mint:   Object.freeze([-3, 3, 4, -3]),   // пазач
  cobalt: Object.freeze([3, -1, -4, 3]),   // таран
});

/** Таван на нивото на всяка статистика по форма. */
export const STAT_CAP = Object.freeze({ 1: 4, 2: 7, 3: 10 });
export const MAX_STAT_LEVEL = 10;
/** Всяко ниво добавя толкова точки; животът се показва ×5 (20 точки = 100 ❤️). */
export const POINTS_PER_LEVEL = 2;
export const HP_SCALE = 5;

/** Цената на следващото ниво (от `level` към `level + 1`): 20, 40, 60 … 200. */
export function trainCost(level) {
  return 20 * (Math.max(0, Math.floor(level)) + 1);
}

/** Основните точки на спътника от каталога (форма 1, без тренировка). */
export function baseStats(companionId) {
  const c = companionById(companionId);
  if (!c) return null;
  const off = FAMILY_OFFSETS[c.family] || FAMILY_OFFSETS.lime;
  const b = BASE_POINTS + (RARITY_BONUS[c.rarity] ?? 0);
  return { atk: b + off[0], def: b + off[1], spd: b + off[2], hp: b + off[3] };
}

/** Нивата от реда в базата (липсващо = 0). */
export function levelsOf(row = {}) {
  return Object.fromEntries(STAT_KEYS.map((k) => [k, Math.max(0, Math.floor(row?.[STAT_COLUMN[k]] || 0))]));
}

/**
 * Сила = 4 × средното геометрично на четирите статистики (в точки). Така е,
 * защото битката зависи от произведението им: +2 на най-слабата статистика
 * вдига силата повече от +2 на най-силната — точно както и шанса.
 */
export function powerOf({ atk, def, spd, hpPoints }) {
  return Math.round(4 * Math.pow(atk * def * spd * hpPoints, 0.25));
}

/**
 * Ефективните статистики: основа + форма + тренировка. Животът е в точки ×5.
 * @returns {{atk:number, def:number, spd:number, hp:number, power:number}|null}
 */
export function effectiveStats(companionId, stage = 1, levels = {}) {
  const base = baseStats(companionId);
  if (!base) return null;
  const s = STAGE_BONUS[stage] ?? 0;
  const pts = Object.fromEntries(STAT_KEYS.map((k) => [k, base[k] + s + POINTS_PER_LEVEL * Math.max(0, levels[k] || 0)]));
  return { atk: pts.atk, def: pts.def, spd: pts.spd, hp: pts.hp * HP_SCALE, power: powerOf({ ...pts, hpPoints: pts.hp }) };
}

/** Всичко за един притежаван спътник: статистики, нива, таван, следваща цена, рекорд. */
export function statSheet(row) {
  const stage = row?.stage || 1;
  const levels = levelsOf(row);
  const cap = STAT_CAP[stage] || STAT_CAP[1];
  return {
    stats: effectiveStats(row?.companionId, stage, levels),
    levels,
    cap,
    nextCost: Object.fromEntries(STAT_KEYS.map((k) => [k, levels[k] < cap ? trainCost(levels[k]) : null])),
    wins: row?.wins || 0,
    losses: row?.losses || 0,
  };
}

// ─── Награда ─────────────────────────────────────────────────────────────────
// Само нападател, който ПОБЕДИ, и само до дневния таван (battleOps.js).
// Победа над по-силен носи повече; над много по-слаб — нищо, за да няма смисъл
// да се бият новаците (под 0,85 от силата ти шансът ти е над ~84 %).
export const WIN_SPARKS = 10;
export const UNDERDOG_SPARKS = 15;
export const EASY_RATIO = 0.85;

/**
 * @param {number} attackerPower
 * @param {number} defenderPower
 * @returns {{ tier: "underdog"|"fair"|"easy", sparks: number }}
 */
export function winReward(attackerPower, defenderPower) {
  if (defenderPower > attackerPower) return { tier: "underdog", sparks: UNDERDOG_SPARKS };
  if (defenderPower < attackerPower * EASY_RATIO) return { tier: "easy", sparks: 0 };
  return { tier: "fair", sparks: WIN_SPARKS };
}

/** Приблизителен шанс на нападателя по силата (калибриран спрямо симулатора). */
export function winChance(attackerPower, defenderPower) {
  return 1 / (1 + Math.pow(defenderPower / attackerPower, 10));
}

// ─── Загуба ──────────────────────────────────────────────────────────────────
// Загубилият губи между 1 % и 3 % от искрите си. Колкото по-слаб е бил спрямо
// противника, толкова по-малко: процентът е 1 + 2 × шансът, който е имал да
// победи (по силата). Срещу много по-силен → ~1 %, при равни → 2 %, ако самият
// той е бил много по-силен и пак е загубил → ~3 %.
export const LOSS_MIN_PCT = 1;
export const LOSS_MAX_PCT = 3;

/**
 * @param {number} loserPower
 * @param {number} winnerPower
 * @returns {number} процент от искрите (1…3)
 */
export function lossPct(loserPower, winnerPower) {
  const p = winChance(loserPower, winnerPower);
  return Math.min(LOSS_MAX_PCT, Math.max(LOSS_MIN_PCT, LOSS_MIN_PCT + (LOSS_MAX_PCT - LOSS_MIN_PCT) * p));
}

/** Изгубените искри: процент от баланса, закръглен НАДОЛУ — никога над обявения процент. */
export function sparksLost(balance, pct) {
  return Math.max(0, Math.floor((Math.max(0, Math.floor(balance)) * pct) / 100));
}

// ─── Симулаторът ─────────────────────────────────────────────────────────────

/** Mulberry32 — малък детерминистичен PRNG; същото зърно → същата битка. */
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MAX_ACTIONS = 100;
/** Удар при равни атака и защита (5 удара събарят 100 ❤️). */
export const HIT_BASE = 20;
export const HIT_SPREAD = 0.25;
export const CRIT_CHANCE = 0.1;
export const CRIT_MULT = 1.5;
export const DODGE_CHANCE = 0.06;

/**
 * Битка между два спътника. `a` е нападателят, `b` — защитникът.
 * Всяко действие: кой удря се тегли по бързината (шанс = бързина / сбора на
 * двете); удар = 20 × атака / защита ±25 %, 10 % критичен (×1,5), 6 %
 * избягване. Така атака, защита, бързина и живот тежат ЕДНАКВО (печели по-
 * голямото произведение, с късмет). Край при 0 живот; след MAX_ACTIONS печели
 * по-високият процент живот, при равенство — защитникът.
 *
 * @param {{atk:number,def:number,spd:number,hp:number}} a
 * @param {{atk:number,def:number,spd:number,hp:number}} b
 * @param {number} seed
 * @returns {{ winner: "attacker"|"defender", turns: number, hpA: number, hpB: number, events: Array<{by:"a"|"b", dmg:number, crit:boolean, dodge:boolean, hpA:number, hpB:number}> }}
 */
export function simulateBattle(a, b, seed) {
  const rnd = prng(seed);
  let hpA = a.hp;
  let hpB = b.hp;
  const events = [];
  while (hpA > 0 && hpB > 0 && events.length < MAX_ACTIONS) {
    const by = rnd() * (a.spd + b.spd) < a.spd ? "a" : "b";
    const X = by === "a" ? a : b;
    const Y = by === "a" ? b : a;
    let dmg = 0;
    let crit = false;
    const dodge = rnd() < DODGE_CHANCE;
    if (!dodge) {
      const spread = 1 - HIT_SPREAD + rnd() * 2 * HIT_SPREAD;
      crit = rnd() < CRIT_CHANCE;
      dmg = Math.max(1, Math.round(HIT_BASE * (X.atk / Y.def) * spread * (crit ? CRIT_MULT : 1)));
      if (by === "a") hpB = Math.max(0, hpB - dmg); else hpA = Math.max(0, hpA - dmg);
    }
    events.push({ by, dmg, crit, dodge, hpA, hpB });
  }
  let winner;
  if (hpB <= 0) winner = "attacker";
  else if (hpA <= 0) winner = "defender";
  else winner = hpA / a.hp > hpB / b.hp ? "attacker" : "defender";
  return { winner, turns: events.length, hpA, hpB, events };
}
