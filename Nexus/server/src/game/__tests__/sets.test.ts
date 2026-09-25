// Регресионни тестове за преработката на сетовете (уникални части, класова
// матрица 4×12, обратна съвместимост, източници, крива, 3D тема).
// Изолирана in-memory база — задай ПРЕДИ първия getDb(); роутерът се зарежда
// динамично в before() (виж admin.test.ts).
process.env.DB_PATH = ':memory:';

import test, { after, before } from 'node:test';
import assert from 'node:assert';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { getDb } from '../../db';
import { signToken } from '../../middleware/auth';
import { ITEM_SEED } from '../../seed/items';
import { DUNGEONS } from '../../seed/dungeons';
import {
  ITEM_SETS, TIER_THEMES, SET_LEVEL_REQ, setMembers,
  type SetBonus, type SetDef, type ThemeFamily, type ThemeMotif, type ThemeFinish,
} from '../../seed/sets';
import { SET_SELL_PRICE } from '../../seed/setPieces';
import { deriveStats } from '../stats';
import { dropPoolSlugs, grantDrop, tierForEffectiveLevel } from '../drops';
import { itemSources } from '../setSources';
import * as H from './balanceHarness';
import type { Character, Item, InventoryEntry } from '../../types/domain';

type Seed = Record<string, any>;
const ITEMS = ITEM_SEED as Seed[];
const bySlug = new Map(ITEMS.map((i) => [i.slug, i]));
const KIT_SETS = ITEM_SETS.filter((s) => s.kit);
const CLASSES = ['warrior', 'ranger', 'mage', 'rogue'] as const;

/* ───────────── БД: реалните предмети с всички колони ───────────── */
const db = getDb();
{
  const cols = ['slug', 'name', 'category', 'sub_type', 'tier', 'rarity', 'level_req', 'class_req', 'atk_min', 'atk_max', 'defense',
    'hp_bonus', 'mp_bonus', 'str_bonus', 'dex_bonus', 'con_bonus', 'int_bonus', 'cha_bonus', 'wis_bonus', 'buy_price', 'sell_price',
    'icon', 'description', 'set_slug'];
  const ins = db.prepare(`INSERT INTO items (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`);
  db.transaction(() => { for (const it of ITEMS) ins.run({ set_slug: '', class_req: '', sub_type: '', ...it }); })();
}

/* ═════════════════ 1. уникални части ═════════════════ */

test('всеки сет има ≥ 4 уникални части; никоя част не е в два сета; всички съществуват', () => {
  const owner = new Map<string, string>();
  for (const s of ITEM_SETS) {
    assert.ok(s.pieces.length >= 4, `${s.slug}: само ${s.pieces.length} части`);
    assert.equal(new Set(s.pieces).size, s.pieces.length, `${s.slug}: дублирана част`);
    for (const p of s.pieces) {
      assert.ok(bySlug.has(p), `${s.slug}: част ${p} липсва в ITEM_SEED`);
      assert.ok(!owner.has(p), `${p} е част и на ${owner.get(p)}, и на ${s.slug}`);
      owner.set(p, s.slug);
    }
  }
  // Уникалните части не са legacy на друг сет (legacy са само общите предмети).
  for (const s of ITEM_SETS) for (const l of s.legacy_pieces ?? []) {
    assert.ok(!owner.has(l), `legacy ${l} на ${s.slug} е уникална част на ${owner.get(l)}`);
  }
  const slugs = ITEMS.map((i) => i.slug);
  assert.equal(new Set(slugs).size, slugs.length, 'дублиран slug в ITEM_SEED');
});

test('генерираните части носят set_slug, клас и оръжие, което съответства на класа', () => {
  const WEAPON_ICONS: Record<string, string[]> = {
    warrior: ['sword', 'axe', 'mace'], ranger: ['bow'], mage: ['staff'], rogue: ['dagger'],
  };
  for (const s of KIT_SETS) {
    const cats = new Set<string>();
    for (const p of s.pieces) {
      const it = bySlug.get(p)!;
      assert.equal(it.set_slug, s.slug, `${p}.set_slug`);
      assert.equal(it.tier, s.tier, `${p}.tier`);
      assert.equal(it.level_req, SET_LEVEL_REQ[s.tier], `${p}.level_req`);
      assert.equal(it.class_req, s.class_focus ?? '', `${p}.class_req`);
      cats.add(it.category);
      if (it.category === 'weapon') {
        assert.ok(s.class_focus, `${s.slug}: универсален сет с оръжие`);
        assert.ok(WEAPON_ICONS[s.class_focus!].includes(it.icon), `${p}: ${it.icon} не е оръжие за ${s.class_focus}`);
      }
    }
    for (const c of ['helm', 'armor', 'gloves', 'boots']) assert.ok(cats.has(c), `${s.slug} няма ${c}`);
  }
  // Общите предмети остават без set_slug (вкл. legacy и elite … primordial).
  for (const it of ITEMS) if (!KIT_SETS.some((s) => s.pieces.includes(it.slug))) assert.ok(!it.set_slug, `${it.slug} има set_slug`);
});

