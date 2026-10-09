/**
 * Детерминистичен баланс харнес (seeded RNG) — мери енджина, не гадае.
 *
 * Ползва РЕАЛНИТЕ функции: deriveStats (stats.ts), simulateCombat (combat.ts),
 * paceXpForKill (progression.ts), наградните формули (rewardFormulas.ts) и
 * seed данните (items / monsters / quests / dungeons). Math.random се подменя
 * с mulberry32 за времето на всяко измерване → повторяеми числа.
 *
 * Модел на „референтен герой" на ниво L (изрично допускане, не истина):
 *  • Екипировка: най-добрият МАГАЗИНЕН предмет (buy_price > 0, level_req ≤ L)
 *    за всеки слот; оръжие по класа. Еднаква броня за всички класове.
 *  • Статове: базата на класа + злато-ъпгрейди (5·n крива) с бюджет
 *    STAT_SHARE × кумулативното злато от лов до ниво L (16 убийства/ниво —
 *    лов + останалите писти), разпределено по класов шаблон (ALLOC).
 * is_npc = 1 → deriveStats не пипа БД (без guild buffs).
 */
import { deriveStats, buildHeroActor } from '../stats';
import { simulateCombat } from '../combat';
import { paceXpForKill } from '../progression';
import { ITEM_SEED } from '../../seed/items';
import { ITEM_SETS, type SetDef } from '../../seed/sets';
import { MONSTER_SEED } from '../../seed/monsters';
import type { Character, CharacterClass, CombatActor, Item, InventoryEntry } from '../../types/domain';
import { REGION_ORDER, REGION_GATES, huntEncounterPools, isApexSlug, APEX_ENCOUNTER_CHANCE } from '../regions';

export type CharacterClassT = CharacterClass;
export const CLASSES: CharacterClass[] = ['warrior', 'ranger', 'mage', 'rogue'];

/* ───────────── seeded RNG ───────────── */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Изпълнява fn с детерминистичен Math.random и го възстановява. */
export function withSeed<T>(seed: number, fn: () => T): T {
  const orig = Math.random;
  Math.random = mulberry32(seed);
  try { return fn(); } finally { Math.random = orig; }
}

/* ───────────── икономически модел ───────────── */
type Mon = (typeof MONSTER_SEED)[number];
const NON_APEX: Mon[] = (MONSTER_SEED as Mon[]).filter((m) => !m.slug.includes('_apex_'));

/** Средно злато на убийство около ниво L (най-близките по ниво не-APEX мобове). */
export function avgMonsterGold(level: number): number {
  const near = [...NON_APEX].sort((a, b) => Math.abs(a.level - level) - Math.abs(b.level - level)).slice(0, 3);
  return near.reduce((s, m) => s + (m.gold_min + m.gold_max) / 2, 0) / near.length;
}

const KILLS_PER_LEVEL = 16; // ~8 лов + еквивалент от останалите писти
const STAT_SHARE = 0.5;     // половината злато отива в статове, останалото — екипировка/мивки

const goldCache = new Map<number, number>();
/** Кумулативно злато, спечелено до достигане на ниво L. */
export function cumulativeGold(level: number): number {
  if (goldCache.has(level)) return goldCache.get(level)!;
  let g = 50;
  for (let l = 1; l < level; l++) g += KILLS_PER_LEVEL * avgMonsterGold(l);
  goldCache.set(level, g);
  return g;
}

/** Колко ъпгрейда купува `gold` злато по кривата 5·n (от 0). */
export function upgradesFor(gold: number): number {
  // 5·n(n+1)/2 ≤ gold → n = floor((-1 + sqrt(1 + 8·gold/5)) / 2)
  return Math.max(0, Math.floor((-1 + Math.sqrt(1 + (8 * gold) / 5)) / 2));
}

type StatKey = 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma'
  | 'skill_sword' | 'skill_axe' | 'skill_bow' | 'skill_staff' | 'skill_magic' | 'skill_stealth';

/** Класови шаблони за харчене (дял от стат-бюджета). Сумата = 1. */
export const ALLOC: Record<CharacterClass, Partial<Record<StatKey, number>>> = {
  // Симетричен шаблон: 45% основен стат · 30% CON · 10% WIS · 15% оръжейно умение.
  warrior: { strength: 0.45, constitution: 0.30, wisdom: 0.10, skill_sword: 0.15 },
  ranger:  { dexterity: 0.45, constitution: 0.30, wisdom: 0.10, skill_bow: 0.15 },
  mage:    { intelligence: 0.45, constitution: 0.30, wisdom: 0.10, skill_magic: 0.15 },
  rogue:   { dexterity: 0.45, constitution: 0.30, wisdom: 0.10, skill_stealth: 0.15 },
};

