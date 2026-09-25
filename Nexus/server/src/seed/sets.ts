/**
 * Item Sets — Nexus Dominion.
 *
 * Each set defines a themed collection of equipment pieces and the bonuses
 * a hero receives at 2 / 4 / 6 simultaneously equipped pieces. The bonus
 * tier system is a standard MMORPG progression pattern; all set names,
 * piece lists, lore, and bonus values are original designs.
 *
 * Преработка „уникални сетове" (2026-09):
 *  • Всеки сет има СОБСТВЕНИ части. Ранните 8 сета (wayfarer … mythwoven)
 *    преди деляха общите leather/chain/plate/cloth предмети — сега всеки има
 *    свой `kit` (генерира се в seed/setPieces.ts по кривата на тира).
 *  • Старите общи предмети стават `legacy_pieces`: продължават да се броят
 *    за СЪЩИЯ сет като преди (играч, който днес ги носи, не губи бонус). Нищо
 *    не е изтрито.
 *  • Нова матрица: по един класов сет за всеки клас (warrior/ranger/mage/rogue)
 *    на всеки тир 1–12. Универсалните сетове (wayfarer, mythwoven, elite …
 *    primordial) остават.
 *  • Всеки сет носи `theme` — визуалният договор с 3D иконите/прегледа
 *    (scripts/export-item-visuals.ts → client/public/assets/items3d/catalog.json).
 */

export interface SetBonus {
  hp_bonus?: number;
  mp_bonus?: number;
  str_bonus?: number;
  dex_bonus?: number;
  con_bonus?: number;
  int_bonus?: number;
  wis_bonus?: number;
  cha_bonus?: number;
  defense_bonus?: number;
  atk_bonus?: number;
  crit_bonus?: number;   // flat % bonus to crit chance (e.g. 0.05 = +5%)
  dodge_bonus?: number;  // flat % bonus to dodge chance
}

export type SetClass = 'warrior' | 'ranger' | 'mage' | 'rogue';
export type SetRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/* ───────────── визуална тема (договор с 3D агента) ───────────── */
export type ThemeFamily =
  | 'leather' | 'mail' | 'plate' | 'cloth' | 'bone' | 'crystal' | 'void'
  | 'celestial' | 'infernal' | 'verdant' | 'shadow' | 'arcane' | 'storm' | 'frost';
export type ThemeMotif =
  | 'plain' | 'rivets' | 'filigree' | 'spikes' | 'runes' | 'feathers'
  | 'scales' | 'thorns' | 'stars' | 'flames';
export type ThemeFinish = 'matte' | 'worn' | 'polished' | 'enameled' | 'glowing';

export interface SetTheme {
  family: ThemeFamily;
  primary: string;   // #rrggbb
  secondary: string; // #rrggbb
  trim: string;      // #rrggbb
  emissive?: string; // #rrggbb — задължително при finish 'glowing'
  motif: ThemeMotif;
  finish: ThemeFinish;
}

/* ───────────── части на сета ───────────── */
export type KitSlot = 'helm' | 'armor' | 'gloves' | 'boots' | 'cloak' | 'shield' | 'weapon';
export type WeaponKind = 'sword' | 'axe' | 'mace' | 'bow' | 'staff' | 'dagger';

/** Една собствена част: слот + показвано име (оръжието носи и вида си). */
export interface KitPiece {
  slot: KitSlot;
  name: string;
  weapon?: WeaponKind;
}

export interface SetDef {
  slug: string;
  name: string;
  tier: number;
  rarity: SetRarity;
  class_focus?: SetClass;
  lore: string;
  /** Уникалните части на сета (slug-ове). Никой slug не е в два сета. */
  pieces: string[];
  /**
   * Обратна съвместимост: общите предмети, които ПРЕДИ преработката бяха
   * части на сета. Броят се за същия сет (stats.ts → setMembers), за да не
   * загуби бонус никой, който ги носи. Не се показват като „части".
   */
  legacy_pieces?: string[];
  /** Собствените части, генерирани в seed/setPieces.ts (липсва при сетовете
   *  от generic tier екипировка — elite … primordial). */
  kit?: KitPiece[];
  /** level_req на генерираните части (по тира, SET_LEVEL_REQ). */
  level_req?: number;
  theme: SetTheme;
  bonus_2?: SetBonus;
  bonus_4?: SetBonus;
  bonus_6?: SetBonus;
}

/**
 * Ниво на частите по тир. Малко над входа на тира (затова частта е малко
 * по-силна от общия предмет на тира), но под входа на следващия.
 * T3 е широк (lv 12–59) — сетовете му са в средата (lv 30).
 */
export const SET_LEVEL_REQ: Record<number, number> = {
  1: 3, 2: 8, 3: 30, 4: 70, 5: 105, 6: 145, 7: 195, 8: 245, 9: 295, 10: 340, 11: 400, 12: 460,
};

/** Рядкост на класовите сетове по тир. */
const CLASS_SET_RARITY: Record<number, SetRarity> = {
  1: 'uncommon', 2: 'uncommon', 3: 'rare', 4: 'rare', 5: 'epic', 6: 'epic',
  7: 'epic', 8: 'epic', 9: 'legendary', 10: 'legendary', 11: 'legendary', 12: 'legendary',
};

/** slug на генерирана част: <set>_<slot> или <set>_<вид оръжие>. */
export function kitPieceSlug(setSlug: string, p: KitPiece): string {
  return `${setSlug}_${p.slot === 'weapon' ? p.weapon : p.slot}`;
}

/* ───────────── класови бонуси (2/4/6), мащабирани по тир ───────────── */

/**
 * Бюджет на пълния 6-частов бонус по тир — изведен от съществуващите
 * универсални сетове (elite T4 … primordial T12: сумарно hp/def/str/atk при
 * 6 части), за да се мащабират класовите сетове като тях. T3/T4 са
 * калибрирани спрямо историческите sunforged/voidshard (ръчни бонуси, които
 * не бива да падат), за да няма класов дисбаланс на lv 30–130.
 */
const BONUS_BUDGET: Record<number, { hp: number; def: number; stat: number; atk: number }> = {
  1: { hp: 40, def: 4, stat: 3, atk: 2 },
  2: { hp: 180, def: 18, stat: 8, atk: 10 },
  3: { hp: 470, def: 34, stat: 14, atk: 24 },
  4: { hp: 560, def: 48, stat: 18, atk: 26 },
  5: { hp: 1000, def: 95, stat: 22, atk: 28 },
  6: { hp: 1620, def: 134, stat: 32, atk: 44 },
  7: { hp: 2560, def: 216, stat: 46, atk: 70 },
  8: { hp: 4000, def: 346, stat: 70, atk: 111 },
  9: { hp: 6000, def: 522, stat: 102, atk: 169 },
  10: { hp: 9400, def: 810, stat: 158, atk: 266 },
  11: { hp: 14700, def: 1265, stat: 245, atk: 414 },
  12: { hp: 22800, def: 1975, stat: 382, atk: 650 },
};

