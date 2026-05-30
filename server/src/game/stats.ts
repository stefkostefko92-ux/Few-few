import type { Character, CombatActor, Item, InventoryEntry, CharacterClass } from '../types/domain';
import { ITEM_SETS, type SetBonus, type SetDef } from '../seed/sets';

export interface SetBonusSummary {
  set_slug: string;
  set_name: string;
  pieces_equipped: number;
  pieces_total: number;
  bonuses_active: { threshold: 2 | 4 | 6; bonus: SetBonus }[];
}

export interface DerivedStats {
  atk_min: number;
  atk_max: number;
  defense: number;
  hp_max: number;
  mp_max: number;
  crit_chance: number;
  dodge_chance: number;
  speed: number;
  active_sets: SetBonusSummary[];
}

export function classWeaponSkill(cls: CharacterClass, sub: string, ch: Character): number {
  if (cls === 'mage' && (sub === 'staff' || sub === '')) return Math.max(ch.skill_staff, ch.skill_magic);
  if (cls === 'ranger' && (sub === 'bow' || sub === '')) return ch.skill_bow;
  if (cls === 'warrior' && (sub === 'axe' || sub === 'sword' || sub === '')) return Math.max(ch.skill_axe, ch.skill_sword);
  if (cls === 'rogue' && (sub === 'sword' || sub === '' || sub === 'dagger')) return Math.max(ch.skill_sword, ch.skill_stealth);
  if (sub === 'sword') return ch.skill_sword;
  if (sub === 'axe') return ch.skill_axe;
  if (sub === 'bow') return ch.skill_bow;
  if (sub === 'staff') return ch.skill_staff;
  return 0;
}

/** Count equipped pieces per set, picking the set with the most matches for any shared slug. */
function computeSetCounts(equipped: { item: Item }[]): Map<string, number> {
  const counts = new Map<string, number>();
  // For each equipped item, find sets it belongs to.
  const equippedSlugs = new Set(equipped.map((e) => e.item.slug));
  for (const set of ITEM_SETS) {
    let matched = 0;
    for (const slug of set.pieces) if (equippedSlugs.has(slug)) matched++;
    if (matched > 0) counts.set(set.slug, matched);
  }
  return counts;
}

function bonusAt(set: SetDef, count: number): SetBonus[] {
  const out: SetBonus[] = [];
  if (count >= 2 && set.bonus_2) out.push(set.bonus_2);
  if (count >= 4 && set.bonus_4) out.push(set.bonus_4);
  if (count >= 6 && set.bonus_6) out.push(set.bonus_6);
  return out;
}

function readActiveBuffs(ch: Character): Record<string, number> {
  const now = Date.now();
  let raw: any[] = [];
  try { raw = JSON.parse((ch as any).active_buffs || '[]'); } catch { raw = []; }
  const out: Record<string, number> = {};
  for (const b of raw) {
    if (!b || typeof b !== 'object') continue;
    if (b.expires_at && b.expires_at <= now) continue;
    if (typeof b.stat === 'string' && typeof b.percent === 'number') {
      out[b.stat] = (out[b.stat] || 0) + b.percent;
    }
  }
  return out;
}