const BASE: Record<CharacterClass, Partial<Record<StatKey, number>>> = {
  warrior: { strength: 9, dexterity: 5, constitution: 8, intelligence: 3, charisma: 4, wisdom: 4, skill_sword: 5, skill_axe: 3 },
  ranger:  { strength: 5, dexterity: 9, constitution: 6, intelligence: 4, charisma: 5, wisdom: 5, skill_bow: 5, skill_stealth: 3 },
  mage:    { strength: 3, dexterity: 4, constitution: 5, intelligence: 9, charisma: 5, wisdom: 8, skill_staff: 4, skill_magic: 5 },
  rogue:   { strength: 5, dexterity: 8, constitution: 6, intelligence: 5, charisma: 6, wisdom: 4, skill_sword: 3, skill_stealth: 5 },
};

/* ───────────── екипировка ───────────── */
type SeedItem = (typeof ITEM_SEED)[number] & Record<string, any>;
/** Режим „shop" (по подразбиране): най-добрият ОБЩ магазинен предмет — без
 *  собствените части на сетовете (set_slug), за да остане базовата линия
 *  сравнима преди/след преработката на сетовете. Сетовете се мерят отделно
 *  в режим „sets" (gearFor(..., 'sets')). */
const GEAR = (ITEM_SEED as SeedItem[]).filter((i) => i.buy_price > 0 && !i.set_slug);
const ARMOR_SLOTS = ['helm', 'armor', 'gloves', 'boots', 'shield', 'ring', 'amulet'] as const; // cloak: не се екипира (виж доклада)
const classOk = (cls: CharacterClass, i: SeedItem) => !i.class_req || i.class_req === cls;

function weaponOk(cls: CharacterClass, it: SeedItem): boolean {
  if (it.category !== 'weapon') return false;
  if (cls === 'warrior') return (it.sub_type === 'sword' || it.sub_type === 'axe') && !it.slug.includes('dagger');
  if (cls === 'ranger') return it.sub_type === 'bow';
  if (cls === 'mage') return it.sub_type === 'staff';
  return it.sub_type === 'sword'; // rogue: кинжалите са sub_type 'sword' (classWeaponSkill приема sword/dagger)
}
const PRIMARY_BONUS: Record<CharacterClass, 'str_bonus' | 'dex_bonus' | 'int_bonus'> = {
  warrior: 'str_bonus', ranger: 'dex_bonus', mage: 'int_bonus', rogue: 'dex_bonus',
};
/** Класово-осъзнат избор: броят се само статовете, които класът реално ползва. */
const armorScore = (cls: CharacterClass, i: SeedItem) =>
  i.defense + i.hp_bonus / 4 + (i[PRIMARY_BONUS[cls]] * 3 + i.con_bonus * 1.5 + i.wis_bonus + i.cha_bonus * 0.5) * 2;

/** shop — базовата линия (без наметало, както преди); shop6 — общите
 *  магазинни предмети + наметало (пълен 6-частов универсален сет на тира);
 *  sets — пълният класов сет + общи предмети в останалите слотове. */
export type GearMode = 'shop' | 'shop6' | 'sets';

/** Класовият сет, който герой от клас `cls` на ниво L носи в режим „sets":
 *  най-високият тир, чиито части са достъпни (level_req ≤ L). */
export function classSetFor(cls: CharacterClass, level: number): SetDef | undefined {
  return ITEM_SETS
    .filter((s) => s.kit && s.class_focus === cls && (s.level_req ?? 1) <= level)
    .sort((a, b) => b.tier - a.tier)[0];
}

