/**
 * Екипируемите уникати, които маршрутите вписват в БД при първо ползване:
 * сезонни трофеи (routes/events.ts), realm boss дропове (routes/realmBoss.ts)
 * и Tower of Trials екипировка (routes/trialCache.ts).
 *
 * Преди статовете им живееха разпръснати в SQL-а на всеки маршрут — извън
 * погледа на кривата (realm гримоарът беше 600–950 atk на lv 250 при общи
 * 420–580 на lv 280). Сега са ЕДНО място с пълни редове: маршрутите, сийдът
 * (`npm run seed`), scripts/export-item-visuals.ts и тестът на кривата
 * (__tests__/uniqueCurve.test.ts) четат оттук → статове и каталог не могат
 * да се разминат.
 *
 * Правило на кривата: game/itemCurve.ts. Тир = лентата на нивото
 * (tierForEffectiveLevel), продажна цена ≤ SET_SELL_PRICE[тир].
 */
import type Database from 'better-sqlite3';
import { SET_SELL_PRICE } from './setPieces';

export interface RuntimeItemRow {
  slug: string; name: string; category: string; sub_type: string; tier: number; rarity: string;
  level_req: number; class_req: string;
  atk_min: number; atk_max: number; defense: number; hp_bonus: number; mp_bonus: number;
  str_bonus: number; dex_bonus: number; con_bonus: number; int_bonus: number; cha_bonus: number; wis_bonus: number;
  heal_hp: number; heal_mp: number; buy_price: number; sell_price: number; icon: string; description: string;
  set_slug: string;
}

type Stats = Partial<Pick<RuntimeItemRow,
  'atk_min' | 'atk_max' | 'defense' | 'hp_bonus' | 'mp_bonus' |
  'str_bonus' | 'dex_bonus' | 'con_bonus' | 'int_bonus' | 'cha_bonus' | 'wis_bonus'>>;

function row(
  base: Pick<RuntimeItemRow, 'slug' | 'name' | 'category' | 'tier' | 'rarity' | 'level_req' | 'sell_price' | 'description'> &
    { sub_type?: string; icon?: string },
  stats: Stats,
): RuntimeItemRow {
  return {
    sub_type: '', class_req: '', icon: base.icon ?? base.category,
    atk_min: 0, atk_max: 0, defense: 0, hp_bonus: 0, mp_bonus: 0,
    str_bonus: 0, dex_bonus: 0, con_bonus: 0, int_bonus: 0, cha_bonus: 0, wis_bonus: 0,
    heal_hp: 0, heal_mp: 0, buy_price: 0, set_slug: '',
    ...base, ...stats,
  };
}

/* ─────────── сезонни трофеи (lv 220, T7) — купуват се със сезонни точки ───────────
 * Бяха „T9" с def/hp над общия амулет/пръстен на lv 230 и по 18 в ЧЕТИРИ
 * атрибута (72 — ~5× бюджета на общия предмет). Сега: следващият тир (cosmic,
 * lv 230) +~9% в общия бюджет; формата (четирите атрибута) е запазена. */