test('класова матрица: по един класов сет за всеки клас на всеки тир 1–12', () => {
  for (let t = 1; t <= 12; t++) for (const c of CLASSES) {
    const n = ITEM_SETS.filter((s) => s.tier === t && s.class_focus === c).length;
    assert.equal(n, 1, `тир ${t} ${c}: ${n} класови сета`);
  }
  // Универсалните остават.
  for (const u of ['wayfarer', 'mythwoven', 'elite', 'mythic', 'ascendant', 'cosmic', 'eldritch', 'divine', 'veilforged', 'primordial']) {
    const s = ITEM_SETS.find((x) => x.slug === u)!;
    assert.ok(s && !s.class_focus, `${u} е универсален`);
  }
  assert.equal(ITEM_SETS.length, 58);
});

/* ═════════════════ 2. крива: малко по-силна, не доминира следващия тир ═════════════════ */

const ATTRS = ['str_bonus', 'dex_bonus', 'con_bonus', 'int_bonus', 'cha_bonus', 'wis_bonus'];
const attrSum = (i: Seed) => ATTRS.reduce((s, k) => s + (i[k] || 0), 0);
const score = (i: Seed) => i.defense + i.hp_bonus / 4 + (i.atk_min + i.atk_max) + attrSum(i) * 2;
const setSlugsAll = new Set(ITEM_SETS.flatMap((s) => (s.kit ? s.pieces : [])));

/** Общият (generic) референтен предмет: магазинен, не-сетов, с най-ниско
 *  ниво в тира; оръжията — от същото „семейство" (икона), кинжал→меч,
 *  наметало/щит без generic в тира → шлем. */
function genericRef(tier: number, it: Seed): Seed | undefined {
  const pool = ITEMS.filter((g) => g.tier === tier && g.buy_price > 0 && !setSlugsAll.has(g.slug) && !g.set_slug);
  const lowest = (xs: Seed[]) => xs.sort((a, b) => a.level_req - b.level_req)[0];
  if (it.category === 'weapon') {
    return lowest(pool.filter((g) => g.category === 'weapon' && g.icon === it.icon))
      ?? lowest(pool.filter((g) => g.category === 'weapon' && g.sub_type === it.sub_type));
  }
  return lowest(pool.filter((g) => g.category === it.category)) ?? lowest(pool.filter((g) => g.category === 'helm'));
}

test('част от сет НЕ надвишава общия предмет на следващия тир (def/hp/atk/сума атрибути)', () => {
  for (const s of KIT_SETS) {
    if (s.tier >= 12) continue;
    for (const p of s.pieces) {
      const it = bySlug.get(p)!;
      const next = genericRef(s.tier + 1, it);
      assert.ok(next, `${p}: няма generic на тир ${s.tier + 1}`);
      for (const f of ['defense', 'hp_bonus', 'atk_min', 'atk_max']) {
        assert.ok(it[f] <= next![f], `${p}.${f} ${it[f]} > ${next!.slug}.${f} ${next![f]}`);
      }
      assert.ok(attrSum(it) <= attrSum(next!), `${p} атрибути ${attrSum(it)} > ${next!.slug} ${attrSum(next!)}`);
      assert.ok(it.sell_price <= next!.sell_price, `${p} sell ${it.sell_price} > ${next!.slug} ${next!.sell_price}`);
    }
  }
});

test('част от сет е поне колкото общия предмет на СЪЩИЯ тир (малко по-силна)', () => {
  for (const s of KIT_SETS) for (const p of s.pieces) {
    const it = bySlug.get(p)!;
    const same = genericRef(s.tier, it);
    if (!same) continue; // T1/T2 наметало няма generic
    assert.ok(score(it) >= score(same), `${p} score ${score(it)} < ${same.slug} ${score(same)}`);
  }
});