export function gearFor(cls: CharacterClass, level: number, mode: GearMode = 'shop'): SeedItem[] {
  const out: SeedItem[] = [];
  const taken = new Set<string>();
  if (mode === 'sets') {
    // Пълният класов сет (6 части) + най-добрият общ предмет в останалите
    // слотове. Симетрично за всички класове: 9 слота (оръжие, шлем, броня,
    // ръкавици, ботуши, щит, наметало, пръстен, амулет).
    const set = classSetFor(cls, level);
    if (set) {
      for (const slug of set.pieces) {
        const it = (ITEM_SEED as SeedItem[]).find((i) => i.slug === slug)!;
        out.push(it);
        taken.add(it.category);
      }
    }
  }
  if (!taken.has('weapon')) {
    const w = GEAR.filter((i) => weaponOk(cls, i) && classOk(cls, i) && i.level_req <= level)
      .sort((a, b) => (b.atk_min + b.atk_max) - (a.atk_min + a.atk_max))[0];
    if (w) out.push(w);
  }
  const slots: readonly string[] = mode === 'shop' ? ARMOR_SLOTS : [...ARMOR_SLOTS, 'cloak'];
  for (const slot of slots) {
    if (taken.has(slot)) continue;
    const best = GEAR.filter((i) => i.category === slot && classOk(cls, i) && i.level_req <= level)
      .sort((a, b) => armorScore(cls, b) - armorScore(cls, a))[0];
    if (best) out.push(best);
  }
  return out;
}

/* ───────────── референтен герой ───────────── */
export interface HeroOpts { budgetMul?: number; alloc?: Partial<Record<StatKey, number>>; gear?: GearMode }

export function refCharacter(cls: CharacterClass, level: number, o: HeroOpts = {}): Character {
  const budget = cumulativeGold(level) * STAT_SHARE * (o.budgetMul ?? 1);
  const ch: any = {
    id: 1, user_id: 1, is_npc: 1, name: cls, class: cls, gender: 'male', portrait: 'x',
    level, xp: 0, gold: 0, stat_points: 0, skill_points: 0, hp: 1, hp_max: 1, mp: 1, mp_max: 1,
    strength: 0, dexterity: 0, constitution: 0, intelligence: 0, charisma: 0, wisdom: 0,
    skill_sword: 0, skill_axe: 0, skill_bow: 0, skill_staff: 0, skill_magic: 0, skill_stealth: 0,
    energy: 100, energy_max: 100, energy_updated_at: 0, arena_rating: 1000, wins: 0, losses: 0, created_at: 0,
    active_buffs: '[]', tower_best_floor: 0,
  };
  for (const [k, v] of Object.entries(BASE[cls])) ch[k] = v;
  for (const [k, share] of Object.entries(o.alloc ?? ALLOC[cls])) ch[k] += upgradesFor(budget * (share as number));
  return ch as Character;
}

export function refHero(cls: CharacterClass, level: number, o: HeroOpts = {}): CombatActor {
  const ch = refCharacter(cls, level, o);
  const eq = gearFor(cls, level, o.gear ?? 'shop').map((it, idx) => ({
    item: { id: idx + 1, ...it } as unknown as Item,
    entry: { id: idx + 1, character_id: 1, item_id: idx + 1, quantity: 1, equipped: 1, slot: '' } as InventoryEntry,
    enchant_bonuses: {},
  }));
  const d = deriveStats(ch, eq);
  return buildHeroActor(ch, d, d.hp_max);
}

/* ───────────── чудовища ───────────── */
export function monsterActor(m: Mon, crit = 0.06, dodge = 0.03, scale = 1): CombatActor {
  return {
    name: m.name, side: 'foe', level: m.level,
    hp: Math.round(m.hp * scale), hp_max: Math.round(m.hp * scale),
    atk_min: Math.round(m.atk_min * scale), atk_max: Math.round(m.atk_max * scale),
    defense: Math.round(m.defense * scale), speed: m.speed,
    crit_chance: crit, dodge_chance: dodge, sprite: m.sprite,
  };
}

/** Пуловете, от които hunting.ts тегли за ниво L в регион (game/regions.ts). */
export function huntPools(region: string, level: number) {
  return huntEncounterPools((MONSTER_SEED as Mon[]).filter((m) => m.region === region), level);
}
/** Обикновеният (не-APEX) пул на лова. */
export function huntPool(region: string, level: number): Mon[] {
  return huntPools(region, level).regular;
}

/* ───────────── бой ───────────── */
export interface FightStats { win: number; rounds: number; hpLeft: number }

