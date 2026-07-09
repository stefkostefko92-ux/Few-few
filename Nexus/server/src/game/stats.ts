import type { Character, CombatActor, Item, InventoryEntry, CharacterClass } from '../types/domain';
import { ITEM_SETS, type SetBonus, type SetDef } from '../seed/sets';
import { loadGuildBuffsForCharacter } from './guild';

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
  // Damage-type breakdown. atk_min/atk_max remain the combined "go" number
  // used by the existing combat sim, but these axes are shown to the player
  // (Character page, mount tooltip) and let future systems separate magical
  // and physical mitigation.
  phys_dmg: number;
  phys_def: number;
  mag_dmg: number;
  mag_def: number;
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
  // Damage-type axes
  let phys_dmg = 0;
  let phys_def = 0;
  let mag_dmg = 0;
  let mag_def = 0;

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
    phys_dmg += ((item as any).phys_dmg_bonus || 0) + (e.phys_dmg_bonus || 0);
    phys_def += ((item as any).phys_def_bonus || 0) + (e.phys_def_bonus || 0);
    mag_dmg  += ((item as any).mag_dmg_bonus  || 0) + (e.mag_dmg_bonus  || 0);
    mag_def  += ((item as any).mag_def_bonus  || 0) + (e.mag_def_bonus  || 0);
    if (item.category === 'weapon') {
      atkMin = item.atk_min + (e.atk_min || 0);
      atkMax = item.atk_max + (e.atk_max || 0);
      weaponSub = item.sub_type;
      // Audit (balance tuning #10): Wyrmsong promises "strikes harder
      // the higher you climb" but used to ship as a static lv-18 sword
      // — at lv 25+ a veteran sword outclassed it. Scale its atk_max
      // with the player's best tower floor so the description matches
      // reality: +1.2 atk_max per floor cleared, capped at +200 so it
      // doesn't completely overshadow tier-10 drops.
      if (item.slug === 'wyrmsong_blade') {
        const climb = Math.min(200, Math.floor(((ch as any).tower_best_floor || 0) * 1.2));
        atkMin += Math.floor(climb * 0.6);
        atkMax += climb;
      }
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

  // ─── Guild track buffs ───────────────────────────────────────────
  // Six independent guild tracks (attr / power / defence / exp / gold /
  // protected_gold) feed into every member's combat math. We apply the
  // attr multiplier BEFORE deriving HP/MP so the bonus propagates through
  // the existing curves correctly.
  const guildBuffs = ch.is_npc ? null : loadGuildBuffsForCharacter(ch.id);
  if (guildBuffs) {
    str  = Math.round(str  * guildBuffs.attr_multiplier);
    dex  = Math.round(dex  * guildBuffs.attr_multiplier);
    con  = Math.round(con  * guildBuffs.attr_multiplier);
    int_ = Math.round(int_ * guildBuffs.attr_multiplier);
    wis  = Math.round(wis  * guildBuffs.attr_multiplier);
    cha  = Math.round(cha  * guildBuffs.attr_multiplier);
  }

  // Audit (balance tuning #8): mage classDmg was 0.7 vs others 0.6,
  // so a mage with int 200 + Supreme Intellect elixir out-DPS'd a
  // matched warrior by ~14%. Mage already has the MP scaling advantage
  // (int_*3 + wis*2) for spell sustain — damage parity is fair. All
  // four classes now share the same 0.6 dmg coefficient on their
  // primary stat.
  const classDmg = ch.class === 'mage' ? int_ * 0.6 : ch.class === 'ranger' ? dex * 0.6 : str * 0.6;
  const skill = classWeaponSkill(ch.class, weaponSub, ch);

  // Mages use mag_dmg, every other class uses phys_dmg. Defense in the
  // current combat sim is a single number, so phys_def + mag_def stack
  // into it; the axes stay visible to the player so future damage-type
  // splits don't need re-derivation.
  const typedDmgBonus = ch.class === 'mage' ? mag_dmg : phys_dmg;
  let atk_min = Math.round(atkMin + classDmg * 0.5 + skill * 0.4 + atkBonus + typedDmgBonus);
  let atk_max = Math.round(atkMax + classDmg + skill * 0.8 + atkBonus + typedDmgBonus);
  def += phys_def + mag_def;
  // Audit (balance landmine #2): hero HP per level was `lvl * 6` —
  // a lv 350 hero with con=120 ended up at ~3.5k HP staring down a
  // 26k-HP monster that hit for ~1300, so endgame fights died inside
  // 3 monster swings. Bumped to `lvl * 15` so the geared lv 350 sits
  // at ~7k HP and the survivability ratio holds. MP gets a smaller
  // bump for spell sustain.
  const hp_max = 40 + con * 6 + ch.level * 15 + hp_bonus;
  const mp_max = 10 + int_ * 3 + wis * 2 + ch.level * 2 + mp_bonus;

  const dodge_chance = Math.min(0.45, dex * 0.005 + ch.skill_stealth * 0.004 + dodgeBonus);
  const crit_chance = Math.min(0.5, dex * 0.004 + ch.skill_sword * 0.003 + ch.skill_bow * 0.003 + 0.03 + critBonus);
  const speed = 5 + Math.round(dex * 0.4);

  if (guildBuffs) {
    atk_min = Math.round(atk_min * guildBuffs.power_multiplier);
    atk_max = Math.round(atk_max * guildBuffs.power_multiplier);
    def     = Math.round(def     * guildBuffs.defence_multiplier);
  }

  // Sanitise every numeric derived stat before it leaves this function.
  // Enchant / typed-damage bonuses are summed raw from item JSON
  // (stats.ts:107-139); a malformed bonus (NaN from a string coercion,
  // or Infinity) would otherwise propagate into the combat sim and HP
  // pool unchecked. fin() clamps to a finite, non-negative value with a
  // sensible default. (Balance audit.)
  const fin = (n: number, d = 0): number => (Number.isFinite(n) && n >= 0 ? n : d);
  return {
    atk_min: fin(atk_min, 1),
    atk_max: fin(atk_max, Math.max(1, fin(atk_min, 1))),
    defense: fin(def),
    hp_max: fin(hp_max, 1),
    mp_max: fin(mp_max),
    crit_chance: Math.min(1, fin(crit_chance)),
    dodge_chance: Math.min(0.75, fin(dodge_chance)),
    speed: fin(speed),
    phys_dmg: fin(phys_dmg), phys_def: fin(phys_def),
    mag_dmg: fin(mag_dmg), mag_def: fin(mag_def),
    active_sets,
  };
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