test('кривата на частите е монотонна по тир и цените са по кривата (без печалба купи→продай)', () => {
  for (let t = 2; t <= 12; t++) assert.ok(SET_SELL_PRICE[t] > SET_SELL_PRICE[t - 1]);
  for (const cls of CLASSES) {
    const chain = KIT_SETS.filter((s) => s.class_focus === cls).sort((a, b) => a.tier - b.tier);
    for (let k = 1; k < chain.length; k++) {
      for (const slot of ['armor', 'weapon']) {
        const a = bySlug.get(chain[k - 1].pieces.find((p) => bySlug.get(p)!.category === slot)!)!;
        const b = bySlug.get(chain[k].pieces.find((p) => bySlug.get(p)!.category === slot)!)!;
        for (const f of ['defense', 'hp_bonus', 'atk_max']) assert.ok(b[f] >= a[f], `${b.slug}.${f} < ${a.slug}.${f}`);
      }
    }
  }
  for (const it of ITEMS) if (setSlugsAll.has(it.slug) && it.buy_price > 0) {
    assert.ok(it.sell_price < Math.floor(it.buy_price * 0.7), `${it.slug}: sell ${it.sell_price} ≥ −30% оферта`);
  }
});

/* ═════════════════ 3. придобиване ═════════════════ */

test('всяка част от сет има поне един източник на придобиване', () => {
  for (const s of ITEM_SETS) for (const p of s.pieces) {
    assert.ok(itemSources(p).length > 0, `${s.slug}/${p}: няма източник`);
  }
  // Ниските тирове — магазин; T3–T10 — поне едно подземие (+ Mythic+ milestone).
  for (const s of KIT_SETS) for (const p of s.pieces) {
    const src = itemSources(p);
    if (s.tier <= 2) assert.ok(src.includes('shop'), `${p}: T${s.tier} не е в магазина`);
    else assert.ok(!src.includes('shop'), `${p}: T${s.tier} не бива да е в магазина`);
    if (s.tier >= 3 && s.tier <= 10) assert.ok(src.some((x) => x.startsWith('dungeon:')), `${p}: няма подземие`);
  }
});

test('сет клонът на дропа РЕАЛНО тегли всяка собствена част (ниво/клас/тир в БД)', () => {
  for (const s of KIT_SETS) {
    const tier = s.tier;
    // Има ли ниво на противника в тира; героят е на нивото на частите.
    let eff = 0;
    for (let e = 1; e <= 500 && !eff; e++) if (tierForEffectiveLevel(e) === tier) eff = e;
    assert.ok(eff > 0, `тир ${tier} недостижим`);
    const classes = s.class_focus ? [s.class_focus] : CLASSES;
    for (const cls of classes) {
      const pool = dropPoolSlugs(db, tier, SET_LEVEL_REQ[tier], cls, 'set');
      for (const p of s.pieces) assert.ok(pool.includes(p), `${p} не е в сет пула (T${tier}, ${cls})`);
      // Класовата част НЕ пада на друг клас.
      for (const other of CLASSES) {
        if (!s.class_focus || other === s.class_focus) continue;
        const foreign = dropPoolSlugs(db, tier, 500, other, 'set');
        assert.ok(!s.pieces.some((p) => foreign.includes(p)), `${s.slug} пада на ${other}`);
      }
    }
  }
  // Generic клонът не съдържа собствени части (разпределението му е като преди).
  for (let t = 1; t <= 12; t++) {
    const g = dropPoolSlugs(db, t, 500, 'warrior', 'generic');
    assert.ok(g.length > 0);
    assert.ok(!g.some((x) => setSlugsAll.has(x)), `generic пул T${t} съдържа сет част`);
  }
});

test('grantDrop: при сет клон героят получава своя (или универсален) сет, иначе — общ предмет', () => {
  const charId = Number(db.prepare("INSERT INTO characters (name, class, energy_updated_at, created_at) VALUES ('SetDropHero', 'ranger', 0, 0)").run().lastInsertRowid);
  const orig = Math.random;
  try {
    Math.random = () => 0; // < SET_DROP_SHARE → сет клон
    const r = grantDrop(charId, 200, 'ranger', 200);
    const it = bySlug.get(r.slug!.replace(/_dup$/, ''))!;
    assert.ok(it.set_slug, `очакван сет предмет, получен ${r.slug}`);
    assert.ok(it.class_req === '' || it.class_req === 'ranger', `${r.slug}: клас ${it.class_req}`);
    assert.equal(it.tier, 7);
    Math.random = () => 0.99; // generic клон
    const g = grantDrop(charId, 200, 'ranger', 200);
    assert.ok(!bySlug.get(g.slug!.replace(/_dup$/, ''))!.set_slug, `очакван общ предмет, получен ${g.slug}`);
  } finally { Math.random = orig; }
});