export function fight(a: () => CombatActor, b: () => CombatActor, n: number, seed: number): FightStats {
  return withSeed(seed, () => {
    let w = 0, r = 0, hp = 0;
    for (let i = 0; i < n; i++) {
      const A = a(); const B = { ...b(), side: 'foe' as const };
      const res = simulateCombat(A, B);
      if (res.winner === 'hero') { w++; hp += res.hero.hp / Math.max(1, res.hero.hp_max); }
      r += res.rounds.length;
    }
    return { win: w / n, rounds: r / n, hpLeft: w ? hp / w : 0 };
  });
}

/** Клас срещу клас — двата реда на страните (елиминира hero-bias на инициативата). */
export function duel(c1: CharacterClass, c2: CharacterClass, level: number, n = 400, seed = 1, gear: GearMode = 'shop'): number {
  const A = refHero(c1, level, { gear }); const B = refHero(c2, level, { gear });
  const one = fight(() => ({ ...A }), () => ({ ...B }), n, seed).win;
  const two = 1 - fight(() => ({ ...B }), () => ({ ...A }), n, seed + 7).win;
  return (one + two) / 2;
}

/** Един и същ клас/ниво, различна екипировка (двата реда на инициатива) — победи на `a`. */
export function gearDuel(cls: CharacterClass, level: number, a: GearMode, b: GearMode, n = 300, seed = 21): number {
  const A = refHero(cls, level, { gear: a }); const B = refHero(cls, level, { gear: b });
  const one = fight(() => ({ ...A }), () => ({ ...B }), n, seed).win;
  const two = 1 - fight(() => ({ ...B }), () => ({ ...A }), n, seed + 7).win;
  return (one + two) / 2;
}

/* ───────────── региони ───────────── */
export const REGION_LIST: { region: string; gate: number }[] = REGION_ORDER.map((region) => ({ region, gate: REGION_GATES[region] }));

export interface RegionRow { region: string; gate: number; win: number; rounds: number; hpLeft: number; poolSize: number; xpPerKill: number; goldPerKill: number }

/** Вход в регион: среден клас на ниво gate срещу пула на лова (APEX изключен — той е целта на региона). */
export function regionEntry(n = 120, seed = 11, gear: GearMode = 'shop'): RegionRow[] {
  return REGION_LIST.map(({ region, gate }, idx) => {
    const usePool = huntPool(region, gate);
    let win = 0, rounds = 0, hpLeft = 0;
    for (const cls of CLASSES) {
      const H = refHero(cls, gate, { gear });
      let k = 0;
      for (const m of usePool) {
        const f = fight(() => ({ ...H }), () => monsterActor(m), n, seed + idx * 101 + k++);
        win += f.win; rounds += f.rounds; hpLeft += f.hpLeft;
      }
    }
    const div = CLASSES.length * usePool.length;
    const xp = usePool.reduce((s, m) => s + Math.max(Math.round(paceXpForKill(m.level) * 0.6), Math.min(Math.round(paceXpForKill(m.level) * 1.8), m.xp_reward)), 0) / usePool.length;
    const gold = usePool.reduce((s, m) => s + (m.gold_min + m.gold_max) / 2, 0) / usePool.length;
    return { region, gate, win: win / div, rounds: rounds / div, hpLeft: hpLeft / div, poolSize: usePool.length, xpPerKill: xp, goldPerKill: gold };
  });
}

/** Шанс срещу конкретен моб (всички класове, средно). */
export function winVsMonster(slug: string, level: number, n = 150, seed = 5, scale = 1): number {
  const m = (MONSTER_SEED as Mon[]).find((x) => x.slug === slug)!;
  let w = 0;
  CLASSES.forEach((cls, i) => {
    const H = refHero(cls, level);
    w += fight(() => ({ ...H }), () => monsterActor(m, 0.08, 0.04, scale), n, seed + i).win;
  });
  return w / CLASSES.length;
}

/* ───────────── икономика: злато + XP на час по писта ───────────── */
import * as RF from '../rewardFormulas';
import { COOLDOWN_RANGES_MS } from '../cooldowns';
import { QUEST_SEED } from '../../seed/quests';
import { DUNGEONS } from '../../seed/dungeons';
import { COMBO_CAP, COMBO_STEP } from '../momentum';

/** Наградните формули — инжектират се, за да може „преди" да се мери със
 *  старата логика (скрипт) и „след" с реалния модул. */
