/**
 * Собствените части на сетовете — генерирани от `kit` в seed/sets.ts по
 * монотонната крива на екипировката (фаза 2 я изправи — не я чупим).
 *
 * Правило на кривата: част от сет на тир N е МАЛКО по-силна от общия
 * (generic) предмет на тир N за същия слот, но НЕ надвишава общия предмет на
 * тир N+1 (def / hp / atk / сума атрибути). Пази го тестът
 * __tests__/sets.test.ts. Стойностите по-долу са котвени в generic таблицата
 * от items.ts (veteran/champion/warlord за T3, elite … primordial за T4–T12).
 *
 * Разпределение на атрибута по слот (класов сет):
 *   шлем/броня/щит → CON · ръкавици/ботуши/оръжие → основният стат на класа ·
 *   наметало → WIS (+MP). Универсалните сетове (wayfarer, mythwoven) следват
 *   generic разпределението (ръкавици STR, ботуши DEX).
 *
 * Цени: продажната цена е по кривата (≈1.1× generic на тира, ≤ generic на
 * следващия) — никакъв нов източник на злато. T1/T2 се продават в магазина
 * (buy ≥ 3.3× sell → купи→продай винаги е на загуба, вкл. −30% офертата);
 * T3+ НЕ са в магазина — печелят се (дроп/подземия/Mythic+).
 */
import { ITEM_SETS, type KitPiece, type SetClass, type WeaponKind } from './sets';

type Triple = [def: number, hp: number, stat: number];
type ArmorSlot = 'helm' | 'armor' | 'gloves' | 'boots' | 'shield' | 'cloak';

/** Броня по тир: T1/T2 по слот (generic също варира), T3+ еднаква за всички слотове. */
const ARMOR_CURVE: Record<number, Record<ArmorSlot, Triple> | Triple> = {
  1: { helm: [3, 7, 1], armor: [5, 14, 2], gloves: [2, 4, 1], boots: [2, 4, 1], shield: [5, 8, 2], cloak: [2, 6, 1] },
  2: { helm: [6, 15, 2], armor: [11, 30, 3], gloves: [4, 10, 2], boots: [4, 10, 2], shield: [10, 19, 3], cloak: [5, 13, 2] },
  3: [19, 70, 6],
  4: [31, 132, 8],
  5: [40, 160, 9],
  6: [58, 180, 10],
  7: [80, 196, 13],
  8: [108, 240, 17],
  9: [148, 360, 23],
  10: [198, 500, 31],
  11: [262, 665, 41],
  12: [335, 860, 53],
};

/** Оръжие по тир: [atk_min, atk_max, hp, stat]. */
const WEAPON_CURVE: Record<number, [number, number, number, number]> = {
  1: [4, 9, 0, 2],
  2: [10, 18, 0, 3],
  3: [24, 40, 60, 6],
  4: [52, 86, 132, 8],
  5: [85, 135, 160, 9],
  6: [135, 205, 180, 10],
  7: [215, 310, 196, 13],
  8: [330, 465, 240, 17],
  9: [490, 665, 360, 23],
  10: [690, 910, 500, 31],
  11: [920, 1215, 665, 41],
  12: [1180, 1560, 860, 53],
};

/** MP на наметало/жезъл (не е боен стат — само вкус/запас за умения). */
const MP_CURVE: Record<number, number> = {
  1: 8, 2: 18, 3: 28, 4: 35, 5: 50, 6: 80, 7: 120, 8: 180, 9: 280, 10: 400, 11: 530, 12: 700,
};

/** Продажна цена по тир (≈1.1× generic, ≤ generic на следващия тир). */
export const SET_SELL_PRICE: Record<number, number> = {
  1: 6, 2: 30, 3: 250, 4: 600, 5: 1500, 6: 4000, 7: 8600, 8: 18000, 9: 36000, 10: 80000, 11: 160000, 12: 320000,
};
/** Покупна цена в магазина — само ниските тирове. */
export const SET_SHOP_PRICE: Record<number, number> = { 1: 20, 2: 100 };