test('подземията: сет частите в loot_pool са от тира на средното ниво; generic лутът е запазен', () => {
  const HANDMADE = ['forgotten_crypt', 'orc_warcamp', 'caverns_descent', 'wastes_pilgrimage'];
  const band = DUNGEONS.filter((x) => !HANDMADE.includes(x.slug));
  assert.equal(band.length, 11);
  for (const d of DUNGEONS.filter((x) => HANDMADE.includes(x.slug))) {
    assert.ok(!d.loot_pool.some((p) => setSlugsAll.has(p)), `${d.slug}: ръчното подземие е пипнато`);
  }
  for (const d of band) {
    const setPieces = d.loot_pool.filter((p) => setSlugsAll.has(p));
    const generic = d.loot_pool.filter((p) => !setSlugsAll.has(p));
    assert.equal(generic.length, 5, `${d.slug}: generic лутът е променен`);
    assert.ok(setPieces.length >= 24, `${d.slug}: ${setPieces.length} сет части`);
    const tiers = new Set(setPieces.map((p) => bySlug.get(p)!.tier));
    assert.equal(tiers.size, 1, `${d.slug}: сет части от няколко тира`);
  }
});

/* ═════════════════ 4. обратна съвместимост ═════════════════ */

/** Снимка ПРЕДИ преработката (части + бонуси) — буквално копие. */
const OLD: { slug: string; pieces: string[]; b: (SetBonus | undefined)[] }[] = [
  { slug: 'wayfarer', pieces: ['leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots'], b: [{ hp_bonus: 8, dex_bonus: 1 }, { hp_bonus: 18, dex_bonus: 2, defense_bonus: 2 }] },
  { slug: 'ironguard', pieces: ['chain_helm', 'chain_armor', 'chain_gloves', 'chain_boots', 'kite_shield', 'steel_longsword'], b: [{ hp_bonus: 25, atk_bonus: 1 }, { hp_bonus: 55, defense_bonus: 6, atk_bonus: 2 }, { hp_bonus: 100, defense_bonus: 12, atk_bonus: 7 }] },
  { slug: 'sylvan_marshal', pieces: ['leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots', 'elven_bow'], b: [{ dex_bonus: 3, crit_bonus: 0.03 }, { dex_bonus: 5, dodge_bonus: 0.04, atk_bonus: 3 }] },
  { slug: 'arcane_conclave', pieces: ['cloth_hood', 'cloth_robe', 'cloth_gloves', 'cloth_shoes', 'sapphire_staff'], b: [{ mp_bonus: 25, int_bonus: 3 }, { mp_bonus: 50, int_bonus: 5, wis_bonus: 3 }] },
  { slug: 'nightveil', pieces: ['leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots', 'rusty_dagger'], b: [{ dex_bonus: 3, dodge_bonus: 0.04 }, { dex_bonus: 5, crit_bonus: 0.05, atk_bonus: 3 }] },
  { slug: 'sunforged', pieces: ['plate_helm', 'plate_armor', 'chain_gloves', 'chain_boots', 'flameblade'], b: [{ hp_bonus: 80, atk_bonus: 2 }, { hp_bonus: 180, defense_bonus: 18, atk_bonus: 11 }] },
  { slug: 'voidshard', pieces: ['cloth_hood', 'mage_robe', 'cloth_gloves', 'cloth_shoes', 'archmage_staff', 'amulet_of_warding'], b: [{ mp_bonus: 60, int_bonus: 6 }, { mp_bonus: 120, int_bonus: 10, wis_bonus: 8, atk_bonus: 8 }, { mp_bonus: 220, int_bonus: 16, wis_bonus: 14, atk_bonus: 16, crit_bonus: 0.08 }] },
  { slug: 'mythwoven', pieces: ['plate_helm', 'plate_armor', 'chain_gloves', 'chain_boots', 'dragonbane', 'ring_of_power'], b: [{ hp_bonus: 150, str_bonus: 6 }, { hp_bonus: 320, defense_bonus: 24, str_bonus: 10, atk_bonus: 14 }, { hp_bonus: 600, defense_bonus: 50, str_bonus: 18, atk_bonus: 30, crit_bonus: 0.1, dodge_bonus: 0.05 }] },
];