export type Formulas = typeof RF & {
  /** Стойност (злато) на item_reward на куест при повторение: 0 = веднъж. */
  questItemRepeatValue?: (q: any) => number;
  /** Старата логика на лова: APEX в равномерния ±3 пул (преди одита). */
  legacyApexPool?: boolean;
};

const midMin = (k: keyof typeof COOLDOWN_RANGES_MS) => (COOLDOWN_RANGES_MS[k][0] + COOLDOWN_RANGES_MS[k][1]) / 2 / 60_000;
const perHour = (k: keyof typeof COOLDOWN_RANGES_MS) => 60 / midMin(k);
const monBySlug = new Map((MONSTER_SEED as Mon[]).map((m) => [m.slug, m]));

export interface LaneRow { lane: string; xpHr: number; goldHr: number; win: number; note?: string }

/** Средна победа на смесен клас (4 класа) срещу актьор-фабрика. */
function mixedWin(level: number, foe: () => CombatActor, n: number, seed: number, heroHp?: (h: CombatActor) => number): number {
  let w = 0;
  CLASSES.forEach((c, i) => {
    const H = refHero(c, level);
    w += fight(() => ({ ...H, hp: heroHp ? heroHp(H) : H.hp }), foe, n, seed + i * 31).win;
  });
  return w / CLASSES.length;
}

export function bestRegion(level: number): string {
  let best = REGION_LIST[0].region;
  for (const r of REGION_LIST) if (r.gate <= level) best = r.region;
  return best;
}

export function huntLane(level: number, F: Formulas = RF as Formulas, n = 60): LaneRow {
  let { regular, apex } = huntPools(bestRegion(level), level);
  if (F.legacyApexPool) {
    const all = (MONSTER_SEED as Mon[]).filter((m) => m.region === bestRegion(level));
    for (const w of [3, 8, 16, 999]) { regular = all.filter((m) => m.level >= Math.max(1, level - w) && m.level <= level + w); if (regular.length) break; }
    apex = [];
  }
  const avg = (pool: Mon[], seed: number) => {
    let xp = 0, gold = 0, win = 0;
    pool.forEach((m, k) => {
      const w = mixedWin(level, () => monsterActor(m), n, seed + k);
      win += w;
      xp += w * F.huntKillXp(m.level, m.xp_reward, isApexSlug(m.slug));
      gold += w * (m.gold_min + m.gold_max) / 2;
    });
    const d = Math.max(1, pool.length);
    return { xp: xp / d, gold: gold / d, win: win / d };
  };
  const r = avg(regular, 1000);
  const p = apex.length ? (regular.length ? APEX_ENCOUNTER_CHANCE : 1) : 0;
  const a = apex.length ? avg(apex, 1500) : { xp: 0, gold: 0, win: 0 };
  const mix = (x: number, y: number) => (1 - p) * x + p * y;
  // Стационарно комбо (cd 4.5 мин < 10 мин прозорец), намалено с шанса за загуба.
  const win = mix(r.win, a.win);
  const combo = 1 + COMBO_CAP * COMBO_STEP * win;
  const k = perHour('hunt') * combo;
  return { lane: 'hunt', xpHr: mix(r.xp, a.xp) * k, goldHr: mix(r.gold, a.gold) * k, win };
}

export function arenaLane(level: number, F: Formulas = RF as Formulas): LaneRow {
  const r = F.arenaReward(level);
  const w = 0.5; // равни противници в ±3 скобата
  return { lane: 'arena', xpHr: perHour('arena') * w * r.xp, goldHr: perHour('arena') * w * r.gold, win: w };
}

/** Най-доходният куест, достъпен на ниво L (победа ≥ 50%). */
export function questLane(level: number, F: Formulas = RF as Formulas, n = 40): LaneRow {
  let best: LaneRow = { lane: 'quest', xpHr: 0, goldHr: 0, win: 0 };
  let bestVal = -1;
  for (const q of QUEST_SEED as any[]) {
    if (q.level_req > level) continue;
    const m = q.monster_slug ? monBySlug.get(q.monster_slug) : undefined;
    let w = 0.8, xp = 0, gold = 0;
    if (m) {
      w = mixedWin(level, () => monsterActor(m, 0.08, 0.04), n, 2000 + q.level_req);
      if (w < 0.5) continue;
      xp = w * F.questCombatXp(q, m);
      gold = w * (F.questBaseGold(q, m) + (m.gold_min + m.gold_max) / 2 + (F.questItemRepeatValue ? F.questItemRepeatValue(q) * 0.6 : 0));
    } else {
      xp = 0.8 * F.questBaseXp(q) + 0.2 * Math.floor(F.questBaseXp(q) * 0.3);
      gold = 0.8 * F.questBaseGold(q, null);
    }
    // Стойност за избор: XP в „нива" + злато в „убийства" (и двете спрямо pace).
    const val = xp / paceXpForKill(level) + gold / avgMonsterGold(level);
    if (val > bestVal) { bestVal = val; best = { lane: 'quest', xpHr: xp * perHour('quest'), goldHr: gold * perHour('quest'), win: w, note: q.slug }; }
  }
  return best;
}