export const SEASON_TROPHY_ITEMS: RuntimeItemRow[] = [
  row({ slug: 'season_trophy_frostmoot', name: 'Frostmoot Ledger of the Hunt', category: 'amulet', tier: 7, rarity: 'legendary', level_req: 220, sell_price: 0, description: 'A T7 amulet, season-locked.' },
    { defense: 42, hp_bonus: 194, mp_bonus: 153, str_bonus: 12, con_bonus: 12, int_bonus: 12, wis_bonus: 12 }),
  row({ slug: 'season_trophy_bloomtide', name: "Bloomtide Hunter's Wreath", category: 'cloak', tier: 7, rarity: 'legendary', level_req: 220, sell_price: 0, description: 'A T7 cloak, season-locked.' },
    { defense: 46, hp_bonus: 205, mp_bonus: 116, str_bonus: 12, con_bonus: 12, int_bonus: 12, wis_bonus: 12 }),
  row({ slug: 'season_trophy_sunhigh', name: 'Sunhigh Ember-Crown', category: 'helm', tier: 7, rarity: 'legendary', level_req: 220, sell_price: 0, description: 'A T7 helm, season-locked.' },
    { defense: 55, hp_bonus: 173, mp_bonus: 86, str_bonus: 12, con_bonus: 12, int_bonus: 12, wis_bonus: 12 }),
  row({ slug: 'season_trophy_emberfall', name: "Emberfall Reaper's Ring", category: 'ring', tier: 7, rarity: 'legendary', level_req: 220, sell_price: 0, description: 'A T7 ring, season-locked.' },
    { defense: 29, hp_bonus: 186, mp_bonus: 143, str_bonus: 14, con_bonus: 14, int_bonus: 14, wis_bonus: 14 }),
];

/* ─────────── realm boss дропове (lv 250, T8) — само за убийствения удар ───────────
 * Бяха „T10" (продажба по T10) с гримоар 600–950 atk и шлем/броня/наметало
 * 1.3–1.5× над общия предмет на lv 280. Сега: следващият тир (eldritch,
 * lv 280) +~6%; амулетът и пръстенът и преди бяха под кривата — непипнати. */
const REALM_DESC = 'One of the six Realm Boss legendaries. Only drops to the hero who lands the killing blow.';
const REALM_SELL = SET_SELL_PRICE[8];
export const REALM_DROP_ITEMS: RuntimeItemRow[] = [
  row({ slug: 'realm_thalion_crown', name: 'Sunless Crown of Thalion', category: 'helm', tier: 8, rarity: 'legendary', level_req: 250, sell_price: REALM_SELL, description: REALM_DESC },
    { defense: 101, hp_bonus: 354, mp_bonus: 126, con_bonus: 13 }),
  row({ slug: 'realm_vethryx_scale', name: 'Spine-of-Sky Scaleplate', category: 'armor', tier: 8, rarity: 'legendary', level_req: 250, sell_price: REALM_SELL, description: REALM_DESC },
    { defense: 100, hp_bonus: 355, str_bonus: 20 }),
  row({ slug: 'realm_orsis_pendant', name: 'Drowned-God Pendant of Orsis', category: 'amulet', tier: 8, rarity: 'legendary', level_req: 250, sell_price: REALM_SELL, description: REALM_DESC },
    { hp_bonus: 380, mp_bonus: 220 }),
  row({ slug: 'realm_kallosh_grimoire', name: "Kallosh's Marrow Grimoire", category: 'weapon', sub_type: 'staff', icon: 'staff', tier: 8, rarity: 'legendary', level_req: 250, sell_price: REALM_SELL, description: REALM_DESC },
    { atk_min: 388, atk_max: 614, hp_bonus: 181, mp_bonus: 207 }),
  row({ slug: 'realm_dawn_unmaker_ash', name: 'Ash of the Dawn-Unmaker', category: 'cloak', tier: 8, rarity: 'legendary', level_req: 250, sell_price: REALM_SELL, description: REALM_DESC },
    { defense: 74, hp_bonus: 380, mp_bonus: 232, con_bonus: 12 }),
  row({ slug: 'realm_unnamed_sigil', name: "The Sigil That Wasn't Named", category: 'ring', tier: 8, rarity: 'legendary', level_req: 250, sell_price: REALM_SELL, description: REALM_DESC },
    { hp_bonus: 350, mp_bonus: 200, str_bonus: 26 }),
];