test('обратна съвместимост: всеки стар член на сет още съществува и се брои за същия сет', () => {
  for (const o of OLD) {
    const s = ITEM_SETS.find((x) => x.slug === o.slug)!;
    for (const p of o.pieces) {
      assert.ok(bySlug.has(p), `${p} е изтрит`);
      assert.ok(setMembers(s).includes(p), `${p} вече не се брои за ${s.slug}`);
    }
    assert.ok(s.pieces.length >= o.pieces.length, `${s.slug}: таванът (${s.pieces.length}) реже старите ${o.pieces.length}`);
    // Бонусите на всеки праг: нито едно поле не е намаляло.
    [s.bonus_2, s.bonus_4, s.bonus_6].forEach((nb, i) => {
      const ob = o.b[i];
      if (!ob) return;
      assert.ok(nb, `${s.slug}: праг ${(i + 1) * 2} изчезна`);
      for (const [k, v] of Object.entries(ob)) assert.ok(((nb as any)[k] ?? 0) >= v, `${s.slug} bonus_${(i + 1) * 2}.${k} ${(nb as any)[k]} < ${v}`);
    });
  }
});

function npc(cls: Character['class'], level = 30): Character {
  return {
    id: 1, user_id: 1, is_npc: 1, name: 'T', class: cls, gender: 'male', portrait: 'x',
    level, xp: 0, gold: 0, stat_points: 0, skill_points: 0, hp: 1, hp_max: 1, mp: 1, mp_max: 1,
    strength: 20, dexterity: 20, constitution: 20, intelligence: 20, charisma: 10, wisdom: 10,
    skill_sword: 0, skill_axe: 0, skill_bow: 0, skill_staff: 0, skill_magic: 0, skill_stealth: 0,
    energy: 0, energy_max: 0, energy_updated_at: 0, arena_rating: 1000, wins: 0, losses: 0, created_at: 0,
  } as unknown as Character;
}
function wear(slugs: string[]): { item: Item; entry: InventoryEntry }[] {
  return slugs.map((slug, idx) => ({
    item: { id: idx + 1, ...bySlug.get(slug)! } as unknown as Item,
    entry: { id: idx + 1, character_id: 1, item_id: idx + 1, quantity: 1, equipped: 1, slot: '' } as InventoryEntry,
  }));
}
/** Старият алгоритъм (буквално): брой носени от старите части → активни прагове. */
function oldActive(slugs: string[]): Map<string, number> {
  const eq = new Set(slugs);
  const m = new Map<string, number>();
  for (const o of OLD) {
    const n = o.pieces.filter((p) => eq.has(p)).length;
    const th = [2, 4, 6].filter((t, i) => n >= t && o.b[i]).length;
    if (th) m.set(o.slug, th);
  }
  return m;
}

test('обратна съвместимост: днешните legacy комплекти пазят ВСИЧКИ активни бонуси (deriveStats)', () => {
  const loadouts: Record<string, string[]> = {
    leather: ['leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots', 'elven_bow'],
    chain: ['chain_helm', 'chain_armor', 'chain_gloves', 'chain_boots', 'kite_shield', 'steel_longsword'],
    plate: ['plate_helm', 'plate_armor', 'chain_gloves', 'chain_boots', 'flameblade', 'ring_of_power'],
    cloth: ['cloth_hood', 'mage_robe', 'cloth_gloves', 'cloth_shoes', 'archmage_staff', 'amulet_of_warding'],
    mythwoven_legacy: ['plate_helm', 'plate_armor', 'chain_gloves', 'chain_boots', 'dragonbane', 'ring_of_power'],
    rogue_leather: ['leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots', 'rusty_dagger'],
  };
  for (const [name, slugs] of Object.entries(loadouts)) {
    const d = deriveStats(npc('warrior'), wear(slugs));
    const now = new Map(d.active_sets.map((a) => [a.set_slug, a.bonuses_active.length]));
    for (const [set, th] of oldActive(slugs)) {
      assert.ok((now.get(set) ?? 0) >= th, `${name}: ${set} имаше ${th} прага, сега ${now.get(set) ?? 0}`);
    }
  }
});