/** Кула: героят стои на фронта си (най-високият етаж с ≥ 50% победа). */
export function towerFrontier(level: number, F: Formulas = RF as Formulas, n = 30): number {
  let lo = 1, hi = 1200;
  const ok = (f: number) => mixedWin(level, () => F.towerFoe(f, 3), n, 3000 + f) >= 0.5;
  if (!ok(1)) return 0;
  while (lo < hi) { const mid = Math.ceil((lo + hi + 1) / 2); if (ok(mid)) lo = mid; else hi = mid - 1; }
  return lo;
}

export function towerLane(level: number, F: Formulas = RF as Formulas): LaneRow {
  const f = towerFrontier(level, F) + 1;
  const w = mixedWin(level, () => F.towerFoe(f, 3), 40, 4000 + f);
  const vault = 1 + 1 / 5; // всеки 5-и етаж ×2
  return { lane: 'tower', xpHr: perHour('tower') * w * F.towerXp(f) * vault, goldHr: perHour('tower') * w * F.towerGold(f) * vault, win: w, note: `floor ${f}` };
}

/** Шанс за изчистване на 4-те етапа подред с пренесено HP (смесен клас). */
export function dungeonClearChance(level: number, stageSlugs: string[], scale: number, n = 40, seed = 5000): number {
  let ok = 0;
  CLASSES.forEach((c, ci) => {
    const H = refHero(c, level);
    withSeed(seed + ci, () => {
      for (let i = 0; i < n; i++) {
        let hp = H.hp_max; let alive = true;
        for (const s of stageSlugs) {
          const m = monBySlug.get(s)!;
          const r = simulateCombat({ ...H, hp }, monsterActor(m, 0.08, 0.03, scale));
          if (r.winner !== 'hero') { alive = false; break; }
          hp = Math.max(1, r.hero.hp);
        }
        if (alive) ok++;
      }
    });
  });
  return ok / (n * CLASSES.length);
}

/** Писта „подземие" в стационарен режим (след дневните lock-ове): Mythic+
 *  повторение на най-добрия достъпен tier-1 — това пълни 7–10 мин пистата. */
export function dungeonLane(level: number, F: Formulas = RF as Formulas): LaneRow {
  let best: LaneRow = { lane: 'dungeon(M+)', xpHr: 0, goldHr: 0, win: 0 };
  for (const d of DUNGEONS) {
    if (d.level_req > level) continue;
    const slugs = d.stages.map((s) => s.monster_slug);
    const p = dungeonClearChance(level, slugs, 1 + 1 * RF.MYTHIC_TIER_SCALE, 20);
    if (p < 0.5) continue;
    const r = F.mythicPlusReward(d, slugs.map((s) => monBySlug.get(s)!), 1, 1); // повторение на бит tier 1
    const xpHr = perHour('dungeon') * p * r.xp;
    if (xpHr > best.xpHr) best = { lane: 'dungeon(M+)', xpHr, goldHr: perHour('dungeon') * p * r.gold, win: p, note: d.slug };
  }
  return best;
}

/** Дневен „изблик" от обикновените подземия (по веднъж на 24 ч / cooldown_hours). */
export function dailyDungeonXp(level: number): { xp: number; levels: number } {
  let xp = 0;
  for (const d of DUNGEONS) if (d.level_req <= level) xp += d.xp_bonus * (24 / d.cooldown_hours);
  const step = paceXpForKill(level) * 8;
  return { xp, levels: xp / step };
}

export function economyAt(level: number, F: Formulas = RF as Formulas): LaneRow[] {
  return [huntLane(level, F), arenaLane(level, F), questLane(level, F), towerLane(level, F), dungeonLane(level, F)];
}
