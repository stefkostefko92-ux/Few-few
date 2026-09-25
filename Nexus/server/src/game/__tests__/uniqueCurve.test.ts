// Инвариант на кривата на силата (game/itemCurve.ts): НИТО ЕДИН екипируем
// предмет — сийд (ITEM_SEED, вкл. сетовете) и уникатите, които маршрутите
// вписват при първо ползване (seed/runtimeItems.ts) — не е над общия предмет
// на СЛЕДВАЩИЯ тир за слота си с повече от 15% (оръжие → atk_max, иначе
// def+hp; плюс общ бюджет с атрибутите). Хваща и бъдещи предмети: всичко,
// добавено в сийда/runtime, минава автоматично; маршрут, който вписва
// екипировка покрай runtimeItems, пада на allowlist-а.
// Плюс: без „плати, за да спечелиш" при фракцията; уникатите не падат от
// случаен дроп; Wyrmsong не расте над кривата.
process.env.DB_PATH = ':memory:';

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../../db';
import { ITEM_SEED } from '../../seed/items';
import { RUNTIME_ITEM_SEED, REALM_DROP_ITEMS, SEASON_TROPHY_ITEMS, TRIAL_GEAR_ITEMS } from '../../seed/runtimeItems';
import { SET_SELL_PRICE } from '../../seed/setPieces';
import {
  CURVE_TOLERANCE, curveCheck, curveScore, isEquip, isUnique, nextTierRef, primaryStat, type CurveItem,
} from '../itemCurve';
import { dropPoolSlugs, tierForEffectiveLevel } from '../drops';
import { wyrmsongClimb } from '../stats';
import { VENDOR_STOCK, FACTION_TIER_GOLD } from '../../routes/faction';

const ZERO = {
  atk_min: 0, atk_max: 0, defense: 0, hp_bonus: 0, mp_bonus: 0, str_bonus: 0, dex_bonus: 0, con_bonus: 0,
  int_bonus: 0, cha_bonus: 0, wis_bonus: 0, buy_price: 0, sell_price: 0, set_slug: '', class_req: '', sub_type: '',
};
type Row = CurveItem & Record<string, any>;
const ALL: Row[] = [...(ITEM_SEED as Row[]), ...(RUNTIME_ITEM_SEED as unknown as Row[])].map((i) => ({ ...ZERO, ...i }));
const bySlug = new Map(ALL.map((i) => [i.slug, i]));

/**
 * Изрично документирани изключения от кривата: slug → обосновка.
 * Празно — към 2026-09 НИТО един предмет не се нуждае от изключение.
 * (Wyrmsong расте с кулата динамично, но таванът му е по кривата —
 * отделен тест по-долу.) Всяко бъдещо изключение иска обосновка тук.
 */
const CURVE_EXCEPTIONS: Record<string, string> = {};

test('кривата: всеки екипируем предмет ≤ +15% над общия предмет на следващия тир (основен стат и общ бюджет)', () => {
  const bad: string[] = [];
  let n = 0;
  for (const it of ALL) {
    if (!isEquip(it)) continue;
    n++;
    const c = curveCheck(ALL, it);
    assert.ok(c, `${it.slug}: няма общ предмет за слот ${it.category}`);
    if (CURVE_EXCEPTIONS[it.slug]) continue;
    if (c!.primaryRatio > CURVE_TOLERANCE || c!.scoreRatio > CURVE_TOLERANCE) {
      bad.push(`${it.slug} (lv ${it.level_req} ${it.category}): ${c!.primaryRatio.toFixed(2)}× основен / ${c!.scoreRatio.toFixed(2)}× бюджет срещу ${c!.ref.slugs[0]} (lv ${c!.ref.level})`);
    }
  }
  assert.ok(n > 400, `само ${n} екипируеми предмета — пулът не е пълен`);
  assert.deepEqual(bad, [], `над кривата:\n${bad.join('\n')}`);
  for (const [slug, why] of Object.entries(CURVE_EXCEPTIONS)) {
    assert.ok(bySlug.has(slug), `изключение за несъществуващ ${slug}`);
    assert.ok(why.trim().length > 20, `${slug}: изключение без обосновка`);
  }
});