/**
 * Класов профил (дял от бюджета). Ядрото (HP/DEF/основен стат/atk) е ЕДНАКВО
 * за всички класове — така пълният класов сет ≈ универсалния сет на тира, но
 * с полезния за класа стат (универсалните дават STR, който помага само на
 * воина). Вкусът е отгоре и е малък: стрелец — crit, разбойник — dodge/crit,
 * маг — MP/WIS. Crit/dodge се капват в deriveStats (0.50/0.45), затова не
 * носят реална тежест на високо ниво. Калибрирано с харнеса
 * (balanceHarness.ts, режим „sets"): клас срещу клас 45–55% на lv 50–500;
 * класов сет срещу универсалния 6-частов в същия тир 54–69%, срещу следващия
 * тир 2–21% (scripts/balance-sim.ts).
 */
const CLASS_WEIGHTS: Record<SetClass, { hp: number; def: number; stat: number; atk: number }> = {
  warrior: { hp: 1.0, def: 1.0, stat: 1.0, atk: 1.0 },
  ranger: { hp: 1.0, def: 1.0, stat: 1.0, atk: 1.0 },
  mage: { hp: 1.0, def: 1.0, stat: 1.0, atk: 1.0 },
  rogue: { hp: 1.0, def: 1.0, stat: 1.0, atk: 1.0 },
};
const PRIMARY_KEY: Record<SetClass, 'str_bonus' | 'dex_bonus' | 'int_bonus'> = {
  warrior: 'str_bonus', ranger: 'dex_bonus', mage: 'int_bonus', rogue: 'dex_bonus',
};
/** Дял на всеки праг (2 / 4 / 6) от пълния бюджет — кумулативно 20% / 55% / 100%. */
const STEP = [0.2, 0.35, 0.45] as const;
/** Процентен „вкус" по тир (crit/dodge), нараства бавно: T1 3% … T12 14%. */
const flavorPct = (tier: number) => Math.round((0.02 + 0.01 * tier) * 100) / 100;

function strip(b: SetBonus): SetBonus {
  const out: SetBonus = {};
  for (const [k, v] of Object.entries(b) as [keyof SetBonus, number][]) if (v) out[k] = v;
  return out;
}

/** Бонусите 2/4/6 на класов сет за даден тир (детерминистично от бюджета). */
export function classSetBonuses(cls: SetClass, tier: number): Pick<SetDef, 'bonus_2' | 'bonus_4' | 'bonus_6'> {
  const B = BONUS_BUDGET[tier];
  const W = CLASS_WEIGHTS[cls];
  const fl = flavorPct(tier);
  const make = (i: 0 | 1 | 2): SetBonus => {
    const f = STEP[i];
    const b: SetBonus = {
      hp_bonus: Math.round(B.hp * W.hp * f),
      defense_bonus: Math.round(B.def * W.def * f),
      [PRIMARY_KEY[cls]]: Math.max(1, Math.round(B.stat * W.stat * f)),
      atk_bonus: i === 0 ? 0 : Math.round(B.atk * W.atk * f),
    };
    if (cls === 'ranger') {
      if (i === 0) b.crit_bonus = Math.round((fl / 2) * 100) / 100;
      if (i === 2) b.crit_bonus = Math.round((fl / 2) * 100) / 100;
    }
    if (cls === 'rogue') {
      if (i === 0) b.dodge_bonus = Math.round((fl / 2) * 100) / 100;
      if (i === 2) b.crit_bonus = Math.round((fl / 2) * 100) / 100;
    }
    if (cls === 'mage') {
      b.mp_bonus = Math.round(B.hp * 0.5 * f);
      if (i === 2) b.wis_bonus = Math.max(1, Math.round(B.stat * 0.3 * f));
    }
    return strip(b);
  };
  return { bonus_2: make(0), bonus_4: make(1), bonus_6: make(2) };
}

/* ───────────── строители ───────────── */

const CLASS_NOUNS: Record<SetClass, Record<Exclude<KitSlot, 'weapon'>, string>> = {
  warrior: { helm: 'Helm', armor: 'Cuirass', gloves: 'Gauntlets', boots: 'Sabatons', shield: 'Shield', cloak: 'Cloak' },
  ranger: { helm: 'Hood', armor: 'Jerkin', gloves: 'Bracers', boots: 'Treads', cloak: 'Cloak', shield: 'Buckler' },
  mage: { helm: 'Circlet', armor: 'Robe', gloves: 'Handwraps', boots: 'Slippers', cloak: 'Mantle', shield: 'Ward' },
  rogue: { helm: 'Mask', armor: 'Leathers', gloves: 'Grips', boots: 'Softboots', cloak: 'Shroud', shield: 'Parrier' },
};
/** 6-ият слот (освен шлем/броня/ръкавици/ботуши/оръжие) по клас. */
const SIXTH_SLOT: Record<SetClass, 'shield' | 'cloak'> = {
  warrior: 'shield', ranger: 'cloak', mage: 'cloak', rogue: 'cloak',
};
const CLASS_WEAPON: Record<SetClass, WeaponKind[]> = {
  warrior: ['sword', 'axe', 'mace'],
  ranger: ['bow'],
  mage: ['staff'],
  rogue: ['dagger'],
};

interface ClassSetSpec {
  slug: string;
  name: string;
  prefix: string;
  tier: number;
  cls: SetClass;
  lore: string;
  theme: SetTheme;
  weapon: [WeaponKind, string];
  /** Имена по слот, ако се различават от „<prefix> <noun>". */
  names?: Partial<Record<Exclude<KitSlot, 'weapon'>, string>>;
  rarity?: SetRarity;
  legacy?: string[];
  bonuses?: Pick<SetDef, 'bonus_2' | 'bonus_4' | 'bonus_6'>;
}

function classSet(s: ClassSetSpec): SetDef {
  if (!CLASS_WEAPON[s.cls].includes(s.weapon[0])) throw new Error(`${s.slug}: оръжие ${s.weapon[0]} не е за ${s.cls}`);
  const nouns = CLASS_NOUNS[s.cls];
  const name = (slot: Exclude<KitSlot, 'weapon'>) => s.names?.[slot] ?? `${s.prefix} ${nouns[slot]}`;
  const kit: KitPiece[] = [
    { slot: 'helm', name: name('helm') },
    { slot: 'armor', name: name('armor') },
    { slot: 'gloves', name: name('gloves') },
    { slot: 'boots', name: name('boots') },
    { slot: SIXTH_SLOT[s.cls], name: name(SIXTH_SLOT[s.cls]) },
    { slot: 'weapon', weapon: s.weapon[0], name: s.weapon[1] },
  ];
  const gen = classSetBonuses(s.cls, s.tier);
  const b = s.bonuses ?? {};
  return {
    slug: s.slug,
    name: s.name,
    tier: s.tier,
    rarity: s.rarity ?? CLASS_SET_RARITY[s.tier],
    class_focus: s.cls,
    lore: s.lore,
    kit,
    pieces: kit.map((p) => kitPieceSlug(s.slug, p)),
    ...(s.legacy ? { legacy_pieces: s.legacy } : {}),
    level_req: SET_LEVEL_REQ[s.tier],
    theme: s.theme,
    // Ръчно зададените (исторически) прагове се пазят; липсващите се
    // допълват от шаблона (адитивно — никой не губи бонус).
    bonus_2: b.bonus_2 ?? gen.bonus_2,
    bonus_4: b.bonus_4 ?? gen.bonus_4,
    bonus_6: b.bonus_6 ?? gen.bonus_6,
  };
}