/* ─────────── Tower of Trials (купува се с trial токени, веднъж) ─────────── */
export const TRIAL_GEAR_ITEMS: RuntimeItemRow[] = [
  row({ slug: 'trial_crown', name: 'Trial Crown', category: 'helm', tier: 2, rarity: 'epic', level_req: 12, sell_price: SET_SELL_PRICE[2], description: 'A relic helm from the Tower of Trials.' },
    { defense: 6, hp_bonus: 35, con_bonus: 2, int_bonus: 2 }),
  row({ slug: 'trial_aegis', name: 'Trial Aegis', category: 'armor', tier: 2, rarity: 'epic', level_req: 15, sell_price: SET_SELL_PRICE[2], description: 'Plate forged from compressed floor-energy.' },
    { defense: 13, hp_bonus: 62, str_bonus: 3, con_bonus: 4, wis_bonus: 1 }),
  // Мащабира се с кулата (game/stats.ts → wyrmsongClimb), но таванът на
  // растежа следва и НИВОТО на героя — иначе висок етаж на ниско ниво
  // даваше над следващия тир.
  row({ slug: 'wyrmsong_blade', name: 'Wyrmsong', category: 'weapon', sub_type: 'sword', icon: 'sword', tier: 2, rarity: 'legendary', level_req: 18, sell_price: SET_SELL_PRICE[2], description: 'A blade that hums louder the higher you climb.' },
    { atk_min: 14, atk_max: 32, str_bonus: 6 }),
];

export const RUNTIME_ITEM_SEED: RuntimeItemRow[] = [...SEASON_TROPHY_ITEMS, ...REALM_DROP_ITEMS, ...TRIAL_GEAR_ITEMS];

const UPSERT_SQL = `
  INSERT INTO items (
    slug, name, category, sub_type, tier, rarity, level_req, class_req,
    atk_min, atk_max, defense, hp_bonus, mp_bonus,
    str_bonus, dex_bonus, con_bonus, int_bonus, cha_bonus, wis_bonus,
    heal_hp, heal_mp, buy_price, sell_price, icon, description, set_slug
  ) VALUES (
    @slug, @name, @category, @sub_type, @tier, @rarity, @level_req, @class_req,
    @atk_min, @atk_max, @defense, @hp_bonus, @mp_bonus,
    @str_bonus, @dex_bonus, @con_bonus, @int_bonus, @cha_bonus, @wis_bonus,
    @heal_hp, @heal_mp, @buy_price, @sell_price, @icon, @description, @set_slug
  )
  ON CONFLICT(slug) DO UPDATE SET
    name = excluded.name, category = excluded.category, sub_type = excluded.sub_type, tier = excluded.tier,
    rarity = excluded.rarity, level_req = excluded.level_req, class_req = excluded.class_req,
    atk_min = excluded.atk_min, atk_max = excluded.atk_max, defense = excluded.defense,
    hp_bonus = excluded.hp_bonus, mp_bonus = excluded.mp_bonus,
    str_bonus = excluded.str_bonus, dex_bonus = excluded.dex_bonus, con_bonus = excluded.con_bonus,
    int_bonus = excluded.int_bonus, cha_bonus = excluded.cha_bonus, wis_bonus = excluded.wis_bonus,
    heal_hp = excluded.heal_hp, heal_mp = excluded.heal_mp, buy_price = excluded.buy_price,
    sell_price = excluded.sell_price, icon = excluded.icon, description = excluded.description,
    set_slug = excluded.set_slug`;

/** UPSERT по slug (id-то се пази → инвентарът не осиротява). */
export function upsertRuntimeItems(db: Database.Database, rows: readonly RuntimeItemRow[]): void {
  const st = db.prepare(UPSERT_SQL);
  db.transaction(() => { for (const r of rows) st.run(r); })();
}

/** Веднъж на процес: вписва/опреснява редовете (маршрутите го викат при
 *  първо ползване — стар ред в БД получава текущите статове без ре-сийд). */
const synced = new Set<string>();
export function ensureRuntimeItems(db: Database.Database, rows: readonly RuntimeItemRow[]): void {
  const todo = rows.filter((r) => !synced.has(r.slug));
  if (!todo.length) return;
  upsertRuntimeItems(db, todo);
  for (const r of todo) synced.add(r.slug);
}