test('кривата хваща нарушител (мутация: khalad_fang със старите 96–152)', () => {
  const k = bySlug.get('khalad_fang')!;
  const c = curveCheck(ALL, { ...k, atk_min: 96, atk_max: 152 })!;
  assert.ok(c.primaryRatio > CURVE_TOLERANCE, `старият khalad (${c.primaryRatio.toFixed(2)}×) не е хванат`);
  const r = curveCheck(ALL, { ...bySlug.get('realm_kallosh_grimoire')!, atk_min: 600, atk_max: 950 })!;
  assert.ok(r.primaryRatio > CURVE_TOLERANCE, 'старият realm гримоар не е хванат');
});

test('уникатите остават желани: ≥ общия предмет на СОБСТВЕНОТО си ниво (основен стат или общ бюджет)', () => {
  for (const it of ALL) {
    if (!isUnique(it)) continue;
    const same = ALL.filter((g) => g.category === it.category && g.buy_price > 0 && !g.set_slug && g.level_req <= it.level_req)
      .sort((a, b) => b.level_req - a.level_req || curveScore(b) - curveScore(a))[0];
    if (!same) continue;
    const best = Math.max(primaryStat(it) / primaryStat(same), curveScore(it) / curveScore(same));
    assert.ok(best >= 1, `${it.slug} (lv ${it.level_req}): ${best.toFixed(2)}× срещу общия ${same.slug} (lv ${same.level_req}) — уникатът не си струва`);
  }
});

test('уникатите: тир = лентата на нивото, продажба ≤ кривата на тира', () => {
  for (const it of ALL) {
    if (!isUnique(it)) continue;
    assert.equal(it.tier, tierForEffectiveLevel(it.level_req), `${it.slug}: тир ${it.tier} при lv ${it.level_req}`);
    assert.ok(it.sell_price <= SET_SELL_PRICE[it.tier], `${it.slug}: sell ${it.sell_price} > крива T${it.tier}`);
  }
});

test('runtime уникатите: пълни редове, уникални slug-ове, ползвани от маршрута си', () => {
  const slugs = RUNTIME_ITEM_SEED.map((r) => r.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const s of slugs) assert.ok(!(ITEM_SEED as Row[]).some((i) => i.slug === s), `${s} е и в ITEM_SEED`);
  const src = (f: string) => fs.readFileSync(path.join(__dirname, '..', '..', 'routes', f), 'utf8');
  for (const [rows, file] of [[SEASON_TROPHY_ITEMS, 'events.ts'], [REALM_DROP_ITEMS, 'realmBoss.ts'], [TRIAL_GEAR_ITEMS, 'trialCache.ts']] as const) {
    const text = src(file);
    for (const r of rows) assert.ok(text.includes(`'${r.slug}'`), `${r.slug} не се ползва в routes/${file}`);
  }
});