interface UniversalKitSpec {
  slug: string;
  name: string;
  tier: number;
  rarity: SetRarity;
  lore: string;
  theme: SetTheme;
  kit: KitPiece[];
  legacy: string[];
  bonus_2?: SetBonus;
  bonus_4?: SetBonus;
  bonus_6?: SetBonus;
}
function universalKitSet(s: UniversalKitSpec): SetDef {
  return {
    slug: s.slug, name: s.name, tier: s.tier, rarity: s.rarity, lore: s.lore,
    kit: s.kit,
    pieces: s.kit.map((p) => kitPieceSlug(s.slug, p)),
    legacy_pieces: s.legacy,
    level_req: SET_LEVEL_REQ[s.tier],
    theme: s.theme,
    bonus_2: s.bonus_2, bonus_4: s.bonus_4, bonus_6: s.bonus_6,
  };
}

/* ═════════════════════════════ СЕТОВЕТЕ ═════════════════════════════ */

export const ITEM_SETS: SetDef[] = [
  /* ===== Tier 1 — Starter set, accessible to every class ===== */
  universalKitSet({
    slug: 'wayfarer',
    name: "Wayfarer's Garb",
    tier: 1,
    rarity: 'common',
    lore:
      'Boiled leather and stitched hide. Worn by every aspiring hero on their first night out of Oaken Hollow.',
    theme: { family: 'leather', primary: '#7a5230', secondary: '#c8a878', trim: '#4a3520', motif: 'plain', finish: 'worn' },
    kit: [
      { slot: 'helm', name: "Wayfarer's Cap" },
      { slot: 'armor', name: "Wayfarer's Coat" },
      { slot: 'gloves', name: "Wayfarer's Gloves" },
      { slot: 'boots', name: "Wayfarer's Boots" },
      { slot: 'cloak', name: "Wayfarer's Cloak" },
    ],
    legacy: ['leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots'],
    bonus_2: { hp_bonus: 8, dex_bonus: 1 },
    bonus_4: { hp_bonus: 18, dex_bonus: 2, defense_bonus: 2 },
  }),

  /* ===== Tier 1 — класови стартови сетове (нови) ===== */
  classSet({
    slug: 'militia', name: 'Militia Brigandine', prefix: 'Militia', tier: 1, cls: 'warrior',
    lore: 'Riveted leather and a borrowed blade — what Oaken Hollow hands a farmhand when the wolves come down from the hills.',
    theme: { family: 'leather', primary: '#6b4a2e', secondary: '#9c2f2f', trim: '#8a8f96', motif: 'rivets', finish: 'worn' },
    weapon: ['sword', 'Militia Arming Sword'],
    names: { shield: 'Militia Buckler', armor: 'Militia Brigandine' },
  }),
  classSet({
    slug: 'trapper', name: "Trapper's Kit", prefix: "Trapper's", tier: 1, cls: 'ranger',
    lore: 'Fur-lined hide and a horn-backed bow, patched through a hundred winters on the Whispering Woods trapline.',
    theme: { family: 'leather', primary: '#8a6a3a', secondary: '#4f5d2f', trim: '#d8c8a0', motif: 'feathers', finish: 'worn' },
    weapon: ['bow', "Trapper's Hornbow"],
  }),
  classSet({
    slug: 'acolyte', name: "Acolyte's Vestments", prefix: "Acolyte's", tier: 1, cls: 'mage',
    lore: 'Undyed wool and a birch rod — the first gift of the Conclave to anyone who can light a candle without flint.',
    theme: { family: 'cloth', primary: '#7d6b9a', secondary: '#e8e0cc', trim: '#b89a5a', motif: 'plain', finish: 'matte' },
    weapon: ['staff', "Acolyte's Rod"],
  }),
  classSet({
    slug: 'cutpurse', name: 'Cutpurse Leathers', prefix: 'Cutpurse', tier: 1, cls: 'rogue',
    lore: 'Soft soles, deep pockets and a sharpened spoon-handle. Bought, never asked where from.',
    theme: { family: 'leather', primary: '#3a3230', secondary: '#6a2a2a', trim: '#9a8a70', motif: 'spikes', finish: 'worn' },
    weapon: ['dagger', 'Cutpurse Shiv'],
  }),

  /* ===== Tier 2 — Class-themed early sets ===== */
  classSet({
    slug: 'ironguard', name: 'Ironguard Plate', prefix: 'Ironguard', tier: 2, cls: 'warrior',
    lore:
      'Standard issue for the Iron Watch — the kingdom-conscripted infantry who patrol the bridges and tollroads.',
    theme: { family: 'mail', primary: '#8a8f96', secondary: '#3b4a5a', trim: '#b08d57', motif: 'rivets', finish: 'worn' },
    weapon: ['sword', 'Ironguard Longsword'],
    names: { armor: 'Ironguard Hauberk', boots: 'Ironguard Greaves', shield: 'Ironguard Kite Shield' },
    legacy: ['chain_helm', 'chain_armor', 'chain_gloves', 'chain_boots', 'kite_shield', 'steel_longsword'],
    bonuses: {
      bonus_2: { hp_bonus: 25, atk_bonus: 1 },
      bonus_4: { hp_bonus: 55, defense_bonus: 6, atk_bonus: 2 },
      bonus_6: { hp_bonus: 100, defense_bonus: 12, atk_bonus: 7 },
    },
  }),
  classSet({
    slug: 'sylvan_marshal', name: 'Sylvan Marshal', prefix: "Sylvan Marshal's", tier: 2, cls: 'ranger',
    lore:
      'Forest-dyed leathers worn by the marshals who walk the Whispering Woods and the high paths of Mistmoor.',
    theme: { family: 'verdant', primary: '#3f6b35', secondary: '#8b6b3e', trim: '#c9b458', motif: 'feathers', finish: 'matte' },
    weapon: ['bow', "Sylvan Marshal's Longbow"],
    legacy: ['leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots', 'elven_bow'],
    bonuses: {
      bonus_2: { dex_bonus: 3, crit_bonus: 0.03 },
      bonus_4: { dex_bonus: 5, dodge_bonus: 0.04, atk_bonus: 3 },
    },
  }),
  classSet({
    slug: 'arcane_conclave', name: 'Arcane Conclave', prefix: 'Conclave', tier: 2, cls: 'mage',
    lore:
      'Spell-thread robes and runed silks granted to junior members of the Conclave at Aedric.',
    theme: { family: 'cloth', primary: '#3b4fa0', secondary: '#d9d2c0', trim: '#c0a060', motif: 'runes', finish: 'matte' },
    weapon: ['staff', 'Conclave Staff'],
    names: { helm: 'Conclave Hood' },
    legacy: ['cloth_hood', 'cloth_robe', 'cloth_gloves', 'cloth_shoes', 'sapphire_staff'],
    bonuses: {
      bonus_2: { mp_bonus: 25, int_bonus: 3 },
      bonus_4: { mp_bonus: 50, int_bonus: 5, wis_bonus: 3 },
    },
  }),
  classSet({
    slug: 'nightveil', name: 'Nightveil', prefix: 'Nightveil', tier: 2, cls: 'rogue',
    lore:
      "A killer's wardrobe. Charcoal hood, black-tinted plates, dyed leather. Made to disappear at dusk.",
    theme: { family: 'shadow', primary: '#26262e', secondary: '#4b3b5c', trim: '#8a8a96', motif: 'plain', finish: 'matte' },
    weapon: ['dagger', 'Nightveil Dagger'],
    names: { helm: 'Nightveil Hood' },
    legacy: ['leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots', 'rusty_dagger'],
    bonuses: {
      bonus_2: { dex_bonus: 3, dodge_bonus: 0.04 },
      bonus_4: { dex_bonus: 5, crit_bonus: 0.05, atk_bonus: 3 },
    },
  }),

  /* ===== Tier 3 — Rare adventurer sets (lv 30) ===== */
  classSet({
    slug: 'sunforged', name: 'Sunforged Champion', prefix: 'Sunforged', tier: 3, cls: 'warrior',
    lore:
      'Forged in the molten kilns of the Ember Spires. Armour that the Lava Titans cannot fully crush.',
    theme: { family: 'plate', primary: '#c26a1e', secondary: '#5a2a14', trim: '#f2c14e', emissive: '#ff7a1a', motif: 'flames', finish: 'polished' },
    weapon: ['sword', 'Sunforged Blade'],
    names: { helm: 'Sunforged Greathelm', shield: 'Sunforged Aegis' },
    legacy: ['plate_helm', 'plate_armor', 'chain_gloves', 'chain_boots', 'flameblade'],
    bonuses: {
      bonus_2: { hp_bonus: 80, atk_bonus: 2 },
      bonus_4: { hp_bonus: 180, defense_bonus: 18, atk_bonus: 11 },
    },
  }),
  classSet({
    slug: 'ashfeather', name: 'Ashfeather Stalker', prefix: 'Ashfeather', tier: 3, cls: 'ranger',
    lore: "Fletched with the grey pinions of Emberreach's cinder hawks. The arrows arrive before the smoke does.",
    theme: { family: 'infernal', primary: '#4a4440', secondary: '#b5471f', trim: '#e0c080', motif: 'feathers', finish: 'matte' },
    weapon: ['bow', 'Ashfeather Recurve'],
  }),
  classSet({
    slug: 'cinderweave', name: 'Cinderweave Regalia', prefix: 'Cinderweave', tier: 3, cls: 'mage',
    lore: 'Silk spun in the sulfur vents of Emberreach. It smoulders when the wearer is angry.',
    theme: { family: 'cloth', primary: '#8a2f1c', secondary: '#2b1a14', trim: '#e3a33b', emissive: '#ff8a3d', motif: 'flames', finish: 'matte' },
    weapon: ['staff', 'Cinderweave Brand'],
  }),
  classSet({
    slug: 'tunnelrat', name: 'Tunnelrat Harness', prefix: 'Tunnelrat', tier: 3, cls: 'rogue',
    lore: "Chain-sleeved and soot-blackened — gear stripped from the scavengers who still haunt Hammerhand's lower shafts.",
    theme: { family: 'mail', primary: '#4b4038', secondary: '#7a6a4a', trim: '#b87333', motif: 'plain', finish: 'worn' },
    weapon: ['dagger', 'Tunnelrat Pick-Knife'],
    names: { armor: 'Tunnelrat Harness' },
  }),

  /* ===== Tier 4 — (lv 70) ===== */
  classSet({
    slug: 'voidshard', name: 'Voidshard Adept', prefix: 'Voidshard', tier: 4, cls: 'mage', rarity: 'epic',
    lore:
      'Robes woven with strands of crystallised dark from the Shadowfell. Whispers of dead empires cling to the fabric.',
    theme: { family: 'void', primary: '#2a1740', secondary: '#0d0d16', trim: '#9b7fd4', emissive: '#b36bff', motif: 'spikes', finish: 'enameled' },
    weapon: ['staff', 'Voidshard Staff'],
    names: { helm: 'Voidshard Cowl' },
    legacy: ['cloth_hood', 'mage_robe', 'cloth_gloves', 'cloth_shoes', 'archmage_staff', 'amulet_of_warding'],
    bonuses: {
      // Исторически бонуси + адитивно HP/DEF на 4/6 (преработката): без тях
      // магът губеше класовия паритет на T4 (харнес, режим „sets"). Само се
      // добавя; 2-частовият праг е непроменен (lv 1 cloth legacy не се пипа).
      bonus_2: { mp_bonus: 60, int_bonus: 6 },
      bonus_4: { mp_bonus: 120, int_bonus: 10, wis_bonus: 8, atk_bonus: 8, hp_bonus: 200, defense_bonus: 14 },
      bonus_6: { mp_bonus: 220, int_bonus: 16, wis_bonus: 14, atk_bonus: 16, crit_bonus: 0.08, hp_bonus: 260, defense_bonus: 20 },
    },
  }),
  classSet({
    slug: 'hammerhand', name: 'Hammerhand Bulwark', prefix: 'Hammerhand', tier: 4, cls: 'warrior',
    lore: 'Runed dwarven steel reclaimed from the fallen holds of Hammerhand Pass. It remembers every hammer-blow that shaped it.',
    theme: { family: 'plate', primary: '#5a5e66', secondary: '#b87333', trim: '#d4af37', motif: 'runes', finish: 'polished' },
    weapon: ['mace', 'Hammerhand Warhammer'],
    names: { shield: 'Hammerhand Tower Shield' },
  }),
  classSet({
    slug: 'stormfletch', name: 'Stormfletch Rangerguard', prefix: 'Stormfletch', tier: 4, cls: 'ranger',
    lore: "Oilcloth and storm-silver, worn by the scouts who ride the thunderheads above the Conclave's towers.",
    theme: { family: 'storm', primary: '#3e5a73', secondary: '#c7d3dd', trim: '#e8e8f0', emissive: '#7fd1ff', motif: 'feathers', finish: 'polished' },
    weapon: ['bow', 'Stormfletch Longbow'],
  }),
  classSet({
    slug: 'duskfang', name: 'Duskfang Assassin', prefix: 'Duskfang', tier: 4, cls: 'rogue',
    lore: 'The guild of the Duskfang paid in blood and was paid in silence. Their leathers never quite dry.',
    theme: { family: 'shadow', primary: '#1f1a24', secondary: '#6b1f2e', trim: '#b0b0b8', motif: 'spikes', finish: 'polished' },
    weapon: ['dagger', 'Duskfang Kris'],
  }),

  /* ===== Tier 5 — Legendary endgame set + класови (lv 105) ===== */
  universalKitSet({
    slug: 'mythwoven',
    name: 'Solar Mythwoven',
    tier: 5,
    rarity: 'legendary',
    lore:
      'A regalia thought lost with the first Hero of the Realm. The fabric drinks sunlight; the steel sheds it.',
    theme: { family: 'celestial', primary: '#f0e2b6', secondary: '#d4a93a', trim: '#fff4d0', emissive: '#ffe08a', motif: 'filigree', finish: 'polished' },
    kit: [
      { slot: 'helm', name: 'Mythwoven Diadem' },
      { slot: 'armor', name: 'Mythwoven Hauberk' },
      { slot: 'gloves', name: 'Mythwoven Gauntlets' },
      { slot: 'boots', name: 'Mythwoven Greaves' },
      { slot: 'cloak', name: 'Mythwoven Mantle' },
      { slot: 'shield', name: 'Mythwoven Sunshield' },
    ],
    legacy: ['plate_helm', 'plate_armor', 'chain_gloves', 'chain_boots', 'dragonbane', 'ring_of_power'],
    bonus_2: { hp_bonus: 150, str_bonus: 6 },
    bonus_4: { hp_bonus: 320, defense_bonus: 24, str_bonus: 10, atk_bonus: 14 },
    bonus_6: { hp_bonus: 600, defense_bonus: 50, str_bonus: 18, atk_bonus: 30, crit_bonus: 0.1, dodge_bonus: 0.05 },
  }),
  classSet({
    slug: 'tidebreaker', name: 'Tidebreaker Plate', prefix: 'Tidebreaker', tier: 5, cls: 'warrior',
    lore: "Scale-mail hauled from the Sunken King's drowned honour guard, still crusted with salt.",
    theme: { family: 'mail', primary: '#2f5d62', secondary: '#c2b280', trim: '#d8dde0', motif: 'scales', finish: 'enameled' },
    weapon: ['axe', 'Tidebreaker Greataxe'],
    names: { shield: 'Tidebreaker Scutum' },
  }),
  classSet({
    slug: 'marshstrider', name: 'Marshstrider Garb', prefix: 'Marshstrider', tier: 5, cls: 'ranger',
    lore: 'Reed-woven and thorn-stitched. The lizardfolk of Saltmarsh never saw the hunters who wore it.',
    theme: { family: 'verdant', primary: '#4d5a2a', secondary: '#7a6040', trim: '#9fbf6f', motif: 'thorns', finish: 'enameled' },
    weapon: ['bow', 'Marshstrider Reedbow'],
  }),
  classSet({
    slug: 'archon', name: 'Aedric Archon Robes', prefix: "Archon's", tier: 5, cls: 'mage',
    lore: "Ceremonial regalia of the Conclave's inner circle, embroidered with gold thread that still hums with old wards.",
    theme: { family: 'arcane', primary: '#5a2d82', secondary: '#e6d8a8', trim: '#ffd700', emissive: '#c89bff', motif: 'filigree', finish: 'enameled' },
    weapon: ['staff', "Archon's Sceptre"],
  }),
  classSet({
    slug: 'corsair', name: 'Saltknife Corsair', prefix: 'Saltknife', tier: 5, cls: 'rogue',
    lore: "Tar-black leathers of the marsh pirates who raided Saltmarsh's pilgrim barges.",
    theme: { family: 'shadow', primary: '#3b2f2a', secondary: '#1f4f5f', trim: '#c0c0c0', motif: 'rivets', finish: 'enameled' },
    weapon: ['dagger', 'Saltknife Dirk'],
  }),

  /* ===== Tier 6 — Frostvale (lv 145) ===== */
  classSet({
    slug: 'frostgiant', name: 'Frostgiant Bastion', prefix: 'Frostgiant', tier: 6, cls: 'warrior',
    lore: 'Plates of rime-hardened iron, each one hacked from the armour of a fallen Frostvale giant.',
    theme: { family: 'frost', primary: '#9ec9e2', secondary: '#3a5a7a', trim: '#ffffff', emissive: '#bfefff', motif: 'spikes', finish: 'polished' },
    weapon: ['axe', 'Frostgiant Cleaver'],
    names: { shield: 'Frostgiant Rampart' },
  }),
  classSet({
    slug: 'wendigo', name: 'Wendigo Hunter', prefix: 'Wendigo', tier: 6, cls: 'ranger',
    lore: 'Bone and antler lashed with sinew. Hunters who wear it swear they can smell fear on the wind.',
    theme: { family: 'bone', primary: '#d8d0bc', secondary: '#4a3a2a', trim: '#8fb8c8', motif: 'thorns', finish: 'polished' },
    weapon: ['bow', 'Wendigo Antlerbow'],
  }),
  classSet({
    slug: 'rimecaller', name: 'Rimecaller Vestments', prefix: 'Rimecaller', tier: 6, cls: 'mage',
    lore: 'Frost-woven robes that never thaw. The hem leaves little crystals on the snow.',
    theme: { family: 'frost', primary: '#dff3ff', secondary: '#5b7fa6', trim: '#a9d8f0', emissive: '#9fe8ff', motif: 'runes', finish: 'enameled' },
    weapon: ['staff', 'Rimecaller Icestaff'],
  }),
  classSet({
    slug: 'snowblind', name: 'Snowblind Stalker', prefix: 'Snowblind', tier: 6, cls: 'rogue',
    lore: 'White-on-white leathers with hoarfrost filigree. In a blizzard, the wearer is simply not there.',
    theme: { family: 'frost', primary: '#eef2f5', secondary: '#9aa8b4', trim: '#cfe3ee', motif: 'filigree', finish: 'polished' },
    weapon: ['dagger', 'Snowblind Icicle'],
  }),

  /* ===== Tier 7 — Black Spire / Stormpeaks (lv 195) ===== */
  classSet({
    slug: 'blackspire', name: 'Blackspire Warplate', prefix: 'Blackspire', tier: 7, cls: 'warrior',
    lore: 'Spiked black iron from the forges beneath the Black Spire. It was made to frighten before it was made to protect.',
    theme: { family: 'plate', primary: '#1c1c1f', secondary: '#7a1010', trim: '#9a9aa2', emissive: '#ff3b1f', motif: 'spikes', finish: 'polished' },
    weapon: ['sword', 'Blackspire Greatsword'],
    names: { shield: 'Blackspire Aegis' },
  }),
  classSet({
    slug: 'skywatcher', name: 'Stormpeak Skywatcher', prefix: 'Skywatcher', tier: 7, cls: 'ranger',
    lore: 'Worn by the eyrie-wardens of the Stormpeaks. The silver threading draws lightning away from the wearer — mostly.',
    theme: { family: 'storm', primary: '#6c7f91', secondary: '#2a3642', trim: '#d9e4ee', emissive: '#a6e1ff', motif: 'filigree', finish: 'enameled' },
    weapon: ['bow', 'Skywatcher Stormbow'],
  }),
  classSet({
    slug: 'tempest', name: 'Tempest Magister', prefix: 'Tempest', tier: 7, cls: 'mage',
    lore: 'Robes of the storm-callers of the high peaks. Static crackles along the runes whenever a spell is half-spoken.',
    theme: { family: 'storm', primary: '#27365c', secondary: '#8fa6c8', trim: '#f2f5ff', emissive: '#6fc3ff', motif: 'runes', finish: 'glowing' },
    weapon: ['staff', 'Tempest Rod'],
  }),
  classSet({
    slug: 'obsidian', name: 'Obsidian Veil', prefix: 'Obsidian', tier: 7, cls: 'rogue',
    lore: "Volcanic glass knapped into scales and blades. It cuts the wearer's shadow as easily as the enemy.",
    theme: { family: 'crystal', primary: '#141018', secondary: '#3d2a4a', trim: '#8c6a9e', emissive: '#c05cff', motif: 'spikes', finish: 'polished' },
    weapon: ['dagger', 'Obsidian Fang'],
  }),

  /* ===== Tier 8 — Voidshade Hollow (lv 245) ===== */
  classSet({
    slug: 'voidbreaker', name: 'Voidbreaker Aegis', prefix: 'Voidbreaker', tier: 8, cls: 'warrior',
    lore: 'Riveted voidsteel from Voidshade Hollow. Where it strikes, the world briefly forgets there was a gap.',
    theme: { family: 'void', primary: '#3b3450', secondary: '#16121f', trim: '#c9c2e0', emissive: '#8a6bff', motif: 'rivets', finish: 'enameled' },
    weapon: ['mace', 'Voidbreaker Maul'],
    names: { shield: 'Voidbreaker Wall' },
  }),
  classSet({
    slug: 'hollowstar', name: 'Hollowstar Seeker', prefix: 'Hollowstar', tier: 8, cls: 'ranger',
    lore: 'Fletchings of a bird that has never touched the ground. The arrows fall upward if the archer loses faith.',
    theme: { family: 'void', primary: '#1d2a3f', secondary: '#4a3d6b', trim: '#b8c6e8', emissive: '#7ab0ff', motif: 'feathers', finish: 'glowing' },
    weapon: ['bow', 'Hollowstar Longbow'],
  }),
  classSet({
    slug: 'nullweave', name: 'Nullweave Oracle', prefix: 'Nullweave', tier: 8, cls: 'mage',
    lore: 'Cloth woven from absence. Oracles of the Hollow wear it to hear what the void is not saying.',
    theme: { family: 'void', primary: '#0f0b1a', secondary: '#5c2d7a', trim: '#e0c8ff', emissive: '#d17bff', motif: 'filigree', finish: 'glowing' },
    weapon: ['staff', 'Nullweave Stave'],
  }),
  classSet({
    slug: 'umbral', name: 'Umbral Whisper', prefix: 'Umbral', tier: 8, cls: 'rogue',
    lore: 'Shadow-inked leathers etched with runes of hush. Footsteps in it make no sound, even in memory.',
    theme: { family: 'shadow', primary: '#15151c', secondary: '#2e2a45', trim: '#6f6a8f', emissive: '#6a5cff', motif: 'runes', finish: 'enameled' },
    weapon: ['dagger', 'Umbral Stiletto'],
  }),

  /* ===== Tier 9 — Mooncradle / Worldspine (lv 295) ===== */
  classSet({
    slug: 'wyrmspine', name: 'Wyrmspine Juggernaut', prefix: 'Wyrmspine', tier: 9, cls: 'warrior',
    lore: "Scales and vertebrae of the Worldspine's elder dragons, bound into armour that still flexes like a living hide.",
    theme: { family: 'bone', primary: '#6b2f24', secondary: '#e3d6b8', trim: '#c89b3c', emissive: '#ff6a3a', motif: 'scales', finish: 'glowing' },
    weapon: ['axe', 'Wyrmspine Headsman'],
    names: { shield: 'Wyrmspine Scale' },
  }),
  classSet({
    slug: 'moonshadow', name: 'Moonshadow Pathfinder', prefix: 'Moonshadow', tier: 9, cls: 'ranger',
    lore: 'Owl-feathered leathers of the Mooncradle wardens, who hunt only by the pale light of the second moon.',
    theme: { family: 'arcane', primary: '#3c4a6e', secondary: '#c9d2e8', trim: '#f4f1ff', emissive: '#b9c8ff', motif: 'feathers', finish: 'glowing' },
    weapon: ['bow', 'Moonshadow Crescent'],
  }),
  classSet({
    slug: 'moonweaver', name: 'Moonweaver Sanctum', prefix: 'Moonweaver', tier: 9, cls: 'mage',
    lore: "Star-charted silks from Mooncradle's observatories. The constellations on the robe drift with the real ones.",
    theme: { family: 'arcane', primary: '#1a1f45', secondary: '#9b8fd9', trim: '#e8e3ff', emissive: '#a99bff', motif: 'stars', finish: 'glowing' },
    weapon: ['staff', 'Moonweaver Orrery'],
  }),
  classSet({
    slug: 'dragonfang', name: 'Dragonfang Reaver', prefix: 'Dragonfang', tier: 9, cls: 'rogue',
    lore: "Leathers of red wyrm-hide and knives cut from a dragon's tooth. They are still warm.",
    theme: { family: 'infernal', primary: '#8e1f1f', secondary: '#2a0f0f', trim: '#e8d3a0', emissive: '#ff4a2a', motif: 'scales', finish: 'glowing' },
    weapon: ['dagger', 'Dragonfang Kukri'],
  }),

  /* ===== Tier 10 — Eternal Throne (lv 340) ===== */
  classSet({
    slug: 'throneguard', name: 'Throneguard Paragon', prefix: 'Throneguard', tier: 10, cls: 'warrior',
    lore: 'Gilded plate of the guard who held the Eternal Throne after its king fell. They held it for a thousand years.',
    theme: { family: 'plate', primary: '#b8912e', secondary: '#5c1a22', trim: '#fff1c2', emissive: '#ffd66b', motif: 'filigree', finish: 'glowing' },
    weapon: ['sword', 'Throneguard Oathblade'],
    names: { shield: 'Throneguard Bulwark' },
  }),
  classSet({
    slug: 'dawnstring', name: 'Dawnstring Sentinel', prefix: 'Dawnstring', tier: 10, cls: 'ranger',
    lore: 'Its bowstring is spun from the first ray of a dawn that happened only once. It hums a note no one has heard since.',
    theme: { family: 'celestial', primary: '#f7d9a8', secondary: '#c0602a', trim: '#fffaf0', emissive: '#ffc070', motif: 'runes', finish: 'glowing' },
    weapon: ['bow', 'Dawnstring Greatbow'],
  }),
  classSet({
    slug: 'crownseer', name: 'Crown-Seer Regalia', prefix: 'Crown-Seer', tier: 10, cls: 'mage',
    lore: "Crystal-filigreed robes of the Throne's prophets. Each facet shows a future the wearer declined.",
    theme: { family: 'crystal', primary: '#7fd6e0', secondary: '#1d4a66', trim: '#f5fbff', emissive: '#9ff4ff', motif: 'filigree', finish: 'glowing' },
    weapon: ['staff', 'Crown-Seer Prism'],
  }),
  classSet({
    slug: 'hellbound', name: 'Hellbound Executioner', prefix: 'Hellbound', tier: 10, cls: 'rogue',
    lore: 'Leathers scorched in the pits below the Eternal Throne. The executioner who wore them never missed twice.',
    theme: { family: 'infernal', primary: '#2b1410', secondary: '#c2410c', trim: '#f59e0b', emissive: '#ff5a1f', motif: 'flames', finish: 'glowing' },
    weapon: ['dagger', 'Hellbound Cinderknife'],
  }),

  /* ===== Tier 11 — Ashen Veil / Starfall Abyss (lv 400) ===== */
  classSet({
    slug: 'dreadnought', name: 'Ashen Dreadnought', prefix: 'Dreadnought', tier: 11, cls: 'warrior',
    lore: 'Bone-plated iron from the Ashen Veil, where the dead still march in formation.',
    theme: { family: 'bone', primary: '#9c968a', secondary: '#2e2b27', trim: '#d6cfc0', emissive: '#7fe0c0', motif: 'spikes', finish: 'glowing' },
    weapon: ['axe', 'Dreadnought Reaper'],
    names: { shield: 'Dreadnought Barricade' },
  }),
  classSet({
    slug: 'starfall', name: 'Starfall Longwatch', prefix: 'Starfall', tier: 11, cls: 'ranger',
    lore: 'Watch-cloaks of the sentinels at the Starfall Abyss. They count the falling stars — and shoot the ones that land.',
    theme: { family: 'void', primary: '#0b1433', secondary: '#34518c', trim: '#ffe9a8', emissive: '#ffd36b', motif: 'stars', finish: 'glowing' },
    weapon: ['bow', 'Starfall Meteorbow'],
  }),
  classSet({
    slug: 'astromancer', name: 'Abyssal Astromancer', prefix: "Astromancer's", tier: 11, cls: 'mage',
    lore: 'Crystalline vestments grown in the Abyss. Tiny stars orbit inside the facets.',
    theme: { family: 'crystal', primary: '#3b2a6e', secondary: '#a78bfa', trim: '#f0e9ff', emissive: '#c4b5fd', motif: 'stars', finish: 'glowing' },
    weapon: ['staff', "Astromancer's Starstaff"],
  }),
  classSet({
    slug: 'gravewind', name: 'Gravewind Phantom', prefix: 'Gravewind', tier: 11, cls: 'rogue',
    lore: 'Raven-feathered shadowcloth. When it moves, the wind smells of turned earth.',
    theme: { family: 'shadow', primary: '#22262b', secondary: '#4a5a52', trim: '#a7b3ad', emissive: '#8cffc8', motif: 'feathers', finish: 'glowing' },
    weapon: ['dagger', 'Gravewind Talon'],
  }),

  /* ===== Tier 12 — Forge of Dawn / Crown of Night / First Light (lv 460) ===== */
  classSet({
    slug: 'dawnforge', name: 'Dawnforge Colossus', prefix: 'Dawnforge', tier: 12, cls: 'warrior',
    lore: 'Hammered in the Forge of Dawn from the slag of the first sunrise. It is still cooling.',
    theme: { family: 'celestial', primary: '#e8a33a', secondary: '#7a2e0e', trim: '#fff6d6', emissive: '#ffb347', motif: 'flames', finish: 'glowing' },
    weapon: ['mace', 'Dawnforge Sunhammer'],
    names: { shield: 'Dawnforge Sunwall' },
  }),
  classSet({
    slug: 'lightwarden', name: 'Lightwarden Vanguard', prefix: 'Lightwarden', tier: 12, cls: 'ranger',
    lore: 'Living wood from the World-Tree of the First Light, strung with starlight. It grows a new leaf for every kill.',
    theme: { family: 'verdant', primary: '#2f7a4a', secondary: '#e9f5d0', trim: '#ffe28a', emissive: '#b8ff8a', motif: 'stars', finish: 'glowing' },
    weapon: ['bow', 'Lightwarden Rootbow'],
  }),
  classSet({
    slug: 'nightcrown', name: 'Nightcrown Archmage', prefix: 'Nightcrown', tier: 12, cls: 'mage',
    lore: 'Void-silk robes of the sorcerers who crowned the night itself. The runes are older than the stars they bind.',
    theme: { family: 'void', primary: '#07060d', secondary: '#27164a', trim: '#b89cff', emissive: '#7c3aed', motif: 'runes', finish: 'glowing' },
    weapon: ['staff', 'Nightcrown Scepter'],
  }),
  classSet({
    slug: 'eclipse', name: 'Eclipse Stalker', prefix: 'Eclipse', tier: 12, cls: 'rogue',
    lore: 'Shadowcloth that eats light. For the length of a heartbeat, the wearer is the eclipse.',
    theme: { family: 'shadow', primary: '#0a0a0a', secondary: '#3a2a10', trim: '#f5c542', emissive: '#ffcf4a', motif: 'stars', finish: 'glowing' },
    weapon: ['dagger', 'Eclipse Crescent'],
  }),

  // ====== TIER SETS от generic tier екипировката (T4 / T6 … T12). Всяка
  // част е уникална за сета (никой друг сет не я ползва); носенето на 4+
  // части от един тир отключва мащабиращите бонуси. Не са преработвани —
  // частите им са и общата екипировка на тира (магазин/дроп/подземия).
  {
    slug: 'elite',
    name: 'Elite Vanguard',
    tier: 4,
    rarity: 'uncommon',
    lore: 'Issued to the kingdom\'s standing legion. Solid, dependable, never glamorous.',
    pieces: ['elite_armor_4', 'elite_helm_4', 'elite_boots_4', 'elite_gloves_4', 'elite_shield_4', 'elite_cloak_4'],
    theme: { family: 'plate', primary: '#6f7a86', secondary: '#8b1e2a', trim: '#c9a45c', motif: 'rivets', finish: 'polished' },
    bonus_2: { hp_bonus: 60, defense_bonus: 6 },
    bonus_4: { hp_bonus: 160, defense_bonus: 18, str_bonus: 4 },
    bonus_6: { hp_bonus: 300, defense_bonus: 36, str_bonus: 8, atk_bonus: 8 },
  },
  {
    slug: 'mythic',
    name: 'Mythic Regalia',
    tier: 6,
    rarity: 'rare',
    lore: 'Pieces forged from a single meteor. They warm the wearer faintly, even at rest.',
    pieces: ['mythic_armor_6', 'mythic_helm_6', 'mythic_boots_6', 'mythic_gloves_6', 'mythic_shield_6', 'mythic_cloak_6'],
    theme: { family: 'infernal', primary: '#5b2e2e', secondary: '#c1662f', trim: '#e8c07a', emissive: '#ff9a55', motif: 'spikes', finish: 'polished' },
    bonus_2: { hp_bonus: 220, defense_bonus: 14 },
    bonus_4: { hp_bonus: 500, defense_bonus: 40, str_bonus: 10, atk_bonus: 14 },
    bonus_6: { hp_bonus: 900, defense_bonus: 80, str_bonus: 22, atk_bonus: 30, crit_bonus: 0.04 },
  },
  {
    slug: 'ascendant',
    name: 'Ascendant Garb',
    tier: 7,
    rarity: 'rare',
    lore: 'Etched with runes that drift across the surface in moonlight.',
    pieces: ['ascendant_armor_7', 'ascendant_helm_7', 'ascendant_boots_7', 'ascendant_gloves_7', 'ascendant_shield_7', 'ascendant_cloak_7'],
    theme: { family: 'arcane', primary: '#cfd6e6', secondary: '#4b5d8a', trim: '#9fd3ff', emissive: '#a8d8ff', motif: 'runes', finish: 'polished' },
    bonus_2: { hp_bonus: 380, defense_bonus: 22 },
    bonus_4: { hp_bonus: 780, defense_bonus: 64, str_bonus: 14, atk_bonus: 22 },
    bonus_6: { hp_bonus: 1400, defense_bonus: 130, str_bonus: 32, atk_bonus: 48, crit_bonus: 0.06 },
  },
  {
    slug: 'cosmic',
    name: 'Cosmic Vestments',
    tier: 8,
    rarity: 'epic',
    lore: 'When the stars align, the wearer briefly feels themselves elsewhere.',
    pieces: ['cosmic_armor_8', 'cosmic_helm_8', 'cosmic_boots_8', 'cosmic_gloves_8', 'cosmic_shield_8', 'cosmic_cloak_8'],
    theme: { family: 'celestial', primary: '#1b2250', secondary: '#5a3fa0', trim: '#e6e0ff', emissive: '#8fb4ff', motif: 'stars', finish: 'glowing' },
    bonus_2: { hp_bonus: 600, defense_bonus: 36 },
    bonus_4: { hp_bonus: 1200, defense_bonus: 100, str_bonus: 22, atk_bonus: 36 },
    bonus_6: { hp_bonus: 2200, defense_bonus: 210, str_bonus: 48, atk_bonus: 75, crit_bonus: 0.08, dodge_bonus: 0.04 },
  },
  {
    slug: 'eldritch',
    name: 'Eldritch Mantle',
    tier: 9,
    rarity: 'epic',
    lore: 'Older than language. The metal remembers what it used to be.',
    pieces: ['eldritch_armor_9', 'eldritch_helm_9', 'eldritch_boots_9', 'eldritch_gloves_9', 'eldritch_shield_9', 'eldritch_cloak_9'],
    theme: { family: 'bone', primary: '#3d4a3a', secondary: '#c9c3a8', trim: '#7a9a6a', emissive: '#7dff9a', motif: 'runes', finish: 'glowing' },
    bonus_2: { hp_bonus: 900, defense_bonus: 52 },
    bonus_4: { hp_bonus: 1800, defense_bonus: 150, str_bonus: 32, atk_bonus: 54 },
    bonus_6: { hp_bonus: 3300, defense_bonus: 320, str_bonus: 70, atk_bonus: 115, crit_bonus: 0.1, dodge_bonus: 0.06 },
  },
  {
    slug: 'divine',
    name: 'Divine Apotheosis',
    tier: 10,
    rarity: 'legendary',
    lore: 'Touched by a god in passing — and never quite the same again.',
    pieces: ['divine_armor_10', 'divine_helm_10', 'divine_boots_10', 'divine_gloves_10', 'divine_shield_10', 'divine_cloak_10'],
    theme: { family: 'celestial', primary: '#fff8e6', secondary: '#e0b44a', trim: '#ffffff', emissive: '#fff2b0', motif: 'feathers', finish: 'glowing' },
    bonus_2: { hp_bonus: 1400, defense_bonus: 80 },
    bonus_4: { hp_bonus: 2800, defense_bonus: 230, str_bonus: 48, atk_bonus: 86 },
    bonus_6: { hp_bonus: 5200, defense_bonus: 500, str_bonus: 110, atk_bonus: 180, crit_bonus: 0.15, dodge_bonus: 0.08 },
  },

  /* ===== „Отвъд Края" сетове (tier 11-12) — мащаб ≈×1.55/tier, продължава
     точната прогресия eldritch→divine. ===== */
  {
    slug: 'veilforged',
    name: 'Veilforged Requiem',
    tier: 11,
    rarity: 'legendary',
    lore: 'Armor hammered from the ash of the old world. It grieves, and it protects.',
    pieces: ['veilforged_armor_11', 'veilforged_helm_11', 'veilforged_boots_11', 'veilforged_gloves_11', 'veilforged_shield_11', 'veilforged_cloak_11'],
    theme: { family: 'shadow', primary: '#5a5a5f', secondary: '#1c1c20', trim: '#b8b8c8', emissive: '#9ab0ff', motif: 'filigree', finish: 'glowing' },
    bonus_2: { hp_bonus: 2200, defense_bonus: 125 },
    bonus_4: { hp_bonus: 4400, defense_bonus: 360, str_bonus: 75, atk_bonus: 134 },
    bonus_6: { hp_bonus: 8100, defense_bonus: 780, str_bonus: 170, atk_bonus: 280, crit_bonus: 0.18, dodge_bonus: 0.1 },
  },
  {
    slug: 'primordial',
    name: 'Primordial Genesis',
    tier: 12,
    rarity: 'legendary',
    lore: 'Forged before the first dawn agreed to rise. The final argument in any war.',
    pieces: ['primordial_armor_12', 'primordial_helm_12', 'primordial_boots_12', 'primordial_gloves_12', 'primordial_shield_12', 'primordial_cloak_12'],
    theme: { family: 'crystal', primary: '#1e3d3a', secondary: '#e8f4f0', trim: '#ffd27a', emissive: '#7affe0', motif: 'runes', finish: 'glowing' },
    bonus_2: { hp_bonus: 3400, defense_bonus: 195 },
    bonus_4: { hp_bonus: 6800, defense_bonus: 560, str_bonus: 117, atk_bonus: 210 },
    bonus_6: { hp_bonus: 12600, defense_bonus: 1220, str_bonus: 265, atk_bonus: 440, crit_bonus: 0.22, dodge_bonus: 0.12 },
  },
];