test('обратна съвместимост: legacy + нови части се сумират (смесен комплект), таванът = броя части', () => {
  // 2 legacy chain + 2 нови ironguard → 4 части на Ironguard.
  const mixed = deriveStats(npc('warrior'), wear(['chain_helm', 'chain_armor', 'ironguard_gloves', 'ironguard_boots']));
  const ig = mixed.active_sets.find((a) => a.set_slug === 'ironguard')!;
  assert.equal(ig.pieces_equipped, 4);
  // Mythwoven: 6 нови + legacy оръжие + пръстен → 8 съвпадения, но таван 6.
  const full = ITEM_SETS.find((s) => s.slug === 'mythwoven')!.pieces;
  const mw = deriveStats(npc('warrior'), wear([...full, 'dragonbane', 'ring_of_power']))
    .active_sets.find((a) => a.set_slug === 'mythwoven')!;
  assert.equal(mw.pieces_equipped, 6);
  assert.equal(mw.pieces_total, 6);
  assert.equal(mw.bonuses_active.length, 3);
});

test('пълен нов класов сет дава 2/4/6 и само своя сет (без „чужди" бонуси)', () => {
  for (const s of KIT_SETS.filter((x) => x.pieces.length === 6)) {
    const d = deriveStats(npc(s.class_focus ?? 'warrior', 500), wear(s.pieces));
    assert.deepEqual(d.active_sets.map((a) => a.set_slug), [s.slug], `${s.slug}: активни ${d.active_sets.map((a) => a.set_slug)}`);
    assert.equal(d.active_sets[0].bonuses_active.length, [s.bonus_2, s.bonus_4, s.bonus_6].filter(Boolean).length);
  }
});

/* ═════════════════ 5. баланс ═════════════════ */

test('класови сетове: никой клас над 58% срещу друг (харнес „sets", lv 50–500)', () => {
  for (const L of [50, 100, 150, 200, 300, 420, 500]) {
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const w = H.duel(H.CLASSES[i], H.CLASSES[j], L, 200, 17, 'sets');
      assert.ok(w >= 0.42 && w <= 0.58, `lv${L} ${H.CLASSES[i]} vs ${H.CLASSES[j]}: ${(w * 100).toFixed(0)}%`);
    }
  }
});

test('пълен класов сет: не доминира следващия тир, но в своя тир е малко над универсалния 6-частов', () => {
  // Вход на тир N+1 → класовият сет е от тир N, универсалният (общи предмети + наметало) от N+1.
  for (const L of [60, 130, 180, 230, 280, 320, 380, 440]) {
    for (const c of H.CLASSES) {
      const w = H.gearDuel(c, L, 'sets', 'shop6', 150);
      assert.ok(w <= 0.35, `lv${L} ${c}: сет T${H.classSetFor(c, L)?.tier} бие следващия тир ${(w * 100).toFixed(0)}%`);
    }
  }
  // Един и същ тир: класовата специализация си заслужава, без да е пропаст.
  for (const L of [150, 250, 350, 500]) {
    for (const c of H.CLASSES) {
      const w = H.gearDuel(c, L, 'sets', 'shop6', 150);
      assert.ok(w >= 0.5 && w <= 0.8, `lv${L} ${c}: класов срещу универсален ${(w * 100).toFixed(0)}%`);
    }
  }
});

test('класовите бонуси растат с тира (бойна стойност на пълния 6-частов бонус)', () => {
  const cum = (s: SetDef, k: keyof SetBonus) => [s.bonus_2, s.bonus_4, s.bonus_6].reduce((a, b) => a + ((b?.[k] as number) ?? 0), 0);
  for (const cls of CLASSES) {
    const chain = ITEM_SETS.filter((s) => s.class_focus === cls && s.tier >= 3).sort((a, b) => a.tier - b.tier);
    const key = ({ warrior: 'str_bonus', ranger: 'dex_bonus', mage: 'int_bonus', rogue: 'dex_bonus' } as const)[cls];
    // Исторически сетове (voidshard) разпределят бюджета различно (INT вместо
    // HP), затова се сравнява бойната стойност, не поле по поле.
    const value = (s: SetDef) => cum(s, 'hp_bonus') / 4 + cum(s, 'defense_bonus') + cum(s, key) * 3 + cum(s, 'atk_bonus') * 2 + cum(s, 'wis_bonus');
    for (let k = 1; k < chain.length; k++) {
      assert.ok(value(chain[k]) >= value(chain[k - 1]), `${chain[k].slug} ${value(chain[k])} < ${chain[k - 1].slug} ${value(chain[k - 1])}`);
    }
  }
});