test('маршрутите не вписват екипировка покрай seed/runtimeItems.ts (иначе кривата не я вижда)', () => {
  // Разрешени сурови INSERT-и: само не-екипируеми категории.
  const ALLOWED: Record<string, string> = {
    'routes/bounties.ts': 'monster_trophy (misc)',
    'routes/recipes.ts': 'сокет гемове (misc)',
    'routes/mount.ts': 'маунтове (misc)',
    'routes/events.ts': 'козметика (cosmetic)',
  };
  const root = path.join(__dirname, '..', '..');
  const found: string[] = [];
  for (const dir of ['routes', 'game', 'lib']) {
    for (const f of fs.readdirSync(path.join(root, dir))) {
      if (!f.endsWith('.ts')) continue;
      const rel = `${dir}/${f}`;
      const text = fs.readFileSync(path.join(root, dir, f), 'utf8');
      const stmts = text.match(/INTO items\b[\s\S]*?VALUES\s*\(([\s\S]*?)\)`/g) ?? [];
      if (!stmts.length) continue;
      found.push(rel);
      assert.ok(ALLOWED[rel], `${rel} вписва предмети в items — екипировката живее в seed/runtimeItems.ts`);
      for (const st of stmts) assert.match(st, /'misc'|'cosmetic'/, `${rel}: суров INSERT без 'misc'/'cosmetic' категория`);
    }
  }
  for (const rel of Object.keys(ALLOWED)) assert.ok(found.includes(rel), `${rel} вече не вписва — махни го от allowlist-а`);
});

test('Wyrmsong: растежът с кулата никога не минава кривата (всяко ниво 18–500, безкраен етаж)', () => {
  const w = bySlug.get('wyrmsong_blade')!;
  let prev = -1;
  for (let L = w.level_req; L <= 500; L++) {
    const climb = wyrmsongClimb(L, 100_000, w.atk_max);
    const ref = nextTierRef(ALL, 'weapon', L)!;
    assert.ok(w.atk_max + climb <= ref.primary * CURVE_TOLERANCE, `lv ${L}: ${w.atk_max + climb} > ${ref.primary}×1.15`);
    assert.ok(climb >= prev, `lv ${L}: растежът намалява`);
    prev = climb;
  }
  assert.equal(wyrmsongClimb(100, 0, w.atk_max), 0, 'без етажи няма растеж');
  assert.equal(wyrmsongClimb(100, 10, w.atk_max), 12, '+1.2 на етаж');
  assert.ok(wyrmsongClimb(300, 100_000, w.atk_max) === 200, 'таван 200');
});

test('фракционен вендор: нищо с боен ефект не се купува с гемове; злато по прогресията на ранга', () => {
  const tiers = Object.keys(FACTION_TIER_GOLD).map(Number).sort((a, b) => a - b);
  for (let i = 1; i < tiers.length; i++) assert.ok(FACTION_TIER_GOLD[tiers[i]] > FACTION_TIER_GOLD[tiers[i - 1]]);
  for (const [f, stock] of Object.entries(VENDOR_STOCK)) {
    for (const o of stock) {
      const it = bySlug.get(o.slug)!;
      assert.ok(it, `${f}: ${o.slug} липсва`);
      assert.ok(!('gems' in o), `${f}/${o.slug}: гем-цена`);
      assert.equal(o.gold, FACTION_TIER_GOLD[o.tier], `${f}/${o.slug}: цена извън прогресията`);
      assert.ok(o.gold > it.sell_price, `${f}/${o.slug}: купи ${o.gold} ≤ продай ${it.sell_price}`);
    }
    // По-високият ранг отключва по-високото ниво сред уникатите.
    const u = stock.filter((o) => isUnique(bySlug.get(o.slug)!)).sort((a, b) => a.tier - b.tier);
    for (let i = 1; i < u.length; i++) {
      assert.ok(bySlug.get(u[i].slug)!.level_req >= bySlug.get(u[i - 1].slug)!.level_req, `${f}: ${u[i].slug} (ранг ${u[i].tier}) под ${u[i - 1].slug}`);
    }
  }
});

test('случаен дроп: generic пулът никога не тегли уникат (само собственият им източник)', () => {
  const db = getDb();
  const cols = ['slug', 'name', 'category', 'sub_type', 'tier', 'rarity', 'level_req', 'class_req', 'atk_min', 'atk_max', 'defense',
    'hp_bonus', 'mp_bonus', 'str_bonus', 'dex_bonus', 'con_bonus', 'int_bonus', 'cha_bonus', 'wis_bonus', 'buy_price', 'sell_price',
    'icon', 'description', 'set_slug'];
  const ins = db.prepare(`INSERT OR IGNORE INTO items (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`);
  db.transaction(() => { for (const it of ALL) ins.run({ icon: '', description: '', rarity: 'common', name: it.slug, tier: 1, level_req: 1, ...it }); })();
  const uniques = new Set(ALL.filter(isUnique).map((i) => i.slug));
  assert.ok(uniques.size >= 30);
  for (let t = 1; t <= 12; t++) for (const cls of ['warrior', 'ranger', 'mage', 'rogue']) {
    const pool = dropPoolSlugs(db, t, 500, cls, 'generic');
    assert.ok(pool.length > 0, `T${t} ${cls}: празен generic пул`);
    const leak = pool.filter((s) => uniques.has(s));
    assert.deepEqual(leak, [], `T${t} ${cls}: уникат в случайния дроп`);
  }
});