const WEAPON_META: Record<WeaponKind, { sub_type: string; icon: string }> = {
  sword: { sub_type: 'sword', icon: 'sword' },
  axe: { sub_type: 'axe', icon: 'axe' },
  mace: { sub_type: 'axe', icon: 'mace' },
  bow: { sub_type: 'bow', icon: 'bow' },
  staff: { sub_type: 'staff', icon: 'staff' },
  dagger: { sub_type: 'sword', icon: 'dagger' }, // конвенция: кинжалите са sub_type 'sword' (classWeaponSkill)
};

type StatKey = 'str_bonus' | 'dex_bonus' | 'con_bonus' | 'int_bonus' | 'cha_bonus' | 'wis_bonus';
const PRIMARY: Record<SetClass, StatKey> = {
  warrior: 'str_bonus', ranger: 'dex_bonus', mage: 'int_bonus', rogue: 'dex_bonus',
};
/** Атрибут по слот; `cls` = undefined → универсален сет (generic разпределение). */
function slotStat(slot: KitPiece['slot'], cls: SetClass | undefined): StatKey {
  switch (slot) {
    case 'helm': case 'armor': case 'shield': return 'con_bonus';
    case 'cloak': return 'wis_bonus';
    case 'gloves': return cls ? PRIMARY[cls] : 'str_bonus';
    case 'boots': return cls ? PRIMARY[cls] : 'dex_bonus';
    case 'weapon': return cls ? PRIMARY[cls] : 'str_bonus';
  }
}

export interface SetPieceRow {
  slug: string; name: string; category: string; sub_type: string; tier: number; rarity: string;
  level_req: number; class_req: string;
  atk_min: number; atk_max: number; defense: number; hp_bonus: number; mp_bonus: number;
  str_bonus: number; dex_bonus: number; con_bonus: number; int_bonus: number; cha_bonus: number; wis_bonus: number;
  buy_price: number; sell_price: number; icon: string; description: string;
  set_slug: string;
}

function armorTriple(tier: number, slot: ArmorSlot): Triple {
  const c = ARMOR_CURVE[tier];
  return Array.isArray(c) ? c : c[slot];
}

function buildSetPieces(): SetPieceRow[] {
  const out: SetPieceRow[] = [];
  for (const set of ITEM_SETS) {
    if (!set.kit) continue;
    const t = set.tier;
    const cls = set.class_focus;
    for (let i = 0; i < set.kit.length; i++) {
      const p = set.kit[i];
      const row: SetPieceRow = {
        slug: set.pieces[i], name: p.name, category: '', sub_type: '', tier: t, rarity: set.rarity,
        level_req: set.level_req ?? 1, class_req: cls ?? '',
        atk_min: 0, atk_max: 0, defense: 0, hp_bonus: 0, mp_bonus: 0,
        str_bonus: 0, dex_bonus: 0, con_bonus: 0, int_bonus: 0, cha_bonus: 0, wis_bonus: 0,
        buy_price: SET_SHOP_PRICE[t] ?? 0, sell_price: SET_SELL_PRICE[t], icon: '',
        description: `Part of the ${set.name} set (${set.kit.length} pieces).`,
        set_slug: set.slug,
      };
      if (p.slot === 'weapon') {
        const kind = p.weapon!;
        const [amin, amax, hp, stat] = WEAPON_CURVE[t];
        row.category = 'weapon';
        row.sub_type = WEAPON_META[kind].sub_type;
        row.icon = WEAPON_META[kind].icon;
        row.atk_min = amin; row.atk_max = amax; row.hp_bonus = hp;
        row[slotStat('weapon', cls)] += stat;
        if (kind === 'staff') {
          row.mp_bonus = MP_CURVE[t];
          if (t <= 2) row.wis_bonus += 1; // като generic жезлите на ниските тирове
        }
      } else {
        const [def, hp, stat] = armorTriple(t, p.slot);
        row.category = p.slot;
        row.icon = p.slot;
        row.defense = def; row.hp_bonus = hp;
        row[slotStat(p.slot, cls)] += stat;
        if (p.slot === 'cloak') row.mp_bonus = MP_CURVE[t];
      }
      out.push(row);
    }
  }
  return out;
}

/** Всички генерирани части (добавят се в края на ITEM_SEED). */
export const SET_PIECE_SEED: SetPieceRow[] = buildSetPieces();