/* ═════════════════ 6. визуална тема (договор с 3D) ═════════════════ */

const FAMILIES: ThemeFamily[] = ['leather', 'mail', 'plate', 'cloth', 'bone', 'crystal', 'void', 'celestial', 'infernal', 'verdant', 'shadow', 'arcane', 'storm', 'frost'];
const MOTIFS: ThemeMotif[] = ['plain', 'rivets', 'filigree', 'spikes', 'runes', 'feathers', 'scales', 'thorns', 'stars', 'flames'];
const FINISHES: ThemeFinish[] = ['matte', 'worn', 'polished', 'enameled', 'glowing'];
const HEX = /^#[0-9a-f]{6}$/;

test('тема: валидна, различима между сетовете, глоуинг ⇒ emissive; tierThemes 1–12', () => {
  const pairs = new Set<string>();
  const prim = new Set<string>();
  const check = (where: string, t: SetDef['theme']) => {
    assert.ok(FAMILIES.includes(t.family), `${where}.family`);
    assert.ok(MOTIFS.includes(t.motif), `${where}.motif`);
    assert.ok(FINISHES.includes(t.finish), `${where}.finish`);
    for (const k of ['primary', 'secondary', 'trim'] as const) assert.match(t[k], HEX, `${where}.${k}`);
    if (t.emissive) assert.match(t.emissive, HEX, `${where}.emissive`);
    if (t.finish === 'glowing') assert.ok(t.emissive, `${where}: glowing без emissive`);
  };
  for (const s of ITEM_SETS) {
    check(s.slug, s.theme);
    const key = `${s.theme.family}/${s.theme.motif}`;
    assert.ok(!pairs.has(key), `${s.slug}: семейство+мотив ${key} вече е заето`);
    assert.ok(!prim.has(s.theme.primary), `${s.slug}: основният цвят се повтаря`);
    pairs.add(key); prim.add(s.theme.primary);
    // Ниските тирове са скромни, високите — полирани/светещи.
    if (s.tier <= 2) assert.ok(['worn', 'matte'].includes(s.theme.finish), `${s.slug}: T${s.tier} ${s.theme.finish}`);
    if (s.tier >= 9) assert.ok(s.theme.finish === 'glowing', `${s.slug}: T${s.tier} ${s.theme.finish}`);
  }
  for (let t = 1; t <= 12; t++) check(`tierThemes[${t}]`, TIER_THEMES[t]);
});

/* ═════════════════ 7. /api/sets (адитивно: theme + legacy + източници) ═════════════════ */

let server: Server;
let base = '';
let token = '';
before(async () => {
  const setsRouter = (await import('../../routes/sets')).default;
  const now = Date.now();
  const uid = Number(db.prepare("INSERT INTO users (username, email, password_hash, created_at, last_seen_at) VALUES ('SetsUser', 'sets@example.com', 'x', ?, ?)").run(now, now).lastInsertRowid);
  token = signToken({ uid, username: 'SetsUser' });
  const app = express();
  app.use('/api/sets', setsRouter);
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { server?.close(); });

test('/api/sets връща theme, legacy_pieces и източници на всяка част (старите полета непроменени)', async () => {
  const r = await fetch(`${base}/api/sets`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(r.status, 200);
  const j = await r.json() as any;
  assert.equal(j.sets.length, ITEM_SETS.length);
  for (const s of j.sets) {
    for (const k of ['slug', 'name', 'tier', 'rarity', 'class_focus', 'lore', 'pieces', 'bonus_2', 'bonus_4', 'bonus_6', 'theme']) assert.ok(k in s, `${s.slug}.${k}`);
    assert.ok(s.theme.family && s.theme.primary);
    for (const p of s.pieces) {
      assert.ok(!p.missing, `${s.slug}/${p.slug} липсва в БД`);
      assert.ok(p.sources.length > 0, `${p.slug}: няма източници`);
    }
  }
  const ig = j.sets.find((s: any) => s.slug === 'ironguard');
  assert.deepEqual(ig.legacy_pieces.map((p: any) => p.slug), ['chain_helm', 'chain_armor', 'chain_gloves', 'chain_boots', 'kite_shield', 'steel_longsword']);
  assert.equal(Object.keys(j.tier_themes).length, 12);
});