export function deriveStats(ch: Character, equipped: { item: Item; entry: InventoryEntry }[]): DerivedStats {
  const buffs = readActiveBuffs(ch);
  const buff = (key: string, base: number) => Math.round(base * (1 + (buffs[key] || 0) / 100));
  let str = buff('strength', ch.strength);
  let dex = buff('dexterity', ch.dexterity);
  let con = buff('constitution', ch.constitution);
  let int_ = buff('intelligence', ch.intelligence);
  let wis = buff('wisdom', ch.wisdom);
  let cha = buff('charisma', ch.charisma);
  let hp_bonus = 0;
  let mp_bonus = 0;
  let atkMin = 1;
  let atkMax = 2;
  let def = 0;
  let weaponSub = '';
  let critBonus = 0;
  let dodgeBonus = 0;
  let atkBonus = 0;

  for (const slot of equipped) {
    const { item } = slot;
    const e = (slot as any).enchant_bonuses || {};
    str += item.str_bonus + (e.str_bonus || 0);
    dex += item.dex_bonus + (e.dex_bonus || 0);
    con += item.con_bonus + (e.con_bonus || 0);
    int_ += item.int_bonus + (e.int_bonus || 0);
    wis += item.wis_bonus + (e.wis_bonus || 0);
    cha += item.cha_bonus + (e.cha_bonus || 0);
    hp_bonus += item.hp_bonus + (e.hp_bonus || 0);
    mp_bonus += item.mp_bonus + (e.mp_bonus || 0);
    def += item.defense + (e.defense || 0);
    if (item.category === 'weapon') {
      atkMin = item.atk_min + (e.atk_min || 0);
      atkMax = item.atk_max + (e.atk_max || 0);
      weaponSub = item.sub_type;
    } else {
      // Forge enchants can roll an attack bonus onto non-weapons too;
      // those add into the global atkBonus pool.
      atkBonus += (e.atk_max || 0);
    }
  }

  // Apply set bonuses
  const counts = computeSetCounts(equipped);
  const active_sets: SetBonusSummary[] = [];
  for (const [slug, count] of counts) {
    const set = ITEM_SETS.find((s) => s.slug === slug)!;
    const bonuses = bonusAt(set, count);
    const thresholds: { threshold: 2 | 4 | 6; bonus: SetBonus }[] = [];
    if (count >= 2 && set.bonus_2) thresholds.push({ threshold: 2, bonus: set.bonus_2 });
    if (count >= 4 && set.bonus_4) thresholds.push({ threshold: 4, bonus: set.bonus_4 });
    if (count >= 6 && set.bonus_6) thresholds.push({ threshold: 6, bonus: set.bonus_6 });
    if (thresholds.length) {
      active_sets.push({
        set_slug: set.slug,
        set_name: set.name,
        pieces_equipped: count,
        pieces_total: set.pieces.length,
        bonuses_active: thresholds,
      });
    }
    for (const b of bonuses) {
      str += b.str_bonus ?? 0;
      dex += b.dex_bonus ?? 0;
      con += b.con_bonus ?? 0;
      int_ += b.int_bonus ?? 0;
      wis += b.wis_bonus ?? 0;
      cha += b.cha_bonus ?? 0;
      hp_bonus += b.hp_bonus ?? 0;
      mp_bonus += b.mp_bonus ?? 0;
      def += b.defense_bonus ?? 0;
      atkBonus += b.atk_bonus ?? 0;
      critBonus += b.crit_bonus ?? 0;
      dodgeBonus += b.dodge_bonus ?? 0;
    }
  }

  const classDmg = ch.class === 'mage' ? int_ * 0.7 : ch.class === 'ranger' ? dex * 0.6 : str * 0.6;
  const skill = classWeaponSkill(ch.class, weaponSub, ch);

  const atk_min = Math.round(atkMin + classDmg * 0.5 + skill * 0.4 + atkBonus);
  const atk_max = Math.round(atkMax + classDmg + skill * 0.8 + atkBonus);

  const hp_max = 40 + con * 6 + ch.level * 6 + hp_bonus;
  const mp_max = 10 + int_ * 3 + wis * 2 + mp_bonus;

  const dodge_chance = Math.min(0.45, dex * 0.005 + ch.skill_stealth * 0.004 + dodgeBonus);
  const crit_chance = Math.min(0.5, dex * 0.004 + ch.skill_sword * 0.003 + ch.skill_bow * 0.003 + 0.03 + critBonus);
  const speed = 5 + Math.round(dex * 0.4);

  return { atk_min, atk_max, defense: def, hp_max, mp_max, crit_chance, dodge_chance, speed, active_sets };
}

export function buildHeroActor(ch: Character, derived: DerivedStats, currentHp: number): CombatActor {
  return {
    name: ch.name,
    side: 'hero',
    level: ch.level,
    hp: currentHp,
    hp_max: derived.hp_max,
    atk_min: derived.atk_min,
    atk_max: derived.atk_max,
    defense: derived.defense,
    speed: derived.speed,
    crit_chance: derived.crit_chance,
    dodge_chance: derived.dodge_chance,
    sprite: ch.class,
    class: ch.class,
  };
}