/**
 * Тема по подразбиране за предмет ИЗВЪН сет (по тир). T4+ следва
 * семейството на универсалния сет на тира, но с „plain" мотив и по-скромен
 * завършек — общият предмет прилича на тира си, без да се бърка със сета.
 */
export const TIER_THEMES: Record<number, SetTheme> = {
  1: { family: 'leather', primary: '#7b5a3c', secondary: '#a88a64', trim: '#5a4028', motif: 'plain', finish: 'worn' },
  2: { family: 'mail', primary: '#8c9196', secondary: '#5a4a3a', trim: '#a3a8ad', motif: 'rivets', finish: 'worn' },
  3: { family: 'plate', primary: '#9aa1a8', secondary: '#4a5058', trim: '#c2c7cc', motif: 'rivets', finish: 'matte' },
  4: { family: 'plate', primary: '#707a84', secondary: '#5a3a3e', trim: '#b9a070', motif: 'plain', finish: 'polished' },
  5: { family: 'mail', primary: '#7d8a99', secondary: '#3e4a5a', trim: '#c8ced6', motif: 'plain', finish: 'polished' },
  6: { family: 'infernal', primary: '#5e3434', secondary: '#9a5a3a', trim: '#d8b27a', motif: 'plain', finish: 'polished' },
  7: { family: 'arcane', primary: '#c6cedf', secondary: '#56648a', trim: '#b6d6f2', motif: 'plain', finish: 'polished' },
  8: { family: 'celestial', primary: '#232a58', secondary: '#4e4190', trim: '#d6d2f2', motif: 'plain', finish: 'enameled' },
  9: { family: 'bone', primary: '#46524a', secondary: '#bdb79e', trim: '#7e9272', emissive: '#6fe08a', motif: 'plain', finish: 'glowing' },
  10: { family: 'celestial', primary: '#f5eedb', secondary: '#cfa855', trim: '#fefcf5', emissive: '#f7e7a8', motif: 'plain', finish: 'glowing' },
  11: { family: 'shadow', primary: '#55555c', secondary: '#26262b', trim: '#aeb0bf', emissive: '#8ea2e8', motif: 'plain', finish: 'glowing' },
  12: { family: 'crystal', primary: '#24433f', secondary: '#d6ebe5', trim: '#f0cd80', emissive: '#6ee8cf', motif: 'plain', finish: 'glowing' },
};

/** Всички предмети, които се броят за сета: уникалните части + legacy. */
export function setMembers(set: SetDef): string[] {
  return set.legacy_pieces ? [...set.pieces, ...set.legacy_pieces] : set.pieces;
}

/** Сетът, чиято УНИКАЛНА част е предметът (legacy не се броят тук). */
export function findSetForItem(slug: string): SetDef | undefined {
  return ITEM_SETS.find((s) => s.pieces.includes(slug));
}

/** Всички сетове, за които предметът се брои (вкл. legacy). */
export function findSetsCountingItem(slug: string): SetDef[] {
  return ITEM_SETS.filter((s) => setMembers(s).includes(slug));
}

/** Собствените (генерирани) части на всички сетове от даден тир. */
export function kitPiecesForTier(tier: number): string[] {
  return ITEM_SETS.filter((s) => s.kit && s.tier === tier).flatMap((s) => s.pieces);
}
